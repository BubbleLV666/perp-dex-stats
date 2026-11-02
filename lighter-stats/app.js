/* Lighter Trade Stats — static, no backend. Reads the public Lighter API straight from the browser. */
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
/* hold time: a round trip starts when a market goes from flat to a position and ends when it is flat again (or flips to the other side).
   A closing fill that arrives while the market is flat in the loaded history belongs to a position opened before it: that trip is skipped. Spot markets (BASE/QUOTE) are not included. */
function holdTrips(fills) {
  const pos = {}, trips = [];
  for (const f of fills.slice().sort((a, b) => a.t - b.t)) {
    if (String(f.m).includes('/')) continue;
    const st = pos[f.m] || (pos[f.m] = { p: 0, t0: 0, pnl: 0, long: true }), d = f.side === 'B' ? f.sz : -f.sz;
    if (Math.abs(st.p) < 1e-9) { if (f.pnl) continue; st.p = d; st.t0 = f.t; st.pnl = -f.fee; st.long = d > 0; continue; }
    const np = st.p + d; st.pnl += f.pnl - f.fee;
    if (Math.abs(np) < 1e-7 || st.p * np < 0) {
      trips.push({ m: f.m, t0: st.t0, t1: f.t, dur: f.t - st.t0, pnl: st.pnl, long: st.long });
      if (Math.abs(np) < 1e-7) st.p = 0; else { st.p = np; st.t0 = f.t; st.pnl = 0; st.long = np > 0; }
    } else st.p = np;
  }
  return trips;
}
const durFmt = ms => { const s = Math.round(ms / 1000); if (s < 60) return s + 's'; const m = Math.floor(s / 60); if (m < 60) return m + 'm ' + String(s % 60).padStart(2, '0') + 's'; const h = Math.floor(m / 60); if (h < 24) return h + 'h ' + String(m % 60).padStart(2, '0') + 'm'; const d = Math.floor(h / 24); return d + 'd ' + (h % 24) + 'h'; };
const med = a => { const x = a.slice().sort((p, q) => p - q), k = x.length >> 1; return x.length % 2 ? x[k] : (x[k - 1] + x[k]) / 2; };
const fsub = S => { const pr = getPeriod(); return (pr ? pr.label + ' · ' : '') + (S.fillsDone ? `${fmt(S.vf.length, 0)} fills` : 'loading…'); };
const SHOWN = { fills: 100 };
const moreNote = (k, total, what) => total <= SHOWN[k] ? '' : `<p class="note">Showing the latest ${fmt(SHOWN[k], 0)} of ${fmt(total, 0)} ${what}. <button class="linkbtn" data-more="${k}" type="button">Show 200 more</button> <button class="linkbtn" data-more="${k}:all" type="button">Show all</button></p>`;
const COMMON_CARDS = [
  { id: 'activity', title: 'Trading style', sub: fsub, w: 4, render(S) {
    const F = S.fs; if (!S.vf.length) return S.fillsDone ? '<div class="empty">No fills</div>' : '<div class="empty">Loading fills…</div>';
    const span = (F.t1 - F.t0) / 1000, closed = F.wins + F.losses, pf = F.lossSum ? F.winSum / -F.lossSum : null;
    return `<div class="rows">` + row('Fills', fmt(F.n, 0)) + row('Period', `${dtl(F.t0)} – ${dtl(F.t1)}`) + row('Volume', '$' + big(F.vol)) +
      row('Maker / taker (by volume)', `${fmt(F.mvol / (F.vol || 1) * 100, 0)}% / ${fmt(F.tvol / (F.vol || 1) * 100, 0)}%`) +
      row('Average fill size', money(F.vol / F.n, 0)) + row('Fills per hour', span > 60 ? fmt(F.n / (span / 3600), 1) : '—') +
      row('Win rate (closing fills)', closed ? fmt(F.wins / closed * 100, 1) + '%' : '—', 'Share of closing fills with a positive realized PnL.') +
      row('Average win / loss', closed ? `${smoney(F.wins ? F.winSum / F.wins : 0, 3)} / ${smoney(F.losses ? F.lossSum / F.losses : 0, 3)}` : '—') +
      row('Profit factor', pf == null ? '—' : fmt(pf, 2), 'Gross profit divided by gross loss of closing fills.') + row('Best / worst', `${smoney(F.maxWin, 2)} / ${smoney(F.maxLoss, 2)}`) +
      row('Realized PnL − fees', `<span class="${cls(F.pnl - F.fees)}">${smoney(F.pnl - F.fees, 2)}</span>`) +
      row('Buys / sells', `${fmt(F.buyVol / (F.vol || 1) * 100, 0)}% / ${fmt(F.sellVol / (F.vol || 1) * 100, 0)}%`) +
      (F.liqs ? row('Liquidation fills', `<span class="neg">${F.liqs}</span>`) : '') + `</div>` + (MODE === 'spot' ? '<p class="note">The exchange reports no PnL per spot fill, so win rate, profit factor and the PnL curve stay empty here. Spot PnL for the period is in the Profit card.</p>' : '');
  } },
  { id: 'hold', title: 'Hold time', sub: fsub, w: 4, render(S) {
    if (MODE === 'spot') return '<div class="empty">Hold time is for perpetual positions: pick Perps or All</div>';
    if (!S.vf.length) return S.fillsDone ? '<div class="empty">No fills</div>' : '<div class="empty">Loading fills…</div>';
    const T = holdTrips(S.vf); if (!T.length) return '<div class="empty">No position was both opened and closed within the loaded fills. Pick a larger fills depth to look further back.</div>';
    const D = T.map(t => t.dur), avg = a => a.length ? durFmt(a.reduce((x, y) => x + y, 0) / a.length) : '—', W = T.filter(t => t.pnl > 0).map(t => t.dur), L = T.filter(t => t.pnl < 0).map(t => t.dur), lg = T.filter(t => t.long).map(t => t.dur), sh = T.filter(t => !t.long).map(t => t.dur);
    return `<div class="rows">` + row('Closed positions', fmt(T.length, 0), 'A position counts from the first fill that opens it in a market until the market is flat again (or flips to the other side).') + row('Median hold time', durFmt(med(D))) + row('Average hold time', avg(D)) +
      row('Shortest / longest', `${durFmt(Math.min(...D))} / ${durFmt(Math.max(...D))}`) + row('Winners: average', `<span class="pos">${avg(W)}</span>`, 'Closed positions with a positive result (realized PnL − fees).') + row('Losers: average', `<span class="neg">${avg(L)}</span>`) +
      row('Long / short: average', `${avg(lg)} / ${avg(sh)}`) + `</div><p class="note">Counts positions opened and closed within the loaded fills${S.trunc ? '; the history is incomplete, so long positions are missing' : ''}. Positions still open are not included.</p>`;
  } },
  { id: 'streaks', title: 'Win / loss streaks', sub: fsub, w: 4, render(S) {
    if (MODE === 'spot') return '<div class="empty">Streaks are for perpetual positions: pick Perps or All</div>';
    if (!S.vf.length) return S.fillsDone ? '<div class="empty">No fills</div>' : '<div class="empty">Loading fills…</div>';
    const T = holdTrips(S.vf).sort((a, b) => a.t1 - b.t1); if (!T.length) return '<div class="empty">No position was both opened and closed within the loaded fills. Pick a larger fills depth to look further back.</div>';
    let cw = 0, cl = 0, bw = 0, bl = 0, wins = 0;
    for (const t of T) { if (t.pnl > 0) { wins++; cw++; cl = 0; bw = Math.max(bw, cw); } else { cl++; cw = 0; bl = Math.max(bl, cl); } }
    const now = cw ? `<span class="pos">${cw} win${cw > 1 ? 's' : ''}</span>` : `<span class="neg">${cl} loss${cl > 1 ? 'es' : ''}</span>`;
    return `<div class="rows">` + row('Closed positions', `${fmt(T.length, 0)} <small class="muted">(${fmt(wins, 0)} won · ${fmt(T.length - wins, 0)} lost)</small>`, 'A position counts from the first fill that opens it in a market until the market is flat again (or flips). Won = realized PnL − fees above zero.') +
      row('Current streak', now, 'Positions in a row with the same result, counted back from the latest closed position.') + row('Best win streak', `<span class="pos">${bw}</span>`) + row('Worst loss streak', `<span class="neg">${bl}</span>`) + `</div>` +
      `<p class="note">Counts positions opened and closed within the loaded fills${S.trunc ? '; the history is incomplete, so long positions are missing' : ''}. Not to be confused with the leaderboard's active-day streak.</p>`;
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
    if (!S.vf.length) return S.fillsDone ? '<div class="empty">No fills</div>' : '<div class="empty">Loading fills…</div>';
    const rows = S.vf.slice().sort((a, b) => b.t - a.t).slice(0, SHOWN.fills);
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

/* ---------------------------------------------------------------- Lighter adapter (GET https://mainnet.zklighter.elliot.ai/api/v1) */
const API = 'https://mainnet.zklighter.elliot.ai/api/v1';
const EVM = /^0x[0-9a-fA-F]{40}$/;
const CFG = {
  prefix: 'lt_', depth: 1000, badInput: 'Enter an Ethereum address (0x + 40 hex characters) or a numeric Lighter account ID',
  parse: t => { t = String(t || '').trim().replace(/^#/, ''); return EVM.test(t) ? t.toLowerCase() : /^\d{1,12}$/.test(t) ? String(+t) : null; },
  prepare: S => { S.risk = riskCalc(S); },
  load: (key, o) => loadWallet(key, o),
  pick: idx => pickAccount(+idx),
  platform: async () => {
    const d = await get('/orderBookDetails'), oiOf = m => n(m.open_interest_usd) || n(m.open_interest) * (n(m.mark_price) || n(m.last_trade_price)), perps = (d.order_book_details || []).filter(m => m.status === 'active' || n(m.daily_quote_token_volume) > 0), spot = d.spot_order_book_details || [];
    const top = perps.slice().sort((a, b) => oiOf(b) - oiOf(a)).slice(0, 3).map(m => m.symbol + ' $' + big(oiOf(m))).join(', ');
    return { spotVol: spot.reduce((s, m) => s + n(m.daily_quote_token_volume), 0), vol: perps.reduce((s, m) => s + n(m.daily_quote_token_volume), 0), oi: perps.reduce((s, m) => s + oiOf(m), 0), title: `All ${perps.length} perpetual markets on Lighter.\nVolume: last 24 hours (rolling window). Spot volume: $${big(spot.reduce((s, m) => s + n(m.daily_quote_token_volume), 0))}.\nOI: open interest in USD. Largest: ${top}.` };
  },
  lb: {
    wins: [['24h', 'Last 24 hours'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['all', 'All time']], win: '7d',
    sorts: [['pnl', 'By PnL'], ['volume', 'By volume'], ['roi', 'By ROI'], ['account_value', 'By account value'], ['streak', 'By streak']], sort: 'pnl',
    load: (win, sort, page, size) => ltBoardLoad(win, sort, page, size),
    find: (addr, win, sort, say) => ltBoardFind(addr, win, sort, say),
    points: () => ltPoints(),
    extra: [{ t: 'Open exposure', f: r => r.x && r.x.expo ? '$' + big(r.x.expo) : '—' }, { t: 'Largest position', f: r => r.x && r.x.big ? `${esc(r.x.asset || '')} · $${big(r.x.big)}` : '—' }, { t: 'Long / short', f: r => r.x && r.x.expo ? `${fmt(r.x.long, 0)}% / ${fmt(r.x.short, 0)}%` : '—' }, { t: 'Active-day streak', tip: 'Consecutive days with activity on the account, up to today (best = the longest run ever). Counted by the exchange.', f: r => r.x ? `${r.x.streak} <small>(best ${r.x.best})</small>` : '—' }],
  },
};
/* ---------- leaderboard: pnlLeaderboard of the exchange (any rank by offset, ranked by pnl / volume / roi / account value) */
const ltRow = (e, i) => ({ rank: e.rank, addr: e.l1_address, av: n(e.account_value), pnl: n(e.pnl), roi: n(e.roi), vol: n(e.volume), x: { expo: n(e.net_position), big: n(e.biggest_position_value), asset: e.biggest_position_asset, long: n(e.long_percentage), short: n(e.short_percentage), streak: n(e.streak), best: n(e.longest_streak) } });
const ltQuery = (win, sort, extra, dir) => ({ time_window: win, sort_by: sort, sort_dir: dir || 'desc', ...extra });
async function ltBoardLoad(win, sort, page, size) {
  const d = await get('/pnlLeaderboard', ltQuery(win, sort, { limit: size, offset: page * size }, LB.dir));   // LB.dir = 'asc' shows the bottom of the ranking (biggest losers for PnL)
  return { rows: (d.entries || []).map(ltRow), total: d.total, at: d.updated_at ? d.updated_at * 1000 : null, note: 'Source: the leaderboard of the exchange (refreshed hourly): every wallet ranked by the chosen metric. PnL and ROI are as reported by Lighter; open exposure, largest position and long / short describe the positions open at the time of the snapshot. The ranking covers all accounts of an address together.' };
}
async function ltBoardFind(addr, win, sort, say) {
  const one = await get('/pnlLeaderboard', ltQuery(win, sort, { limit: 1, offset: 0, l1_addresses: addr })), e = one.entries && one.entries[0]; if (!e) return null;
  const row = ltRow(e), target = sort === 'pnl' ? row.pnl : sort === 'volume' ? row.vol : sort === 'roi' ? row.roi : sort === 'streak' ? row.x.streak : row.av, total = one.total ? 0 : 0;
  const all = await get('/pnlLeaderboard', ltQuery(win, sort, { limit: 1, offset: 0 })); let lo = 0, hi = Math.max(0, (all.total || 1) - 1), steps = 0;
  while (lo < hi && steps < 24) {                      // the filtered query ranks only the address itself: its place in the whole ranking is found by bisection over the offsets
    const mid = (lo + hi) >> 1; steps++; say && say(`Looking up the rank… step ${steps}`);
    const m = await get('/pnlLeaderboard', ltQuery(win, sort, { limit: 1, offset: mid })), me = m.entries && m.entries[0]; if (!me) break;
    const v = sort === 'pnl' ? n(me.pnl) : sort === 'volume' ? n(me.volume) : sort === 'roi' ? n(me.roi) : sort === 'streak' ? n(me.streak) : n(me.account_value);
    if (v > target) lo = mid + 1; else hi = mid;
  }
  row.rank = lo + 1; return { rank: row.rank, row };
}
/* points of the farming program: the exchange publishes only the top 10, with masked addresses */
async function ltPoints() {
  const d = await get('/leaderboard', { type: 'all' }); const es = d.entries || [];
  return { rows: es.map(e => ({ rank: e.entry, addr: e.l1_address, points: n(e.points) })), sub: 'top ' + es.length + ' · addresses are masked by the exchange', note: 'The points leaderboard is public only for the top 10, and Lighter hides the addresses. A wallet\'s own points and rank are shown by the exchange to its owner after sign-in; they are not available here.' };
}

let lastReq = 0;
async function get(path, params = {}) {
  const q = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (v != null) q.set(k, v);
  const url = API + path + (q.toString() ? '?' + q : '');
  for (let a = 0; a < 5; a++) {
    const wait = lastReq + 450 - Date.now(); if (wait > 0) await sleep(wait); lastReq = Date.now();
    let r; try { r = await fetch(url); } catch (e) { await sleep(800 * (a + 1)); continue; }
    if (r.status === 429) { const ra = parseFloat(r.headers.get('Retry-After')); await sleep(ra > 0 ? ra * 1000 : 2000 * (a + 1)); continue; }
    if (r.status >= 500 && r.status !== 502) { await sleep(700 * (a + 1)); continue; }
    let body = null; try { body = await r.json(); } catch (e) { }
    if (!r.ok || (body && body.code && body.code !== 200)) { const err = new Error((body && body.message) || 'HTTP ' + r.status); err.code = body && body.code; err.status = r.status; throw err; }
    return body;
  }
  throw new Error('API unavailable or rate limit exceeded, please try again later');
}
const safe = p => p.catch(e => (console.warn(e), null));
const FEE = 1e-6;                                  // trade fee fields are in millionths of the trade value

/* ---------- normalizers */
function normTrade(t, me) {
  const isAsk = +t.ask_account_id === me, usd = n(t.usd_amount), takerSide = isAsk ? !t.is_maker_ask : !!t.is_maker_ask, spot = t.market_kind === 'spot';
  const fee = usd * FEE * n(takerSide ? t.taker_fee : t.maker_fee), pnl = spot ? 0 : n(isAsk ? t.ask_account_pnl : t.bid_account_pnl);
  return { t: t.timestamp, m: t.market_symbol || ('#' + t.market_id), side: isAsk ? 'S' : 'B', sz: n(t.size), px: n(t.price), fee, pnl, maker: !takerSide, liq: t.type === 'liquidation' || t.type === 'deleverage', kind: t.type, id: t.trade_id, spot };
}
async function loadTrades(idx, depth, my) {
  const pr = getPeriod(), cap = pr ? 30000 : depth, out = []; let cursor = null, done = false;
  while (out.length < cap && !done) {
    const d = await get('/trades', { account_index: idx, sort_by: 'timestamp', limit: 100, cursor }); if (my !== runId) return null;
    const rows = d.trades || [];
    for (const t of rows) { if (pr && t.timestamp < pr.from) { done = true; break; } if (!pr || t.timestamp <= pr.to) out.push(normTrade(t, idx)); }
    status(`Loading fills… ${fmt(out.length, 0)}`);
    if (!d.next_cursor || rows.length < 100) return { fills: out, truncated: false };
    cursor = d.next_cursor;
  }
  return { fills: out.slice(0, cap), truncated: !done };
}
const posList = a => (a.positions || []).filter(p => n(p.position) !== 0).map(p => ({ ...p, s: n(p.position) * (p.sign < 0 ? -1 : 1), val: Math.abs(n(p.position_value)), up: n(p.unrealized_pnl), mark: n(p.position) ? Math.abs(n(p.position_value)) / n(p.position) : 0 }));
function riskCalc(S) {
  const a = S.acct, pos = posList(a), eq = n(a.cross_asset_value) || n(a.total_asset_value), im = n(a.cross_initial_margin_requirement), mm = n(a.cross_maintenance_margin_requirement);
  let gross = 0, long = 0, short = 0; pos.forEach(p => { gross += p.val; p.s > 0 ? long += p.val : short += p.val; });
  return { pos, eq, im, mm, gross, long, short, lev: eq > 0 ? gross / eq : null, buffer: eq - mm };
}
let PX = null, MK = [], TIERS = null;                                       // last price of every spot market, by base asset symbol (USDC = 1)
async function loadPrices() {
  if (PX) return PX; PX = { USDC: 1, USDT: 1 };
  try { const d = await get('/orderBookDetails'); MK = d.order_book_details || []; (d.spot_order_book_details || []).forEach(m => { const b = String(m.symbol).split('/')[0]; if (n(m.last_trade_price) > 0) PX[b] = n(m.last_trade_price); }); } catch (e) { console.warn(e); PX = null; }
  return PX || { USDC: 1, USDT: 1 };
}
const assetValue = x => n(x.balance) * (PX && PX[x.symbol] != null ? PX[x.symbol] : 0);
const perpsBal = a => n(a.total_asset_value) || n(a.collateral);
const spotBal = a => (a.assets || []).reduce((s, x) => s + assetValue(x), 0);
const total = a => perpsBal(a) + spotBal(a);

/* ---------- loading */
async function loadAccounts(key) {
  const d = /^\d+$/.test(key) ? await get('/account', { by: 'index', value: key }) : await get('/account', { by: 'l1_address', value: key });
  return d.accounts || [];
}
async function loadWallet(key, opts = {}) {
  const my = ++runId;
  if (!opts.silent) { status('Loading account…'); S = null; $('#out').innerHTML = ''; $('#welcome').hidden = true; }
  let accounts;
  try { await loadPrices(); accounts = await loadAccounts(key); } catch (e) { status(e.code === 21100 || e.status === 404 ? 'Account not found on Lighter: this address / ID has never traded or deposited there.' : 'Error: ' + esc(e.message), true); return; }
  if (my !== runId) return; if (!accounts.length) { status('Account not found on Lighter.', true); return; }
  accounts.sort((a, b) => total(b) - total(a));
  const sel = opts.keep && S && S.key === key ? S.sel : (/^\d+$/.test(key) ? +key : accounts[0].index);
  S = { key, accounts, sel, fills: [], fillsDone: false, sortKey: S && S.sortKey, sortDir: S && S.sortDir };
  rememberWallet(key); await showAccount(my, opts);
}
async function pickAccount(idx) { if (!S || idx === S.sel) return; S.sel = idx; S.pnl = null; S.fills = []; S.fillsDone = false; await showAccount(++runId, {}); }
async function showAccount(my, opts) {
  const a = S.accounts.find(x => x.index === S.sel) || S.accounts[0]; S.sel = a.index; S.acct = a;
  const byId = /^\d+$/.test(S.key);
  S.label = byId ? 'account ' + a.index : S.key;
  S.tags = (byId ? [] : [`account ${a.index}`]).concat([a.account_type ? 'sub-account' : 'master'], S.accounts.length > 1 ? [`${S.accounts.length} accounts`] : [], byId && a.l1_address ? ['owner ' + a.l1_address.slice(0, 6) + '…' + a.l1_address.slice(-4)] : []);
  status(''); render();
  const live = () => my === runId && S && S.sel === a.index;
  const pr = getPeriod(), now = Math.floor(Date.now() / 1000), hourly = pr && pr.to - pr.from <= 3 * DAY, step = hourly ? 3600 : 86400;
  const q = pr ? { start_timestamp: Math.floor(pr.from / 1000) - step, end_timestamp: Math.ceil(pr.to / 1000), count_back: Math.ceil((pr.to - pr.from) / 1000 / step) + 3 } : { start_timestamp: 0, end_timestamp: now, count_back: 2000 };
  const p = await safe(get('/pnl', { by: 'index', value: a.index, resolution: hourly ? '1h' : '1d', ...q })); if (!live()) return;
  S.pnl = (p && p.pnl) || []; render();
  loadTiers().then(() => { if (live()) render(); });
  { const owner = /^\d+$/.test(S.key) ? String(a.l1_address || '') : S.key; if (owner && S.ptsFor !== owner) { S.ptsFor = owner; S.pts = null; safe(loadPointsFor(owner)).then(r => { if (live()) { S.pts = r || { err: true }; render(); } }); } }
  if (!S.pools || S.poolsFor !== a.index) { S.pools = null; S.poolsFor = a.index; loadPools(a).then(r => { if (live()) { S.pools = r; render(); } }); }
  try {
    const r = await loadTrades(a.index, +$('#depth').value, my); if (!live() || !r) return;
    S.fills = r.fills; S.fillsDone = true; S.trunc = r.truncated; render(); status(r.truncated ? (getPeriod() ? 'This period has more fills than the API makes available: the statistics cover the loaded part only.' : 'Showing the most recent fills only; pick a larger depth to analyze more.') : '');
  } catch (e) { if (live()) status('Fills: ' + esc(e.message), true); }
}
let SYS = null;
async function sysConfig() { if (SYS) return SYS; try { SYS = await get('/systemConfig'); } catch (e) { SYS = {}; } return SYS; }
async function loadPools(a) {                          // name, current value and APY of every pool this account holds shares in
  const sh = a.shares || []; if (!sh.length) return []; const sys = await sysConfig();
  return Promise.all(sh.map(async x => {
    const idx = x.public_pool_index, d = await safe(get('/account', { by: 'index', value: idx })), p = d && d.accounts && d.accounts[0], info = (p && p.pool_info) || {}, assets = ((p && p.assets) || []).filter(y => n(y.balance));
    const val = p ? n(p.total_asset_value) + assets.reduce((s, y) => s + assetValue(y), 0) : null, per = info.total_shares ? val / info.total_shares : null;
    const isLiq = idx === sys.liquidity_pool_index, isStk = idx === sys.staking_pool_index;
    const name = (p && p.name) || (isLiq && isStk ? 'Lighter pool' : isStk ? 'LIT Staking Pool' : isLiq ? 'Lighter Liquidity Provider (LLP)' : 'Pool ' + idx);
    const one = assets.length === 1 && !n(p.total_asset_value) ? assets[0] : null;   // a pool that holds a single token (e.g. LIT staking)
    return { idx, name, shares: n(x.shares_amount), principal: n(x.principal_amount), value: per == null ? null : per * n(x.shares_amount), apy: info.annual_percentage_yield, ret: info.daily_returns || [], sharpe: info.sharpe_ratio, opFee: info.operator_fee, unit: one ? one.symbol : null, units: one && info.total_shares ? n(one.balance) / info.total_shares * n(x.shares_amount) : null };
  }));
}
async function loadTiers() { if (TIERS) return TIERS; try { TIERS = await get('/feeTiers', { filter: 'all' }); } catch (e) { TIERS = {}; } return TIERS; }
/* points of the farming program: the exchange publishes only the top 10; asking for one address returns its own (unmasked) entry when it is among them */
async function loadPointsFor(addr) {
  const d = await get('/leaderboard', { type: 'all', l1_address: addr }), es = d.entries || [], me = es.find(e => String(e.l1_address).toLowerCase() === addr.toLowerCase());
  return { me: me ? { points: n(me.points), rank: me.entry } : null, first: es.length ? n(es[0].points) : null, tenth: es.length ? n(es[es.length - 1].points) : null, total: es.reduce((a, e) => a + n(e.points), 0), count: es.length, above: me ? n((es.find(e => e.entry === me.entry - 1) || {}).points) : null };
}
const lastPnl = S => S.pnl && S.pnl.length ? S.pnl[S.pnl.length - 1] : null;
const ptsAll = S => (S.pnl || []).map(p => ({ ...p, t: p.timestamp * 1000 }));
const inPeriod = S => { const pr = getPeriod(), all = ptsAll(S); if (!pr) return { rows: all, base: null }; const base = all.filter(p => p.t < pr.from).pop() || null; return { rows: all.filter(p => p.t >= pr.from && p.t <= pr.to), base }; };
const ptsOf = (S, f, rebase) => { const { rows, base } = inPeriod(S); const b = rebase && getPeriod() ? f(base || rows[0] || {}) : 0; return rows.map(p => [p.t, f(p) - b]); };
const netDepOf = p => n(p.inflow) - n(p.outflow) + n(p.spot_inflow) - n(p.spot_outflow);   // transfers between perps and spot cancel out; moves to pools / staking count as withdrawals
const totalPnl = p => n(p.trade_pnl) + n(p.trade_spot_pnl) + n(p.pool_pnl) + n(p.staking_pnl);

/* ---------- cards */
const CARDS = [
  { id: 'accounts', title: 'Accounts', sub: S => /^\d+$/.test(S.key) ? '' : 'owned by this address', w: 12, render(S) {
    if (S.accounts.length < 2) return '';
    return `<div class="scroll" style="max-height:260px"><table><thead><tr><th>Account</th><th>Type</th><th>Perps</th><th>Spot</th><th>Total</th><th></th></tr></thead><tbody>` +
      S.accounts.map(a => `<tr><td>${a.index}</td><td>${a.account_type ? 'sub-account' : 'master'}</td><td class="num">${money(perpsBal(a))}</td><td class="num">${money(spotBal(a))}</td><td class="num">${money(total(a))}</td><td>${a.index === S.sel ? '<span class="tag ok">shown</span>' : `<button class="linkbtn" data-acct="${a.index}" type="button">show stats</button>`}</td></tr>`).join('') + `</tbody></table></div>` +
      `<p class="note">Total across ${S.accounts.length} accounts: ${money(S.accounts.reduce((s, a) => s + total(a), 0))}</p>`;
  } },
  { id: 'summary', title: 'Account', w: 4, render(S) {
    const a = S.acct, L = lastPnl(S), dep = L ? netDepOf(L) : null, perp = perpsBal(a), spot = spotBal(a), upnl = posList(a).reduce((s, p) => s + p.up, 0), pr = getPeriod();
    return `<div class="big num">${money(perp + spot)}</div><div class="rows">` +
      row('Perps balance', money(perp), 'Collateral of the perpetuals account including unrealized PnL.') + row('Spot balance', money(spot), 'Spot assets at the latest price of their USDC market.') +
      row('Available (perps)', money(n(a.available_balance)), 'Free to open new positions or withdraw.') +
      row('Unrealized PnL', `<span class="${cls(upnl)}">${smoney(upnl)}</span>`) +
      row('Net deposits', dep == null ? '…' : money(dep), 'Money put into perps and spot minus money taken out, from the exchange history. Transfers between perps and spot cancel out; money moved into pools or staking counts as taken out, because pool shares are not part of the balance.') +
      row('Open positions', String(S.risk.pos.length)) + row('Open orders', fmt(n(a.pending_order_count), 0)) + row('Total orders placed', fmt(n(a.total_order_count), 0)) +
      row('L1 address', a.l1_address ? `<code>${esc(a.l1_address.slice(0, 6))}…${esc(a.l1_address.slice(-4))}</code>` : '—') + `</div>`;
  } },
  { id: 'volume', title: 'Volume & fees', sub: () => getPeriod() ? getPeriod().label : 'all time', w: 4, render(S) {
    if (!S.pnl) return '<div class="empty">Loading…</div>'; const pr = getPeriod(), { rows } = inPeriod(S), vol = rows.reduce((s, r) => s + n(r.volume), 0), F = S.fs;
    return `<div class="big num">${'$' + big(vol)}</div><div class="rows">` + row('Volume (exchange)', money(vol, 0), 'Sum of the daily / hourly volume reported by the exchange.') +
      row('Volume (loaded fills)', money(F.vol, 0), 'Volume of the fills loaded below; with a period it covers the whole period.') +
      row('Perps / spot volume (loaded)', `${money(S.fills.filter(f => !f.spot).reduce((a, f) => a + f.sz * f.px, 0), 0)} / ${money(S.fills.filter(f => f.spot).reduce((a, f) => a + f.sz * f.px, 0), 0)}`, 'All loaded fills split by market type, whatever the Perps / Spot switch is set to.') +
      row('Fees paid (loaded fills)', money(-F.fees), 'Taker / maker fee of every loaded fill (fee rate × trade value).') + row('Fee rate (bps of volume)', F.vol ? fmt(F.fees / F.vol * 1e4, 2) : '—') +
      row('Maker / taker (by volume)', F.vol ? `${fmt(F.mvol / F.vol * 100, 0)}% / ${fmt(F.tvol / F.vol * 100, 0)}%` : '—') + row('Fills loaded', fmt(F.n, 0)) + `</div>` +
      (pr ? '' : `<p class="note">The exchange volume covers the whole history; the fills are the most recent ones, as chosen on the right.</p>`);
  } },
  { id: 'pnl', title: 'Profit', w: 4, render(S) {
    if (!S.pnl) return '<div class="empty">Loading…</div>'; const pr = getPeriod(), L = lastPnl(S), { rows, base } = inPeriod(S), last = rows[rows.length - 1], first = pr ? (base || rows[0]) : null, F = S.fs;
    if (!last) return '<div class="empty">No history in this period</div>';
    const d = f => first ? n(last[f]) - n(first[f]) : n(last[f]), tot = first ? totalPnl(last) - totalPnl(first) : totalPnl(last), pnl = f => `<span class="${cls(d(f))}">${smoney(d(f))}</span>`, vol = rows.reduce((s, r) => s + n(r.volume), 0);
    return `<div class="big num ${cls(tot)}">${smoney(tot)}</div><div class="rows">` + (pr ? row('Period', esc(pr.label)) : '') +
      row('Trading PnL (perps)', pnl('trade_pnl'), 'Realized perps trading PnL reported by the exchange.') + row('Spot trading PnL', pnl('trade_spot_pnl')) +
      (d('pool_pnl') ? row('Pool PnL', pnl('pool_pnl')) : '') + (d('staking_pnl') ? row('Staking PnL', pnl('staking_pnl')) : '') +
      row('Realized PnL (loaded fills)', `<span class="${cls(F.pnl)}">${smoney(F.pnl)}</span>`) + row('Fees (loaded fills)', money(-F.fees)) +
      row('PnL per $1M volume', vol > 0 ? smoney(tot / vol * 1e6, 0) : '—', 'Exchange-reported PnL divided by the exchange volume of the same period.') + `</div>` +
      `<p class="note">Big number = exchange-reported PnL (perps + spot + pools + staking). Unrealized PnL of open positions is included in the perps part.</p>`;
  } },
  { id: 'equity', title: 'Equity', sub: () => 'net deposits + PnL · ' + (getPeriod() ? getPeriod().label : 'all time'), w: 6, render() { return '<div class="chartbox" data-ch="equity"></div>'; },
    after(el, S) { lineChart($('[data-ch=equity]', el), ptsOf(S, p => netDepOf(p) + totalPnl(p)), { color: css('--s1'), area: true, axis: usd, tip: v => money(v, 2), xfmt: dshort }); } },
  riskCard,
  { id: 'pnlchart', title: 'PnL over period', sub: () => 'exchange-reported · ' + (getPeriod() ? getPeriod().label : 'all time'), w: 6, render() { return '<div class="chartbox" data-ch="pnl"></div>'; },
    after(el, S) { lineChart($('[data-ch=pnl]', el), ptsOf(S, totalPnl, true), { color: css('--s3'), zero: true, minRange: 1, axis: v => smoney(v, Math.abs(v) < 10 ? 2 : 0), tip: v => smoney(v, 2), xfmt: dshort }); } },
  { id: 'netdep', title: 'Net deposits', sub: () => 'perps + spot · ' + (getPeriod() ? getPeriod().label : 'all time'), w: 6, render() { return '<div class="chartbox" data-ch="dep"></div>'; },
    after(el, S) { lineChart($('[data-ch=dep]', el), ptsOf(S, netDepOf), { color: css('--s1'), area: true, axis: usd, tip: v => money(v, 2), xfmt: dshort }); } },
  { id: 'positions', title: 'Open positions', sub: 'now', w: 12, render(S) {
    const pos = S.risk.pos; if (!pos.length) return '<div class="empty">No open positions</div>';
    return `<div class="scroll"><table><thead><tr><th>Market</th><th>Side</th><th>Size</th><th>Size $</th><th>Entry</th><th>Mark</th><th>uPnL</th><th>Leverage</th><th>Margin</th><th>Liq. price</th><th>Realized PnL</th></tr></thead><tbody>` +
      pos.slice().sort((a, b) => b.val - a.val).map(p => { const lev = n(p.initial_margin_fraction) ? 100 / n(p.initial_margin_fraction) : null;
        return `<tr><td>${esc(p.symbol)}</td><td><span class="tag ${p.s > 0 ? 'ok' : 'bad'}">${p.s > 0 ? '▲ LONG' : '▼ SHORT'}</span></td><td class="num">${fmt(Math.abs(p.s), 4)}</td><td class="num">${money(p.val)}</td><td class="num">${pxf(n(p.avg_entry_price))}</td><td class="num">${pxf(p.mark)}</td><td class="num ${cls(p.up)}">${smoney(p.up)}</td><td class="num">${lev ? fmt(lev, 1) + '× ' + (p.margin_mode ? 'isolated' : 'cross') : '—'}</td><td class="num">${n(p.allocated_margin) ? money(n(p.allocated_margin)) : '—'}</td><td class="num">${n(p.liquidation_price) ? pxf(n(p.liquidation_price)) : '—'}</td><td class="num ${cls(n(p.realized_pnl))}">${smoney(n(p.realized_pnl))}</td></tr>`; }).join('') + `</tbody></table></div>`;
  } },
  { id: 'assets', title: 'Spot assets', sub: S => money(spotBal(S.acct)), w: 6, render(S) {
    const as = (S.acct.assets || []).filter(x => n(x.balance) || n(x.locked_balance)); if (!as.length) return '<div class="empty">No spot assets</div>';
    return `<div class="scroll" style="max-height:300px"><table><thead><tr><th>Asset</th><th>Balance</th><th>Locked</th><th>Price</th><th>Value $</th></tr></thead><tbody>` +
      as.sort((x, y) => assetValue(y) - assetValue(x)).map(x => { const px = PX && PX[x.symbol]; return `<tr><td>${esc(x.symbol)}</td><td class="num">${fmt(n(x.balance), 4)}</td><td class="num">${fmt(n(x.locked_balance), 4)}</td><td class="num">${px ? pxf(px) : '—'}</td><td class="num">${px ? money(assetValue(x)) : '—'}</td></tr>`; }).join('') + `</tbody></table></div>`;
  } },
  { id: 'pools', title: 'Pool shares', sub: 'public pools / LLP / staking', w: 6, render(S) {
    const sh = S.acct.shares || []; if (!sh.length) return '<div class="empty">No pool shares</div>'; if (!S.pools) return '<div class="empty">Loading pools…</div>';
    const tot = S.pools.reduce((s, p) => s + (p.value || 0), 0);
    return `<div class="scroll" style="max-height:300px"><table><thead><tr><th>Pool</th><th>Shares</th><th>Principal</th><th>Value now</th><th>APY</th></tr></thead><tbody>` +
      S.pools.map(p => `<tr><td title="pool account ${p.idx}">${esc(p.name)}</td><td class="num">${fmt(p.shares, 0)}</td><td class="num">${p.unit ? fmt(p.principal, 2) + ' ' + esc(p.unit) : money(p.principal)}</td><td class="num">${p.value == null ? '—' : money(p.value) + (p.unit && p.units != null ? `<br><span class="muted">${fmt(p.units, 2)} ${esc(p.unit)}</span>` : '')}</td><td class="num">${p.apy == null ? '—' : fmt(p.apy, 1) + '%'}</td></tr>`).join('') + `</tbody></table></div>` +
      `<p class="note">Total value in pools: ${money(tot)}. Pool shares are not included in the balance above.</p>`;
  } },
  { id: 'points', title: 'Points', sub: 'Lighter points program', w: 4, render(S) {
    const P = S.pts; if (!P) return '<div class="empty">Loading…</div>'; if (P.err) return '<div class="empty">Points are unavailable right now</div>';
    if (P.me) return `<div class="big num">${fmt(P.me.points, 0)}</div><div class="rows">` + row('Rank', `#${P.me.rank} of the top ${P.count}`) + row('Share of the top-10 points', fmt(P.me.points / P.total * 100, 1) + '%') +
      (P.me.rank > 1 ? row('To the place above', '+' + fmt(P.above - P.me.points, 0)) : '') + row('Leader', fmt(P.first, 0)) + `</div><p class="note">The exchange publishes points only for the top ${P.count}; this wallet is among them.</p>`;
    return `<div class="big num muted">—</div><div class="rows">` + row('Status', 'not in the top ' + P.count) + row('10th place needs', P.tenth == null ? '—' : fmt(P.tenth, 0) + ' points') + row('Leader', P.first == null ? '—' : fmt(P.first, 0) + ' points') + `</div>` +
      `<p class="note">Lighter publishes points only for the top ${P.count} wallets (their addresses are masked). The exact points of any other wallet are visible only to its owner after signing in on the exchange site.</p>`;
  } },
  { id: 'liqs', title: 'Liquidations & ADL', sub: fsub, w: 12, render(S) {
    if (!S.vf.length) return S.fillsDone ? '<div class="empty">No fills</div>' : '<div class="empty">Loading fills…</div>';
    const L = S.vf.filter(f => f.liq).sort((a, b) => b.t - a.t); if (!L.length) return '<div class="empty">No liquidations or auto-deleveraging in the loaded fills</div>';
    const val = L.reduce((a, f) => a + f.sz * f.px, 0), pnl = L.reduce((a, f) => a + f.pnl, 0);
    return `<div class="rows" style="margin:0 0 10px">` + row('Events', fmt(L.length, 0)) + row('Value', money(val, 0)) + row('Realized PnL', `<span class="${cls(pnl)}">${smoney(pnl)}</span>`) + `</div>` +
      `<div class="scroll" style="max-height:300px"><table><thead><tr><th>Time</th><th>Market</th><th>Event</th><th>Side</th><th>Size</th><th>Price</th><th>Value $</th><th>Fee</th><th>Realized PnL</th></tr></thead><tbody>` +
      L.slice(0, 100).map(f => `<tr><td>${dtl(f.t)}</td><td>${esc(f.m)}</td><td><span class="tag bad">${f.kind === 'deleverage' ? 'ADL' : 'liquidation'}</span></td><td>${f.side === 'B' ? 'BUY' : 'SELL'}</td><td class="num">${fmt(f.sz, 4)}</td><td class="num">${pxf(f.px)}</td><td class="num">${fmt(f.sz * f.px, 2)}</td><td class="num">${fmt(f.fee, 4)}</td><td class="num ${cls(f.pnl)}">${f.pnl ? smoney(f.pnl, 2) : '—'}</td></tr>`).join('') + `</tbody></table></div>`;
  } },
  { id: 'markets', title: 'Markets now', sub: 'your positions + the biggest markets', w: 12, render(S) {
    if (!MK.length) return '<div class="empty">No market data</div>';
    const mine = new Set(S.risk.pos.map(p => p.symbol)), oi = m => n(m.open_interest_usd) || n(m.open_interest) * (n(m.mark_price) || n(m.last_trade_price));
    const top = MK.filter(m => n(m.daily_quote_token_volume) > 0).sort((a, b) => n(b.daily_quote_token_volume) - n(a.daily_quote_token_volume)).slice(0, 10), rows = [...MK.filter(m => mine.has(m.symbol)), ...top.filter(m => !mine.has(m.symbol))];
    return `<div class="scroll" style="max-height:340px"><table><thead><tr><th>Market</th><th>Last price</th><th>24h change</th><th>24h volume</th><th>Open interest</th><th>Trades 24h</th></tr></thead><tbody>` +
      rows.map(m => `<tr><td>${esc(m.symbol)}${mine.has(m.symbol) ? ' <span class="tag ok">position</span>' : ''}</td><td class="num">${pxf(n(m.last_trade_price))}</td><td class="num ${cls(n(m.daily_price_change))}">${sgn(n(m.daily_price_change), 2)}%</td><td class="num">$${big(n(m.daily_quote_token_volume))}</td><td class="num">$${big(oi(m))}</td><td class="num">${fmt(n(m.daily_trades_count), 0)}</td></tr>`).join('') + `</tbody></table></div>`;
  } },
  { id: 'feetier', title: 'Fee tiers', sub: 'by staked LIT', w: 6, render(S) {
    if (!TIERS || !TIERS.user_tiers) return '<div class="empty">Loading…</div>';
    const staked = (S.pools || []).filter(p => p.unit === 'LIT').reduce((a, p) => a + (p.units || 0), 0), prem = TIERS.user_tiers.filter(t => /^premium/.test(t.name)), st = (TIERS.staking_tiers || []).slice().reverse().find(t => staked >= t.required_lit_stakes);
    const at = prem.slice().reverse().find(t => staked >= t.required_lit_stakes), bps = t => fmt(t / 100, 2);
    return `<div class="rows">` + row('Staked LIT', S.pools ? fmt(staked, 2) + ' LIT' : '…', 'LIT in the staking pool, from the pool shares of this account.') +
      row('Staking discount', st ? esc(st.name) + ` · ${fmt((1 - st.fee_rate) * 100, 1)}% off` : 'none yet', 'The staking tier of the exchange; the exact tier of an account is visible only to its owner.') + row('Premium tier by stake', at ? esc(at.name) : 'premium (no stake)') + `</div>` +
      `<div class="scroll" style="max-height:260px;margin-top:10px"><table><thead><tr><th>Tier</th><th>LIT staked</th><th>Maker, bps</th><th>Taker, bps</th></tr></thead><tbody>` +
      prem.map(t => `<tr${at && at.name === t.name ? ' class="lbrow me"' : ''}><td>${esc(t.name)}</td><td class="num">${fmt(t.required_lit_stakes, 0)}</td><td class="num">${bps(t.maker_fee_ticks)}</td><td class="num">${bps(t.taker_fee_ticks)}</td></tr>`).join('') + `</tbody></table></div>` +
      `<p class="note">Standard accounts pay no fees. The Premium tiers become cheaper with more staked LIT; which plan an account uses is not public, so this is a reference table.</p>`;
  } },
  { id: 'poolperf', title: 'Pool performance', sub: 'compounded daily returns', w: 6, render(S) {
    if (!(S.acct.shares || []).length) return '<div class="empty">No pool shares</div>'; if (!S.pools) return '<div class="empty">Loading pools…</div>';
    const ps = S.pools.filter(p => p.ret && p.ret.length > 1); if (!ps.length) return '<div class="empty">No performance data</div>';
    return `<div class="chartbox" data-ch="pool"></div><div class="rows" style="margin-top:10px">` + ps.map(p => row(esc(p.name), `APY ${p.apy == null ? '—' : fmt(p.apy, 1) + '%'} · Sharpe ${p.sharpe == null ? '—' : fmt(p.sharpe, 2)} · operator fee ${p.opFee == null ? '—' : fmt(n(p.opFee) * 100, 1) + '%'}`)).join('') + `</div>`;
  }, after(el, S) { const box = $('[data-ch=pool]', el); if (!box || !S.pools) return; const p = S.pools.filter(x => x.ret && x.ret.length > 1).sort((a, b) => (b.value || 0) - (a.value || 0))[0]; if (!p) return;
    let g = 1; const pts = p.ret.map(r => [r.timestamp * 1000, (g *= 1 + n(r.daily_return)) - 1]); lineChart(box, pts, { color: css('--s3'), zero: true, minRange: .05, axis: v => sgn(v * 100, 0) + '%', tip: v => sgn(v * 100, 2) + '%', xfmt: dshort }); } },
].concat(COMMON_CARDS);
const DEFAULT_CARDS = CARDS.map(c => c.id);
const ORDER = ['accounts', 'summary', 'volume', 'pnl', 'equity', 'pnlchart', 'risk', 'positions', 'activity', 'hold', 'streaks', 'curve', 'points', 'daily', 'hourly', 'bymarket', 'netdep', 'assets', 'pools', 'fills', 'liqs', 'markets', 'feetier', 'poolperf'];

/* ---------------------------------------------------------------- render + page wiring */
function status(html, err) { const s = $('#status'), busy = /^Loading/.test(html); s.className = 'status' + (err ? ' err' : '') + (busy ? ' busy' : ''); s.innerHTML = (busy ? '<i class="spin"></i>' : '') + html; }
let enabled = new Set(store.get('cards', DEFAULT_CARDS));
{ const seen = new Set(store.get('cards_seen', [])); DEFAULT_CARDS.forEach(id => { if (!seen.has(id)) enabled.add(id); }); store.set('cards_seen', DEFAULT_CARDS); store.set('cards', [...enabled]); }
let MODE = store.get('mode', 'all'); if (!['all', 'perps', 'spot'].includes(MODE)) MODE = 'all';   // which fills the cards describe: perpetuals, spot or both
function render() {
  if (!S) return;
  S.vf = MODE === 'all' ? S.fills : S.fills.filter(f => MODE === 'spot' ? f.spot : !f.spot); S.fs = fillStats(S.vf); if (CFG.prepare) CFG.prepare(S);
  const out = $('#out'), ix = c => { const i = ORDER.indexOf(c.id); return i < 0 ? 99 : i; }, list = CARDS.filter(c => enabled.has(c.id)).sort((a, b) => ix(a) - ix(b)).map(c => ({ ...c, html: c.render(S) })).filter(c => c.html !== '');
  out.innerHTML = `<div class="hdr"><code class="addr">${esc(S.label)}</code>${(S.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}<span class="muted" id="upd"></span><span class="seg" id="mode" title="Which trades the cards below describe">${[['all', 'All'], ['perps', 'Perps'], ['spot', 'Spot']].map(([k, t]) => `<button type="button" data-mode="${k}" class="${k === MODE ? 'on' : ''}">${t}</button>`).join('')}</span></div>` + list.map(c =>
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
document.addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (!b || !S) return; MODE = b.dataset.mode; store.set('mode', MODE); render(); });
/* ---- Leaderboard tab: ranking of the whole exchange from the public data; every adapter describes its own CFG.lb */
const LB = { win: CFG.lb.win, sort: CFG.lb.sort, dir: 'desc', page: 0, rows: null, total: 0, found: null, tok: 0 };
const LBSIZE = 100, shortAddr = a => a.slice(0, 6) + '…' + a.slice(-4);
{ const w = store.get('lb_win', null), o = store.get('lb_sort', null); if (CFG.lb.wins.some(x => x[0] === w)) LB.win = w; if (CFG.lb.sorts.some(x => x[0] === o)) LB.sort = o; }
function lbUi() {
  $('#lbWin').innerHTML = CFG.lb.wins.map(w => `<button data-w="${w[0]}" type="button" class="${w[0] === LB.win ? 'on' : ''}">${w[1]}</button>`).join('');
  $('#lbSort').innerHTML = CFG.lb.sorts.map(o => `<button data-s="${o[0]}" type="button" class="${o[0] === LB.sort ? 'on' : ''}" title="${o[0] === LB.sort ? 'Click again to reverse the order' : ''}">${o[1]}${o[0] === LB.sort ? (LB.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button>`).join('');
}
function lbStatus(html, err, busy) { const el = $('#lbStatus'); el.className = 'status' + (err ? ' err' : '') + (busy ? ' busy' : ''); el.innerHTML = (busy ? '<i class="spin"></i>' : '') + html; }
async function lbLoad(keepFound) {
  const tok = ++LB.tok; lbUi(); if (!keepFound) { LB.found = null; $('#lbFound').innerHTML = ''; } lbStatus('Loading the leaderboard…', false, true);
  try {
    const d = await CFG.lb.load(LB.win, LB.sort, LB.page, LBSIZE, m => { if (tok === LB.tok) lbStatus(m, false, true); });
    if (tok !== LB.tok) return;
    LB.rows = d.rows; LB.total = d.total; LB.note = d.note || ''; LB.at = d.at;
    lbStatus(`${fmt(LB.total, 0)} wallets · ${CFG.lb.wins.find(w => w[0] === LB.win)[1].toLowerCase()} · ${CFG.lb.sorts.find(o => o[0] === LB.sort)[1].toLowerCase()}${LB.dir === 'asc' ? ' · lowest first' : ''}${LB.at ? ' · data from ' + new Date(LB.at).toLocaleString('en-US', { hour12: false }) : ''}`);
    lbRender();
  } catch (e) { if (tok === LB.tok) lbStatus('Could not load the leaderboard: ' + esc(e.message), true); }
}
function lbRender() {
  const rows = LB.rows || []; if (!rows.length) { $('#lbTable').innerHTML = '<tr><td class="empty" style="text-align:center">No data</td></tr>'; $('#lbKpis').innerHTML = ''; $('#lbPager').innerHTML = ''; return; }
  const sum = k => rows.reduce((a, r) => a + (r[k] || 0), 0), ex = CFG.lb.extra || [];
  $('#lbKpis').innerHTML = [['Wallets in the ranking', fmt(LB.total, 0)], ['PnL of these ' + rows.length, smoney(sum('pnl'), 0)], ['Volume of these ' + rows.length, '$' + big(sum('vol'))], ['Profitable here', `${rows.filter(r => r.pnl > 0).length} of ${rows.length}`]].map(([k, v]) => `<div>${k}<b class="num">${v}</b></div>`).join('');
  const me = S && S.key, fd = LB.found && LB.found.addr, medal = r => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : fmt(r, 0);
  $('#lbTable').innerHTML = `<thead><tr><th>#</th><th style="text-align:left">Address</th><th>Account value</th><th>PnL</th><th>ROI</th><th>Volume</th>${ex.map(c => `<th${c.tip ? ` title="${esc(c.tip)}"` : ''}>${c.t}</th>`).join('')}<th></th></tr></thead><tbody>` +
    rows.map(r => { const k = r.addr.toLowerCase(), mine = k === me || k === fd;
      return `<tr class="lbrow${mine ? ' me' : ''}"><td class="num"><span class="lbmedal">${medal(r.rank)}</span></td><td class="lbaddr" style="text-align:left" title="${esc(r.addr)}">${shortAddr(r.addr)} <button class="btn tiny" data-copy="${esc(r.addr)}" type="button" title="Copy address">copy</button></td><td class="num">${r.av == null ? '—' : '$' + big(r.av)}</td><td class="num ${cls(r.pnl)}">${r.pnl == null ? '—' : smoney(r.pnl, 0)}</td><td class="num ${cls(r.roi)}">${r.roi == null ? '—' : sgn(r.roi, 1) + '%'}</td><td class="num">${r.vol == null ? '—' : '$' + big(r.vol)}</td>${ex.map(c => `<td class="num">${c.f(r)}</td>`).join('')}<td><button class="btn tiny" data-open="${esc(r.addr)}" type="button">open stats</button></td></tr>`; }).join('') + '</tbody>';
  const pages = Math.max(1, Math.ceil(LB.total / LBSIZE));
  $('#lbPager').innerHTML = `<button class="btn small" data-pg="-1" type="button" ${LB.page <= 0 ? 'disabled' : ''}>‹ Previous</button><span>Page ${fmt(LB.page + 1, 0)} of ${fmt(pages, 0)} · ranks ${fmt(Math.min(...rows.map(r => r.rank)), 0)}–${fmt(Math.max(...rows.map(r => r.rank)), 0)}</span><button class="btn small" data-pg="1" type="button" ${LB.page >= pages - 1 ? 'disabled' : ''}>Next ›</button>`;
  $('#lbNote').textContent = LB.note;
  if (LB.goto) { LB.goto = false; const el = $('#lbTable tr.me'); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
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
    box.innerHTML = `<div class="lbfoundbox"><span class="lbaddr">${shortAddr(key)}</span><span><b>${f.rank ? 'Rank #' + fmt(f.rank, 0) : 'Rank unknown'}</b></span><span>Account value ${r.av == null ? '—' : '$' + big(r.av)}</span><span class="${cls(r.pnl)}">PnL ${r.pnl == null ? '—' : smoney(r.pnl, 0)}</span><span>Volume ${r.vol == null ? '—' : '$' + big(r.vol)}</span> <button class="btn tiny" data-open="${esc(key)}" type="button">open stats</button></div>`;
    if (f.rank) { const pg = LB.dir === 'asc' ? Math.floor((LB.total - f.rank) / LBSIZE) : Math.floor((f.rank - 1) / LBSIZE); LB.goto = true; if (pg !== LB.page) { LB.page = pg; lbLoad(true); } else lbRender(); }   // jump to the page that holds the address
  } catch (e) { box.innerHTML = `<div class="lbfoundbox neg">${esc(e.message)}</div>`; }
}
$('#lbWin').addEventListener('click', e => { const b = e.target.closest('button[data-w]'); if (!b) return; LB.win = b.dataset.w; LB.page = 0; store.set('lb_win', LB.win); lbLoad(); });
$('#lbSort').addEventListener('click', e => { const b = e.target.closest('button[data-s]'); if (!b) return; LB.dir = b.dataset.s === LB.sort && LB.dir !== 'asc' ? 'asc' : 'desc'; LB.sort = b.dataset.s; LB.page = 0; store.set('lb_sort', LB.sort); lbLoad(); });
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
  try { const p = await CFG.platform(); $('#platV').textContent = '$' + big(p.vol); if (p.spotVol != null) { $('#platSpot').textContent = '$' + big(p.spotVol); $('#platSpotWrap').hidden = false; } $('#platOI').textContent = '$' + big(p.oi); $('#plat').title = p.title + '\nUpdated ' + new Date().toLocaleTimeString('en-US', { hour12: false }) + '.'; }
  catch (e) { console.warn(e); $('#platV').textContent = '—'; $('#platOI').textContent = '—'; }
}
loadPlatform(); setInterval(() => { if (!document.hidden) loadPlatform(); }, 60000);

$('#ver').textContent = 'v1.0';
renderCardsList(); renderRecent();
if (location.hash.slice(1) === 'leaderboard') showView('lb', true); else { const k = CFG.parse(decodeURIComponent(location.hash.slice(1))); if (k) { $('#addr').value = k; CFG.load(k); } }
})();
