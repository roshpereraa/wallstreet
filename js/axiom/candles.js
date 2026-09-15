// Axiom-style candle chart on canvas: price or market-cap scale, volume, live last price,
// your buy/sell markers, your average entry, OHLC readout, wheel zoom and drag to pan.

const UP = '#18c78c', DOWN = '#f0435b';

function fmt(v) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return (v / 1e3).toFixed(1) + 'K';
  if (a >= 1) return v.toFixed(a >= 100 ? 2 : 4);
  if (a === 0) return '0';
  return v.toLocaleString('en-US', { maximumSignificantDigits: 4 });
}

export function createCandleChart(host) {
  host.innerHTML = '<canvas></canvas><div class="axc-ohlc"></div><div class="axc-msg"></div>';
  const cv = host.querySelector('canvas');
  const ohlc = host.querySelector('.axc-ohlc');
  const msg = host.querySelector('.axc-msg');
  let data = [], opts = {}, count = 90, offset = 0, hover = null, drag = null;

  const tfSeconds = () => ({ '1s': 1, '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '1D': 86400 }[opts.tf] || 60);

  function draw() {
    const box = host.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = Math.max(10, box.width), H = Math.max(10, box.height);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!data.length) { ohlc.textContent = ''; return; }

    const scale = opts.mode === 'mcap' && opts.mcapFactor ? opts.mcapFactor : 1;
    const n = Math.min(count, data.length);
    const end = Math.max(n, data.length - offset);
    const view = data.slice(end - n, end);
    const padR = 70, padB = 22, padT = 26, volH = Math.min(70, H * 0.18);
    const cw = W - padR, ch = H - padB - padT - volH - 4;
    let lo = Infinity, hi = -Infinity, vmax = 0;
    for (const p of view) { lo = Math.min(lo, p[3]); hi = Math.max(hi, p[2]); vmax = Math.max(vmax, p[5] || 0); }
    if (opts.entry) { lo = Math.min(lo, opts.entry); hi = Math.max(hi, opts.entry); }
    const pad = (hi - lo) * 0.1 || hi * 0.02 || 1e-9;
    lo -= pad; hi += pad;
    const step = cw / n;
    const X = (i) => i * step + step / 2;
    const Y = (v) => padT + ch - ((v - lo) / (hi - lo)) * ch;

    // grid + price axis
    g.font = '11px "IBM Plex Mono", monospace';
    g.textBaseline = 'middle';
    for (let i = 0; i <= 6; i++) {
      const v = lo + ((hi - lo) * i) / 6, y = Y(v);
      g.strokeStyle = 'rgba(120,130,170,.09)';
      g.beginPath(); g.moveTo(0, y); g.lineTo(cw, y); g.stroke();
      g.fillStyle = '#6c7393';
      g.fillText(fmt(v * scale), cw + 8, y);
    }
    // time axis
    const tz = undefined;
    const tf = tfSeconds();
    const labelEvery = Math.max(1, Math.round(110 / step));
    g.textAlign = 'center';
    for (let i = 0; i < n; i += labelEvery) {
      const d = new Date(view[i][0] * 1000);
      const txt = tf >= 86400 ? d.toLocaleDateString([], { month: 'short', day: 'numeric' })
        : tf < 60 ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: tz })
        : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz });
      g.fillStyle = '#6c7393';
      g.fillText(txt, Math.min(cw - 30, Math.max(30, X(i))), H - padB / 2);
      g.strokeStyle = 'rgba(120,130,170,.05)';
      g.beginPath(); g.moveTo(X(i), padT); g.lineTo(X(i), H - padB); g.stroke();
    }
    g.textAlign = 'left';

    // volume
    const bw = Math.max(1, step * 0.7);
    view.forEach((p, i) => {
      const vh = vmax ? ((p[5] || 0) / vmax) * volH : 0;
      g.fillStyle = p[4] >= p[1] ? 'rgba(24,199,140,.28)' : 'rgba(240,67,91,.28)';
      g.fillRect(X(i) - bw / 2, H - padB - vh, bw, vh);
    });

    // candles
    view.forEach((p, i) => {
      const c = p[4] >= p[1] ? UP : DOWN;
      g.strokeStyle = g.fillStyle = c;
      g.beginPath(); g.moveTo(X(i), Y(p[2])); g.lineTo(X(i), Y(p[3])); g.stroke();
      const y0 = Y(Math.max(p[1], p[4])), y1 = Y(Math.min(p[1], p[4]));
      g.fillRect(X(i) - bw / 2, y0, bw, Math.max(1, y1 - y0));
    });

    // average entry
    if (opts.entry) {
      const y = Y(opts.entry);
      g.setLineDash([5, 4]);
      g.strokeStyle = 'rgba(255,209,102,.8)';
      g.beginPath(); g.moveTo(0, y); g.lineTo(cw, y); g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#ffd166';
      g.fillRect(cw + 2, y - 9, padR - 4, 18);
      g.fillStyle = '#1a1300';
      g.fillText('AVG ' + fmt(opts.entry * scale), cw + 5, y);
    }

    // your trades: B / S bubbles
    const t0 = view[0][0], t1 = view[view.length - 1][0] + tf;
    for (const m of opts.markers || []) {
      const ts = m.t / 1000;
      if (ts < t0 || ts > t1) continue;
      const i = Math.min(n - 1, Math.max(0, Math.floor((ts - t0) / tf)));
      const p = view[i];
      const buy = m.side === 'BUY';
      const y = buy ? Y(p[3]) + 14 : Y(p[2]) - 14;
      g.beginPath();
      g.arc(X(i), y, 8, 0, Math.PI * 2);
      g.fillStyle = buy ? UP : DOWN;
      g.fill();
      g.fillStyle = '#fff';
      g.font = 'bold 10px "IBM Plex Mono", monospace';
      g.textAlign = 'center';
      g.fillText(buy ? 'B' : 'S', X(i), y + 0.5);
      g.textAlign = 'left';
      g.font = '11px "IBM Plex Mono", monospace';
    }

    // last price
    const last = view[view.length - 1];
    const lc = last[4] >= last[1] ? UP : DOWN;
    const ly = Y(last[4]);
    g.setLineDash([2, 3]);
    g.strokeStyle = lc;
    g.beginPath(); g.moveTo(0, ly); g.lineTo(cw, ly); g.stroke();
    g.setLineDash([]);
    g.fillStyle = lc;
    g.fillRect(cw + 2, ly - 9, padR - 4, 18);
    g.fillStyle = '#fff';
    g.fillText(fmt(last[4] * scale), cw + 6, ly);

    // crosshair + OHLC readout
    let focus = last;
    if (hover && hover.x < cw) {
      const i = Math.max(0, Math.min(n - 1, Math.floor(hover.x / step)));
      focus = view[i];
      g.strokeStyle = 'rgba(200,210,255,.35)';
      g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(X(i), padT); g.lineTo(X(i), H - padB); g.moveTo(0, hover.y); g.lineTo(cw, hover.y); g.stroke();
      g.setLineDash([]);
      const pv = lo + ((padT + ch - hover.y) / ch) * (hi - lo);
      if (hover.y > padT && hover.y < padT + ch) {
        g.fillStyle = '#2a3150';
        g.fillRect(cw + 2, hover.y - 9, padR - 4, 18);
        g.fillStyle = '#fff';
        g.fillText(fmt(pv * scale), cw + 6, hover.y);
      }
    }
    const col = focus[4] >= focus[1] ? UP : DOWN;
    const chg = focus[1] ? ((focus[4] - focus[1]) / focus[1]) * 100 : 0;
    ohlc.innerHTML = `<span>${opts.label || ''} · ${opts.tf || ''} · ${opts.mode === 'mcap' ? 'MarketCap' : 'Price'}</span>
      O<b style="color:${col}">${fmt(focus[1] * scale)}</b> H<b style="color:${col}">${fmt(focus[2] * scale)}</b>
      L<b style="color:${col}">${fmt(focus[3] * scale)}</b> C<b style="color:${col}">${fmt(focus[4] * scale)}</b>
      <b style="color:${col}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</b> Vol<b>${fmt(focus[5])}</b>`;
  }

  cv.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect();
    if (drag) {
      const dx = e.clientX - drag.x;
      const step = r.width / Math.min(count, data.length || 1);
      offset = Math.max(0, Math.min(Math.max(0, data.length - count), drag.offset + Math.round(dx / step)));
    }
    hover = { x: e.clientX - r.left, y: e.clientY - r.top };
    draw();
  });
  cv.addEventListener('pointerleave', () => { hover = null; drag = null; draw(); });
  cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, offset }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointerup', () => { drag = null; });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    count = Math.max(20, Math.min(400, Math.round(count * (e.deltaY > 0 ? 1.12 : 0.89))));
    draw();
  }, { passive: false });
  new ResizeObserver(draw).observe(host);

  return {
    set(points, o = {}) {
      const tfChanged = o.tf !== undefined && o.tf !== opts.tf;
      data = fillGaps(points || [], { '1s': 1, '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '1D': 86400 }[o.tf || opts.tf] || 60);
      opts = { ...opts, ...o };
      if (tfChanged) { offset = 0; count = o.tf === '1s' ? 120 : 90; }
      msg.textContent = '';
      draw();
    },
    update(o) { opts = { ...opts, ...o }; draw(); },
    // live tick: roll the last candle or open a new one
    tick(price, tSec) {
      if (!(price > 0)) return;
      msg.textContent = '';
      const tf = tfSeconds();
      const bucket = Math.floor(tSec / tf) * tf;
      const last = data[data.length - 1];
      if (!last || bucket > last[0]) data.push([bucket, last ? last[4] : price, Math.max(price, last ? last[4] : price), Math.min(price, last ? last[4] : price), price, 0]);
      else { last[2] = Math.max(last[2], price); last[3] = Math.min(last[3], price); last[4] = price; }
      if (data.length > 1500) data.splice(0, data.length - 1500);
      draw();
    },
    message(text) { msg.textContent = text; },
    get length() { return data.length; },
  };
}

// Candle APIs skip intervals with no trades. Fill them with flat candles so the time axis is real,
// keeping only the most recent stretch so quiet pools still show their latest action.
function fillGaps(points, size, max = 720) {
  if (points.length < 2) return points.map((p) => [...p]);
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = out[out.length - 1];
    if (prev) {
      for (let t = prev[0] + size; t < p[0]; t += size) {
        out.push([t, prev[4], prev[4], prev[4], prev[4], 0]);
        if (out.length > max * 4) out.splice(0, out.length - max * 2);
      }
    }
    out.push([...p]);
  }
  return out.length > max ? out.slice(out.length - max) : out;
}

// Build candles from individual trades (for 1s, and for young pools with no candle history)
export function candlesFromTrades(trades, tf) {
  const size = { '1s': 1, '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '1D': 86400 }[tf] || 60;
  const sorted = [...trades].sort((a, b) => a.t - b.t);
  const out = [];
  for (const t of sorted) {
    const b = Math.floor(t.t / size) * size;
    const last = out[out.length - 1];
    if (!last || last[0] !== b) {
      // carry the previous close so gaps don't jump
      const open = last ? last[4] : t.price;
      out.push([b, open, Math.max(open, t.price), Math.min(open, t.price), t.price, t.usd || 0]);
    } else {
      last[2] = Math.max(last[2], t.price);
      last[3] = Math.min(last[3], t.price);
      last[4] = t.price;
      last[5] += t.usd || 0;
    }
  }
  return out;
}
