// "Axiom Sim": an Axiom-style memecoin terminal running on live pools with a fake SOL wallet.
// Views: Pulse (new / final stretch / migrated), token trading page, Dex Scanner, Positions, Learn.
import { quotes, watch, quoteNow, getChart, storeQuotes, onQuotes, fmtPrice, fmtPct, fmtVol, fmtUsd, fmtQty, tone } from '../market.js';
import { drawChart } from '../chart.js';
import { label, axiomUrl, dexscreenerUrl, dexParts } from '../data.js';
import { scan, cachedScan } from './scan.js';
import { sim, quoteBuy, quoteSell, START_SOL, PLATFORM_FEE, LESSONS } from './sim.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (a) => (a && a.length > 12 ? `${a.slice(0, 5)}…${a.slice(-4)}` : a || '');
const ADDRESS_RE = /^(0x[a-fA-F0-9]{40}([a-fA-F0-9]{24})?|[1-9A-HJ-NP-Za-km-z]{32,48})$/;
const COLS = [['fresh', 'New pairs', 'Just launched. Highest risk.'], ['stretch', 'Final stretch', 'On the bonding curve, filling up.'], ['migrated', 'Migrated', 'Graduated to a full DEX pool.']];
const FRAMES = [['1d', '15m'], ['5d', '1h'], ['1mo', '4h']];

function age(t) {
  if (!t) return '—';
  const m = Math.max(0, (Date.now() / 1000 - t) / 60);
  return m < 60 ? `${Math.round(m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
}
const sol = (v, d = 3) => `◎${(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;

export function createAxiom(root, { openStock }) {
  root.innerHTML = `
    <div class="ax">
      <nav class="ax-nav">
        <b class="ax-logo">AXIOM<span>SIM</span></b>
        <button data-v="pulse" class="on">⚡ Pulse</button>
        <button data-v="scanner">⌖ Dex Scanner</button>
        <button data-v="positions">◧ Positions</button>
        <button data-v="learn">✎ Learn</button>
        <div class="ax-chain"><button data-chain="solana" class="on">SOL</button><button data-chain="robinhood">HOOD</button></div>
        <span class="ax-fake" title="Everything here uses fake money">FAKE MONEY</span>
        <div class="ax-wallet"></div>
      </nav>
      <section class="ax-view" data-view="pulse"></section>
      <section class="ax-view" data-view="token" hidden></section>
      <section class="ax-view" data-view="scanner" hidden></section>
      <section class="ax-view" data-view="positions" hidden></section>
      <section class="ax-view" data-view="learn" hidden></section>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const views = Object.fromEntries([...root.querySelectorAll('.ax-view')].map((v) => [v.dataset.view, v]));

  let view = 'pulse', chain = 'solana', pulse = null, pulseAt = 0, pulseTimer = null;
  let token = null, frame = '1d', chart = null, hover = null, side = 'buy', amount = '', lastReport = null;
  let active = false;

  const solPrice = () => quotes.get('SOL-USD')?.price ?? null;
  watch(['SOL-USD']);

  // ------------------------------------------------ wallet pill
  function renderWallet() {
    const w = sim.wallet, sp = solPrice();
    let posValue = 0;
    for (const [s, p] of Object.entries(w.positions)) {
      const q = quotes.get(s);
      if (q?.price && sp) posValue += quoteSell({ tokens: p.tokens, price: q.price, liquidity: q.liquidity }).usdOut / sp;
      else posValue += p.costSol;
    }
    const total = w.sol + posValue, pnl = total - START_SOL;
    $('.ax-wallet').innerHTML = `<span>${sol(w.sol)}</span><small>${sp ? fmtUsd(w.sol * sp) : ''}</small><em style="color:${tone(pnl)}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(3)} SOL</em>`;
    return { total, posValue, pnl };
  }

  // ------------------------------------------------ navigation
  function show(v, arg) {
    view = v;
    root.querySelectorAll('.ax-nav [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === v || (v === 'token' && b.dataset.v === 'pulse')));
    Object.entries(views).forEach(([k, el]) => (el.hidden = k !== v));
    clearInterval(pulseTimer);
    if (v === 'pulse') { loadPulse(); pulseTimer = setInterval(() => active && view === 'pulse' && loadPulse(true), 30000); }
    if (v === 'token') openToken(arg);
    if (v === 'scanner') renderScanner(arg);
    if (v === 'positions') renderPositions();
    if (v === 'learn') renderLearn();
  }

  // ------------------------------------------------ Pulse
  async function loadPulse(silent) {
    if (!silent || !pulse) {
      views.pulse.innerHTML = `<div class="ax-cols">${COLS.map(([, t, d]) => `<div class="ax-col"><header><b>${t}</b><small>${d}</small></header><p class="ax-empty">Loading live pairs…</p></div>`).join('')}</div>`;
    }
    if (pulse && pulse.chain === chain && Date.now() - pulseAt < 25000) return renderPulse();
    try {
      const r = await fetch(`/api/dex?op=pulse&chain=${chain}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      pulse = d;
      pulseAt = Date.now();
      storeQuotes([...d.fresh, ...d.stretch, ...d.migrated]);
      renderPulse();
    } catch {
      views.pulse.querySelectorAll('.ax-empty').forEach((p) => (p.textContent = 'Live pairs are busy (free API limits). Retrying shortly…'));
      setTimeout(() => active && view === 'pulse' && loadPulse(true), 8000);
    }
  }

  function card(q) {
    const held = sim.position(q.symbol);
    return `<div class="ax-card${held ? ' held' : ''}" data-open="${esc(q.symbol)}">
      <div class="ax-card-top"><b>${esc(q.ticker)}</b><span>${esc(q.name?.split(' / ')[0] || '')}</span><em>${age(q.createdAt)}</em></div>
      <div class="ax-card-mid">
        <span>MC <b>$${fmtVol(q.marketCap)}</b></span><span>L <b>$${fmtVol(q.liquidity)}</b></span><span>V <b>$${fmtVol(q.volume)}</b></span>
      </div>
      <div class="ax-card-bot">
        <span style="color:${tone(q.change1h)}">1h ${fmtPct(q.change1h)}</span>
        <span style="color:${tone(q.changePct)}">24h ${fmtPct(q.changePct)}</span>
        ${q.buys != null ? `<span class="dim">${q.buys ? fmtVol(q.buys) : 0}B/${q.sells ? fmtVol(q.sells) : 0}S</span>` : ''}
        <button class="ax-quick" data-quick="${esc(q.symbol)}" title="Quick buy ${sim.wallet.settings.buyPresets[0]} SOL">⚡ ${sim.wallet.settings.buyPresets[0]}</button>
      </div>
    </div>`;
  }

  function renderPulse() {
    if (!pulse) return;
    views.pulse.innerHTML = `<div class="ax-cols">${COLS.map(([k, t, d]) => `
      <div class="ax-col"><header><b>${t}</b><small>${d}</small></header>
        ${pulse[k]?.length ? pulse[k].map(card).join('') : '<p class="ax-empty">Nothing here right now.</p>'}
      </div>`).join('')}</div>`;
  }

  // ------------------------------------------------ token page
  async function openToken(symbol) {
    if (!symbol) return show('pulse');
    token = symbol;
    amount = '';
    chart = null;
    watch([symbol]);
    renderToken();
    loadChart();
    quoteNow(symbol).then(() => token === symbol && renderToken(true));
    scan({ symbol }).then((r) => { if (token === symbol) { lastReport = r; renderToken(true); } }).catch(() => {});
  }

  async function loadChart(retry = 0) {
    const s = token, f = frame;
    try {
      const d = await getChart(s, f);
      if (s !== token || f !== frame) return;
      chart = d;
      const msg = views.token.querySelector('.ax-chart .lt-msg');
      if (msg) msg.textContent = d.points.length ? '' : 'No candles yet for this pool.';
      redraw();
    } catch {
      if (s !== token) return;
      const msg = views.token.querySelector('.ax-chart .lt-msg');
      if (retry < 4) {
        if (msg) msg.textContent = 'Candles are busy on the free API, retrying…';
        setTimeout(() => token === s && active && loadChart(retry + 1), 4000 + retry * 3000);
      } else if (msg) msg.textContent = 'Candles unavailable right now. Trading still works.';
    }
  }

  const redraw = () => {
    const cv = views.token.querySelector('.ax-chart canvas');
    if (cv) drawChart(cv, views.token.querySelector('.ax-chart .lt-tip'), { chart, symbol: token, range: frame, kind: 'candle', hover });
  };

  function renderToken(partial) {
    const q = quotes.get(token) || {};
    const { network, pool } = dexParts(token);
    const pos = sim.position(token);
    const sp = solPrice();
    const report = lastReport?.token?.symbol === token ? lastReport : cachedScan(token);

    const statsHtml = `
      <div class="ax-stat"><span>Price</span><b>$${fmtPrice(q.price)}</b></div>
      <div class="ax-stat"><span>Mkt cap</span><b>$${fmtVol(q.marketCap)}</b></div>
      <div class="ax-stat"><span>Liquidity</span><b>$${fmtVol(q.liquidity)}</b></div>
      <div class="ax-stat"><span>24h vol</span><b>$${fmtVol(q.volume)}</b></div>
      <div class="ax-stat"><span>5m</span><b style="color:${tone(q.change5m)}">${fmtPct(q.change5m)}</b></div>
      <div class="ax-stat"><span>1h</span><b style="color:${tone(q.change1h)}">${fmtPct(q.change1h)}</b></div>
      <div class="ax-stat"><span>24h</span><b style="color:${tone(q.changePct)}">${fmtPct(q.changePct)}</b></div>
      <div class="ax-stat"><span>Age</span><b>${age(q.createdAt)}</b></div>`;

    let posHtml = '<p class="ax-empty">No position yet. Buy with the panel on the right. It’s all fake SOL.</p>';
    if (pos) {
      const exit = q.price && sp ? quoteSell({ tokens: pos.tokens, price: q.price, liquidity: q.liquidity }) : null;
      const valueSol = exit ? exit.usdOut / sp : pos.costSol;
      const pnl = valueSol - pos.costSol;
      posHtml = `<div class="ax-pos">
        <div><span>Holding</span><b>${fmtQty(pos.tokens)} ${esc(pos.ticker)}</b></div>
        <div><span>Cost</span><b>${sol(pos.costSol)}</b></div>
        <div><span>Value if sold now</span><b>${sol(valueSol)}</b></div>
        <div><span>P&amp;L</span><b style="color:${tone(pnl)}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(4)} SOL (${fmtPct((pnl / pos.costSol) * 100)})</b></div>
      </div>`;
    }
    const mine = sim.wallet.history.filter((t) => t.symbol === token).slice(0, 6);
    const tradesHtml = mine.length ? `<table class="ax-table"><tbody>${mine.map((t) => `<tr><td>${new Date(t.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td class="${t.side === 'BUY' ? 'up' : 'down'}">${t.side}</td><td>${fmtQty(t.tokens)}</td><td>$${fmtPrice(t.price)}</td><td>${sol(t.sol)}</td><td>impact ${t.impact.toFixed(2)}%</td></tr>`).join('')}</tbody></table>` : '';

    const scanHtml = report ? `
      <div class="ax-scan-mini ${riskClass(report.score)}">
        <div class="ax-dial" style="--p:${report.score}"><b>${report.score}</b></div>
        <div><b>${esc(report.level)}</b><small>Dex Scanner</small></div>
        <button class="ax-link" data-v="scanner" data-scan="${esc(token)}">Full report →</button>
      </div>
      <ul class="ax-flags">${report.checks.filter((c) => c.status === 'bad' || c.status === 'warn').slice(0, 4).map((c) => `<li class="${c.status}">${c.status === 'bad' ? '✗' : '⚠'} ${esc(c.title)}: ${esc(c.detail)}</li>`).join('') || '<li class="ok">✓ No major red flags found (memecoins are still risky)</li>'}</ul>`
      : '<p class="ax-empty">Scanning token…</p>';

    if (partial && views.token.querySelector('.ax-token')) {
      views.token.querySelector('.ax-stats').innerHTML = statsHtml;
      views.token.querySelector('.ax-position').innerHTML = posHtml;
      views.token.querySelector('.ax-mytrades').innerHTML = tradesHtml;
      views.token.querySelector('.ax-scanbox').innerHTML = scanHtml;
      views.token.querySelector('.ax-tt-name').textContent = q.name || '';
      views.token.querySelector('.ax-tt-sym').textContent = q.ticker || label(token);
      renderPreview();
      return;
    }

    views.token.innerHTML = `
      <div class="ax-token">
        <div class="ax-token-main">
          <header class="ax-token-head">
            <button class="ax-back" data-v="pulse">←</button>
            <div><b class="ax-tt-sym">${esc(q.ticker || label(token))}</b> <span class="ax-tt-name">${esc(q.name || '')}</span>
              <div class="ax-meta"><i class="lt-chain ${esc(network)}">${esc(network)}</i> ${esc(q.dex || '')}
                ${q.token ? `<button class="ax-copy" data-copy="${esc(q.token)}">CA ${esc(short(q.token))} ⧉</button>` : ''}
                <a href="${esc(dexscreenerUrl(network, pool))}" target="_blank" rel="noopener noreferrer">DexScreener ↗</a>
                ${network === 'solana' ? `<a href="${esc(axiomUrl(pool))}" target="_blank" rel="noopener noreferrer">Real Axiom ↗</a>` : ''}
              </div>
            </div>
          </header>
          <div class="ax-stats">${statsHtml}</div>
          <div class="ax-frames">${FRAMES.map(([r, t]) => `<button data-frame="${r}" class="${r === frame ? 'on' : ''}">${t}</button>`).join('')}<span class="dim">candles · live pool data</span></div>
          <div class="ax-chart lt-chart"><canvas></canvas><div class="lt-tip" hidden></div><div class="lt-msg">Loading candles…</div></div>
          <h5>Your position</h5>
          <div class="ax-position">${posHtml}</div>
          <div class="ax-mytrades">${tradesHtml}</div>
        </div>
        <aside class="ax-trade">
          <div class="ax-side"><button data-side="buy" class="${side === 'buy' ? 'on' : ''}">Buy</button><button data-side="sell" class="${side === 'sell' ? 'on' : ''}">Sell</button></div>
          <div class="ax-presets"></div>
          <label class="ax-amount"><span></span><input inputmode="decimal" placeholder="0.0" value="${esc(amount)}"></label>
          <div class="ax-settings">
            <label>Slippage <select data-set="slippage">${[5, 10, 15, 25, 50].map((v) => `<option ${v === sim.wallet.settings.slippage ? 'selected' : ''} value="${v}">${v}%</option>`).join('')}</select></label>
            <label>Priority <select data-set="priority">${[0.0005, 0.001, 0.005].map((v) => `<option ${v === sim.wallet.settings.priority ? 'selected' : ''} value="${v}">◎${v}</option>`).join('')}</select></label>
          </div>
          <div class="ax-preview"></div>
          <button class="ax-go"></button>
          <p class="ax-msg" role="status"></p>
          <div class="ax-scanbox">${scanHtml}</div>
        </aside>
      </div>`;
    const canvas = views.token.querySelector('.ax-chart canvas');
    canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); hover = { x: e.clientX - r.left, y: e.clientY - r.top }; redraw(); });
    canvas.addEventListener('pointerleave', () => { hover = null; redraw(); });
    views.token.querySelector('.ax-amount input').addEventListener('input', (e) => { amount = e.target.value; renderPreview(); });
    renderPreview();
    redraw();
  }

  function renderPreview() {
    const box = views.token.querySelector('.ax-trade');
    if (!box) return;
    const q = quotes.get(token) || {};
    const sp = solPrice();
    const pos = sim.position(token);
    const w = sim.wallet;
    box.querySelectorAll('[data-side]').forEach((b) => b.classList.toggle('on', b.dataset.side === side));
    box.querySelector('.ax-presets').innerHTML = side === 'buy'
      ? w.settings.buyPresets.map((v) => `<button data-preset="${v}">◎${v}</button>`).join('')
      : w.settings.sellPresets.map((v) => `<button data-preset="${v}">${v}%</button>`).join('');
    box.querySelector('.ax-amount span').textContent = side === 'buy' ? 'SOL' : '%';
    const n = parseFloat(amount);
    const go = box.querySelector('.ax-go');
    go.className = `ax-go ${side}`;
    let rows = '';
    if (side === 'buy') {
      go.textContent = n > 0 ? `Buy ◎${n} of ${q.ticker || ''}` : `Buy ${q.ticker || ''}`;
      if (n > 0 && q.price && sp) {
        const p = quoteBuy({ usdIn: n * sp, price: q.price, liquidity: q.liquidity });
        const over = p.impact > w.settings.slippage;
        rows = `
          <div><span>You pay</span><b>${sol(n)} <small>${fmtUsd(n * sp)}</small></b></div>
          <div><span>You get ≈</span><b>${fmtQty(p.tokens)} ${esc(q.ticker)}</b></div>
          <div><span>Avg price</span><b>$${fmtPrice(p.avgPrice)}</b></div>
          <div class="${over ? 'bad' : p.impact > 5 ? 'warn' : ''}"><span>Price impact</span><b>${p.impact.toFixed(2)}%${over ? ' · above slippage, will fail' : ''}</b></div>
          <div><span>Fees</span><b>${fmtUsd(p.feeUsd)} (${PLATFORM_FEE * 100}%) + ◎${w.settings.priority}</b></div>`;
      }
      rows += `<div class="dim"><span>Wallet</span><b>${sol(w.sol)}</b></div>`;
    } else {
      go.textContent = pos ? `Sell ${n > 0 ? `${Math.min(100, n)}%` : ''} ${pos.ticker}` : 'Nothing to sell';
      if (pos && n > 0 && q.price && sp) {
        const p = quoteSell({ tokens: pos.tokens * Math.min(100, n) / 100, price: q.price, liquidity: q.liquidity });
        rows = `
          <div><span>You sell</span><b>${fmtQty(pos.tokens * Math.min(100, n) / 100)} ${esc(pos.ticker)}</b></div>
          <div><span>You get ≈</span><b>${sol(p.usdOut / sp - w.settings.priority)} <small>${fmtUsd(p.usdOut)}</small></b></div>
          <div class="${p.impact > w.settings.slippage ? 'bad' : p.impact > 5 ? 'warn' : ''}"><span>Price impact</span><b>${p.impact.toFixed(2)}%</b></div>
          <div><span>Fees</span><b>${fmtUsd(p.feeUsd)} + ◎${w.settings.priority}</b></div>`;
      }
      if (pos) rows += `<div class="dim"><span>Holding</span><b>${fmtQty(pos.tokens)} ${esc(pos.ticker)}</b></div>`;
    }
    box.querySelector('.ax-preview').innerHTML = rows;
    go.disabled = side === 'sell' && !pos;
  }

  async function trade(symbol, s, n) {
    const msg = views.token.querySelector('.ax-msg');
    const say = (text, cls) => { if (msg && token === symbol) { msg.textContent = text; msg.className = `ax-msg ${cls || ''}`; } };
    say('Sending order…');
    try {
      const [q, solq] = await Promise.all([quoteNow(symbol), quoteNow('SOL-USD')]);
      const report = cachedScan(symbol);
      const t = s === 'buy'
        ? sim.buy({ symbol, sol: n, quote: q, solPrice: solq?.price, scan: report })
        : sim.sell({ symbol, pct: n, quote: q, solPrice: solq?.price });
      watch([symbol]);
      say(s === 'buy'
        ? `Bought ${fmtQty(t.tokens)} ${t.ticker} for ◎${n} · impact ${t.impact.toFixed(2)}%`
        : `Sold ${fmtQty(t.tokens)} ${t.ticker} for ${sol(t.sol)} · P&L ${t.pnlSol >= 0 ? '+' : ''}${t.pnlSol.toFixed(4)} SOL`, 'ok');
      const tip = sim.wallet.coach[0];
      if (tip && Date.now() - tip.t < 2000) toast(tip);
      return t;
    } catch (e) {
      say(e.message, 'err');
      const tip = sim.wallet.coach[0];
      if (tip && Date.now() - tip.t < 2000) toast(tip);
      throw e;
    } finally {
      if (token === symbol && view === 'token') renderToken(true);
    }
  }

  function toast(tip) {
    let el = root.querySelector('.ax-coach-toast');
    if (!el) { el = document.createElement('div'); el.className = 'ax-coach-toast'; root.querySelector('.ax').appendChild(el); }
    el.className = `ax-coach-toast ${tip.tone}`;
    el.innerHTML = `<b>Coach</b><p>${esc(tip.text)}</p><button data-v="learn">See all tips</button>`;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.hidden = true), 9000);
  }

  // ------------------------------------------------ Dex Scanner
  const riskClass = (s) => (s < 25 ? 'low' : s < 45 ? 'med' : s < 65 ? 'high' : 'extreme');

  function renderScanner(target) {
    const suggestions = (pulse?.migrated || []).concat(pulse?.fresh || []).slice(0, 6);
    views.scanner.innerHTML = `
      <div class="ax-scanner">
        <form class="ax-scanform">
          <div class="ax-scanglass"><i></i><input placeholder="Paste a contract address (Solana, Robinhood, Base…) or a ticker" autocomplete="off" spellcheck="false"></div>
          <button class="ax-scanbtn">SCAN</button>
        </form>
        <div class="ax-chips">${suggestions.length ? '<span class="dim">Try:</span>' : ''}${suggestions.map((q) => `<button data-scan="${esc(q.symbol)}">${esc(q.ticker)}</button>`).join('')}</div>
        <div class="ax-report"><div class="ax-intro">
          <h3>Scan before you buy</h3>
          <p>The Dex Scanner checks liquidity, pool age, holder concentration, mint &amp; freeze authority, honeypot flags, buy/sell flow, pumps and socials, then explains each result. Paste any contract address to start.</p>
        </div></div>
      </div>`;
    if (!pulse) loadPulseQuiet();
    if (target) runScan(target);
  }

  async function loadPulseQuiet() {
    try {
      const d = await (await fetch(`/api/dex?op=pulse&chain=${chain}`)).json();
      if (d.migrated) { pulse = d; pulseAt = Date.now(); storeQuotes([...d.fresh, ...d.stretch, ...d.migrated]); if (view === 'scanner' && !views.scanner.querySelector('.ax-result, .ax-scanning')) renderScanner(); }
    } catch { /* suggestions are optional */ }
  }

  const STEPS = ['Finding the pool', 'Reading liquidity & volume', 'Checking top holders', 'Checking mint & freeze authority', 'Looking for honeypot flags', 'Scoring risk'];

  async function runScan(target) {
    const box = views.scanner.querySelector('.ax-report');
    box.innerHTML = `<div class="ax-scanning"><div class="ax-laser"></div><ol>${STEPS.map((s) => `<li>${s}</li>`).join('')}</ol></div>`;
    const items = [...box.querySelectorAll('li')];
    let i = 0;
    const ticker = setInterval(() => { items[i]?.classList.add('done'); i++; }, 320);
    const started = Date.now();
    try {
      const isSymbol = target.startsWith('dex:');
      const report = await scan(isSymbol ? { symbol: target } : { q: target });
      await new Promise((r) => setTimeout(r, Math.max(0, 2000 - (Date.now() - started))));
      clearInterval(ticker);
      lastReport = report;
      storeQuotes([report.token]);
      renderReport(report);
    } catch (e) {
      clearInterval(ticker);
      box.innerHTML = `<p class="ax-empty err">${esc(e.message || 'Scan failed')}. Check the address, or try again in a moment (free APIs rate-limit bursts).</p>`;
    }
  }

  function renderReport(r) {
    const t = r.token, s = t.safety || {};
    const { network, pool } = dexParts(t.symbol);
    const icon = { ok: '✓', warn: '⚠', bad: '✗', unknown: '?' };
    views.scanner.querySelector('.ax-report').innerHTML = `
      <div class="ax-result">
        <header class="ax-rhead ${riskClass(r.score)}">
          <div class="ax-dial big" style="--p:${r.score}"><b>${r.score}</b><small>risk</small></div>
          <div>
            <h3>${esc(t.ticker)} <span>${esc(t.name)}</span></h3>
            <p class="ax-level">${esc(r.level)}</p>
            <div class="ax-meta"><i class="lt-chain ${esc(network)}">${esc(network)}</i> ${esc(t.dex)} · age ${age(t.createdAt)} · $${fmtPrice(t.price)}
              ${t.token ? `<button class="ax-copy" data-copy="${esc(t.token)}">CA ${esc(short(t.token))} ⧉</button>` : ''}</div>
          </div>
          <div class="ax-ractions">
            <button class="ax-go buy" data-open="${esc(t.symbol)}">Trade in sim →</button>
            ${network === 'solana' ? `<a href="${esc(axiomUrl(pool))}" target="_blank" rel="noopener noreferrer">Real Axiom ↗</a>` : ''}
            <a href="${esc(t.url || dexscreenerUrl(network, pool))}" target="_blank" rel="noopener noreferrer">DexScreener ↗</a>
          </div>
        </header>
        <div class="ax-rgrid">
          <ul class="ax-checks">${r.checks.map((c) => `
            <li class="${c.status}"><details><summary><i>${icon[c.status]}</i><b>${esc(c.title)}</b><span>${esc(c.detail)}</span></summary><p>${esc(c.lesson)}</p></details></li>`).join('')}
          </ul>
          <div class="ax-rside">
            <div class="ax-kv">
              <div><span>Market cap</span><b>$${fmtVol(t.marketCap)}</b></div>
              <div><span>Liquidity</span><b>$${fmtVol(t.liquidity)}</b></div>
              <div><span>24h volume</span><b>$${fmtVol(t.volume)}</b></div>
              <div><span>Holders</span><b>${s.holders != null ? fmtVol(s.holders) : '—'}</b></div>
              <div><span>5m / 1h / 24h</span><b><em style="color:${tone(t.priceChangeAll?.m5)}">${fmtPct(t.priceChangeAll?.m5)}</em> <em style="color:${tone(t.priceChangeAll?.h1)}">${fmtPct(t.priceChangeAll?.h1)}</em> <em style="color:${tone(t.priceChangeAll?.h24)}">${fmtPct(t.priceChangeAll?.h24)}</em></b></div>
              <div><span>Txns 5m / 1h / 24h</span><b>${['m5', 'h1', 'h24'].map((k) => `${t.txns?.[k]?.buys ?? 0}/${t.txns?.[k]?.sells ?? 0}`).join(' · ')}</b></div>
            </div>
            ${s.description ? `<p class="ax-desc">${esc(s.description)}</p>` : ''}
            <div class="ax-socials">${[...(t.websites || []).map((u) => ['web', u]), ...(t.socials || []).map((x) => [x.type, x.url])].map(([k, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(k)} ↗</a>`).join('')}</div>
            <p class="ax-disclaimer">Scores are a teaching aid built from public data. A low score does not make a memecoin safe.</p>
          </div>
        </div>
      </div>`;
  }

  // ------------------------------------------------ positions
  function renderPositions() {
    const w = sim.wallet, sp = solPrice();
    const { total, posValue, pnl } = renderWallet();
    const st = sim.stats();
    const rows = Object.entries(w.positions).map(([s, p]) => {
      const q = quotes.get(s);
      const exit = q?.price && sp ? quoteSell({ tokens: p.tokens, price: q.price, liquidity: q.liquidity }).usdOut / sp : null;
      const pl = exit != null ? exit - p.costSol : null;
      return `<tr>
        <td><button class="ax-link" data-open="${esc(s)}"><b>${esc(p.ticker)}</b></button> <i class="lt-chain ${esc(p.network)}">${esc(p.network)}</i></td>
        <td>${fmtQty(p.tokens)}</td><td>${sol(p.costSol)}</td><td>${exit != null ? sol(exit) : '…'}</td>
        <td style="color:${tone(pl)}">${pl != null ? `${pl >= 0 ? '+' : ''}${pl.toFixed(4)} (${fmtPct((pl / p.costSol) * 100)})` : '…'}</td>
        <td><button class="ax-mini" data-sell="${esc(s)}" data-pct="50">50%</button><button class="ax-mini" data-sell="${esc(s)}" data-pct="100">All</button></td></tr>`;
    }).join('');
    const hist = w.history.slice(0, 25).map((t) => `<tr><td>${new Date(t.t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
      <td class="${t.side === 'BUY' ? 'up' : 'down'}">${t.side}</td><td><b>${esc(t.ticker)}</b></td><td>${fmtQty(t.tokens)}</td><td>${sol(t.sol)}</td>
      <td>${t.impact.toFixed(2)}%</td><td style="color:${tone(t.pnlSol)}">${t.pnlSol != null ? `${t.pnlSol >= 0 ? '+' : ''}${t.pnlSol.toFixed(4)}` : ''}</td></tr>`).join('');
    views.positions.innerHTML = `
      <div class="ax-cards">
        <div><span>Total</span><b>${sol(total)}</b><small>${sp ? fmtUsd(total * sp) : ''}</small></div>
        <div><span>P&amp;L vs ◎${START_SOL}</span><b style="color:${tone(pnl)}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(3)}</b><small>${fmtPct((pnl / START_SOL) * 100)}</small></div>
        <div><span>Win rate</span><b>${st.winRate == null ? '—' : `${st.winRate.toFixed(0)}%`}</b><small>${st.closed} closed · ${st.trades} trades</small></div>
        <div><span>Fees paid</span><b>${sol(w.feesSol)}</b><small>slippage lost ${fmtUsd(w.slippageUsd)}</small></div>
      </div>
      <h5>Open positions <small>· value = what you'd get selling now, after impact &amp; fees</small></h5>
      ${rows ? `<table class="ax-table wide"><thead><tr><th>Token</th><th>Amount</th><th>Cost</th><th>Value</th><th>P&amp;L (SOL)</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="ax-empty">No open positions. Head to Pulse, scan something, and try a small buy.</p>'}
      <h5>Trade history</h5>
      ${hist ? `<table class="ax-table wide"><thead><tr><th>Time</th><th>Side</th><th>Token</th><th>Amount</th><th>SOL</th><th>Impact</th><th>P&amp;L</th></tr></thead><tbody>${hist}</tbody></table>` : '<p class="ax-empty">No trades yet.</p>'}
      <p class="ax-foot">Wallet started with ◎${START_SOL} of fake SOL · realised ${w.realizedSol >= 0 ? '+' : ''}${w.realizedSol.toFixed(4)} SOL · positions ${sol(posValue)} · <button class="ax-reset">Reset wallet</button></p>`;
  }

  // ------------------------------------------------ learn
  function renderLearn() {
    const w = sim.wallet;
    views.learn.innerHTML = `
      <div class="ax-learn">
        <div class="ax-lessons">
          <h5>Lessons <small>${Object.keys(w.lessons).length}/${LESSONS.length} read</small></h5>
          ${LESSONS.map((l, i) => `<details class="ax-lesson${w.lessons[l.id] ? ' read' : ''}" data-lesson="${l.id}"><summary><i>${w.lessons[l.id] ? '✓' : i + 1}</i>${esc(l.title)}</summary><p>${esc(l.body)}</p></details>`).join('')}
          <div class="ax-howto"><h5>A safe practice loop</h5><ol>
            <li>Open <b>Pulse</b> and pick a pair.</li><li>Run it through the <b>Dex Scanner</b> and read every red flag.</li>
            <li>Buy a small size (◎0.1–0.5) and note your exit plan.</li><li>Take profit or cut the loss, then read the coach’s notes.</li></ol></div>
        </div>
        <div class="ax-coachlog">
          <h5>Coach notes</h5>
          ${w.coach.length ? w.coach.map((c) => `<div class="ax-note ${c.tone}"><small>${new Date(c.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small><p>${esc(c.text)}</p></div>`).join('') : '<p class="ax-empty">Make a trade and the coach will review it here.</p>'}
        </div>
      </div>`;
    views.learn.querySelectorAll('.ax-lesson').forEach((d) => d.addEventListener('toggle', () => { if (d.open && !w.lessons[d.dataset.lesson]) { sim.markLesson(d.dataset.lesson); d.classList.add('read'); } }));
  }

  // ------------------------------------------------ events
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button, [data-open]');
    if (!b) return;
    if (b.dataset.copy) { try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied ✓'; } catch { b.textContent = b.dataset.copy; } return; }
    if (b.dataset.quick) {
      e.stopPropagation();
      const n = sim.wallet.settings.buyPresets[0];
      b.disabled = true;
      b.textContent = '…';
      token = b.dataset.quick;
      try { await trade(b.dataset.quick, 'buy', n); b.textContent = '✓'; } catch { b.textContent = '✗'; }
      token = null;
      setTimeout(() => view === 'pulse' && renderPulse(), 1200);
      return;
    }
    if (b.dataset.open) return show('token', b.dataset.open);
    if (b.dataset.scan && b.dataset.v === 'scanner') return show('scanner', b.dataset.scan);
    if (b.dataset.scan) return runScan(b.dataset.scan);
    if (b.dataset.v) return show(b.dataset.v);
    if (b.dataset.chain) {
      chain = b.dataset.chain;
      pulse = null;
      root.querySelectorAll('[data-chain]').forEach((x) => x.classList.toggle('on', x.dataset.chain === chain));
      return show(view === 'token' ? 'pulse' : view);
    }
    if (b.dataset.frame) { frame = b.dataset.frame; chart = null; renderToken(); return loadChart(); }
    if (b.dataset.side) { side = b.dataset.side; amount = ''; views.token.querySelector('.ax-amount input').value = ''; return renderPreview(); }
    if (b.dataset.preset) { amount = b.dataset.preset; views.token.querySelector('.ax-amount input').value = amount; return renderPreview(); }
    if (b.classList.contains('ax-go') && view === 'token') {
      const n = parseFloat(amount);
      if (!(n > 0)) { const m = views.token.querySelector('.ax-msg'); m.textContent = side === 'buy' ? 'Pick an amount of SOL first.' : 'Pick how much to sell.'; m.className = 'ax-msg err'; return; }
      b.disabled = true;
      try { await trade(token, side, n); amount = ''; } catch { /* message shown */ }
      b.disabled = false;
      return;
    }
    if (b.dataset.sell) {
      b.disabled = true;
      token = b.dataset.sell;
      try { await trade(b.dataset.sell, 'sell', Number(b.dataset.pct)); } catch { /* shown in coach */ }
      token = null;
      return renderPositions();
    }
    if (b.classList.contains('ax-reset') && confirm(`Reset the sim wallet to ◎${START_SOL}? Positions, history and coach notes are cleared.`)) { sim.reset(); return renderPositions(); }
  });

  root.addEventListener('change', (e) => {
    if (e.target.dataset.set) { sim.setSetting(e.target.dataset.set, Number(e.target.value)); renderPreview(); }
  });
  root.addEventListener('submit', (e) => {
    if (!e.target.classList.contains('ax-scanform')) return;
    e.preventDefault();
    const v = e.target.querySelector('input').value.trim();
    if (v) runScan(v);
  });
  root.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });

  sim.on(() => { renderWallet(); });
  onQuotes(() => {
    if (!active) return;
    renderWallet();
    if (view === 'token') renderToken(true);
    if (view === 'positions') renderPositions();
  });
  new ResizeObserver(() => active && view === 'token' && redraw()).observe(root);

  return {
    open(v = 'pulse', arg) {
      active = true;
      renderWallet();
      const pos = Object.keys(sim.wallet.positions);
      if (pos.length) watch(pos);
      if (v === 'scanner' && arg && !arg.startsWith('dex:') && !ADDRESS_RE.test(arg)) arg = arg.trim();
      show(v, arg);
    },
    close() { active = false; clearInterval(pulseTimer); },
    scan: (target) => { active = true; show('scanner', target); },
  };
}
