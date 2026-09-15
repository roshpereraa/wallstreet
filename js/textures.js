// Every surface is painted into a canvas at runtime: no downloaded assets.
import { fmtPrice, fmtPct, UP, DOWN } from './market.js';
import { label } from './data.js';

const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

let seed = 7;
export const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

export function carpetCanvas(tint = '#1c2330') {
  const c = mk(256, 256), g = c.getContext('2d');
  g.fillStyle = tint;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(255,255,255,${rand() * 0.035})`;
    g.fillRect(rand() * 256, rand() * 256, 1, 1);
  }
  g.strokeStyle = 'rgba(255,255,255,.04)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256);
  return c;
}

export function skylineCanvas() {
  const c = mk(1024, 256), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#0b1024');
  grd.addColorStop(0.6, '#3b2d4d');
  grd.addColorStop(1, '#d27a45');
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 256);
  let x = 0;
  while (x < 1024) {
    const w = 30 + rand() * 60, h = 60 + rand() * 170;
    g.fillStyle = `rgb(${14 + rand() * 12},${16 + rand() * 12},${28 + rand() * 14})`;
    g.fillRect(x, 256 - h, w, h);
    for (let wy = 256 - h + 6; wy < 250; wy += 9) for (let wx = x + 4; wx < x + w - 4; wx += 7) {
      if (rand() < 0.35) { g.fillStyle = `rgba(255,${200 + rand() * 40},140,${0.4 + rand() * 0.5})`; g.fillRect(wx, wy, 3, 4); }
    }
    x += w + 2;
  }
  return c;
}

export function signPlate(text, color, sub) {
  const c = mk(1200, 200), g = c.getContext('2d');
  g.fillStyle = '#0a0b0e';
  g.fillRect(0, 0, 1200, 200);
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.strokeRect(8, 8, 1184, 184);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 24;
  g.font = '700 96px "Cormorant Garamond", Georgia, serif';
  g.fillText(text.toUpperCase(), 600, 88);
  g.shadowBlur = 0;
  g.globalAlpha = 0.75;
  g.font = '500 26px "IBM Plex Mono", monospace';
  g.fillText(sub, 600, 160);
  return c;
}

// ---------------------------------------------------------------- live screens
export function spark(g, data, x, y, w, h, color, fill = true) {
  if (!data || data.length < 2) return;
  let lo = Infinity, hi = -Infinity;
  for (const v of data) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = hi - lo || 1;
  g.beginPath();
  data.forEach((v, i) => {
    const px = x + (i / (data.length - 1)) * w, py = y + h - ((v - lo) / span) * h;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  });
  g.strokeStyle = color;
  g.lineWidth = Math.max(1.5, w / 160);
  g.stroke();
  if (fill) {
    g.lineTo(x + w, y + h);
    g.lineTo(x, y + h);
    g.closePath();
    const grd = g.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, color + '55');
    grd.addColorStop(1, color + '00');
    g.fillStyle = grd;
    g.fill();
  }
}

export function drawLaptop(g, w, h, symbol, q, t) {
  g.fillStyle = '#05080d';
  g.fillRect(0, 0, w, h);
  const col = q?.change >= 0 ? UP : q ? DOWN : '#6b7a90';
  g.fillStyle = '#0d1624';
  g.fillRect(0, 0, w, h * 0.17);
  g.font = `600 ${h * 0.11}px "IBM Plex Mono", monospace`;
  g.textBaseline = 'middle';
  g.fillStyle = '#ffb000';
  g.fillText(label(symbol), w * 0.05, h * 0.09);
  g.textAlign = 'right';
  g.fillStyle = '#6b7a90';
  g.fillText('LIVE', w * 0.95, h * 0.09);
  g.textAlign = 'left';
  g.font = `600 ${h * 0.17}px "IBM Plex Mono", monospace`;
  g.fillStyle = '#e8eef6';
  g.fillText(q ? fmtPrice(q.price, symbol) : 'loading…', w * 0.05, h * 0.31);
  g.font = `500 ${h * 0.11}px "IBM Plex Mono", monospace`;
  g.fillStyle = col;
  g.fillText(q ? fmtPct(q.changePct) : '', w * 0.05, h * 0.46);
  spark(g, q?.spark, w * 0.05, h * 0.55, w * 0.9, h * 0.38, col);
  // scan cursor
  g.fillStyle = 'rgba(255,255,255,.05)';
  g.fillRect(((t * 60) % (w * 1.2)) - w * 0.1, h * 0.55, 2, h * 0.38);
}

export function drawTape(g, w, h, symbols, quotes, offset, { bg = '#040506', size = 0.55 } = {}) {
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.font = `600 ${h * size}px "IBM Plex Mono", monospace`;
  g.textBaseline = 'middle';
  const parts = symbols.map((s) => {
    const q = quotes.get(s);
    return { s: label(s), p: q ? fmtPrice(q.price, s) : '···', c: q ? fmtPct(q.changePct) : '', up: q ? q.change >= 0 : null };
  });
  const gap = h * 0.9;
  const widths = parts.map((p) => g.measureText(`${p.s} ${p.p} ${p.up == null ? '' : p.up ? '▲' : '▼'}${p.c}`).width + gap);
  const total = widths.reduce((a, b) => a + b, 0) || 1;
  let x = -(offset % total);
  while (x < w) {
    parts.forEach((p, i) => {
      if (x + widths[i] > 0 && x < w) {
        g.fillStyle = '#ffb000';
        g.fillText(p.s, x, h / 2);
        let cx = x + g.measureText(p.s + ' ').width;
        g.fillStyle = '#f2f4f7';
        g.fillText(p.p, cx, h / 2);
        cx += g.measureText(p.p + ' ').width;
        g.fillStyle = p.up == null ? '#777' : p.up ? UP : DOWN;
        g.fillText(`${p.up == null ? '' : p.up ? '▲' : '▼'}${p.c}`, cx, h / 2);
      }
      x += widths[i];
    });
  }
}

export function drawBoard(g, w, h, firm, quotes, t) {
  g.fillStyle = '#030406';
  g.fillRect(0, 0, w, h);
  const head = h * 0.13;
  g.fillStyle = firm.color;
  g.font = `600 ${head * 0.62}px "Cormorant Garamond", Georgia, serif`;
  g.textBaseline = 'middle';
  g.fillText(firm.name.toUpperCase(), w * 0.02, head * 0.55);
  g.textAlign = 'right';
  g.font = `500 ${head * 0.42}px "IBM Plex Mono", monospace`;
  g.fillStyle = '#9aa4b2';
  const ny = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  g.fillText(`${firm.desk.toUpperCase()}  ·  NEW YORK ${ny}`, w * 0.98, head * 0.55);
  g.textAlign = 'left';

  const cols = 4, rows = 2, top = head, tapeH = h * 0.14;
  const cw = w / cols, ch = (h - top - tapeH) / rows;
  firm.symbols.forEach((s, i) => {
    const q = quotes.get(s);
    const x = (i % cols) * cw, y = top + Math.floor(i / cols) * ch;
    const col = q ? (q.change >= 0 ? UP : DOWN) : '#555';
    g.fillStyle = '#0a0e14';
    g.fillRect(x + 6, y + 6, cw - 12, ch - 12);
    g.fillStyle = '#ffb000';
    g.font = `600 ${ch * 0.15}px "IBM Plex Mono", monospace`;
    g.fillText(label(s), x + 22, y + ch * 0.18);
    g.fillStyle = '#f2f4f7';
    g.font = `600 ${ch * 0.2}px "IBM Plex Mono", monospace`;
    g.fillText(q ? fmtPrice(q.price, s) : '···', x + 22, y + ch * 0.4);
    g.fillStyle = col;
    g.font = `500 ${ch * 0.14}px "IBM Plex Mono", monospace`;
    g.textAlign = 'right';
    g.fillText(q ? fmtPct(q.changePct) : '', x + cw - 22, y + ch * 0.18);
    g.textAlign = 'left';
    spark(g, q?.spark, x + 22, y + ch * 0.55, cw - 44, ch * 0.33, col);
  });
  g.save();
  g.translate(0, h - tapeH);
  drawTape(g, w, tapeH, firm.tape, quotes, t * 90, { bg: '#111' });
  g.restore();
}
