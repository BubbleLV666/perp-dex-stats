/* Perp DEX Stats — home page. Scans every connected DEX for the balance of one wallet; the details live in each DEX's own page. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = x => { const v = parseFloat(x); return isFinite(v) ? v : 0; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const money = x => '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const EVM = /^0x[0-9a-fA-F]{40}$/, B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, ID = /^\d{1,12}$/;
const post = (url, body) => retrying(() => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));

async function retrying(doFetch) {            // fetch with backoff on network errors, 429 and 5xx; returns { r, body }
  for (let a = 0; a < 4; a++) {
    let r; try { r = await doFetch(); } catch (e) { await sleep(700 * (a + 1)); continue; }
    if (r.status === 429 || r.status >= 500) { await sleep(1200 * (a + 1)); continue; }
    let body = null; try { body = await r.json(); } catch (e) { }
    return { r, body };
  }
  throw new Error('unreachable');
}

/* Each DEX: `scan(addr)` resolves to { balance, link } when the wallet has an account there, or null when it has none. Throws on API failure. */
const DEXES = [
  { id: 'hyperliquid', name: 'Hyperliquid', logo: 'logos/hyperliquid.png', home: 'hyperliquid-stats/index.html', accepts: a => EVM.test(a),
    async scan(addr) {                         // perps account value + spot balances; in unified accounts the margin sits inside the spot balance
      const a = addr.toLowerCase(), HL = 'https://api.hyperliquid.xyz/info';
      const [ch, sp, ab] = await Promise.all([post(HL, { type: 'clearinghouseState', user: a }), post(HL, { type: 'spotClearinghouseState', user: a }), post(HL, { type: 'userAbstraction', user: a })]);
      if (!ch.r.ok || !ch.body || !ch.body.marginSummary) throw new Error('HTTP ' + ch.r.status);
      const perp = n(ch.body.marginSummary.accountValue), upnl = (ch.body.assetPositions || []).reduce((s, x) => s + n(x.position.unrealizedPnl), 0);
      const bals = ((sp.body && sp.body.balances) || []).filter(b => n(b.total));
      let spot = 0;
      if (bals.some(b => b.coin !== 'USDC')) {
        const [meta, mids] = await Promise.all([post(HL, { type: 'spotMeta' }), post(HL, { type: 'allMids' })]);
        const usd = {}; ((meta.body && meta.body.universe) || []).forEach(u => { if (u.tokens[1] === 0) usd[u.tokens[0]] = u.name; });
        for (const b of bals) { const px = b.coin === 'USDC' ? 1 : n((mids.body || {})[usd[b.token]]); spot += px ? n(b.total) * px : n(b.entryNtl); }
      } else bals.forEach(b => { spot += n(b.total); });
      const unified = /unified|portfolio/i.test(String(ab.body || ''));
      let hip = 0;                             // every HIP-3 dex (builder-deployed perps) keeps its own margin account
      try {
        const dl = await post(HL, { type: 'perpDexs' });
        const rows = await Promise.all(((dl.body || []).filter(Boolean)).map(d => post(HL, { type: 'clearinghouseState', user: a, dex: d.name }).then(x => n(x.body && x.body.marginSummary && x.body.marginSummary.accountValue), () => 0)));
        hip = rows.reduce((x, y) => x + y, 0);
      } catch (e) { }
      return { balance: (unified ? spot + upnl : perp + spot) + hip, link: 'hyperliquid-stats/index.html#' + a };
    } },
  { id: 'lighter', name: 'Lighter', logo: 'logos/lighter.png', home: 'lighter-stats/index.html', accepts: a => EVM.test(a) || ID.test(a), scan: a => lighterScan('https://mainnet.zklighter.elliot.ai/api/v1', 'lighter-stats', a) },
  { id: 'lighter-rh', name: 'Lighter Robinhood', logo: 'logos/lighter.png', home: 'lighter-robinhood-stats/index.html', accepts: a => EVM.test(a) || ID.test(a), scan: a => lighterScan('https://api.rh.lighter.xyz/api/v1', 'lighter-robinhood-stats', a) },
  { id: 'arcus', name: 'Arcus', logo: 'arcus-stats/arcus-logo.svg', home: 'arcus-stats/index.html', accepts: a => EVM.test(a),
    async scan(addr) {                         // balance is summed over subaccounts 0–9
      const a = addr.toLowerCase(), found = [];
      await Promise.all(Array.from({ length: 10 }, async (_, i) => {
        const { r, body } = await retrying(() => fetch('https://api.arcus.xyz/v1/account?address=' + a + '&accountIndex=' + i));
        if (r.status === 404 || r.status === 403) return;
        if (!r.ok) throw new Error((body && body.error) || 'HTTP ' + r.status);
        found.push({ i, eq: n(body.equity) });
      }));
      if (!found.length) return null;
      found.sort((x, y) => y.eq - x.eq || x.i - y.i);
      return { balance: found.reduce((s, f) => s + f.eq, 0), link: 'arcus-stats/index.html#' + a + (found[0].i ? ':' + found[0].i : '') };
    } },
  { id: 'txflow', name: 'TxFlow', logo: 'txflow-stats/txflow-logo.png', wordmark: 'logos/txflow.png', home: 'txflow-stats/index.html', accepts: a => EVM.test(a),
    async scan(addr) {
      const a = addr.toLowerCase();
      const { r, body } = await retrying(() => fetch('https://api.txflow.com/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'clearinghouseState', user: a }) }));
      if (!r.ok || !body || body.status === 'err' || !body.marginSummary) { if (r.status === 404) return null; throw new Error((body && (body.message || body.reason)) || 'HTTP ' + r.status); }
      return { balance: n(body.marginSummary.accountValue) + n(body.vaultEquity), link: 'txflow-stats/index.html#' + a };
    } },
  { id: 'bulk', name: 'Bulk', logo: 'bulk/bulk-logo.png', wordmark: 'logos/bulk.png', home: 'bulk/index.html', accepts: a => B58.test(a),
    async scan(addr) {
      const { r, body } = await retrying(() => fetch('https://mainnet-api1.bulk.trade/api/v1/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'fullAccount', user: addr }) }));
      if (!r.ok) { if (body && body.error && body.error.code === 'ACCOUNT_NOT_FOUND') return null; throw new Error((body && body.error && body.error.message) || 'HTTP ' + r.status); }
      const acct = body && body[0] && body[0].fullAccount; if (!acct) return null;
      return { balance: n((acct.margin || {}).totalMargin), link: 'bulk/index.html#' + addr };
    } },
  { id: 'metric', name: 'Metric', logo: 'logos/metric.svg', home: 'metric-stats/index.html', accepts: a => EVM.test(a),
    async scan(addr) {                         // value of the liquidity positions on every network Metric runs on
      const a = addr.toLowerCase(), API = 'https://api.metric.xyz/public/v1'; let total = 0, any = false;
      await Promise.all([4663, 1, 56].map(async cid => {
        const { r, body } = await retrying(() => fetch(API + '/evm/' + cid + '/positions/' + a));
        if (!r.ok || !Array.isArray(body) || !body.length) return;
        const dec = new Map();
        for (let off = 0; off < 5000; off += 500) {
          const m = await retrying(() => fetch(API + '/evm/' + cid + '/metadata?minTvlFiat=0&count=500&offset=' + off));
          const rows = Array.isArray(m.body) ? m.body : []; rows.forEach(p => dec.set(String(p.poolAddress).toLowerCase(), p));
          if (rows.length < 500 || body.every(x => dec.has(String(x.poolAddress).toLowerCase()))) break;
        }
        body.forEach(x => { const p = dec.get(String(x.poolAddress).toLowerCase()); if (!p) return; any = true; total += n(x.token0Amount) / 10 ** p.token0Decimals * n(x.token0FiatPrice) + n(x.token1Amount) / 10 ** p.token1Decimals * n(x.token1FiatPrice); });
      }));
      return any ? { balance: total, link: 'metric-stats/index.html#' + a } : null;
    } },
  { id: 'entropy', name: 'Entropy', logo: 'logos/entropy.png', home: 'entropy/index.html', accepts: a => EVM.test(a),
    async scan(addr) {                         // margin account of the Entropy perp dex (io) on Hyperliquid
      const a = addr.toLowerCase(), { r, body } = await post('https://api.hyperliquid.xyz/info', { type: 'clearinghouseState', user: a, dex: 'io' });
      if (!r.ok || !body || !body.marginSummary) throw new Error('HTTP ' + r.status);
      return { balance: n(body.marginSummary.accountValue), link: 'entropy/index.html#' + a };
    } },
  { id: 'pacifica', name: 'Pacifica', logo: 'logos/pacifica.svg', home: 'pacifica_fi/index.html', accepts: a => B58.test(a),
    async scan(addr) {
      const { r, body } = await retrying(() => fetch('https://api.pacifica.fi/api/v1/account?account=' + encodeURIComponent(addr)));
      if (r.status === 404) return null;
      if (!r.ok || !body || !body.data) throw new Error('HTTP ' + r.status);
      return { balance: n(body.data.account_equity), link: 'pacifica_fi/index.html#' + addr };
    } },
];
async function lighterScan(base, folder, key) {   // an address can own several accounts: the balance is their sum
  key = ID.test(key) ? key : key.toLowerCase();
  const { r, body } = await retrying(() => fetch(base + '/account?by=' + (ID.test(key) ? 'index' : 'l1_address') + '&value=' + key));
  if (!r.ok || !body || body.code !== 200) { if (r.status === 404 || (body && body.code === 21100)) return null; throw new Error((body && body.message) || 'HTTP ' + r.status); }
  const accts = body.accounts || []; if (!accts.length) return null;
  const px = { USDC: 1, USDT: 1 };            // spot assets are valued at the last price of their USDC market
  if (accts.some(x => (x.assets || []).some(y => n(y.balance) && !px[y.symbol]))) {
    try { const d = await retrying(() => fetch(base + '/orderBookDetails')); ((d.body && d.body.spot_order_book_details) || []).forEach(m => { if (n(m.last_trade_price) > 0) px[String(m.symbol).split('/')[0]] = n(m.last_trade_price); }); } catch (e) { }
  }
  const spot = x => (x.assets || []).reduce((s, y) => s + n(y.balance) * (px[y.symbol] || 0), 0);
  return { balance: accts.reduce((s, x) => s + (n(x.total_asset_value) || n(x.collateral)) + spot(x), 0), link: folder + '/index.html#' + key };
}


const list = $('#list'), statusEl = $('#status'), input = $('#addr'), btn = document.querySelector('.search .btn'), resultsWrap = $('#resultsWrap');
const status = (msg, o = {}) => { statusEl.className = 'status' + (o.err ? ' err' : ''); statusEl.innerHTML = (o.busy ? '<span class="spin"></span>' : '') + esc(msg); };
let run = 0;
$('#logos').innerHTML = DEXES.map(d => `<a class="lg" href="${d.home}" title="${d.name}">${d.wordmark ? `<img src="${d.wordmark}" alt="${d.name}" height="22" style="max-width:10.5rem">` : `<img class="ico" src="${d.logo}" alt="" width="26" height="26"><span>${d.name}</span>`}</a>`).join('');

function row(d, res, i, fresh) {                      // a result card: logo, name, balance; links to the detailed page
  const head = `<div class="rc-top"><img src="${d.logo}" alt=""><span class="name">${d.name}</span>${res.err ? '' : '<span class="go">›</span>'}</div>`;
  if (res.err) return `<li><div class="dexcard dim" style="${fresh ? `animation-delay:${i * 40}ms` : 'animation:none'}">${head}<div class="rc-err">Unavailable right now<a href="#" data-retry="${d.id}">retry</a></div></div></li>`;
  return `<li><a class="dexcard" href="${esc(res.link)}" style="${fresh ? `animation-delay:${i * 40}ms` : 'animation:none'}">${head}<div class="rc-label">Wallet balance</div><div class="rc-bal num">${money(res.balance)}</div></a></li>`;
}

async function scan(addr) {
  const my = ++run; addr = addr.trim();
  const targets = DEXES.filter(d => d.accepts(addr));
  list.innerHTML = ''; resultsWrap.hidden = true; scan.seen = new Set();
  if (!addr) return status('');
  if (!targets.length) return status('That does not look like a wallet address: expected 0x… (40 hex characters), a Solana address or a Lighter account ID.', { err: true });
  btn.disabled = true; status('Scanning ' + targets.map(d => d.name).join(', ') + '…', { busy: true });
  const results = new Map();
  const draw = () => {
    const rows = DEXES.filter(d => results.has(d.id) && results.get(d.id)).map(d => ({ d, res: results.get(d.id) }));
    rows.sort((a, b) => (b.res.balance || -1) - (a.res.balance || -1));
    const seen = scan.seen; list.innerHTML = rows.map((x, i) => { const f = !seen.has(x.d.id); seen.add(x.d.id); return row(x.d, x.res, i, f); }).join(''); resultsWrap.hidden = !rows.length;
  };
  await Promise.all(targets.map(async d => {
    let res; try { res = await d.scan(addr); } catch (e) { console.warn(d.id, e); res = { err: true }; }
    if (my !== run) return;
    results.set(d.id, res && !res.err && res.balance <= 0 ? null : res);   // empty accounts are hidden
    draw();
  }));
  if (my !== run) return;
  btn.disabled = false;
  const shown = [...results.values()].filter(Boolean);
  status(shown.length ? '' : 'No balance found on the connected DEXes for this wallet.');
}

/* platform volume (24 h) and open interest summed over every connected DEX; DEXes that do not answer are skipped */
const PLAT = [
  ['Arcus', async () => { const { body } = await retrying(() => fetch('https://api.arcus.xyz/v1/markets')), a = Array.isArray(body) ? body : Object.values((body && body.markets) || body || {}); return { vol: a.reduce((s, m) => s + n(m.volume24hNotional), 0), oi: a.reduce((s, m) => s + n(m.openInterest) * n(m.markPrice), 0) }; }],
  ['TxFlow', async () => { const { body } = await post('https://api.txflow.com/info', { type: 'allMarketTickers' }), p = (body || []).filter(x => x.instrumentId < 1e4); return { vol: p.reduce((s, x) => s + n(x.dayNtlVlm), 0), oi: p.reduce((s, x) => s + n(x.openInterest) * n(x.markPx), 0) }; }],
  ['Bulk', async () => { const { body } = await retrying(() => fetch('https://mainnet-api1.bulk.trade/api/v1/stats?period=1d')); return { vol: n(body.volume.totalUsd), oi: n(body.openInterest.totalUsd) }; }],
  ['Hyperliquid', async () => { const { body } = await post('https://api.hyperliquid.xyz/info', { type: 'metaAndAssetCtxs' }), c = (body && body[1]) || []; return { vol: c.reduce((s, x) => s + n(x.dayNtlVlm), 0), oi: c.reduce((s, x) => s + n(x.openInterest) * n(x.markPx), 0) }; }],
  ['Lighter', () => lighterPlat('https://mainnet.zklighter.elliot.ai/api/v1')],
  ['Lighter Robinhood', () => lighterPlat('https://api.rh.lighter.xyz/api/v1')],
  ['Entropy', async () => { const { body } = await post('https://api.hyperliquid.xyz/info', { type: 'metaAndAssetCtxs', dex: 'io' }), c = (body && body[1]) || []; return { vol: c.reduce((s, x) => s + n(x.dayNtlVlm), 0), oi: c.reduce((s, x) => s + n(x.openInterest) * n(x.markPx), 0) }; }],
  ['Pacifica', async () => { const { body } = await retrying(() => fetch('https://api.pacifica.fi/api/v1/info/prices')), a = (body && body.data) || []; return { vol: a.reduce((s, x) => s + n(x.volume_24h), 0), oi: a.reduce((s, x) => s + n(x.open_interest) * n(x.mark), 0) }; }],
];
async function lighterPlat(base) { const { body } = await retrying(() => fetch(base + '/orderBookDetails')), p = (body && body.order_book_details) || []; return { vol: p.reduce((s, m) => s + n(m.daily_quote_token_volume), 0), oi: p.reduce((s, m) => s + (n(m.open_interest_usd) || n(m.open_interest) * (n(m.mark_price) || n(m.last_trade_price))), 0) }; }
const bigM = x => { const a = Math.abs(x); return a >= 1e9 ? '$' + (x / 1e9).toFixed(2) + 'B' : a >= 1e6 ? '$' + (x / 1e6).toFixed(1) + 'M' : '$' + Math.round(x).toLocaleString('en-US'); };
async function loadPlatform() {
  const got = (await Promise.all(PLAT.map(async ([name, f]) => { try { return { name, ...(await f()) }; } catch (e) { return null; } }))).filter(Boolean);
  if (!got.length) return;
  $('#platV').textContent = bigM(got.reduce((s, x) => s + x.vol, 0)); $('#platOI').textContent = bigM(got.reduce((s, x) => s + x.oi, 0));
  $('#plat').title = 'Sum over ' + got.length + ' DEXes, perpetual markets, rolling 24 hours.\n' + got.map(x => `${x.name}: volume ${bigM(x.vol)} · OI ${bigM(x.oi)}`).join('\n') + '\nUpdated ' + new Date().toLocaleTimeString('en-US', { hour12: false });
}
loadPlatform(); setInterval(() => { if (!document.hidden) loadPlatform(); }, 60000);
$('#btnTheme').onclick = () => { const r = document.documentElement; r.dataset.theme = r.dataset.theme === 'light' ? 'dark' : 'light'; };

list.addEventListener('click', e => {
  if (e.target.dataset.retry == null) return;
  e.preventDefault(); scan(input.value);
});
$('#form').addEventListener('submit', e => {
  e.preventDefault(); const a = input.value.trim();
  if (a) history.replaceState(null, '', '#' + a);
  scan(a);
});
const fromHash = () => { const h = decodeURIComponent(location.hash.slice(1)).trim(); if (h && h !== input.value.trim()) { input.value = h; scan(h); } };
addEventListener('hashchange', fromHash);
{ const h = decodeURIComponent(location.hash.slice(1)).trim(); if (h) { input.value = h; scan(h); } }
})();
