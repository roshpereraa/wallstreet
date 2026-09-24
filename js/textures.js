// Every surface is painted into a canvas at runtime: no downloaded assets.
import { fmtPrice, fmtPct, UP, DOWN } from './market.js';
import { label } from './data.js';

const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

let seed = 7;
export const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// Synthwave floor: dark tiles with faint neon grid lines
export function gridFloor(line = '#d9a441', bg = '#120c06') {
  const c = mk(256, 256), g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = `rgba(255,255,255,${rand() * 0.03})`;
    g.fillRect(rand() * 256, rand() * 256, 1, 1);
  }
  g.strokeStyle = line;
  g.globalAlpha = 0.28;
  g.lineWidth = 3;
  g.strokeRect(0, 0, 256, 256);
  const sheen = g.createLinearGradient(0, 0, 256, 256); // polished stone
  sheen.addColorStop(0, 'rgba(255,210,130,.06)');
  sheen.addColorStop(0.5, 'rgba(255,210,130,0)');
  sheen.addColorStop(1, 'rgba(255,210,130,.05)');
  g.globalAlpha = 1;
  g.fillStyle = sheen;
  g.fillRect(0, 0, 256, 256);
  return c;
}

// Golden-hour city for the windows: hazy low sun, dark towers, warm lit windows
export function goldenSkyline() {
  const c = mk(1024, 512), g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#2a1a08');
  sky.addColorStop(0.35, '#8a5a17');
  sky.addColorStop(0.62, '#e0a13a');
  sky.addColorStop(0.82, '#ffd27a');
  sky.addColorStop(1, '#ffe9b8');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);

  const sun = g.createRadialGradient(660, 300, 10, 660, 300, 340);
  sun.addColorStop(0, 'rgba(255,245,215,1)');
  sun.addColorStop(0.35, 'rgba(255,196,90,.45)');
  sun.addColorStop(1, 'rgba(255,170,60,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, 1024, 512);

  const layers = [
    { alpha: 0.3, min: 70, max: 150, w: [40, 110], tint: '#7a5626', lit: false },
    { alpha: 0.55, min: 100, max: 200, w: [30, 90], tint: '#4a3214', lit: false },
    { alpha: 1, min: 120, max: 250, w: [26, 74], tint: '#1a1006', lit: true },
  ];
  for (const layer of layers) {
    let x = -20;
    g.globalAlpha = layer.alpha;
    while (x < 1044) {
      const w = layer.w[0] + rand() * (layer.w[1] - layer.w[0]);
      const h = layer.min + rand() * (layer.max - layer.min);
      g.fillStyle = layer.tint;
      g.fillRect(x, 512 - h, w, h);
      if (layer.lit) {
        for (let wy = 512 - h + 10; wy < 506; wy += 11) for (let wx = x + 5; wx < x + w - 5; wx += 9) {
          if (rand() < 0.34) {
            g.fillStyle = `rgba(255,${Math.round(196 + rand() * 50)},${Math.round(90 + rand() * 60)},${0.35 + rand() * 0.55})`;
            g.fillRect(wx, wy, 4, 5);
          }
        }
        if (rand() < 0.3) {
          g.fillStyle = layer.tint;
          g.fillRect(x + w / 2 - 1, 512 - h - 26, 2, 26);
        }
      }
      x += w + 3 + rand() * 10;
    }
  }
  g.globalAlpha = 1;
  const haze = g.createLinearGradient(0, 200, 0, 512);
  haze.addColorStop(0, 'rgba(255,190,90,0)');
  haze.addColorStop(1, 'rgba(255,190,90,.22)');
  g.fillStyle = haze;
  g.fillRect(0, 0, 1024, 512);
  return c;
}

// House emblem: a glowing chevron, like the logo on the trading-floor screen
export function chevronLogo(color = '#ffc247') {
  const c = mk(512, 512), g = c.getContext('2d');
  const draw = (alpha, blur) => {
    g.save();
    g.translate(256, 250);
    g.globalAlpha = alpha;
    g.shadowColor = color;
    g.shadowBlur = blur;
    const grd = g.createLinearGradient(-150, -120, 150, 150);
    grd.addColorStop(0, '#ffe8ad');
    grd.addColorStop(0.5, color);
    grd.addColorStop(1, '#c98a1e');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(-150, -120);
    g.lineTo(-60, -120);
    g.lineTo(0, -10);
    g.lineTo(60, -120);
    g.lineTo(150, -120);
    g.lineTo(0, 130);
    g.closePath();
    g.fill();
    g.restore();
  };
  draw(0.5, 70);
  draw(0.9, 30);
  draw(1, 8);
  return c;
}

// Neon tube lettering on a dark backing
export function neonSign(text, color, { w = 1024, h = 256, font = '"Monoton", "VT323", monospace', size = 0.52, backing = true } = {}) {
  const c = mk(w, h), g = c.getContext('2d');
  if (backing) {
    g.fillStyle = 'rgba(8,5,20,.85)';
    g.fillRect(0, 0, w, h);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${h * size}px ${font}`;
  for (const [blur, alpha] of [[40, 0.6], [18, 0.9], [4, 1]]) {
    g.shadowColor = color;
    g.shadowBlur = blur;
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + h * 0.03);
  }
  g.globalAlpha = 1;
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(255,255,255,.85)';
  g.font = `${h * size * 0.98}px ${font}`;
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.35;
  g.fillText(text, w / 2, h / 2 + h * 0.03);
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
  g.fillStyle = '#0d0904';
  g.fillRect(0, 0, w, h);
  const col = q?.change >= 0 ? UP : q ? DOWN : '#9a8258';
  g.fillStyle = '#241605';
  g.fillRect(0, 0, w, h * 0.17);
  g.font = `600 ${h * 0.11}px "IBM Plex Mono", monospace`;
  g.textBaseline = 'middle';
  g.fillStyle = '#ffc247';
  g.fillText(label(symbol), w * 0.05, h * 0.09);
  g.textAlign = 'right';
  g.fillStyle = '#9a8258';
  g.fillText('LIVE', w * 0.95, h * 0.09);
  g.textAlign = 'left';
  g.font = `600 ${h * 0.17}px "IBM Plex Mono", monospace`;
  g.fillStyle = '#fff3dd';
  g.fillText(q ? fmtPrice(q.price, symbol) : 'loading…', w * 0.05, h * 0.31);
  g.font = `500 ${h * 0.11}px "IBM Plex Mono", monospace`;
  g.fillStyle = col;
  g.fillText(q ? fmtPct(q.changePct) : '', w * 0.05, h * 0.46);
  spark(g, q?.spark, w * 0.05, h * 0.55, w * 0.9, h * 0.38, col);
  // scan cursor
  g.fillStyle = 'rgba(255,255,255,.05)';
  g.fillRect(((t * 60) % (w * 1.2)) - w * 0.1, h * 0.55, 2, h * 0.38);
}

export function drawTape(g, w, h, symbols, quotes, offset, { bg = '#0c0703', size = 0.55 } = {}) {
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
        g.fillStyle = '#ffc247';
        g.fillText(p.s, x, h / 2);
        let cx = x + g.measureText(p.s + ' ').width;
        g.fillStyle = '#fff3dd';
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
  g.fillStyle = '#0c0703';
  g.fillRect(0, 0, w, h);
  const head = h * 0.13;
  g.fillStyle = firm.color;
  g.font = `${head * 0.7}px "VT323", "IBM Plex Mono", monospace`;
  g.textBaseline = 'middle';
  g.fillText(firm.name.toUpperCase(), w * 0.02, head * 0.55);
  g.textAlign = 'right';
  g.font = `500 ${head * 0.42}px "IBM Plex Mono", monospace`;
  g.fillStyle = '#c4a877';
  const ny = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  g.fillText(`${firm.desk.toUpperCase()}  ·  NEW YORK ${ny}`, w * 0.98, head * 0.55);
  g.textAlign = 'left';

  const cols = 4, rows = 2, top = head, tapeH = h * 0.14;
  const cw = w / cols, ch = (h - top - tapeH) / rows;
  firm.symbols.forEach((s, i) => {
    const q = quotes.get(s);
    const x = (i % cols) * cw, y = top + Math.floor(i / cols) * ch;
    const col = q ? (q.change >= 0 ? UP : DOWN) : '#555';
    g.fillStyle = '#1a1206';
    g.fillRect(x + 6, y + 6, cw - 12, ch - 12);
    g.fillStyle = '#ffc247';
    g.font = `600 ${ch * 0.15}px "IBM Plex Mono", monospace`;
    g.fillText(label(s), x + 22, y + ch * 0.18);
    g.fillStyle = '#fff3dd';
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
  drawTape(g, w, tapeH, firm.tape, quotes, t * 90, { bg: '#1c1207' });
  g.restore();
}
