/* Hyperliquid Trade Stats — static, no backend. Reads the public Hyperliquid API straight from the browser. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = x => { const v = parseFloat(x); return isFinite(v) ? v : 0; };
const fmt = (x, d = 2) => x == null || !isFinite(x) ? '—' : x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const sgn = (x, d = 2) => x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + fmt(Math.abs(x), d);
const money = (x, d = 2) => x == null || !isFinite(x) ? '—' : (x < 0 ? '−' : '') + '$' + fmt(Math.abs(x), d);
const smoney = (x, d = 2) => x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + '$' + fmt(Math.abs(x), d);
const big = x => { const a = Math.abs(x); return a >= 1e9 ? fmt(x / 1e9, 2) + 'B' : a >= 1e6 ? fmt(x / 1e6, 2) + 'M' : a >= 1e4 ? fmt(x / 1e3, 1) + 'K' : fmt(x, 0); };
const usd = x => (x < 0 ? '−' : '') + '$' + big(Math.abs(x));   // axis labels: −$1.2K, never $-1.2K
const cls = x => x > 1e-9 ? 'pos' : x < -1e-9 ? 'neg' : '';
const pxf = p => p == null || !isFinite(p) ? '—' : p >= 1000 ? fmt(p, 2) : p >= 1 ? fmt(p, 3) : fmt(p, 5);
const dtl = ms => new Date(ms).toLocaleString('en-US', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const tshort = ms => new Date(ms).toLocaleString('en-US', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const dshort = ms => new Date(ms).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' });
const dayKey = ms => new Date(ms).toISOString().slice(0, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const store = { get(k, d) { try { const v = localStorage.getItem(CFG.prefix + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(CFG.prefix + k, JSON.stringify(v)); } catch (e) { } } };
const row = (k, v, title) => `<div class="row"${title ? ` data-tip="${esc(title)}"` : ''}><span>${k}</span><b class="num">${v}</b></div>`;
let S = null, runId = 0;

/* ---------------------------------------------------------------- periods: all time / last 24 h, 7, 30, 90 days / custom GMT range */
const DAY = 864e5;
const PRESETS = [['24h', '24 hours', DAY], ['7d', '7 days', 7 * DAY], ['30d', '30 days', 30 * DAY], ['90d', '90 days', 90 * DAY]];
let period = { key: 'all' };
const dtlU = ms => new Date(ms).toLocaleString('en-US', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
function getPeriod() {   // null = all time; else { key, label, from, to } in milliseconds
  if (period.key === 'all') return null;
  if (period.key === 'custom') return period.from && period.to ? { key: 'custom', label: dtlU(period.from) + ' – ' + dtlU(period.to) + ' GMT', from: period.from, to: period.to } : null;
  const p = PRESETS.find(x => x[0] === period.key); return p ? { key: p[0], label: 'Last ' + p[1], from: Date.now() - p[2], to: Date.now() } : null;
}
const inP = (pr, ms) => !pr || (ms >= pr.from && ms <= pr.to);

/* ---------------------------------------------------------------- charts */
function lineChart(box, pts, o) {
  const W = box.clientWidth || 500, H = box.clientHeight || 220, m = { l: 54, r: 10, t: 8, b: 22 };
  if (pts.length < 2) { box.innerHTML = '<div class="empty">Not enough data</div>'; return; }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  let y0 = Math.min(...ys), y1 = Math.max(...ys); if (o.zero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
  if (y1 - y0 < (o.minRange || 1e-9)) { const c = (y0 + y1) / 2; y0 = c - (o.minRange || 1) / 2; y1 = c + (o.minRange || 1) / 2; }
  const pad = (y1 - y0) * .08; y0 -= pad; y1 += pad;
  const x0 = xs[0], x1 = xs[xs.length - 1];
  const X = t => m.l + (t - x0) / ((x1 - x0) || 1) * (W - m.l - m.r), Y = v => H - m.b - (v - y0) / ((y1 - y0) || 1) * (H - m.t - m.b);
  let g = '';
  for (let i = 0; i <= 4; i++) { const v = y0 + (y1 - y0) * i / 4, y = Y(v); g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="var(--grid)"/><text x="${m.l - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--ink-3)">${o.axis(v)}</text>`; }
  for (let i = 0; i <= 4; i++) { const t = x0 + (x1 - x0) * i / 4; g += `<text x="${X(t)}" y="${H - 5}" text-anchor="${i == 0 ? 'start' : i == 4 ? 'end' : 'middle'}" font-size="11" fill="var(--ink-3)">${o.xfmt(t)}</text>`; }
  if (o.zero) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--ink-3)" stroke-dasharray="3 3"/>`;
  const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');
  const base = Y(Math.max(y0, Math.min(y1, 0)));
  const gid = 'ga' + (lineChart.n = (lineChart.n || 0) + 1);
  const area = o.area ? `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.color}" stop-opacity=".34"/><stop offset="1" stop-color="${o.color}" stop-opacity="0"/></linearGradient></defs><path d="${d}L${X(x1)} ${base}L${X(x0)} ${base}Z" fill="url(#${gid})"/>` : '';
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}${area}<path d="${d}" fill="none" stroke="${o.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><g class="hv" style="display:none"><line y1="${m.t}" y2="${H - m.b}" stroke="var(--ink-3)"/><circle r="4" fill="${o.color}" stroke="var(--surface)" stroke-width="2"/></g></svg><div class="tt"></div>`;
  hover(box, W, H, (px) => {
    let lo = 0, hi = pts.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (X(pts[mid][0]) < px) lo = mid + 1; else hi = mid; }
    const p = pts[lo]; return { x: X(p[0]), y: Y(p[1]), html: `<span class="k">${o.xfmt(p[0])}</span><br><b class="num">${o.tip(p[1])}</b>` };
  });
}
function barChart(box, items, o) {
  const W = box.clientWidth || 500, H = box.clientHeight || 220, m = { l: 54, r: 8, t: 8, b: 24 };
  if (!items.length) { box.innerHTML = '<div class="empty">No data</div>'; return; }
  let y0 = Math.min(0, ...items.map(i => i.v)), y1 = Math.max(0, ...items.map(i => i.v)); if (y1 === y0) y1 = y0 + 1;
  const Y = v => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b), bw = (W - m.l - m.r) / items.length, gap = Math.min(2, bw * .15);
  let g = ''; for (let i = 0; i <= 4; i++) { const v = y0 + (y1 - y0) * i / 4, y = Y(v); g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="var(--grid)"/><text x="${m.l - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--ink-3)">${o.axis(v)}</text>`; }
  const step = Math.ceil(items.length / 8);
  const bars = items.map((it, i) => {
    const w = Math.max(1, Math.min(bw - gap, 56)), x = m.l + i * bw + (bw - w) / 2, yy = Y(Math.max(it.v, 0)), h = Math.max(1, Math.abs(Y(it.v) - Y(0)));
    const lab = i % step === 0 ? `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--ink-3)">${esc(it.label)}</text>` : '';
    return `<rect x="${x}" y="${yy}" width="${w}" height="${h}" rx="${Math.min(3, w / 3)}" fill="${o.color}" data-i="${i}"/>${lab}`;
  }).join('');
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}<line x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--ink-3)"/>${bars}</svg><div class="tt"></div>`;
  const tip = $('.tt', box), svg = $('svg', box);
  box.onmousemove = e => {
    const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width), i = Math.max(0, Math.min(items.length - 1, Math.floor((px - m.l) / bw)));
    tip.style.display = 'block'; tip.innerHTML = `<span class="k">${esc(items[i].label)}</span><br><b class="num">${o.tip(items[i].v, items[i])}</b>`;
    const bx = box.getBoundingClientRect(); let lx = e.clientX - bx.left + 14; if (lx > bx.width - 150) lx = e.clientX - bx.left - 150; tip.style.left = lx + 'px'; tip.style.top = '8px';
  };
  box.onmouseleave = () => tip.style.display = 'none';
}
function hover(box, W, H, f) {
  const svg = $('svg', box), hv = $('.hv', svg), tip = $('.tt', box);
  box.onmousemove = e => {
    const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width), p = f(px);
    hv.style.display = ''; const l = hv.firstChild; l.setAttribute('x1', p.x); l.setAttribute('x2', p.x);
    const c = hv.lastChild; c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
    tip.style.display = 'block'; tip.innerHTML = p.html;
    const bx = box.getBoundingClientRect(); let lx = e.clientX - bx.left + 14; if (lx > bx.width - 150) lx = e.clientX - bx.left - 150; tip.style.left = lx + 'px'; tip.style.top = '8px';
  };
  box.onmouseleave = () => { hv.style.display = 'none'; tip.style.display = 'none'; };
}

/* ---------------------------------------------------------------- fills analysis
   Normalized fill: { t (ms), m (market), side 'B'|'S', sz, px, fee, pnl (realized, 0 when opening), maker (bool), liq (bool) } */
function fillStats(fills) {
  const F = { n: 0, vol: 0, mvol: 0, tvol: 0, fees: 0, pnl: 0, wins: 0, losses: 0, winSum: 0, lossSum: 0, maxWin: 0, maxLoss: 0, buyVol: 0, sellVol: 0, liqs: 0, byM: {}, byDay: {}, byHour: Array(24).fill(0), curve: [], t0: Infinity, t1: 0 };
  let cum = 0;
  for (const f of fills.slice().sort((a, b) => a.t - b.t)) {
    const v = f.sz * f.px; F.n++; F.vol += v; F.fees += f.fee; F.pnl += f.pnl; F.t0 = Math.min(F.t0, f.t); F.t1 = Math.max(F.t1, f.t);
    f.maker ? F.mvol += v : F.tvol += v; f.side === 'B' ? F.buyVol += v : F.sellVol += v; if (f.liq) F.liqs++;
    if (f.pnl > 0) { F.wins++; F.winSum += f.pnl; F.maxWin = Math.max(F.maxWin, f.pnl); } else if (f.pnl < 0) { F.losses++; F.lossSum += f.pnl; F.maxLoss = Math.min(F.maxLoss, f.pnl); }
    const m = F.byM[f.m] || (F.byM[f.m] = { fills: 0, vol: 0, mvol: 0, pnl: 0, fees: 0, wins: 0, losses: 0 });
    m.fills++; m.vol += v; m.mvol += f.maker ? v : 0; m.pnl += f.pnl; m.fees += f.fee; if (f.pnl > 0) m.wins++; else if (f.pnl < 0) m.losses++;
    const k = dayKey(f.t), d = F.byDay[k] || (F.byDay[k] = { vol: 0, net: 0 }); d.vol += v; d.net += f.pnl - f.fee;
    F.byHour[new Date(f.t).getUTCHours()] += v; cum += f.pnl - f.fee; F.curve.push([f.t, cum]);
  }
  return F;
}
const fsub = S => { const pr = getPeriod(); return (pr ? pr.label + ' · ' : '') + (S.fillsDone ? `${fmt(S.fills.length, 0)} fills` : 'loading…'); };
const SHOWN = { fills: 100 };
const moreNote = (k, total, what) => total <= SHOWN[k] ? '' : `<p class="note">Showing the latest ${fmt(SHOWN[k], 0)} of ${fmt(total, 0)} ${what}. <button class="linkbtn" data-more="${k}" type="button">Show 200 more</button> <button class="linkbtn" data-more="${k}:all" type="button">Show all</button></p>`;
const COMMON_CARDS = [
  { id: 'activity', title: 'Trading style', sub: fsub, w: 4, render(S) {
    const F = S.fs; if (!S.fills.length) return S.fillsDone ? '<div class="empty">No fills</div>' : '<div class="empty">Loading fills…</div>';
    const span = (F.t1 - F.t0) / 1000, closed = F.wins + F.losses, pf = F.lossSum ? F.winSum / -F.lossSum : null;
    return `<div class="rows">` + row('Fills', fmt(F.n, 0)) + row('Period', `${dtl(F.t0)} – ${dtl(F.t1)}`) + row('Volume', '$' + big(F.vol)) +
      row('Maker / taker (by volume)', `${fmt(F.mvol / (F.vol || 1) * 100, 0)}% / ${fmt(F.tvol / (F.vol || 1) * 100, 0)}%`) +
      row('Average fill size', money(F.vol / F.n, 0)) + row('Fills per hour', span > 60 ? fmt(F.n / (span / 3600), 1) : '—') +
      row('Win rate (closing fills)', closed ? fmt(F.wins / closed * 100, 1) + '%' : '—', 'Share of closing fills with a positive realized PnL.') +
      row('Average win / loss', closed ? `${smoney(F.wins ? F.winSum / F.wins : 0, 3)} / ${smoney(F.losses ? F.lossSum / F.losses : 0, 3)}` : '—') +
      row('Profit factor', pf == null ? '—' : fmt(pf, 2), 'Gross profit divided by gross loss of closing fills.') + row('Best / worst', `${smoney(F.maxWin, 2)} / ${smoney(F.maxLoss, 2)}`) +
      row('Realized PnL − fees', `<span class="${cls(F.pnl - F.fees)}">${smoney(F.pnl - F.fees, 2)}</span>`) +
      row('Buys / sells', `${fmt(F.buyVol / (F.vol || 1) * 100, 0)}% / ${fmt(F.sellVol / (F.vol || 1) * 100, 0)}%`) +
      (F.liqs ? row('Liquidation fills', `<span class="neg">${F.liqs}</span>`) : '') + `</div>`;
  } },
  { id: 'curve', title: 'Realized PnL curve', sub: S => 'realized PnL − fees · ' + fsub(S), w: 8, render() { return '<div class="chartbox" data-ch="curve"></div>'; },
    after(el, S) { const b = $('[data-ch=curve]', el); if (S.fs.curve.length < 2) { b.innerHTML = '<div class="empty">Need more fills</div>'; return; }
      lineChart(b, S.fs.curve, { color: css('--s1'), zero: true, minRange: 0.5, axis: v => smoney(v, Math.abs(v) < 10 ? 2 : 0), tip: v => smoney(v, 2), xfmt: tshort }); } },
  { id: 'daily', title: 'Volume by day', sub: S => 'UTC · ' + fsub(S), w: 6, render() { return '<div class="chartbox" data-ch="daily"></div>'; },
    after(el, S) { const b = $('[data-ch=daily]', el), items = Object.keys(S.fs.byDay).sort().map(k => ({ label: k.slice(8) + '.' + k.slice(5, 7), v: S.fs.byDay[k].vol, net: S.fs.byDay[k].net }));
      barChart(b, items, { color: css('--s2'), axis: usd, tip: (v, it) => `$${fmt(v, 0)} · net ${smoney(it.net, 2)}` }); } },
  { id: 'hourly', title: 'Activity by hour', sub: S => 'UTC, volume · ' + fsub(S), w: 6, render() { return '<div class="chartbox" data-ch="hourly"></div>'; },
    after(el, S) { barChart($('[data-ch=hourly]', el), S.fs.byHour.map((v, h) => ({ label: String(h).padStart(2, '0'), v })), { color: css('--s3'), axis: usd, tip: v => '$' + fmt(v, 0) }); } },
  { id: 'bymarket', title: 'Markets', sub: fsub, w: 12, render(S) {
    const F = S.fs, ks = Object.keys(F.byM); if (!ks.length) return '<div class="empty">No data</div>';
    const rows = ks.map(k => { const m = F.byM[k]; return { k, ...m, net: m.pnl - m.fees, win: (m.wins + m.losses) ? m.wins / (m.wins + m.losses) * 100 : null }; });
    const key = S.sortKey || 'vol', dir = S.sortDir || -1; rows.sort((a, b) => ((a[key] > b[key]) - (a[key] < b[key])) * dir || 0);
    const th = (k, t) => `<th data-sort="${k}">${t}${k === key ? (dir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
    return `<div class="scroll"><table><thead><tr>${th('k', 'Market')}${th('fills', 'Fills')}${th('vol', 'Volume $')}${th('mvol', 'Maker $')}${th('pnl', 'Realized PnL')}${th('fees', 'Fees')}${th('net', 'Net')}${th('win', 'Win %')}</tr></thead><tbody>` +
      rows.map(r => `<tr><td>${esc(r.k)}</td><td class="num">${r.fills}</td><td class="num">${fmt(r.vol, 0)}</td><td class="num">${fmt(r.mvol / (r.vol || 1) * 100, 0)}%</td><td class="num ${cls(r.pnl)}">${smoney(r.pnl, 2)}</td><td class="num">${fmt(r.fees, 2)}</td><td class="num ${cls(r.net)}">${smoney(r.net, 2)}</td><td class="num">${r.win == null ? '—' : fmt(r.win, 0)}</td></tr>`).join('') + `</tbody></table></div>`;
  } },
  { id: 'fills', title: 'Recent fills', sub: fsub, w: 12, render(S) {
    if (!S.fills.length) return S.fillsDone ? '<div class="empty">No fills</div>' : '<div class="empty">Loading fills…</div>';
    const rows = S.fills.slice().sort((a, b) => b.t - a.t).slice(0, SHOWN.fills);
    return `<div class="scroll"><table><thead><tr><th>Time</th><th>Market</th><th>Side</th><th>Size</th><th>Price</th><th>Value $</th><th>Role</th><th>Fee</th><th>Realized PnL</th></tr></thead><tbody>` +
      rows.map(f => `<tr><td>${dtl(f.t)}</td><td>${esc(f.m)}</td><td><span class="tag ${f.side === 'B' ? 'ok' : 'bad'}">${f.side === 'B' ? 'BUY' : 'SELL'}</span></td><td class="num">${fmt(f.sz, 4)}</td><td class="num">${pxf(f.px)}</td><td class="num">${fmt(f.sz * f.px, 2)}</td><td>${f.liq ? '<span class="tag bad">liquidation</span>' : f.maker ? 'maker' : 'taker'}</td><td class="num">${fmt(f.fee, 4)}</td><td class="num ${cls(f.pnl)}">${f.pnl ? smoney(f.pnl, 2) : '—'}</td></tr>`).join('') + `</tbody></table></div>` + moreNote('fills', S.fills.length, 'fills');
  } },
];

/* Risk & liquidation card shared by the adapters; R = { eq, mm, im, buffer, gross, lev, long, short } */
const riskCard = { id: 'risk', title: 'Risk & liquidation', sub: 'now', w: 6, render(S) {
  const R = S.risk, eq = Math.max(R.eq, 1e-6), pm = Math.min(100, R.mm / eq * 100), pi = Math.min(100, R.im / eq * 100), tot = R.long + R.short || 1;
  return `<div class="rows">` + row('Equity', money(R.eq)) + row('Maintenance margin', money(R.mm), 'Minimum equity needed to keep the positions open. If equity falls below it, liquidation starts.') + row('Margin used (initial)', money(R.im), 'Collateral currently locked by open positions.') +
    row('Buffer to liquidation', `<span class="${R.buffer < eq * .3 ? 'neg' : ''}">${money(R.buffer)}</span>${R.gross ? ` · ${fmt(R.buffer / R.gross * 100, 1)}% of gross` : ''}`, 'Equity minus maintenance margin: how much more equity can be lost before liquidation.') +
    row('Gross / leverage', `${money(R.gross, 0)} · ${R.lev == null ? '—' : fmt(R.lev, 2) + '×'}`, 'Gross = sum of the absolute sizes of all positions. Leverage = gross ÷ equity.') + `</div>` +
    `<div class="bar2" title="fill: share of equity used as margin"><span style="width:${pi}%;background:var(--s1);opacity:.35"></span><span style="width:${pm}%;background:var(--s2)"></span></div>
     <div class="legend"><span><i style="background:var(--s2)"></i>maintenance</span><span><i style="background:var(--s1);opacity:.4"></i>initial</span></div>
     <div class="rows" style="margin-top:12px">` + row('Longs', `<span class="pos">${money(R.long, 0)}</span>`) + row('Shorts', `<span class="neg">${money(R.short, 0)}</span>`) + row('Net exposure', `<span class="${cls(R.long - R.short)}">${smoney(R.long - R.short, 0)}</span> · ${sgn((R.long - R.short) / tot * 100, 0)}% of total`) + `</div>
     <div class="bar2"><span style="width:${R.long / tot * 100}%;background:var(--good);opacity:.85"></span><span style="left:${R.long / tot * 100}%;width:${R.short / tot * 100}%;background:var(--bad);opacity:.85"></span></div>`;
} };

/* ---------------------------------------------------------------- Hyperliquid adapter (POST https://api.hyperliquid.xyz/info) */
const API = 'https://api.hyperliquid.xyz/info';
const EVM = /^0x[0-9a-fA-F]{40}$/;
const CFG = {
  prefix: 'hl_', depth: 10000, badInput: 'Invalid address: expected 0x followed by 40 hex characters',
  parse: t => { t = String(t || '').trim(); return EVM.test(t) ? t.toLowerCase() : null; },
  prepare: S => { S.risk = riskCalc(S); },
  load: (key, o) => loadWallet(key, o),
  platform: async () => {
    const d = await info({ type: 'metaAndAssetCtxs' }), ctx = d[1] || [], names = (d[0] && d[0].universe) || [], oiOf = c => n(c.openInterest) * n(c.markPx);
    const top = ctx.map((c, i) => [names[i] ? names[i].name : '?', oiOf(c)]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0] + ' $' + big(x[1])).join(', ');
    return { vol: ctx.reduce((s, c) => s + n(c.dayNtlVlm), 0), oi: ctx.reduce((s, c) => s + oiOf(c), 0), title: `All ${ctx.length} perpetual markets on Hyperliquid.\nVolume: last 24 hours (rolling window).\nOI: open interest in USD (coins × mark price). Largest: ${top}.` };
  },
  lb: {
    wins: [['24h', 'Last 24 hours'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['all', 'All time']], win: '7d',
    sorts: [['pnl', 'By PnL'], ['vol', 'By volume'], ['roi', 'By ROI'], ['av', 'By account value']], sort: 'pnl',
    load: (win, sort, page, size, say) => hlBoardLoad(win, sort, page, size, say),
    find: (addr, win, sort, say) => hlBoardFind(addr, win, sort),
  },
};
/* ---------- leaderboard: the public file of the Hyperliquid website (every wallet with a ranking, ~40 MB, loaded once per visit) */
const HLWIN = { '24h': 'day', '7d': 'week', '30d': 'month', all: 'allTime' };
let HLB = null; const HLSORT = {};
async function hlBoard(say) {
  if (HLB) return HLB;
  say && say('Downloading the Hyperliquid leaderboard (about 40 MB, once per visit)…');
  const r = await fetch('https://stats-data.hyperliquid.xyz/Mainnet/leaderboard'); if (!r.ok) throw new Error('HTTP ' + r.status);
  say && say('Processing the leaderboard…'); const d = await r.json();
  HLB = { at: Date.now(), rows: (d.leaderboardRows || []).map(x => { const w = {}; (x.windowPerformances || []).forEach(p => { w[p[0]] = { pnl: n(p[1].pnl), roi: n(p[1].roi) * 100, vol: n(p[1].vlm) }; }); return { addr: x.ethAddress, av: n(x.accountValue), name: x.displayName, w }; }) };
  return HLB;
}
function hlSorted(D, win, sort) {
  const key = win + '|' + sort; if (HLSORT[key]) return HLSORT[key]; const wk = HLWIN[win];
  const val = r => r[sort] || 0;
  let rows = D.rows.map(r => ({ addr: r.addr, av: r.av, name: r.name, pnl: (r.w[wk] || {}).pnl || 0, roi: (r.w[wk] || {}).roi || 0, vol: (r.w[wk] || {}).vol || 0 }));
  if (sort === 'roi') rows = rows.filter(r => r.av >= 1000 && r.vol >= 10000);   // tiny accounts would otherwise take the whole top of the ROI ranking
  if (sort === 'pnl' || sort === 'vol') rows = rows.filter(r => r.vol > 0 || sort === 'pnl' && r.pnl);
  rows.sort((a, b) => val(b) - val(a)); rows.forEach((r, i) => { r.rank = i + 1; });
  return HLSORT[key] = rows;
}
async function hlBoardLoad(win, sort, page, size, say) {
  const D = await hlBoard(say), all = hlSorted(D, win, sort);
  return { rows: all.slice(page * size, (page + 1) * size), total: all.length, at: D.at, note: 'Source: the public leaderboard file of the Hyperliquid website (all wallets with an account value, PnL and volume per window). Rankings by ROI list only wallets with at least $1,000 of account value and $10,000 of volume in the window. PnL and ROI include unrealized PnL.' };
}
async function hlBoardFind(addr, win, sort) {
  const D = await hlBoard(), all = hlSorted(D, win, sort), r = all.find(x => x.addr.toLowerCase() === addr); return r ? { rank: r.rank, row: r } : null;
}

const bucket = { tokens: 300, t: Date.now() };         // the limit is 1200 weight per minute per IP: stay at 18 per second
async function take(w) { for (;;) { const now = Date.now(); bucket.tokens = Math.min(300, bucket.tokens + (now - bucket.t) / 1000 * 18); bucket.t = now; if (bucket.tokens >= w) { bucket.tokens -= w; return; } await sleep(Math.max(60, (w - bucket.tokens) / 18 * 1000)); } }
async function info(body, w = 20) {
  for (let a = 0; a < 5; a++) {
    await take(w);
    let r; try { r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch (e) { await sleep(800 * (a + 1)); continue; }
    if (r.status === 429) { bucket.tokens = 0; await sleep(2000 * (a + 1)); continue; }
    if (r.status >= 500) { await sleep(700 * (a + 1)); continue; }
    let data = null; try { data = await r.json(); } catch (e) { }
    if (!r.ok) throw new Error((typeof data === 'string' ? data : data && data.error) || 'HTTP ' + r.status);
    return data;
  }
  throw new Error('API unavailable or rate limit exceeded, please try again later');
}
const safe = p => p.catch(e => (console.warn(e), null));
let SM = null;                                           // spot metadata: pair name -> display name, token index -> pair name
async function spotMeta() {
  if (SM) return SM; const d = await info({ type: 'spotMeta' }), tok = {}, pair = {}, usdPair = {};
  (d.tokens || []).forEach(t => tok[t.index] = t.name);
  (d.universe || []).forEach(u => { pair[u.name] = (tok[u.tokens[0]] || u.name) + '/' + (tok[u.tokens[1]] || '?'); if (u.tokens[1] === 0) usdPair[u.tokens[0]] = u.name; });
  return SM = { tok, pair, usdPair };
}
const coinName = c => SM && SM.pair[c] ? SM.pair[c] : String(c || '');

/* ---------- normalizers */
function normFill(f) {
  const px = n(f.px), fee = n(f.fee), name = coinName(f.coin), isSpot = /^@\d+$/.test(f.coin) || String(f.coin).includes('/');
  const tokenFee = isSpot && f.feeToken && f.feeToken === name.split('/')[0];   // only a spot fill can charge its fee in the traded token (then fee × price = USD); every other fee token (USDC, USDE, USDH, USDT0 …) is a dollar stablecoin
  return { t: f.time, m: name, side: f.side === 'B' ? 'B' : 'S', sz: n(f.sz), px, fee: tokenFee ? fee * px : fee, pnl: n(f.closedPnl), maker: !f.crossed, liq: !!f.liquidation || /liquidat/i.test(f.dir || ''), dir: f.dir, tid: f.tid };
}
async function loadFills(key, depth, my) {
  const seen = new Set(), out = [], add = a => { for (const f of a) if (!seen.has(f.tid)) { seen.add(f.tid); out.push(normFill(f)); } }, pr = getPeriod();
  if (pr) {                                               // a period: walk forward through the fills of the window (the API keeps the latest 10,000)
    let from = pr.from;
    for (let p = 0; p < 10; p++) {
      status(`Loading fills… ${fmt(out.length, 0)}`); const page = await info({ type: 'userFillsByTime', user: key, startTime: from, endTime: pr.to, aggregateByTime: false }); if (my !== runId) return null;
      add(page); if (page.length < 2000) return { fills: out, truncated: false }; from = page[page.length - 1].time;
    }
    return { fills: out, truncated: true };
  }
  const first = await info({ type: 'userFills', user: key, aggregateByTime: false }); if (my !== runId) return null; add(first);
  if (first.length >= 2000 && depth > 2000) {            // more than 2000 fills: walk forward from the start of the available history
    out.length = 0; seen.clear(); let from = 0;
    for (let p = 0; p < 6; p++) {
      status(`Loading fills… ${fmt(out.length, 0)}`); const page = await info({ type: 'userFillsByTime', user: key, startTime: from, aggregateByTime: false }); if (my !== runId) return null;
      add(page); if (page.length < 2000) break; from = page[page.length - 1].time;
    }
  }
  out.sort((a, b) => b.t - a.t); return { fills: out.slice(0, depth), truncated: out.length > depth };
}
async function loadFunding(key, my) {
  const rows = [], pr = getPeriod(); let from = pr ? pr.from : Date.now() - 90 * 864e5;
  for (let p = 0; p < 12; p++) {
    const page = await info({ type: 'userFunding', user: key, startTime: from, ...(pr ? { endTime: pr.to } : {}) }); if (my !== runId) return null;
    rows.push(...page.map(x => ({ t: x.time, m: coinName(x.delta.coin), usdc: n(x.delta.usdc), rate: n(x.delta.fundingRate), szi: n(x.delta.szi) })));
    if (page.length < 500) break; from = page[page.length - 1].time + 1;
  }
  return rows;
}
async function loadLedger(key, my) {
  const rows = []; let from = 0, more = false;
  for (let p = 0; p < 30; p++) {
    const page = await info({ type: 'userNonFundingLedgerUpdates', user: key, startTime: from }); if (my !== runId) return null;
    rows.push(...page.map(x => { const d = x.delta; return { t: x.time, type: d.type, usd: n(d.usdc || d.usdcValue), amount: n(d.amount), token: d.token, from: String(d.user || '').toLowerCase(), hash: x.hash }; }));
    more = page.length >= 500; if (!more) break; from = page[page.length - 1].time + 1;
  }
  rows.truncated = more; return rows;
}
const XFER = /^(send|spotTransfer|subAccountTransfer|internalTransfer)$/;
const flow = (x, me) => x.type === 'deposit' ? x.usd : x.type === 'withdraw' ? -x.usd : XFER.test(x.type) && x.usd ? (x.from === me ? -x.usd : x.usd) : 0;
function spotValue(spot, mids) {
  const out = []; let total = 0;
  for (const b of (spot && spot.balances) || []) {
    const amt = n(b.total); if (!amt) continue;
    const pair = SM && SM.usdPair[b.token], px = b.coin === 'USDC' ? 1 : pair ? n(mids[pair]) : 0, val = px ? amt * px : n(b.entryNtl);
    out.push({ coin: b.coin, total: amt, hold: n(b.hold), px, val, entry: n(b.entryNtl) }); total += val;
  }
  return { rows: out.sort((a, b) => b.val - a.val), total };
}
const UNIFIED = a => /unified|portfolio/i.test(String(a || ''));
function riskCalc(S) {
  const c = S.ch, ms = c.marginSummary || {}, eq = n(ms.accountValue), pos = (c.assetPositions || []).map(x => x.position), mm = n(c.crossMaintenanceMarginUsed);
  let gross = 0, long = 0, short = 0; pos.forEach(p => { const v = Math.abs(n(p.positionValue)); gross += v; n(p.szi) > 0 ? long += v : short += v; });
  return { eq, mm, im: n(ms.totalMarginUsed), gross, long, short, lev: eq > 0 ? gross / eq : null, buffer: eq - mm, pos };
}

/* ---------- loading */
async function loadWallet(key, opts = {}) {
  const my = ++runId;
  if (!opts.silent) { status('Loading wallet data…'); S = null; $('#out').innerHTML = ''; $('#welcome').hidden = true; }
  let ch, spot, mids, abs, fees, port;
  try {
    await spotMeta();
    [ch, spot, mids] = await Promise.all([info({ type: 'clearinghouseState', user: key }, 2), safe(info({ type: 'spotClearinghouseState', user: key }, 2)), safe(info({ type: 'allMids' }, 2))]);
  } catch (e) { status('Error: ' + esc(e.message), true); return; }
  if (my !== runId) return;
  [abs, fees, port] = await Promise.all([safe(info({ type: 'userAbstraction', user: key }, 20)), safe(info({ type: 'userFees', user: key })), safe(info({ type: 'portfolio', user: key }))]);
  if (my !== runId) return;
  const sv = spotValue(spot, mids || {}), unified = UNIFIED(abs), perpEq = n((ch.marginSummary || {}).accountValue), upnl = (ch.assetPositions || []).reduce((s, x) => s + n(x.position.unrealizedPnl), 0);
  const total = unified ? sv.total + upnl : perpEq + sv.total;
  const keepFills = opts.keep && S && S.key === key ? S.fills : [];
  S = { key, label: key, tags: [unified ? 'unified account' : 'standard account'], ch, spot: sv, abs: String(abs || ''), unified, total, perpEq, upnl, fees, port: portMap(port), fills: keepFills, fillsDone: false, funding: opts.keep && S ? S.funding : null, ledger: opts.keep && S ? S.ledger : null, orders: [], sortKey: S && S.sortKey, sortDir: S && S.sortDir };
  rememberWallet(key); status(''); render();
  const live = () => my === runId && S && S.key === key;
  loadExtra(key, my, live);
  const [orders, ledger, fund] = await Promise.all([safe(info({ type: 'frontendOpenOrders', user: key })), safe(loadLedger(key, my)), safe(loadFunding(key, my))]);
  if (!live()) return; S.orders = Array.isArray(orders) ? orders : []; S.ledger = ledger; S.funding = fund; render();
  try {
    const r = await loadFills(key, +$('#depth').value, my); if (!live() || !r) return;
    S.fills = r.fills; S.fillsDone = true; S.trunc = r.truncated; render(); status(r.truncated ? (getPeriod() ? 'This period has more fills than the API makes available: the statistics cover the loaded part only.' : 'Showing the most recent fills only; pick a larger depth to analyze more.') : '');
  } catch (e) { if (live()) status('Fills: ' + esc(e.message), true); }
}
function portMap(p) { const o = {}; (Array.isArray(p) ? p : []).forEach(x => { o[x[0]] = x[1]; }); return o; }
function CURVE(S, k) {   // account value / PnL history; with a period: the finest history that covers it, clipped (PnL re-based to the period start)
  const pr = getPeriod(), span = pr ? pr.to - pr.from : Infinity, names = span <= DAY ? ['day', 'week', 'month', 'allTime'] : span <= 7 * DAY ? ['week', 'month', 'allTime'] : span <= 30 * DAY ? ['month', 'allTime'] : ['allTime'];
  for (const nm of names) {
    let pts = (((S.port[nm] || {})[k]) || []).map(p => [p[0], n(p[1])]); if (!pr) return pts;
    pts = pts.filter(p => p[0] >= pr.from && p[0] <= pr.to); if (pts.length < 2) continue;
    return k === 'pnlHistory' ? pts.map(p => [p[0], p[1] - pts[0][1]]) : pts;
  }
  return [];
}


/* ---------- extra data: staking, vaults, sub-accounts, HIP-3 dexs, order history, referral, API wallets */
let DEXES = null;
async function hip3(key) {                              // every HIP-3 dex keeps its own margin account
  if (!DEXES) DEXES = ((await info({ type: 'perpDexs' })) || []).filter(Boolean).map(d => d.name);
  const rows = await Promise.all(DEXES.map(async d => { const c = await safe(info({ type: 'clearinghouseState', user: key, dex: d }, 2)); return c ? { dex: d, eq: n((c.marginSummary || {}).accountValue), pos: (c.assetPositions || []).length, upnl: (c.assetPositions || []).reduce((a, x) => a + n(x.position.unrealizedPnl), 0) } : null; }));
  return rows.filter(r => r && (r.eq || r.pos));
}
async function loadExtra(key, my, live) {
  const q = (type, extra = {}) => safe(info({ type, user: key, ...extra }));
  const [ds, dl, dr, rf, sub, vlt, ho, rl, ag, dx] = await Promise.all([q('delegatorSummary'), q('delegations'), q('delegatorRewards'), q('referral'), q('subAccounts'), q('userVaultEquities'), q('historicalOrders'), q('userRateLimit'), q('extraAgents'), safe(hip3(key))]);
  if (!live()) return;
  S.ex = { ds, dl: Array.isArray(dl) ? dl : [], dr: Array.isArray(dr) ? dr : [], rf, sub: Array.isArray(sub) ? sub : [], vlt: Array.isArray(vlt) ? vlt : [], ho: Array.isArray(ho) ? ho : [], rl, ag: Array.isArray(ag) ? ag : [], dx: dx || [] };
  const hv = S.ex.dx.reduce((a, r) => a + r.eq, 0); if (hv) { S.hip3 = hv; S.total += hv; }
  render();
  const vs = await Promise.all(S.ex.vlt.slice(0, 8).map(async v => ({ ...v, d: await safe(info({ type: 'vaultDetails', vaultAddress: v.vaultAddress })) }))); if (!live()) return;
  S.ex.vlt = vs.concat(S.ex.vlt.slice(8)); render();
}
const ago = ms => { const s = Math.max(0, (Date.now() - ms) / 1000); return s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };

/* ---------- cards */
const CARDS = [
  { id: 'summary', title: 'Account', w: 4, render(S) {
    const free = n(S.ch.withdrawable);
    return `<div class="big num">${money(S.total)}</div><div class="rows">` +
      row('Perps account value', money(S.perpEq), S.unified ? 'In a unified account the perps margin is held inside the spot balance, so only the spot value and unrealized PnL are counted in the total.' : '') +
      row('Spot balances', money(S.spot.total)) + (S.hip3 ? row('HIP-3 dexs', money(S.hip3), 'Margin accounts on builder-deployed perp dexs.') : '') + row('Withdrawable (perps)', money(free)) +
      row('Unrealized PnL', `<span class="${cls(S.upnl)}">${smoney(S.upnl)}</span>`, 'Sum of unrealized PnL of open positions at current mark prices.') +
      row('Open positions / orders', `${S.risk.pos.length} / ${S.orders.length}`) + `</div>` +
      `<p class="note">${S.unified ? 'Unified account: spot and perps share one balance.' : 'Standard account: perps and spot balances are separate and added up.'}</p>`;
  } },
  { id: 'volume', title: 'Volume & fees', w: 4, render(S) {
    const f = S.fees; if (!f) return '<div class="empty">Fee data unavailable</div>';
    const d = (f.dailyUserVlm || []).slice().sort((a, b) => a.date < b.date ? -1 : 1), v = x => n(x.userCross) + n(x.userAdd), sum = a => a.reduce((s, x) => s + v(x), 0);
    const pr = x => fmt(n(x) * 100, 4) + '%';
    return `<div class="rows">` + row('Volume, last 14 days', '$' + big(sum(d))) + row('Volume, last 7 days', '$' + big(sum(d.slice(-7)))) + row('Volume, latest day', d.length ? '$' + big(v(d[d.length - 1])) : '—') +
      row('Taker fee (perps)', pr(f.userCrossRate)) + row('Maker fee (perps)', pr(f.userAddRate)) + row('Taker fee (spot)', pr(f.userSpotCrossRate)) + row('Maker fee (spot)', pr(f.userSpotAddRate)) +
      (f.activeReferralDiscount != null && n(f.activeReferralDiscount) ? row('Referral discount', fmt(n(f.activeReferralDiscount) * 100, 1) + '%') : '') +
      (f.activeStakingDiscount && n(f.activeStakingDiscount.discount) ? row('Staking discount', fmt(n(f.activeStakingDiscount.discount) * 100, 1) + '%') : '') + `</div>` +
      `<div class="chartbox" data-ch="vlm" style="height:120px;margin-top:10px"></div>`;
  }, after(el, S) { const f = S.fees; if (!f) return; const d = (f.dailyUserVlm || []).slice().sort((a, b) => a.date < b.date ? -1 : 1);
    barChart($('[data-ch=vlm]', el), d.map(x => ({ label: x.date.slice(8) + '.' + x.date.slice(5, 7), v: n(x.userCross) + n(x.userAdd) })), { color: css('--s2'), axis: usd, tip: v => '$' + fmt(v, 0) }); } },
  riskCard,
  { id: 'pnl', title: 'Profit', w: 4, render(S) {
    const pr = getPeriod(), F = S.fs, fund = S.funding ? S.funding.filter(x => inP(pr, x.t)).reduce((a, x) => a + x.usdc, 0) : null;
    const last = k => { const a = (((S.port[k] || {}).pnlHistory) || []).slice(-1)[0]; return a ? n(a[1]) : null; }, all = last('allTime'), perpAll = last('perpAllTime');
    if (pr) {
      const net = F.pnl - F.fees + (fund || 0), c = CURVE(S, 'pnlHistory'), dEq = c.length > 1 ? c[c.length - 1][1] : null;
      return `<div class="big num ${cls(net)}">${smoney(net)}</div><div class="rows">` + row('Period', esc(pr.label)) +
        row('Realized PnL', `<span class="${cls(F.pnl)}">${smoney(F.pnl)}</span>`, 'Sum of the closed PnL of the fills of the period.') + row('Fees', money(-F.fees)) +
        row('Funding over period', fund == null ? '…' : `<span class="${cls(fund)}">${smoney(fund)}</span>`) +
        row('PnL by equity over period', dEq == null ? '—' : `<span class="${cls(dEq)}">${smoney(dEq)}</span>`, 'Change of the account PnL curve of the exchange (perps + spot): includes unrealized PnL, excludes deposits and withdrawals.') +
        row('PnL per $1M volume', F.vol > 0 ? smoney(net / F.vol * 1e6, 0) : '—') + `</div>` +
        `<p class="note">Big number = realized − fees + funding. “By equity” also includes unrealized PnL.</p>`;
    }
    const net = F.pnl - F.fees + (fund || 0);
    return `<div class="big num ${cls(all)}">${all == null ? '—' : smoney(all)}</div><div class="rows">` +
      row('PnL, all time', all == null ? '—' : `<span class="${cls(all)}">${smoney(all)}</span>`, 'PnL curve of the exchange (portfolio, perps + spot): includes unrealized PnL, excludes deposits and withdrawals.') +
      row('of which perps', perpAll == null ? '—' : `<span class="${cls(perpAll)}">${smoney(perpAll)}</span>`, 'Perps-only PnL of the exchange portfolio (all perp markets including HIP-3 ones); the rest is spot trading.') +
      row('Unrealized PnL', `<span class="${cls(S.upnl)}">${smoney(S.upnl)}</span>`) +
      row('Realized PnL (loaded fills)', `<span class="${cls(F.pnl)}">${smoney(F.pnl)}</span>`) + row('Fees (loaded fills)', money(-F.fees)) +
      row('Funding (last 90 days)', fund == null ? '…' : `<span class="${cls(fund)}">${smoney(fund)}</span>`) +
      row('PnL per $1M volume (loaded fills)', F.vol > 0 ? smoney(net / F.vol * 1e6, 0) : '—') + `</div>` +
      `<p class="note">Realized PnL and fees cover only the fills loaded below; the exchange PnL covers the whole history.</p>`;
  } },
  { id: 'equity', title: 'Equity', sub: () => 'perps + spot · ' + (getPeriod() ? getPeriod().label : 'all time'), w: 6, render() { return '<div class="chartbox" data-ch="equity"></div>'; },
    after(el, S) { lineChart($('[data-ch=equity]', el), CURVE(S, 'accountValueHistory'), { color: css('--s1'), area: true, axis: usd, tip: v => money(v, 2), xfmt: dshort }); } },
  { id: 'pnlchart', title: 'PnL over period', sub: () => 'perps + spot, excludes deposits · ' + (getPeriod() ? getPeriod().label : 'all time'), w: 6, render() { return '<div class="chartbox" data-ch="pnl"></div>'; },
    after(el, S) { lineChart($('[data-ch=pnl]', el), CURVE(S, 'pnlHistory'), { color: css('--s3'), zero: true, minRange: 1, axis: v => smoney(v, Math.abs(v) < 10 ? 2 : 0), tip: v => smoney(v, 2), xfmt: dshort }); } },
  { id: 'positions', title: 'Open positions', sub: 'now', w: 12, render(S) {
    const pos = S.risk.pos; if (!pos.length) return '<div class="empty">No open positions</div>';
    return `<div class="scroll"><table><thead><tr><th>Market</th><th>Side</th><th>Size</th><th>Size $</th><th>Entry</th><th>uPnL</th><th>ROE %</th><th>Leverage</th><th>Margin</th><th>Liq. price</th><th>Funding since open</th></tr></thead><tbody>` +
      pos.slice().sort((a, b) => n(b.positionValue) - n(a.positionValue)).map(p => { const s = n(p.szi), up = n(p.unrealizedPnl), cf = p.cumFunding ? -n(p.cumFunding.sinceOpen) : null;
        return `<tr><td>${esc(p.coin)}</td><td><span class="tag ${s > 0 ? 'ok' : 'bad'}">${s > 0 ? '▲ LONG' : '▼ SHORT'}</span></td><td class="num">${fmt(Math.abs(s), 4)}</td><td class="num">${money(n(p.positionValue))}</td><td class="num">${pxf(n(p.entryPx))}</td><td class="num ${cls(up)}">${smoney(up)}</td><td class="num ${cls(n(p.returnOnEquity))}">${sgn(n(p.returnOnEquity) * 100, 2)}%</td><td class="num">${p.leverage ? p.leverage.value + '× ' + p.leverage.type : '—'}</td><td class="num">${money(n(p.marginUsed))}</td><td class="num">${p.liquidationPx ? pxf(n(p.liquidationPx)) : '—'}</td><td class="num ${cls(cf)}">${cf == null ? '—' : smoney(cf)}</td></tr>`; }).join('') + `</tbody></table></div>`;
  } },
  { id: 'funding', title: 'Funding', sub: () => getPeriod() ? getPeriod().label : 'last 90 days', w: 6, render(S) {
    if (!S.funding) return '<div class="empty">Loading funding…</div>'; const fr = S.funding.filter(x => inP(getPeriod(), x.t)); if (!fr.length) return '<div class="empty">No funding payments in this period</div>';
    const by = {}; let tot = 0; fr.forEach(x => { by[x.m] = (by[x.m] || 0) + x.usdc; tot += x.usdc; });
    return `<div class="rows">` + row('Net funding (received +)', `<span class="${cls(tot)}">${smoney(tot)}</span>`) + `</div><div class="rows" style="margin-top:12px">` +
      Object.entries(by).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 12).map(([m, v]) => row(esc(m), `<span class="${cls(v)}">${smoney(v)}</span>`)).join('') + `</div>`;
  } },
  { id: 'transfers', title: 'Deposits & withdrawals', w: 6, render(S) {
    if (!S.ledger) return '<div class="empty">Loading…</div>';
    const rows = S.ledger.filter(x => (x.type === 'deposit' || x.type === 'withdraw' || XFER.test(x.type)) && inP(getPeriod(), x.t)).sort((a, b) => b.t - a.t);
    if (!rows.length) return '<div class="empty">No transfers</div>';
    const dep = S.ledger.filter(x => x.type === 'deposit' && inP(getPeriod(), x.t)).reduce((s, x) => s + x.usd, 0), wd = S.ledger.filter(x => x.type === 'withdraw' && inP(getPeriod(), x.t)).reduce((s, x) => s + x.usd, 0);
    return `<div class="rows" style="margin:0 0 10px">` + row('Deposited (bridge)', money(dep)) + row('Withdrawn (bridge)', money(wd)) + row('Net via bridge', `<span class="${cls(dep - wd)}">${smoney(dep - wd)}</span>`) + `</div>` +
      `<div class="scroll" style="max-height:260px"><table><thead><tr><th>Time</th><th>Type</th><th>Amount</th></tr></thead><tbody>` +
      rows.slice(0, 100).map(x => { const f = flow(x, S.key); return `<tr><td>${dtl(x.t)}</td><td>${esc(x.type)}</td><td class="num ${cls(f)}">${x.usd ? smoney(f) : fmt(x.amount, 4) + ' ' + esc(x.token || '')}</td></tr>`; }).join('') + `</tbody></table></div>` +
      (S.ledger.truncated ? '<p class="note">The history is very long: only the oldest 15,000 ledger entries were loaded.</p>' : '');
  } },
  { id: 'spot', title: 'Spot balances', w: 6, render(S) {
    if (!S.spot.rows.length) return '<div class="empty">No spot balances</div>';
    return `<div class="scroll" style="max-height:300px"><table><thead><tr><th>Token</th><th>Balance</th><th>Price</th><th>Value $</th></tr></thead><tbody>` +
      S.spot.rows.map(r => `<tr><td>${esc(r.coin)}</td><td class="num">${fmt(r.total, 4)}</td><td class="num">${r.px ? pxf(r.px) : '—'}</td><td class="num">${money(r.val)}</td></tr>`).join('') + `</tbody></table></div>`;
  } },
  { id: 'orders', title: 'Open orders', sub: S => String(S.orders.length), w: 6, render(S) {
    if (!S.orders.length) return '<div class="empty">No open orders</div>';
    return `<div class="scroll" style="max-height:300px"><table><thead><tr><th>Market</th><th>Side</th><th>Type</th><th>Price</th><th>Size</th><th>Flags</th></tr></thead><tbody>` +
      S.orders.slice(0, 200).map(o => `<tr><td>${esc(coinName(o.coin))}</td><td><span class="tag ${o.side === 'B' ? 'ok' : 'bad'}">${o.side === 'B' ? 'BUY' : 'SELL'}</span></td><td>${esc(o.orderType || '')}</td><td class="num">${o.isTrigger ? esc(o.triggerCondition || 'trigger') : pxf(n(o.limitPx))}</td><td class="num">${fmt(n(o.sz), 4)}</td><td>${[o.reduceOnly && 'reduce-only', o.isPositionTpsl && 'tp/sl'].filter(Boolean).join(', ') || '—'}</td></tr>`).join('') + `</tbody></table></div>`;
  } },
  { id: 'staking', title: 'Staking', sub: 'HYPE', w: 4, render(S) {
    const e = S.ex; if (!e) return '<div class="empty">Loading…</div>'; const d = e.ds || {}, rew = e.dr.reduce((a, x) => a + n(x.amount), 0);
    if (!n(d.delegated) && !n(d.undelegated) && !n(d.totalPendingWithdrawal) && !e.dl.length) return '<div class="empty">No staking</div>';
    return `<div class="rows">` + row('Delegated', fmt(n(d.delegated), 2) + ' HYPE') + row('Available to delegate', fmt(n(d.undelegated), 2) + ' HYPE', 'Staking balance that is not delegated to a validator yet.') + row('Pending withdrawal', fmt(n(d.totalPendingWithdrawal), 2) + ' HYPE' + (d.nPendingWithdrawals ? ` (${d.nPendingWithdrawals})` : '')) + row('Rewards received', fmt(rew, 4) + ' HYPE') + `</div>` +
      (e.dl.length ? `<div class="scroll" style="max-height:200px;margin-top:10px"><table><thead><tr><th>Validator</th><th>Amount</th><th>Locked until</th></tr></thead><tbody>` + e.dl.map(x => `<tr><td class="lbaddr" title="${esc(x.validator)}">${shortAddr(x.validator)}</td><td class="num">${fmt(n(x.amount), 2)}</td><td class="num">${x.lockedUntilTimestamp > Date.now() ? dtl(x.lockedUntilTimestamp) : '—'}</td></tr>`).join('') + `</tbody></table></div>` : '');
  } },
  { id: 'vaults', title: 'Vaults', sub: S => S.ex ? String(S.ex.vlt.length) : '', w: 4, render(S) {
    const e = S.ex; if (!e) return '<div class="empty">Loading…</div>'; if (!e.vlt.length) return '<div class="empty">No vault deposits</div>';
    const tot = e.vlt.reduce((a, v) => a + n(v.equity), 0);
    return `<div class="rows">` + row('Total in vaults', money(tot), 'Not included in the balance above.') + `</div><div class="scroll" style="max-height:240px;margin-top:10px"><table><thead><tr><th>Vault</th><th>Equity</th><th>APR</th><th>Locked until</th></tr></thead><tbody>` +
      e.vlt.map(v => `<tr><td title="${esc(v.vaultAddress)}">${esc((v.d && v.d.name) || shortAddr(v.vaultAddress))}</td><td class="num">${money(n(v.equity))}</td><td class="num">${v.d && v.d.apr != null ? fmt(n(v.d.apr) * 100, 1) + '%' : '—'}</td><td class="num">${v.lockedUntilTimestamp > Date.now() ? dtl(v.lockedUntilTimestamp) : '—'}</td></tr>`).join('') + `</tbody></table></div>`;
  } },
  { id: 'subacct', title: 'Sub-accounts', sub: S => S.ex ? String(S.ex.sub.length) : '', w: 4, render(S) {
    const e = S.ex; if (!e) return '<div class="empty">Loading…</div>'; if (!e.sub.length) return '<div class="empty">No sub-accounts</div>';
    return `<div class="scroll" style="max-height:260px"><table><thead><tr><th>Name</th><th>Perps value</th><th>Positions</th><th></th></tr></thead><tbody>` +
      e.sub.map(x => { const c = x.clearinghouseState || {}; return `<tr><td title="${esc(x.subAccountUser)}">${esc(x.name || shortAddr(x.subAccountUser))}</td><td class="num">${money(n((c.marginSummary || {}).accountValue))}</td><td class="num">${(c.assetPositions || []).length}</td><td><button class="btn tiny" data-open="${esc(x.subAccountUser)}" type="button">open stats</button></td></tr>`; }).join('') + `</tbody></table></div>` +
      `<p class="note">Sub-accounts are separate wallets: their balances are not part of the total above.</p>`;
  } },
  { id: 'hip3', title: 'HIP-3 dexs', sub: 'builder-deployed perp dexs', w: 6, render(S) {
    const e = S.ex; if (!e) return '<div class="empty">Loading…</div>'; if (!e.dx.length) return `<div class="empty">No balance or positions on the ${DEXES ? DEXES.length : ''} HIP-3 dexs</div>`;
    return `<div class="scroll" style="max-height:260px"><table><thead><tr><th>Dex</th><th>Account value</th><th>Positions</th><th>Unrealized PnL</th></tr></thead><tbody>` +
      e.dx.map(r => `<tr><td>${esc(r.dex)}</td><td class="num">${money(r.eq)}</td><td class="num">${r.pos}</td><td class="num ${cls(r.upnl)}">${smoney(r.upnl)}</td></tr>`).join('') + `</tbody></table></div><p class="note">Every HIP-3 dex keeps its own margin account; their value is added to the total above.</p>`;
  } },
  { id: 'referral', title: 'Referral & API', w: 6, render(S) {
    const e = S.ex; if (!e) return '<div class="empty">Loading…</div>'; const r = e.rf || {}, rl = e.rl || {};
    return `<div class="rows">` + row('Referred by', r.referredBy ? `<code>${esc(r.referredBy.code || shortAddr(r.referredBy.referrer))}</code>` : '—') + row('Volume counted for referrals', r.cumVlm ? '$' + big(n(r.cumVlm)) : '—') +
      row('Referral rewards (claimed / unclaimed)', r.claimedRewards != null ? `${money(n(r.claimedRewards))} / ${money(n(r.unclaimedRewards))}` : '—') + row('Builder rewards', r.builderRewards != null ? money(n(r.builderRewards)) : '—') +
      row('Referrer stage', r.referrerState ? esc(r.referrerState.stage) : '—') + row('API requests used / allowed', rl.nRequestsCap ? `${fmt(n(rl.nRequestsUsed), 0)} / ${fmt(n(rl.nRequestsCap), 0)}` : '—', 'The exchange gives every address one request per traded dollar plus a base allowance.') +
      row('API wallets (agents)', fmt(e.ag.length, 0)) + `</div>` +
      (e.ag.length ? `<div class="scroll" style="max-height:200px;margin-top:10px"><table><thead><tr><th>Agent</th><th>Address</th><th>Valid until</th></tr></thead><tbody>` + e.ag.map(a => `<tr><td>${esc(a.name || '—')}</td><td class="lbaddr" title="${esc(a.address)}">${shortAddr(a.address)}</td><td class="num">${dtl(a.validUntil)}</td></tr>`).join('') + `</tbody></table></div>` : '');
  } },
  { id: 'orderhist', title: 'Order history', sub: S => S.ex ? `${S.ex.ho.length} latest, 100 shown` : '', w: 12, render(S) {
    const e = S.ex; if (!e) return '<div class="empty">Loading…</div>'; if (!e.ho.length) return '<div class="empty">No orders</div>';
    const st = {}; e.ho.forEach(o => { st[o.status] = (st[o.status] || 0) + 1; });
    return `<div class="rows" style="margin:0 0 10px">` + row('Statuses', Object.entries(st).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ${v}`).join(' · ')) + `</div><div class="scroll"><table><thead><tr><th>Time</th><th>Market</th><th>Side</th><th>Type</th><th>Price</th><th>Size</th><th>Flags</th><th>Status</th></tr></thead><tbody>` +
      e.ho.slice(0, 100).map(x => { const o = x.order; return `<tr><td>${dtl(o.timestamp)}</td><td>${esc(coinName(o.coin))}</td><td><span class="tag ${o.side === 'B' ? 'ok' : 'bad'}">${o.side === 'B' ? 'BUY' : 'SELL'}</span></td><td>${esc(o.orderType || '')}</td><td class="num">${o.isTrigger ? esc(o.triggerCondition || 'trigger') : pxf(n(o.limitPx))}</td><td class="num">${fmt(n(o.origSz), 4)}</td><td>${[o.reduceOnly && 'reduce-only', o.isPositionTpsl && 'tp/sl'].filter(Boolean).join(', ') || '—'}</td><td class="${x.status === 'filled' ? 'pos' : /reject|margin/i.test(x.status) ? 'neg' : ''}">${esc(x.status)}</td></tr>`; }).join('') + `</tbody></table></div>`;
  } },
].concat(COMMON_CARDS);
const DEFAULT_CARDS = CARDS.map(c => c.id);
const ORDER = ['summary', 'volume', 'pnl', 'equity', 'pnlchart', 'risk', 'positions', 'activity', 'curve', 'daily', 'hourly', 'bymarket', 'funding', 'transfers', 'spot', 'orders', 'fills', 'staking', 'vaults', 'subacct', 'hip3', 'referral', 'orderhist'];

/* ---------------------------------------------------------------- render + page wiring */
function status(html, err) { const s = $('#status'), busy = /^Loading/.test(html); s.className = 'status' + (err ? ' err' : '') + (busy ? ' busy' : ''); s.innerHTML = (busy ? '<i class="spin"></i>' : '') + html; }
let enabled = new Set(store.get('cards', DEFAULT_CARDS));
{ const seen = new Set(store.get('cards_seen', [])); DEFAULT_CARDS.forEach(id => { if (!seen.has(id)) enabled.add(id); }); store.set('cards_seen', DEFAULT_CARDS); store.set('cards', [...enabled]); }
function render() {
  if (!S) return;
  S.fs = fillStats(S.fills); if (CFG.prepare) CFG.prepare(S);
  const out = $('#out'), ix = c => { const i = ORDER.indexOf(c.id); return i < 0 ? 99 : i; }, list = CARDS.filter(c => enabled.has(c.id)).sort((a, b) => ix(a) - ix(b)).map(c => ({ ...c, html: c.render(S) })).filter(c => c.html !== '');
  out.innerHTML = `<div class="hdr"><code class="addr">${esc(S.label)}</code>${(S.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}<span class="muted" id="upd"></span></div>` + list.map(c =>
    `<section class="card w${c.w}" data-card="${c.id}"><h2>${c.title}${c.sub ? `<span class="sub">${typeof c.sub === 'function' ? c.sub(S) : c.sub}</span>` : ''}</h2>${c.html}</section>`).join('');
  const draw = () => list.forEach(c => { if (c.after) { try { c.after($(`[data-card=${c.id}]`, out), S); } catch (e) { console.error(c.id, e); } } });
  draw(); cancelAnimationFrame(render.raf); render.raf = requestAnimationFrame(() => { const w = out.clientWidth; if (w !== render.w) { render.w = w; draw(); } });
  $('#upd').textContent = 'updated ' + new Date().toLocaleTimeString('en-US', { hour12: false });
  $('#welcome').hidden = true;
}
function rememberWallet(a) { const r = [a, ...store.get('recent', []).filter(x => x !== a)].slice(0, 5); store.set('recent', r); renderRecent(); }
function renderRecent() { const r = store.get('recent', []); $('#recent').innerHTML = r.map(a => `<button class="chip" data-a="${esc(a)}">${esc(a.length > 14 ? a.slice(0, 6) + '…' + a.slice(-4) : a)}</button>`).join(''); }
function go(text) {
  const key = CFG.parse(text); if (!key) { status(CFG.badInput, true); return; }
  if (location.hash.slice(1) !== key) history.replaceState(null, '', '#' + key);
  $('#addr').value = key; CFG.load(key);
}
$('#recent').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) go(b.dataset.a); });
$('#form').addEventListener('submit', e => { e.preventDefault(); go($('#addr').value); });
$('#out').addEventListener('click', e => {
  const mo = e.target.closest('[data-more]'); if (mo && S) { const [k, all] = mo.dataset.more.split(':'); SHOWN[k] = all ? 1e9 : SHOWN[k] + 200; render(); return; }
  const th = e.target.closest('th[data-sort]'); if (th && S) { const k = th.dataset.sort; S.sortDir = S.sortKey === k ? -(S.sortDir || -1) : (k === 'k' ? 1 : -1); S.sortKey = k; render(); return; }
  const sa = e.target.closest('[data-acct]'); if (sa && CFG.pick) CFG.pick(sa.dataset.acct);
});
function renderCardsList() { $('#cardsList').innerHTML = CARDS.map(c => `<label class="chk"><input type="checkbox" data-c="${c.id}" ${enabled.has(c.id) ? 'checked' : ''}> ${c.title}</label>`).join(''); }
$('#cardsList').addEventListener('change', e => { const c = e.target.dataset.c; if (!c) return; e.target.checked ? enabled.add(c) : enabled.delete(c); store.set('cards', [...enabled]); render(); });
$('#cardsAll').onclick = () => { enabled = new Set(CARDS.map(c => c.id)); store.set('cards', [...enabled]); renderCardsList(); render(); };
$('#cardsNone').onclick = () => { enabled = new Set(); store.set('cards', []); renderCardsList(); render(); };
$('#cardsReset').onclick = () => { enabled = new Set(DEFAULT_CARDS); store.set('cards', [...enabled]); renderCardsList(); render(); };
$('#btnCards').onclick = () => { const p = $('#cardsPanel'); p.hidden = !p.hidden; $('#btnCards').setAttribute('aria-expanded', String(!p.hidden)); };
$('#depth').value = String(store.get('depth', CFG.depth)); if (!$('#depth').value) $('#depth').value = String(CFG.depth);
$('#depth').onchange = () => { store.set('depth', parseInt($('#depth').value, 10)); if (S) CFG.load(S.key, { keep: true }); };
$('#auto').checked = false;
let autoTimer; $('#auto').onchange = () => { clearInterval(autoTimer); if ($('#auto').checked) autoTimer = setInterval(() => { if (S && !document.hidden) CFG.load(S.key, { silent: true, keep: true }); }, 60000); };
const root = document.documentElement; { const t = store.get('theme', null); if (t) root.dataset.theme = t; }
$('#btnTheme').onclick = () => { const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; root.dataset.theme = dark ? 'light' : 'dark'; store.set('theme', root.dataset.theme); render(); };
addEventListener('hashchange', () => { if (location.hash.slice(1) === 'leaderboard') { showView('lb', true); return; } const k = CFG.parse(decodeURIComponent(location.hash.slice(1))); if (k && $('#viewStats').hidden) showView('stats', true); if (k && (!S || S.key !== k)) { $('#addr').value = k; CFG.load(k); } });
/* ---- Leaderboard tab: ranking of the whole exchange from the public data; every adapter describes its own CFG.lb */
const LB = { win: CFG.lb.win, sort: CFG.lb.sort, page: 0, rows: null, total: 0, found: null, tok: 0 };
const LBSIZE = 100, shortAddr = a => a.slice(0, 6) + '…' + a.slice(-4);
{ const w = store.get('lb_win', null), o = store.get('lb_sort', null); if (CFG.lb.wins.some(x => x[0] === w)) LB.win = w; if (CFG.lb.sorts.some(x => x[0] === o)) LB.sort = o; }
function lbUi() {
  $('#lbWin').innerHTML = CFG.lb.wins.map(w => `<button data-w="${w[0]}" type="button" class="${w[0] === LB.win ? 'on' : ''}">${w[1]}</button>`).join('');
  $('#lbSort').innerHTML = CFG.lb.sorts.map(o => `<button data-s="${o[0]}" type="button" class="${o[0] === LB.sort ? 'on' : ''}">${o[1]}</button>`).join('');
}
function lbStatus(html, err, busy) { const el = $('#lbStatus'); el.className = 'status' + (err ? ' err' : '') + (busy ? ' busy' : ''); el.innerHTML = (busy ? '<i class="spin"></i>' : '') + html; }
async function lbLoad(keepFound) {
  const tok = ++LB.tok; lbUi(); if (!keepFound) { LB.found = null; $('#lbFound').innerHTML = ''; } lbStatus('Loading the leaderboard…', false, true);
  try {
    const d = await CFG.lb.load(LB.win, LB.sort, LB.page, LBSIZE, m => { if (tok === LB.tok) lbStatus(m, false, true); });
    if (tok !== LB.tok) return;
    LB.rows = d.rows; LB.total = d.total; LB.note = d.note || ''; LB.at = d.at;
    lbStatus(`${fmt(LB.total, 0)} wallets · ${CFG.lb.wins.find(w => w[0] === LB.win)[1].toLowerCase()} · ${CFG.lb.sorts.find(o => o[0] === LB.sort)[1].toLowerCase()}${LB.at ? ' · data from ' + new Date(LB.at).toLocaleString('en-US', { hour12: false }) : ''}`);
    lbRender();
  } catch (e) { if (tok === LB.tok) lbStatus('Could not load the leaderboard: ' + esc(e.message), true); }
}
function lbRender() {
  const rows = LB.rows || []; if (!rows.length) { $('#lbTable').innerHTML = '<tr><td class="empty" style="text-align:center">No data</td></tr>'; $('#lbKpis').innerHTML = ''; $('#lbPager').innerHTML = ''; return; }
  const sum = k => rows.reduce((a, r) => a + (r[k] || 0), 0), ex = CFG.lb.extra || [];
  $('#lbKpis').innerHTML = [['Wallets in the ranking', fmt(LB.total, 0)], ['PnL of these ' + rows.length, smoney(sum('pnl'), 0)], ['Volume of these ' + rows.length, '$' + big(sum('vol'))], ['Profitable here', `${rows.filter(r => r.pnl > 0).length} of ${rows.length}`]].map(([k, v]) => `<div>${k}<b class="num">${v}</b></div>`).join('');
  const me = S && S.key, fd = LB.found && LB.found.addr, medal = r => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : fmt(r, 0);
  $('#lbTable').innerHTML = `<thead><tr><th>#</th><th style="text-align:left">Address</th><th>Account value</th><th>PnL</th><th>ROI</th><th>Volume</th>${ex.map(c => `<th>${c.t}</th>`).join('')}<th></th></tr></thead><tbody>` +
    rows.map(r => { const k = r.addr.toLowerCase(), mine = k === me || k === fd;
      return `<tr class="lbrow${mine ? ' me' : ''}"><td class="num"><span class="lbmedal">${medal(r.rank)}</span></td><td class="lbaddr" style="text-align:left" title="${esc(r.addr)}">${shortAddr(r.addr)} <button class="btn tiny" data-copy="${esc(r.addr)}" type="button" title="Copy address">copy</button></td><td class="num">${r.av == null ? '—' : '$' + big(r.av)}</td><td class="num ${cls(r.pnl)}">${r.pnl == null ? '—' : smoney(r.pnl, 0)}</td><td class="num ${cls(r.roi)}">${r.roi == null ? '—' : sgn(r.roi, 1) + '%'}</td><td class="num">${r.vol == null ? '—' : '$' + big(r.vol)}</td>${ex.map(c => `<td class="num">${c.f(r)}</td>`).join('')}<td><button class="btn tiny" data-open="${esc(r.addr)}" type="button">open stats</button></td></tr>`; }).join('') + '</tbody>';
  const pages = Math.max(1, Math.ceil(LB.total / LBSIZE));
  $('#lbPager').innerHTML = `<button class="btn small" data-pg="-1" type="button" ${LB.page <= 0 ? 'disabled' : ''}>‹ Previous</button><span>Page ${fmt(LB.page + 1, 0)} of ${fmt(pages, 0)} · ranks ${fmt(LB.page * LBSIZE + 1, 0)}–${fmt(LB.page * LBSIZE + rows.length, 0)}</span><button class="btn small" data-pg="1" type="button" ${LB.page >= pages - 1 ? 'disabled' : ''}>Next ›</button>`;
  $('#lbNote').textContent = LB.note;
}
async function lbPoints() {
  if (!CFG.lb.points) return; const card = $('#lbPointsCard');
  try {
    const p = await CFG.lb.points(); if (!p || !p.rows.length) return; card.hidden = false; $('#lbPointsSub').textContent = ' ' + p.sub; $('#lbPointsNote').textContent = p.note;
    $('#lbPoints').innerHTML = `<thead><tr><th>#</th><th style="text-align:left">Address</th><th>Points</th></tr></thead><tbody>` + p.rows.map(r => `<tr><td class="num">${fmt(r.rank, 0)}</td><td class="lbaddr" style="text-align:left">${esc(r.addr)}</td><td class="num">${fmt(r.points, 0)}</td></tr>`).join('') + '</tbody>';
  } catch (e) { console.warn(e); }
}
async function lbFind(text) {
  const key = CFG.parse(text), box = $('#lbFound'); if (!key || /^\d+$/.test(key)) { box.innerHTML = `<div class="lbfoundbox neg">Enter a wallet address: 0x followed by 40 hex characters</div>`; return; }
  box.innerHTML = '<div class="lbfoundbox"><i class="spin"></i><span id="lbFindMsg">Looking up…</span></div>';
  try {
    const f = await CFG.lb.find(key, LB.win, LB.sort, m => { const el = $('#lbFindMsg'); if (el) el.textContent = m; });
    if (!f) { box.innerHTML = `<div class="lbfoundbox">No data for <span class="lbaddr">${shortAddr(key)}</span> in this ranking (no trades or too small).</div>`; return; }
    LB.found = { addr: key }; const r = f.row;
    box.innerHTML = `<div class="lbfoundbox"><span class="lbaddr">${shortAddr(key)}</span><span><b>${f.rank ? 'Rank #' + fmt(f.rank, 0) : 'Rank unknown'}</b>${f.rank > LBSIZE ? ' <span class="muted">· outside this page</span>' : ''}</span><span>Account value ${r.av == null ? '—' : '$' + big(r.av)}</span><span class="${cls(r.pnl)}">PnL ${r.pnl == null ? '—' : smoney(r.pnl, 0)}</span><span>Volume ${r.vol == null ? '—' : '$' + big(r.vol)}</span> <button class="btn tiny" data-open="${esc(key)}" type="button">open stats</button></div>`;
    if (f.rank && f.rank > LB.page * LBSIZE && f.rank <= (LB.page + 1) * LBSIZE) lbRender();
  } catch (e) { box.innerHTML = `<div class="lbfoundbox neg">${esc(e.message)}</div>`; }
}
$('#lbWin').addEventListener('click', e => { const b = e.target.closest('button[data-w]'); if (!b) return; LB.win = b.dataset.w; LB.page = 0; store.set('lb_win', LB.win); lbLoad(); });
$('#lbSort').addEventListener('click', e => { const b = e.target.closest('button[data-s]'); if (!b) return; LB.sort = b.dataset.s; LB.page = 0; store.set('lb_sort', LB.sort); lbLoad(); });
$('#lbRefresh').onclick = () => lbLoad();
$('#lbFind').addEventListener('submit', e => { e.preventDefault(); lbFind($('#lbAddr').value); });
$('#lbPager').addEventListener('click', e => { const b = e.target.closest('[data-pg]'); if (!b) return; LB.page = Math.max(0, LB.page + (+b.dataset.pg)); lbLoad(true); });
document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]'); if (o) { const k = CFG.parse(o.dataset.open); if (k) { showView('stats'); $('#addr').value = k; go(k); } return; }
  const c = e.target.closest('[data-copy]'); if (c) { try { navigator.clipboard.writeText(c.dataset.copy); const t = c.textContent; c.textContent = 'copied'; setTimeout(() => { c.textContent = t; }, 1200); } catch (err) { } }
});
function showView(v, keepHash) {
  const lbv = v === 'lb';
  $('#viewStats').hidden = lbv; $('#viewLb').hidden = !lbv;
  document.querySelectorAll('#tabs .tab').forEach(t => t.classList.toggle('on', t.dataset.view === v));
  $('#btnCards').hidden = lbv; if (lbv) $('#cardsPanel').hidden = true;
  if (!keepHash) history.replaceState(null, '', lbv ? '#leaderboard' : (S ? '#' + S.key : location.pathname + location.search));
  if (lbv && !LB.rows) { lbLoad(); lbPoints(); } else if (lbv) lbRender();
}
$('#tabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t) showView(t.dataset.view); });

/* ---- period bar */
function renderPeriodBar() {
  const k = period.key, btn = (key, label) => `<button class="pbtn ${k === key ? 'on' : ''}" data-p="${key}" type="button">${label}</button>`;
  $('#periodbar').innerHTML = btn('all', 'All time') + PRESETS.map(p => btn(p[0], p[1] === '24 hours' ? '24 h' : p[1].replace(' days', ' d'))).join('') + btn('custom', 'Custom range…');
  $('#custom').hidden = k !== 'custom';
  $('#pnote').textContent = k === 'all' ? 'All time uses the number of most recent fills chosen on the right.' : 'Fills, funding, transfers and charts are limited to the selected period.';
}
const toGmtInput = ms => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const parseGmt = v => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(v.trim()); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : NaN; };
function applyPeriod(p) {
  period = p; renderPeriodBar();
  if (!S) return; S.fills = []; S.fillsDone = false; render(); CFG.load(S.key, { keep: true, silent: true });
}
$('#periodbar').addEventListener('click', e => {
  const b = e.target.closest('[data-p]'); if (!b) return; const key = b.dataset.p;
  if (key === 'custom') { const now = Date.now(); if (!period.from) { $('#pf').value = toGmtInput(now - DAY); $('#pt').value = toGmtInput(now); } period = { ...period, key: 'custom' }; renderPeriodBar(); if (period.from && period.to) applyPeriod(period); return; }
  applyPeriod({ key });
});
$('#pgo').onclick = () => { const f = parseGmt($('#pf').value), t = parseGmt($('#pt').value); if (isNaN(f) || isNaN(t)) { status('Use the format YYYY-MM-DD HH:MM (GMT), e.g. 2026-10-07 00:00', true); return; } if (!(f < t)) { status('Range start must be before its end', true); return; } applyPeriod({ key: 'custom', from: f, to: t }); };
renderPeriodBar();
/* platform volume of the last 24 hours and open interest, shown in the header and refreshed every minute */
async function loadPlatform() {
  try { const p = await CFG.platform(); $('#platV').textContent = '$' + big(p.vol); $('#platOI').textContent = '$' + big(p.oi); $('#plat').title = p.title + '\nUpdated ' + new Date().toLocaleTimeString('en-US', { hour12: false }) + '.'; }
  catch (e) { console.warn(e); $('#platV').textContent = '—'; $('#platOI').textContent = '—'; }
}
loadPlatform(); setInterval(() => { if (!document.hidden) loadPlatform(); }, 60000);

$('#ver').textContent = 'v1.0';
renderCardsList(); renderRecent();
if (location.hash.slice(1) === 'leaderboard') showView('lb', true); else { const k = CFG.parse(decodeURIComponent(location.hash.slice(1))); if (k) { $('#addr').value = k; CFG.load(k); } }
})();
