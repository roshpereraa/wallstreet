// The laptop terminal: live watchlist, chart, stats and headlines for any ticker.
import { FIRMS, INDICES, label } from './data.js';
import { quotes, watch, onQuotes, refresh, getChart, search, fmtPrice, fmtPct, fmtChg, fmtVol, tone, UP, DOWN } from './market.js';

const RANGES = [['1d', '1D'], ['5d', '5D'], ['1mo', '1M'], ['6mo', '6M'], ['1y', '1Y'], ['5y', '5Y']];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATE_TEXT = { OPEN: 'Market open', PRE: 'Pre-market', AFTER: 'After hours', CLOSED: 'Market closed' };

function loadList() {
  try { return JSON.parse(localStorage.getItem('ws.mylist')) || []; } catch { return []; }
}
function saveList(l) {
  try { localStorage.setItem('ws.mylist', JSON.stringify(l)); } catch { /* private mode */ }
}

export function createTerminal(root, { onClose, blip }) {
  root.innerHTML = `
    <div class="lt-bezel">
      <div class="lt-cam"></div>
      <div class="lt-screen">
        <header class="lt-top">
          <div class="lt-firm"><i class="lt-dot"></i><b class="lt-firm-name"></b><span class="lt-desk"></span></div>
          <div class="lt-user"></div>
          <div class="lt-clock"><span class="lt-state"></span><b class="lt-ny"></b></div>
          <button class="lt-close" aria-label="Close laptop (Esc)">✕ <span>Close</span></button>
        </header>
        <div class="lt-tape" aria-label="Indices"></div>
        <div class="lt-main">
          <aside class="lt-side">
            <div class="lt-search">
              <input type="search" placeholder="Search any ticker…  ( / )" aria-label="Search ticker" autocomplete="off" spellcheck="false">
              <div class="lt-results" hidden></div>
            </div>
            <div class="lt-lists"></div>
          </aside>
          <section class="lt-center">
            <div class="lt-head">
              <div class="lt-title">
                <div class="lt-sym"><b></b><button class="lt-star" title="Add to My list">☆</button></div>
                <div class="lt-name"></div>
              </div>
              <div class="lt-px"><b></b><span></span></div>
            </div>
            <div class="lt-bar">
              <div class="lt-ranges"></div>
              <div class="lt-kinds"><button data-k="line" class="on">Line</button><button data-k="candle">Candles</button></div>
            </div>
            <div class="lt-chart"><canvas></canvas><div class="lt-tip" hidden></div><div class="lt-msg"></div></div>
          </section>
          <aside class="lt-info">
            <h4>Key stats</h4>
            <dl class="lt-stats"></dl>
            <div class="lt-dayrange"><span></span><div><i></i></div><span></span></div>
            <h4>Headlines</h4>
            <ul class="lt-news"><li class="lt-empty">Loading…</li></ul>
          </aside>
        </div>
        <footer class="lt-foot"><span>Live data: Yahoo Finance via /api · quotes can be delayed · not investment advice</span><span class="lt-upd"></span></footer>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const el = {
    firmName: $('.lt-firm-name'), desk: $('.lt-desk'), dot: $('.lt-dot'), user: $('.lt-user'), state: $('.lt-state'), ny: $('.lt-ny'),
    tape: $('.lt-tape'), lists: $('.lt-lists'), input: $('.lt-search input'), results: $('.lt-results'),
    sym: $('.lt-sym b'), star: $('.lt-star'), name: $('.lt-name'), px: $('.lt-px b'), chg: $('.lt-px span'),
    ranges: $('.lt-ranges'), kinds: $('.lt-kinds'), canvas: $('.lt-chart canvas'), tip: $('.lt-tip'), msg: $('.lt-msg'),
    stats: $('.lt-stats'), dayrange: $('.lt-dayrange'), news: $('.lt-news'), upd: $('.lt-upd'),
  };

  let firm = FIRMS[0], symbol = 'AAPL', range = '1d', kind = 'line', chart = null, hover = null;
  let open = false, chartTimer = null, clockTimer = null, reqId = 0, myList = loadList();

  el.ranges.innerHTML = RANGES.map(([r, t]) => `<button data-r="${r}">${t}</button>`).join('');

  // ------------------------------------------------ rendering
  function renderTape() {
    el.tape.innerHTML = INDICES.map((s) => {
      const q = quotes.get(s);
      return `<button data-s="${esc(s)}"><b>${esc(label(s))}</b> ${q ? fmtPrice(q.price, s) : '···'} <em style="color:${tone(q?.change)}">${q ? fmtPct(q.changePct) : ''}</em></button>`;
    }).join('');
  }

  function row(s) {
    const q = quotes.get(s);
    const pts = q?.spark || [];
    let path = '';
    if (pts.length > 1) {
      const lo = Math.min(...pts), hi = Math.max(...pts), sp = hi - lo || 1;
      path = pts.map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * 60).toFixed(1)},${(18 - ((v - lo) / sp) * 16).toFixed(1)}`).join('');
    }
    return `<button class="lt-row${s === symbol ? ' on' : ''}" data-s="${esc(s)}">
      <span class="lt-rs"><b>${esc(label(s))}</b><small>${esc(q?.name || s)}</small></span>
      <svg viewBox="0 0 60 20" preserveAspectRatio="none"><path d="${path}" stroke="${tone(q?.change)}" fill="none" stroke-width="1.4" vector-effect="non-scaling-stroke"/></svg>
      <span class="lt-rp"><b>${q ? fmtPrice(q.price, s) : '···'}</b><small style="color:${tone(q?.change)}">${q ? fmtPct(q.changePct) : ''}</small></span>
    </button>`;
  }

  function renderLists() {
    el.lists.innerHTML = `
      <h5>${esc(firm.desk)}</h5>${firm.symbols.map(row).join('')}
      <h5>My list ${myList.length ? '' : '<small>· tap ☆ to add</small>'}</h5>${myList.map(row).join('')}`;
  }

  function renderHeader() {
    const q = quotes.get(symbol);
    const c = chart && chart.symbol === symbol ? chart : null;
    const src = q || c;
    el.sym.textContent = label(symbol) === symbol ? symbol : `${label(symbol)} · ${symbol}`;
    el.name.textContent = src ? `${src.name} · ${src.exchange || ''} · ${src.currency || ''}` : 'Loading…';
    el.px.textContent = src ? fmtPrice(src.price, symbol) : '—';
    el.chg.textContent = src ? `${fmtChg(src.change, symbol)}  (${fmtPct(src.changePct)})` : '';
    el.chg.style.color = tone(src?.change);
    el.star.textContent = myList.includes(symbol) ? '★' : '☆';
    const ms = src?.marketState || 'CLOSED';
    el.state.textContent = STATE_TEXT[ms];
    el.state.dataset.s = ms;

    const stat = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
    el.stats.innerHTML = src ? [
      stat('Open', fmtPrice(c?.open ?? q?.open, symbol)),
      stat('Prev close', fmtPrice(src.prevClose, symbol)),
      stat('Day high', fmtPrice(src.dayHigh, symbol)),
      stat('Day low', fmtPrice(src.dayLow, symbol)),
      stat('Volume', fmtVol(src.volume)),
      stat('52W high', fmtPrice(src.high52, symbol)),
      stat('52W low', fmtPrice(src.low52, symbol)),
      stat('Type', esc((src.type || '').toLowerCase())),
    ].join('') : '';
    const [lo, bar, hi] = el.dayrange.children;
    if (src?.dayLow != null && src?.dayHigh != null) {
      el.dayrange.hidden = false;
      lo.textContent = fmtPrice(src.dayLow, symbol);
      hi.textContent = fmtPrice(src.dayHigh, symbol);
      const k = (src.price - src.dayLow) / ((src.dayHigh - src.dayLow) || 1);
      bar.firstElementChild.style.left = `${Math.min(100, Math.max(0, k * 100))}%`;
    } else el.dayrange.hidden = true;
    if (src?.time) el.upd.textContent = `Last trade ${new Date(src.time * 1000).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ET`;
  }

  function renderRanges() {
    el.ranges.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.r === range));
    el.kinds.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === kind));
  }

  // ------------------------------------------------ chart
  function drawChart() {
    const cv = el.canvas, box = cv.parentElement.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = Math.max(10, box.width), H = Math.max(10, box.height);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!chart || chart.symbol !== symbol || !chart.points.length) return;

    const pts = chart.points;
    g.font = '11px "IBM Plex Mono", monospace';
    const padR = Math.max(64, g.measureText(fmtPrice(pts.reduce((m, p) => Math.max(m, p[2]), 0), symbol)).width + 18), padB = 22, volH = Math.min(60, H * 0.18);
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
    const up = pts.at(-1)[4] >= (base ?? pts[0][4]);
    const col = up ? UP : DOWN;

    // grid + y labels
    g.font = '11px "IBM Plex Mono", monospace';
    g.textBaseline = 'middle';
    for (let i = 0; i <= 5; i++) {
      const v = lo + ((hi - lo) * i) / 5, y = Y(v);
      g.strokeStyle = 'rgba(255,255,255,.06)';
      g.beginPath(); g.moveTo(0, y); g.lineTo(cw, y); g.stroke();
      g.fillStyle = '#6f7b8c';
      g.fillText(fmtPrice(v, symbol), cw + 8, y);
    }
    // x labels
    const tz = chart.timezone || 'America/New_York';
    const fmtT = (ts) => new Date(ts * 1000).toLocaleString('en-US', range === '1d' ? { timeZone: tz, hour: 'numeric', minute: '2-digit' } : range === '5d' || range === '1mo' ? { timeZone: tz, month: 'short', day: 'numeric' } : { timeZone: tz, month: 'short', year: '2-digit' });
    g.textAlign = 'center';
    const ticks = Math.max(2, Math.floor(cw / 110));
    for (let i = 0; i <= ticks; i++) {
      const idx = Math.round((i / ticks) * (pts.length - 1));
      g.fillStyle = '#6f7b8c';
      g.fillText(fmtT(pts[idx][0]), Math.min(cw - 30, Math.max(30, X(idx))), H - padB / 2);
    }
    g.textAlign = 'left';

    // previous close
    if (base && range === '1d') {
      g.setLineDash([4, 4]);
      g.strokeStyle = 'rgba(255,176,0,.5)';
      g.beginPath(); g.moveTo(0, Y(base)); g.lineTo(cw, Y(base)); g.stroke();
      g.setLineDash([]);
    }

    // volume
    const bw = Math.max(1, cw / pts.length - 1);
    pts.forEach((p, i) => {
      const vh = vmax ? (p[5] / vmax) * volH : 0;
      g.fillStyle = p[4] >= p[1] ? 'rgba(39,212,126,.28)' : 'rgba(255,77,94,.28)';
      g.fillRect(X(i) - bw / 2, H - padB - vh, bw, vh);
    });

    if (kind === 'candle') {
      const w = Math.max(1, Math.min(10, cw / pts.length * 0.7));
      pts.forEach((p, i) => {
        const c = p[4] >= p[1] ? UP : DOWN;
        g.strokeStyle = g.fillStyle = c;
        g.beginPath(); g.moveTo(X(i), Y(p[2])); g.lineTo(X(i), Y(p[3])); g.stroke();
        const y0 = Y(Math.max(p[1], p[4])), y1 = Y(Math.min(p[1], p[4]));
        g.fillRect(X(i) - w / 2, y0, w, Math.max(1, y1 - y0));
      });
    } else {
      const grd = g.createLinearGradient(0, 0, 0, ch);
      grd.addColorStop(0, col + '44');
      grd.addColorStop(1, col + '00');
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(X(i), Y(p[4])) : g.moveTo(X(i), Y(p[4]))));
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.stroke();
      g.lineTo(X(pts.length - 1), ch);
      g.lineTo(0, ch);
      g.closePath();
      g.fillStyle = grd;
      g.fill();
      g.lineWidth = 1;
    }

    // last price tag
    const last = chart.price ?? pts.at(-1)[4];
    g.fillStyle = col;
    g.fillRect(cw + 2, Y(last) - 9, padR - 4, 18);
    g.fillStyle = '#05080d';
    g.fillText(fmtPrice(last, symbol), cw + 8, Y(last));

    // crosshair
    if (hover != null && hover.x < cw) {
      const i = Math.round((hover.x / cw) * (pts.length - 1));
      const p = pts[Math.max(0, Math.min(pts.length - 1, i))];
      g.strokeStyle = 'rgba(255,255,255,.25)';
      g.beginPath(); g.moveTo(X(i), 0); g.lineTo(X(i), H - padB); g.stroke();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(X(i), Y(p[4]), 3.5, 0, Math.PI * 2); g.fill();
      el.tip.hidden = false;
      el.tip.innerHTML = `<b>${fmtPrice(p[4], symbol)}</b><span>${new Date(p[0] * 1000).toLocaleString('en-US', { timeZone: tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span><span>O ${fmtPrice(p[1], symbol)} H ${fmtPrice(p[2], symbol)} L ${fmtPrice(p[3], symbol)}</span><span>Vol ${fmtVol(p[5])}</span>`;
      const tx = X(i) > cw / 2 ? X(i) - 190 : X(i) + 12;
      el.tip.style.transform = `translate(${tx}px, 8px)`;
    } else el.tip.hidden = true;
  }

  async function loadChart(silent) {
    const id = ++reqId;
    if (!silent) { el.msg.textContent = 'Loading chart…'; chart = chart?.symbol === symbol && chart.range === range ? chart : null; drawChart(); }
    try {
      const data = await getChart(symbol, range);
      if (id !== reqId) return;
      chart = data;
      el.msg.textContent = data.points.length ? '' : 'No trades in this range yet.';
    } catch (e) {
      if (id !== reqId) return;
      chart = null;
      el.msg.textContent = `Couldn't load ${symbol}. Check the ticker and try again.`;
    }
    renderHeader();
    drawChart();
  }

  async function loadNews() {
    const s = symbol;
    el.news.innerHTML = '<li class="lt-empty">Loading…</li>';
    const q = quotes.get(s) || chart;
    const term = s.startsWith('^') || s.includes('=') ? (q?.name || label(s)) : s;
    const { news = [] } = await search(term).catch(() => ({}));
    if (s !== symbol) return;
    el.news.innerHTML = news.length ? news.slice(0, 7).map((n) => `
      <li><a href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>
      <small>${esc(n.publisher)} · ${ago(n.time)}</small></li>`).join('') : '<li class="lt-empty">No recent headlines.</li>';
  }

  function ago(ts) {
    const m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60));
    if (m < 60) return `${m}m ago`;
    if (m < 1440) return `${Math.round(m / 60)}h ago`;
    return `${Math.round(m / 1440)}d ago`;
  }

  function select(s) {
    if (!s) return;
    symbol = s;
    watch([s]);
    blip?.(700, 0.05);
    renderLists();
    renderHeader();
    loadChart();
    loadNews();
  }

  // ------------------------------------------------ events
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) {
      if (!e.target.closest('.lt-search')) el.results.hidden = true;
      return;
    }
    if (b.classList.contains('lt-close')) return onClose();
    if (b.dataset.s) { el.results.hidden = true; el.input.value = ''; return select(b.dataset.s); }
    if (b.dataset.r) { range = b.dataset.r; renderRanges(); return loadChart(); }
    if (b.dataset.k) { kind = b.dataset.k; renderRanges(); return drawChart(); }
    if (b === el.star) {
      myList = myList.includes(symbol) ? myList.filter((x) => x !== symbol) : [...myList, symbol].slice(-20);
      saveList(myList);
      renderLists();
      renderHeader();
    }
  });

  let searchTimer;
  el.input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = el.input.value.trim();
    if (!q) { el.results.hidden = true; return; }
    searchTimer = setTimeout(async () => {
      const { quotes: qs = [] } = await search(q).catch(() => ({}));
      if (el.input.value.trim() !== q) return;
      const direct = /^[A-Za-z.^=\-]{1,10}$/.test(q) && !qs.some((x) => x.symbol === q.toUpperCase()) ? [{ symbol: q.toUpperCase(), name: 'Open ticker', exchange: '', type: '' }] : [];
      const all = [...qs, ...direct];
      el.results.innerHTML = all.length ? all.map((x) => `<button data-s="${esc(x.symbol)}"><b>${esc(x.symbol)}</b><span>${esc(x.name)}</span><small>${esc([x.exchange, x.type].filter(Boolean).join(' · '))}</small></button>`).join('') : '<p>No matches</p>';
      el.results.hidden = false;
    }, 220);
  });
  el.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = el.results.querySelector('button');
      select(first ? first.dataset.s : el.input.value.trim().toUpperCase());
      el.input.value = '';
      el.results.hidden = true;
      el.input.blur();
    }
    if (e.key === 'Escape') { el.input.value = ''; el.results.hidden = true; el.input.blur(); e.stopPropagation(); }
  });

  el.canvas.addEventListener('pointermove', (e) => {
    const r = el.canvas.getBoundingClientRect();
    hover = { x: e.clientX - r.left, y: e.clientY - r.top };
    drawChart();
  });
  el.canvas.addEventListener('pointerleave', () => { hover = null; drawChart(); });
  new ResizeObserver(() => open && drawChart()).observe(el.canvas.parentElement);

  onQuotes(() => {
    if (!open) return;
    renderTape();
    renderLists();
    renderHeader();
  });

  function tickClock() {
    el.ny.textContent = `NY ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  }

  return {
    get isOpen() { return open; },
    open({ firm: f, symbol: s, who }) {
      firm = f || FIRMS[0];
      open = true;
      root.style.setProperty('--firm', firm.color);
      el.firmName.textContent = firm.name;
      el.desk.textContent = firm.desk;
      el.user.innerHTML = who ? `<b>${esc(who.name)}</b> · ${esc(who.role)}` : '<b>Guest</b> · Visitor';
      watch([...INDICES, ...firm.symbols, ...myList]);
      range = '1d';
      renderRanges();
      renderTape();
      select(s || firm.symbols[0]);
      refresh();
      tickClock();
      clearInterval(clockTimer);
      clockTimer = setInterval(tickClock, 1000);
      clearInterval(chartTimer);
      chartTimer = setInterval(() => { if (!document.hidden && range === '1d') loadChart(true); }, 30000);
    },
    close() {
      open = false;
      clearInterval(chartTimer);
      clearInterval(clockTimer);
      el.results.hidden = true;
    },
    onKey(e) {
      if (!open) return false;
      if (e.key === '/' && document.activeElement !== el.input) { e.preventDefault(); el.input.focus(); return true; }
      if (e.target === el.input) return true;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const all = [...firm.symbols, ...myList];
        const i = all.indexOf(symbol);
        select(all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]);
        e.preventDefault();
        return true;
      }
      return false;
    },
  };
}
