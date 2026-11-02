/* Pacifica Trade Stats — static, no backend. Reads the public Pacifica REST API (api.pacifica.fi) straight from the browser. */
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

/* ---------------------------------------------------------------- Pacifica adapter (public REST API, GET https://api.pacifica.fi/api/v1/…, no key) */
const API = 'https://api.pacifica.fi/api/v1';
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;                 // a Solana address
const safe = p => p.catch(e => (console.warn(e), null));
/* An IP gets 100 credits per 60 s. The header `ratelimit: "credits";r=<10 × credits left>;t=<seconds to the reset>` says how much is left, so the requests wait instead of failing. */
const RL = { left: 1000, until: 0 };
let FILLS_STOP = false;                                       // set by the “stop” button while the fills load
const STOP_BTN = ' <button class="linkbtn" data-stopfills type="button">Stop and show what is loaded</button>';
async function api(path, params = {}, o = {}) {
  const q = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v); });
  for (let a = 0; a < 6; a++) {
    if (RL.left < 120 && Date.now() < RL.until) {
      while (Date.now() < RL.until + 300 && !(o.halt && o.halt())) { if (o.say) o.say(`Waiting for the Pacifica API limit (${Math.ceil(Math.max(0, RL.until - Date.now()) / 1000)} s)…`); await sleep(250); }
      if (o.halt && o.halt()) return { data: [], has_more: false, halted: true };
      RL.left = 1000;
    }
    let r; try { r = await fetch(API + path + (q.toString() ? '?' + q : '')); } catch (e) { await sleep(800 * (a + 1)); continue; }
    const hd = r.headers.get('ratelimit'), m = hd && /r=(\d+);\s*t=(\d+)/.exec(hd); if (m) { RL.left = +m[1]; RL.until = Date.now() + (+m[2]) * 1000; }
    if (r.status === 429) { RL.left = 0; RL.until = Date.now() + 8000 * (a + 1); continue; }
    if (r.status >= 500) { await sleep(700 * (a + 1)); continue; }
    const d = await r.json().catch(() => null);
    if (!r.ok || !d || d.success === false) throw new Error((d && (d.error || d.message)) || 'HTTP ' + r.status);
    return d;
  }
  throw new Error('The Pacifica API is busy (rate limit): try again in a minute');
}
let PRX = null;
async function prices() { if (PRX && Date.now() - PRX.at < 30000) return PRX; const d = await api('/info/prices'); return PRX = { at: Date.now(), list: d.data || [], by: Object.fromEntries((d.data || []).map(x => [x.symbol, x])) }; }
const CFG = {
  prefix: 'pac_', depth: 10000, badInput: 'Invalid address: expected a Solana wallet address (base58, 32–44 characters)',
  parse: t => { t = String(t || '').trim(); return B58.test(t) ? t : null; },
  prepare: S => { S.risk = riskCalc(S); },
  load: (key, o) => loadWallet(key, o),
  platform: async () => {
    const L = (await prices()).list, oi = x => n(x.open_interest) * n(x.mark), top = L.slice().sort((a, b) => oi(b) - oi(a)).slice(0, 3).map(x => x.symbol + ' $' + big(oi(x))).join(', ');
    return { vol: L.reduce((s, x) => s + n(x.volume_24h), 0), oi: L.reduce((s, x) => s + oi(x), 0), title: `All ${L.length} markets on Pacifica (perpetual and spot).\nVolume: last 24 hours (rolling window).\nOI: open interest in USD (coins × mark price). Largest: ${top}.` };
  },
};

/* ---------- normalizers */
function normTrade(f) {                                      // side: open_long / close_long / open_short / close_short; pnl of the API is already net of the fee
  const s = String(f.side), buy = s === 'open_long' || s === 'close_short', fee = n(f.fee);
  return { t: f.created_at, m: f.symbol, side: buy ? 'B' : 'S', sz: n(f.amount), px: n(f.price), fee, pnl: n(f.pnl) + fee, maker: f.event_type === 'fulfill_maker', liq: !!f.cause && f.cause !== 'normal', dir: s.replace('_', ' '), cause: f.cause, tid: f.history_id };
}
function normPos(p, by) {
  const px = by[p.symbol], mark = px ? n(px.mark) : 0, amt = n(p.amount), long = p.side === 'bid', entry = n(p.entry_price), value = amt * mark;
  return { sym: p.symbol, long, amt, entry, mark, value, upnl: mark ? (mark - entry) * amt * (long ? 1 : -1) : 0, funding: n(p.funding), iso: !!p.isolated, margin: n(p.margin), liq: p.liquidation_price == null || n(p.liquidation_price) <= 0 ? null : n(p.liquidation_price), realized: n(p.realized_pnl), t0: p.created_at, t1: p.updated_at };
}
function riskCalc(S) {
  const a = S.acc, eq = n(a.account_equity), pos = S.pos; let gross = 0, long = 0, short = 0; pos.forEach(p => { gross += p.value; p.long ? long += p.value : short += p.value; });
  const mm = n(a.cross_mmr), im = n(a.total_margin_used); return { eq, mm, im, gross, long, short, lev: eq > 0 ? gross / eq : null, buffer: eq - mm, pos };
}

/* ---------- loading: cursor pages, newest first */
async function pages(path, params, o) {
  const out = []; let cursor = null;
  for (let g = 0; g < 60; g++) {
    const d = await api(path, { ...params, cursor, limit: o.limit || 1000 }, { say: o.say, halt: o.halt }); if (o.stop && o.stop()) return null;
    const rows = Array.isArray(d.data) ? d.data : []; out.push(...rows); if (o.onPage) o.onPage(out);
    if (!d.has_more || !d.next_cursor || !rows.length || out.length >= o.max || (o.halt && o.halt())) break; cursor = d.next_cursor;
  }
  return out;
}
async function loadFills(key, depth, my) {
  const pr = getPeriod(), seen = new Set(), out = [];
  const rows = await pages('/trades/history', { account: key, ...(pr ? { start_time: Math.floor(pr.from), end_time: Math.ceil(pr.to) } : {}) }, { max: depth, stop: () => my !== runId, halt: () => FILLS_STOP, say: m => status(m + STOP_BTN), onPage: r => status(`Loading fills… ${fmt(r.length, 0)}${STOP_BTN}`) });
  if (!rows) return null;
  for (const f of rows) if (!seen.has(f.history_id)) { seen.add(f.history_id); out.push(normTrade(f)); }
  out.sort((a, b) => b.t - a.t); return { fills: out.slice(0, depth), truncated: rows.length >= depth || FILLS_STOP, stopped: FILLS_STOP };
}
async function loadFunding(key, my) {
  const pr = getPeriod(), from = pr ? pr.from : Date.now() - 90 * 864e5, rows = await pages('/funding/history', { account: key }, { max: 8000, stop: () => my !== runId });
  if (!rows) return null;
  return rows.filter(x => x.created_at >= from && (!pr || x.created_at <= pr.to)).map(x => ({ t: x.created_at, m: x.symbol, usdc: n(x.payout), rate: n(x.rate), szi: n(x.amount) * (x.side === 'ask' ? -1 : 1) }));
}
const FLOW = /^(deposit|deposit_release|withdraw|subaccount_transfer|payout)$/;
async function loadLedger(key, my) {
  const rows = await pages('/account/balance/history', { account: key }, { max: 6000, stop: () => my !== runId });
  return rows ? rows.filter(x => FLOW.test(x.event_type) || /liquidation/.test(x.event_type)).map(x => ({ t: x.created_at, type: x.event_type, usd: n(x.amount) })) : null;
}
async function loadPortfolio(key) {
  const pr = getPeriod(), span = pr ? pr.to - pr.from : Infinity, tr = span <= DAY ? '1d' : span <= 7 * DAY ? '7d' : span <= 30 * DAY ? '30d' : 'all';
  const d = await api('/portfolio', { account: key, time_range: tr }); return (d.data || []).map(x => ({ t: x.timestamp, eq: n(x.account_equity), pnl: n(x.pnl) }));
}
function CURVE(S, k) {                                      // equity / PnL history of the exchange, clipped to the period (PnL re-based to the period start)
  const pr = getPeriod(); let pts = (S.port || []).map(p => [p.t, p[k]]); if (!pr) return pts;
  pts = pts.filter(p => p[0] >= pr.from && p[0] <= pr.to); if (pts.length < 2) return [];
  return k === 'pnl' ? pts.map(p => [p[0], p[1] - pts[0][1]]) : pts;
}
async function loadWallet(key, opts = {}) {
  const my = ++runId, say = m => { if (my === runId) status(m); }; FILLS_STOP = false;
  if (!opts.silent) { status('Loading wallet data…'); S = null; $('#out').innerHTML = ''; $('#welcome').hidden = true; }
  let acc, pos, prx;
  try { [acc, pos, prx] = await Promise.all([api('/account', { account: key }, { say }), api('/positions', { account: key }, { say }), prices()]); }
  catch (e) { status('Error: ' + esc(e.message), true); return; }
  if (my !== runId) return;
  const A = acc.data || {}, P = (pos.data || []).map(p => normPos(p, prx.by));
  if (A.account_equity == null && !P.length) { status('No Pacifica account found for this address.', true); return; }
  const keep = opts.keep && S && S.key === key;
  S = { key, label: key, tags: [], acc: A, pos: P, prx: prx.by, fills: keep ? S.fills : [], fillsDone: false, funding: keep ? S.funding : null, ledger: keep ? S.ledger : null, port: keep ? S.port : null, orders: keep ? S.orders : [], ohist: keep ? S.ohist : null, sets: keep ? S.sets : null, lakes: keep ? S.lakes : null, sortKey: S && S.sortKey, sortDir: S && S.sortDir };
  rememberWallet(key); status(''); render();
  const live = () => my === runId && S && S.key === key;
  const [ord, port, fund, led, oh, sets] = await Promise.all([safe(api('/orders', { account: key }, { say })), safe(loadPortfolio(key)), safe(loadFunding(key, my)), safe(loadLedger(key, my)), safe(api('/orders/history', { account: key, limit: 100 }, { say })), safe(api('/account/settings', { account: key }, { say }))]);
  if (!live()) return;
  S.orders = ord && ord.data || []; S.port = port || []; S.funding = fund; S.ledger = led; S.ohist = oh && oh.data || []; S.sets = sets && sets.data || null; render();
  try {
    const r = await loadFills(key, +$('#depth').value, my); if (!live() || !r) return;
    S.fills = r.fills; S.fillsDone = true; S.trunc = r.truncated; S.stopped = r.stopped; render(); status(r.stopped ? `Stopped: the statistics cover the ${fmt(r.fills.length, 0)} fills loaded so far.` : r.truncated ? (getPeriod() ? 'This period has more fills than the chosen depth: the statistics cover the loaded part only.' : ($('#depth').selectedIndex < $('#depth').options.length - 1 ? 'Showing the most recent fills only; pick a larger depth to analyze more.' : 'This is the largest depth the page loads: the statistics cover the latest ' + fmt(r.fills.length, 0) + ' fills only.')) : '');
  } catch (e) { if (live()) status('Fills: ' + esc(e.message), true); }
  safe(api('/lake/list', { account: key })).then(d => { if (!live() || !d) return; S.lakes = (d.data && d.data.lakes) || []; if (S.lakes.some(x => x.address === key)) S.tags = ['Pacifica vault']; render(); });
}

/* ---------------------------------------------------------------- cards */
const feeRate = x => fmt(n(x) * 100, 3) + '%';
const CARDS = [
  { id: 'summary', title: 'Account', w: 4, render(S) {
    const a = S.acc, upnl = S.pos.reduce((s, p) => s + p.upnl, 0);
    return `<div class="big num">${money(n(a.account_equity))}</div><div class="rows">` +
      row('Balance', money(n(a.balance)), 'Cash balance before the unrealized PnL of the open positions.') + row('Unrealized PnL', `<span class="${cls(upnl)}">${smoney(upnl)}</span>`, 'Sum of the unrealized PnL of open positions at current mark prices.') +
      row('Available to spend', money(n(a.available_to_spend))) + row('Available to withdraw', money(n(a.available_to_withdraw))) + row('Margin used', money(n(a.total_margin_used))) +
      (n(a.spot_market_value) ? row('Spot assets', money(n(a.spot_market_value))) : '') + (n(a.pending_balance) ? row('Pending balance', money(n(a.pending_balance))) : '') +
      row('Fee level', `${a.fee_level == null ? '—' : a.fee_level} · maker ${feeRate(a.maker_fee)} · taker ${feeRate(a.taker_fee)}`) +
      row('Open positions / orders', `${fmt(S.pos.length, 0)} / ${fmt(n(a.orders_count), 0)}${n(a.stop_orders_count) ? ' + ' + fmt(n(a.stop_orders_count), 0) + ' stop' : ''}`) + (a.updated_at ? row('State as of', dtl(a.updated_at)) : '') + `</div>`;
  } },
  { id: 'volume', title: 'Volume & fees', sub: fsub, w: 4, render(S) {
    const F = S.fs, a = S.acc;
    return `<div class="big num">$${big(F.vol)}</div><div class="muted" style="margin:-6px 0 6px">volume of the loaded fills</div><div class="rows">` + row('Fills', fmt(F.n, 0)) + row('Fees paid', money(F.fees)) +
      row('Maker / taker (by volume)', F.vol ? `${fmt(F.mvol / F.vol * 100, 0)}% / ${fmt(F.tvol / F.vol * 100, 0)}%` : '—') + row('Average fill size', F.n ? money(F.vol / F.n, 0) : '—') +
      row('Fee level now', `${a.fee_level == null ? '—' : a.fee_level}`, 'The fee level follows the trading volume of the account.') + row('Maker / taker rate', `${feeRate(a.maker_fee)} / ${feeRate(a.taker_fee)}`) + `</div>` +
      `<p class="note">Volume and fees count the loaded fills only (chosen depth or period).</p>`;
  } },
  { id: 'pnl', title: 'Profit', w: 4, render(S) {
    const pr = getPeriod(), F = S.fs, fund = S.funding ? S.funding.filter(x => inP(pr, x.t)).reduce((a, x) => a + x.usdc, 0) : null, c = CURVE(S, 'pnl'), ex = c.length ? c[c.length - 1][1] : null, upnl = S.pos.reduce((s, p) => s + p.upnl, 0), net = F.pnl - F.fees + (fund || 0);
    return `<div class="big num ${cls(ex == null ? net : ex)}">${smoney(ex == null ? net : ex)}</div><div class="muted" style="margin:-6px 0 6px">${ex == null ? 'fills + funding' : 'PnL by the exchange'} · ${pr ? esc(pr.label) : 'all time'}</div><div class="rows">` +
      row('Unrealized PnL', `<span class="${cls(upnl)}">${smoney(upnl)}</span>`) + row('Realized PnL (loaded fills)', `<span class="${cls(F.pnl)}">${smoney(F.pnl)}</span>`, 'Realized PnL of the closing fills before the fee.') +
      row('Fees (loaded fills)', money(-F.fees)) + row('Funding' + (pr ? '' : ' (last 90 days)'), fund == null ? '—' : `<span class="${cls(fund)}">${smoney(fund)}</span>`) + row('Net (fills + funding)', `<span class="${cls(net)}">${smoney(net)}</span>`) +
      row('PnL per $1M volume', F.vol ? `<span class="${cls(net)}">${smoney(net / F.vol * 1e6, 0)}</span>` : '—') + `</div>` +
      `<p class="note">“PnL by the exchange” is the account PnL of the Pacifica API (equity change without deposits and withdrawals); the other rows count only the loaded fills.</p>`;
  } },
  { id: 'equity', title: 'Equity', sub: () => getPeriod() ? getPeriod().label : 'all time', w: 6, render() { return '<div class="chartbox" data-ch="equity"></div>'; },
    after(el, S) { const b = $('[data-ch=equity]', el); if (!S.port) { b.innerHTML = '<div class="empty">Loading…</div>'; return; }
      lineChart(b, CURVE(S, 'eq'), { color: css('--s1'), area: true, minRange: 1, axis: v => money(v, 0), tip: v => money(v, 2), xfmt: dshort }); } },
  { id: 'pnlchart', title: 'PnL over period', sub: () => 'excludes deposits · ' + (getPeriod() ? getPeriod().label : 'all time'), w: 6, render() { return '<div class="chartbox" data-ch="pnlh"></div>'; },
    after(el, S) { const b = $('[data-ch=pnlh]', el); if (!S.port) { b.innerHTML = '<div class="empty">Loading…</div>'; return; }
      lineChart(b, CURVE(S, 'pnl'), { color: css('--s2'), zero: true, minRange: 1, axis: v => smoney(v, 0), tip: v => smoney(v, 2), xfmt: dshort }); } },
  riskCard,
  { id: 'positions', title: 'Open positions', sub: 'now', w: 12, render(S) {
    const pos = S.pos; if (!pos.length) return '<div class="empty">No open positions</div>';
    const lev = sym => { const m = S.sets && (S.sets.margin_settings || []).find(x => x.symbol === sym); return m ? `${m.leverage}× ${m.isolated ? 'isolated' : 'cross'}` : '—'; };
    return `<div class="scroll"><table><thead><tr><th>Market</th><th>Side</th><th>Size</th><th>Size $</th><th>Entry</th><th>Mark</th><th>uPnL</th><th>uPnL %</th><th>Leverage</th><th>Margin</th><th>Liq. price</th><th>Funding since open</th><th>Opened</th></tr></thead><tbody>` +
      pos.slice().sort((a, b) => b.value - a.value).map(p => `<tr><td>${esc(p.sym)}</td><td><span class="tag ${p.long ? 'ok' : 'bad'}">${p.long ? '▲ LONG' : '▼ SHORT'}</span></td><td class="num">${fmt(p.amt, 4)}</td><td class="num">${money(p.value)}</td><td class="num">${pxf(p.entry)}</td><td class="num">${pxf(p.mark)}</td><td class="num ${cls(p.upnl)}">${smoney(p.upnl)}</td><td class="num ${cls(p.upnl)}">${p.entry ? sgn(p.upnl / (p.entry * p.amt) * 100, 2) + '%' : '—'}</td><td>${lev(p.sym)}</td><td class="num">${p.iso ? money(p.margin) : '—'}</td><td class="num">${p.liq ? pxf(p.liq) : '—'}</td><td class="num ${cls(-p.funding)}">${smoney(-p.funding)}</td><td>${p.t0 ? dtl(p.t0) : '—'}</td></tr>`).join('') + `</tbody></table></div>`;
  } },
  { id: 'funding', title: 'Funding', sub: () => getPeriod() ? getPeriod().label : 'last 90 days', w: 6, render(S) {
    if (!S.funding) return '<div class="empty">Loading funding…</div>'; const fr = S.funding.filter(x => inP(getPeriod(), x.t)); if (!fr.length) return '<div class="empty">No funding payments in this period</div>';
    const by = {}; let tot = 0; fr.forEach(x => { by[x.m] = (by[x.m] || 0) + x.usdc; tot += x.usdc; });
    return `<div class="rows">` + row('Net funding (received +)', `<span class="${cls(tot)}">${smoney(tot)}</span>`) + `</div><div class="rows" style="margin-top:12px">` +
      Object.entries(by).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 12).map(([m, v]) => row(esc(m), `<span class="${cls(v)}">${smoney(v)}</span>`)).join('') + `</div>`;
  } },
  { id: 'transfers', title: 'Deposits & withdrawals', w: 6, render(S) {
    if (!S.ledger) return '<div class="empty">Loading…</div>';
    const pr = getPeriod(), rows = S.ledger.filter(x => inP(pr, x.t)), dep = rows.filter(x => /^deposit/.test(x.type)).reduce((s, x) => s + x.usd, 0), wd = rows.filter(x => x.type === 'withdraw').reduce((s, x) => s + x.usd, 0), liq = rows.filter(x => /liquidation/.test(x.type)).reduce((s, x) => s + x.usd, 0);
    if (!rows.length) return '<div class="empty">No deposits or withdrawals in this period</div>';
    return `<div class="rows">` + row('Deposits', money(dep)) + row('Withdrawals', money(-wd)) + row('Net deposits', `<span class="${cls(dep + wd)}">${smoney(dep + wd)}</span>`) + (liq ? row('Liquidation losses', `<span class="neg">${smoney(liq)}</span>`) : '') + `</div>` +
      `<div class="scroll" style="max-height:220px;margin-top:10px"><table><thead><tr><th>Time</th><th>Type</th><th>Amount</th></tr></thead><tbody>` + rows.slice(0, 60).map(x => `<tr><td>${dtl(x.t)}</td><td>${esc(x.type.replace('_', ' '))}</td><td class="num ${cls(x.usd)}">${smoney(x.usd)}</td></tr>`).join('') + `</tbody></table></div>`;
  } },
  { id: 'orders', title: 'Open orders', sub: S => String(S.orders.length), w: 6, render(S) {
    if (!S.orders.length) return '<div class="empty">No open orders</div>';
    return `<div class="scroll"><table><thead><tr><th>Market</th><th>Side</th><th>Type</th><th>Price</th><th>Size</th><th>Filled</th><th>Flags</th><th>Created</th></tr></thead><tbody>` +
      S.orders.slice(0, 100).map(o => `<tr><td>${esc(o.symbol)}</td><td><span class="tag ${o.side === 'bid' ? 'ok' : 'bad'}">${o.side === 'bid' ? 'BUY' : 'SELL'}</span></td><td>${esc(String(o.order_type || '').replace(/_/g, ' '))}</td><td class="num">${o.stop_price ? pxf(n(o.stop_price)) + ' stop' : pxf(n(o.price))}</td><td class="num">${fmt(n(o.initial_amount), 4)}</td><td class="num">${fmt(n(o.filled_amount), 4)}</td><td>${o.reduce_only ? 'reduce-only' : '—'}</td><td>${dtl(o.created_at)}</td></tr>`).join('') + `</tbody></table></div>`;
  } },
  { id: 'vaults', title: 'Vaults', sub: S => S.lakes ? String(S.lakes.filter(x => n(x.user_share) > 0 || x.address === S.key || x.manager === S.key || x.creator === S.key).length) : '', w: 6, render(S) {
    if (!S.lakes) return '<div class="empty">Loading…</div>';
    const mine = S.lakes.filter(x => n(x.user_share) > 0 || x.address === S.key || x.manager === S.key || x.creator === S.key); if (!mine.length) return '<div class="empty">No vaults: this address neither runs a vault nor holds vault shares</div>';
    return `<div class="scroll"><table><thead><tr><th>Vault</th><th>Role</th><th>Equity</th><th>Your shares</th><th>Manager profit share</th><th>Created</th></tr></thead><tbody>` +
      mine.slice(0, 40).map(x => `<tr><td title="${esc(x.address)}">${esc(x.nickname || x.address.slice(0, 6) + '…')}</td><td>${x.address === S.key ? 'this wallet' : x.manager === S.key ? 'manager' : x.creator === S.key ? 'creator' : 'investor'}</td><td class="num">${money(n(x.last_checked_equity), 0)}</td><td class="num">${n(x.user_share) ? fmt(n(x.user_share), 2) : '—'}</td><td class="num">${x.config && x.config.manager_profit_share != null ? fmt(n(x.config.manager_profit_share) * 100, 0) + '%' : '—'}</td><td>${x.created_at ? dtl(x.created_at) : '—'}</td></tr>`).join('') + `</tbody></table></div>`;
  } },
  { id: 'orderhist', title: 'Order history', sub: S => S.ohist ? `${S.ohist.length} latest` : '', w: 12, render(S) {
    if (!S.ohist) return '<div class="empty">Loading…</div>'; if (!S.ohist.length) return '<div class="empty">No orders</div>';
    return `<div class="scroll"><table><thead><tr><th>Time</th><th>Market</th><th>Side</th><th>Type</th><th>Price</th><th>Avg fill</th><th>Size</th><th>Filled</th><th>Status</th></tr></thead><tbody>` +
      S.ohist.slice(0, 100).map(o => `<tr><td>${dtl(o.created_at)}</td><td>${esc(o.symbol)}</td><td><span class="tag ${o.side === 'bid' ? 'ok' : 'bad'}">${o.side === 'bid' ? 'BUY' : 'SELL'}</span></td><td>${esc(String(o.order_type || '').replace(/_/g, ' '))}</td><td class="num">${pxf(n(o.initial_price))}</td><td class="num">${n(o.average_filled_price) ? pxf(n(o.average_filled_price)) : '—'}</td><td class="num">${fmt(n(o.amount), 4)}</td><td class="num">${fmt(n(o.filled_amount), 4)}</td><td class="${o.order_status === 'filled' ? 'pos' : /cancel|reject/i.test(o.order_status) ? 'neg' : ''}">${esc(String(o.order_status || '').replace(/_/g, ' '))}${o.reason ? ' · ' + esc(String(o.reason)) : ''}</td></tr>`).join('') + `</tbody></table></div>`;
  } },
].concat(COMMON_CARDS);
const DEFAULT_CARDS = CARDS.map(c => c.id);
const ORDER = ['summary', 'volume', 'pnl', 'equity', 'pnlchart', 'risk', 'positions', 'activity', 'curve', 'daily', 'hourly', 'bymarket', 'funding', 'transfers', 'orders', 'fills', 'vaults', 'orderhist'];

/* ---------------------------------------------------------------- render + page wiring */
function status(html, err) { const s = $('#status'), busy = /^Loading/.test(html); s.className = 'status' + (err ? ' err' : '') + (busy ? ' busy' : ''); s.innerHTML = (busy ? '<i class="spin"></i>' : '') + html; }
let enabled = new Set(store.get('cards', DEFAULT_CARDS));
{ const seen = new Set(store.get('cards_seen', [])); DEFAULT_CARDS.forEach(id => { if (!seen.has(id)) enabled.add(id); }); store.set('cards_seen', DEFAULT_CARDS); store.set('cards', [...enabled]); }
const isIdle = S => S.fillsDone && !S.fills.length && !S.pos.length && n(S.acc.balance) < 1 && !(S.ledger || []).length && !(S.funding || []).length && !(S.orders || []).length && !(S.ohist || []).length;   // nothing ever happened on this account
function render() {
  if (!S) return;
  S.fs = fillStats(S.fills); if (CFG.prepare) CFG.prepare(S);
  const out = $('#out'), ix = c => { const i = ORDER.indexOf(c.id); return i < 0 ? 99 : i; }; let list = CARDS.filter(c => enabled.has(c.id)).sort((a, b) => ix(a) - ix(b)).map(c => ({ ...c, html: c.render(S) })).filter(c => c.html !== '');
  if (isIdle(S)) { const sm = list.find(c => c.id === 'summary'); list = [sm, { id: 'idle', title: 'No activity', w: 8, html: '<div class="empty">This account has no trades, open positions, orders or deposits on Pacifica yet (balance about $0), so there is nothing to analyze.</div>' }].filter(Boolean); }
  else if (S.fillsDone && !S.fills.length) { list = list.filter(c => !['activity', 'curve', 'daily', 'hourly', 'bymarket', 'fills'].includes(c.id)); const at = list.findIndex(c => c.id === 'positions'); list.splice(at < 0 ? list.length : at + 1, 0, { id: 'nofills', title: 'No trades', w: 8, html: '<div class="empty">' + (S.stopped ? 'Loading was stopped before any trades arrived. Reload the wallet to try again.' : getPeriod() ? 'No trades in this period.' : 'No trades found for this account.') + '</div>' }); }
  out.innerHTML = `<div class="hdr"><code class="addr">${esc(S.label)}</code>${(S.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}${S.trunc ? `<span class="tag" style="background:var(--warn-bg);color:var(--warn)" title="Only the most recent fills fit the page limit, so volume, fees and PnL below count only the loaded fills.">${S.stopped ? 'stopped early: ' + fmt(S.fills.length, 0) + ' fills loaded' : 'history incomplete: latest ' + fmt(S.fills.length, 0) + ' fills'}</span>` : ''}<span class="muted" id="upd"></span></div>` + list.map(c =>
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
addEventListener('hashchange', () => { const k = CFG.parse(decodeURIComponent(location.hash.slice(1))); if (k && (!S || S.key !== k)) { $('#addr').value = k; CFG.load(k); } });
document.addEventListener('click', e => { if (e.target.closest('[data-stopfills]')) { FILLS_STOP = true; status('Stopping…'); } });
document.addEventListener('click', e => {
  const c = e.target.closest('[data-copy]'); if (c) { try { navigator.clipboard.writeText(c.dataset.copy); const t = c.textContent; c.textContent = 'copied'; setTimeout(() => { c.textContent = t; }, 1200); } catch (err) { } }
});

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
{ const k = CFG.parse(decodeURIComponent(location.hash.slice(1))); if (k) { $('#addr').value = k; CFG.load(k); } }
})();
