// Canvas price chart: line or candles, volume, previous-close line, crosshair tooltip.
import { isCrypto } from './data.js';
import { fmtPrice, fmtVol, UP, DOWN } from './market.js';

export function drawChart(cv, tip, { chart, symbol, range, kind, hover }) {
  const box = cv.parentElement.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = Math.max(10, box.width), H = Math.max(10, box.height);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  tip.hidden = true;
  if (!chart || chart.symbol !== symbol || !chart.points?.length) return;

  const pts = chart.points;
  g.font = '11px "IBM Plex Mono", monospace';
  const padR = Math.max(64, g.measureText(fmtPrice(pts.reduce((m, p) => Math.max(m, p[2]), 0), symbol)).width + 18);
  const padB = 22, volH = Math.min(56, H * 0.18);
  const cw = W - padR, ch = H - padB - volH - 6;
  let lo = Infinity, hi = -Infinity, vmax = 0;
  for (const p of pts) {
    const l = kind === 'candle' ? p[3] : p[4], h = kind === 'candle' ? p[2] : p[4];
    if (l < lo) lo = l;
    if (h > hi) hi = h;
    if (p[5] > vmax) vmax = p[5];
  }
  const base = chart.rangeBase;
  if (base && range === '1d') { lo = Math.min(lo, base); hi = Math.max(hi, base); }
  const pad = (hi - lo) * 0.08 || hi * 0.01 || 1;
  lo -= pad; hi += pad;
  const X = (i) => (pts.length === 1 ? cw / 2 : (i / (pts.length - 1)) * cw);
  const Y = (v) => ch - ((v - lo) / (hi - lo)) * ch;
  const col = pts.at(-1)[4] >= (base ?? pts[0][4]) ? UP : DOWN;

  g.textBaseline = 'middle';
  for (let i = 0; i <= 5; i++) {
    const v = lo + ((hi - lo) * i) / 5, y = Y(v);
    g.strokeStyle = 'rgba(160,140,255,.08)';
    g.beginPath(); g.moveTo(0, y); g.lineTo(cw, y); g.stroke();
    g.fillStyle = '#7d74a8';
    g.fillText(fmtPrice(v, symbol), cw + 8, y);
  }
  const tz = isCrypto(symbol) ? undefined : chart.timezone || 'America/New_York';
  const fmtT = (ts) => new Date(ts * 1000).toLocaleString('en-US', range === '1d' ? { timeZone: tz, hour: 'numeric', minute: '2-digit' } : range === '5d' || range === '1mo' ? { timeZone: tz, month: 'short', day: 'numeric' } : { timeZone: tz, month: 'short', year: '2-digit' });
  g.textAlign = 'center';
  const ticks = Math.max(2, Math.floor(cw / 110));
  for (let i = 0; i <= ticks; i++) {
    const idx = Math.round((i / ticks) * (pts.length - 1));
    g.fillStyle = '#7d74a8';
    g.fillText(fmtT(pts[idx][0]), Math.min(cw - 30, Math.max(30, X(idx))), H - padB / 2);
  }
  g.textAlign = 'left';

  if (base && range === '1d') {
    g.setLineDash([4, 4]);
    g.strokeStyle = 'rgba(255,62,165,.45)';
    g.beginPath(); g.moveTo(0, Y(base)); g.lineTo(cw, Y(base)); g.stroke();
    g.setLineDash([]);
  }

  const bw = Math.max(1, cw / pts.length - 1);
  pts.forEach((p, i) => {
    const vh = vmax ? (p[5] / vmax) * volH : 0;
    g.fillStyle = p[4] >= p[1] ? 'rgba(61,255,168,.25)' : 'rgba(255,79,123,.25)';
    g.fillRect(X(i) - bw / 2, H - padB - vh, bw, vh);
  });

  if (kind === 'candle') {
    const w = Math.max(1, Math.min(10, (cw / pts.length) * 0.7));
    pts.forEach((p, i) => {
      const c = p[4] >= p[1] ? UP : DOWN;
      g.strokeStyle = g.fillStyle = c;
      g.beginPath(); g.moveTo(X(i), Y(p[2])); g.lineTo(X(i), Y(p[3])); g.stroke();
      const y0 = Y(Math.max(p[1], p[4])), y1 = Y(Math.min(p[1], p[4]));
      g.fillRect(X(i) - w / 2, y0, w, Math.max(1, y1 - y0));
    });
  } else {
    const grd = g.createLinearGradient(0, 0, 0, ch);
    grd.addColorStop(0, col + '40');
    grd.addColorStop(1, col + '00');
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(X(i), Y(p[4])) : g.moveTo(X(i), Y(p[4]))));
    g.strokeStyle = col;
    g.lineWidth = 2;
    g.shadowColor = col;
    g.shadowBlur = 10;
    g.stroke();
    g.shadowBlur = 0;
    g.lineTo(X(pts.length - 1), ch);
    g.lineTo(0, ch);
    g.closePath();
    g.fillStyle = grd;
    g.fill();
    g.lineWidth = 1;
  }

  const last = chart.price ?? pts.at(-1)[4];
  g.fillStyle = col;
  g.fillRect(cw + 2, Y(last) - 9, padR - 4, 18);
  g.fillStyle = '#0b0718';
  g.fillText(fmtPrice(last, symbol), cw + 8, Y(last));

  if (hover != null && hover.x < cw) {
    const i = Math.max(0, Math.min(pts.length - 1, Math.round((hover.x / cw) * (pts.length - 1))));
    const p = pts[i];
    g.strokeStyle = 'rgba(255,255,255,.25)';
    g.beginPath(); g.moveTo(X(i), 0); g.lineTo(X(i), H - padB); g.stroke();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(X(i), Y(p[4]), 3.5, 0, Math.PI * 2); g.fill();
    tip.hidden = false;
    tip.innerHTML = `<b>${fmtPrice(p[4], symbol)}</b><span>${new Date(p[0] * 1000).toLocaleString('en-US', { timeZone: tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span><span>O ${fmtPrice(p[1], symbol)} H ${fmtPrice(p[2], symbol)}</span><span>L ${fmtPrice(p[3], symbol)} C ${fmtPrice(p[4], symbol)}</span><span>Vol ${fmtVol(p[5])}</span>`;
    tip.style.transform = `translate(${X(i) > cw / 2 ? X(i) - 190 : X(i) + 12}px, 8px)`;
  }
}
