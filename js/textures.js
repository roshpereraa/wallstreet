// Every surface is painted into a canvas at runtime: no downloaded assets.
import { fmtPrice, fmtPct, UP, DOWN } from './market.js';
import { label } from './data.js';

const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

let seed = 7;
export const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

export function skyCanvas() {
  const c = mk(16, 512), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#070b1a');
  grd.addColorStop(0.45, '#1a2140');
  grd.addColorStop(0.72, '#5b3a52');
  grd.addColorStop(0.86, '#c86a3e');
  grd.addColorStop(1, '#f2a65a');
  g.fillStyle = grd;
  g.fillRect(0, 0, 16, 512);
  return c;
}

// Office-tower facade: a grid of windows, some lit. Used as colour map and emissive map.
export function facadeCanvas({ cols = 8, rows = 16, base = '#1b2230', lit = 0.45, warm = true } = {}) {
  const c = mk(512, 1024), g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 1024);
  const cw = 512 / cols, rh = 1024 / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const on = rand() < lit;
      const hue = warm ? (rand() < 0.8 ? '255,208,140' : '190,220,255') : (rand() < 0.7 ? '200,225,255' : '255,220,160');
      g.fillStyle = on ? `rgba(${hue},${0.55 + rand() * 0.45})` : `rgba(40,55,80,${0.5 + rand() * 0.3})`;
      g.fillRect(x * cw + cw * 0.14, y * rh + rh * 0.16, cw * 0.72, rh * 0.62);
    }
  }
  // mullions
  g.fillStyle = 'rgba(0,0,0,.35)';
  for (let y = 0; y < rows; y++) g.fillRect(0, y * rh, 512, rh * 0.08);
  return c;
}

// Emissive-only copy: black everywhere except the lit windows.
export function facadeGlow(src) {
  const c = mk(src.width, src.height), g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (lum < 150) { d[i] = d[i + 1] = d[i + 2] = 0; }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function stoneCanvas(color) {
  const c = mk(256, 256), g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    g.fillStyle = 'rgba(0,0,0,.22)';
    g.fillRect(0, y, 256, 2);
    const off = (y / 32) % 2 ? 0 : 48;
    for (let x = off; x < 256; x += 96) g.fillRect(x, y, 2, 32);
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'},${rand() * 0.06})`;
    g.fillRect(rand() * 256, rand() * 256, 2, 2);
  }
  return c;
}

export function roadCanvas() {
  const c = mk(256, 512), g = c.getContext('2d');
  g.fillStyle = '#2a2b2f';
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'},${rand() * 0.08})`;
    g.fillRect(rand() * 256, rand() * 512, 2, 2);
  }
  g.fillStyle = '#e6b84a';
  g.fillRect(124, 0, 3, 512);
  g.fillRect(130, 0, 3, 512);
  return c;
}

export function cobbleCanvas() {
  const c = mk(256, 256), g = c.getContext('2d');
  g.fillStyle = '#6b6660';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32) {
    const v = 90 + rand() * 30;
    g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
    g.fillRect(x + 1, y + 1, 30, 30);
  }
  return c;
}

export function signCanvas(text, color, sub = 'EST. 1869 · TRADING FLOOR') {
  const c = mk(1024, 200), g = c.getContext('2d');
  g.fillStyle = '#0c0d10';
  g.fillRect(0, 0, 1024, 200);
  g.strokeStyle = color;
  g.lineWidth = 4;
  g.strokeRect(10, 10, 1004, 180);
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '600 92px "Cormorant Garamond", Georgia, "Times New Roman", serif';
  g.shadowColor = color;
  g.shadowBlur = 18;
  g.fillText(text.toUpperCase(), 512, 92);
  g.shadowBlur = 0;
  g.font = '500 24px "IBM Plex Mono", monospace';
  g.globalAlpha = 0.7;
  g.fillText(sub, 512, 160);
  return c;
}

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

export function glowCanvas(color) {
  const c = mk(256, 256), g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
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

export function drawBoard(g, w, h, firm, quotes, t, tapeSymbols) {
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
  drawTape(g, w, tapeH, tapeSymbols, quotes, t * 90, { bg: '#111' });
  g.restore();
}
