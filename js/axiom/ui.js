// "Axiom Sim": an Axiom-style memecoin terminal running on live pools with fake native-coin wallets.
// Views: Pulse (new / final stretch / migrated), token page, Dex Scanner, Positions, Learn.
import { quotes, watch, quoteNow, getChart, storeQuotes, onQuotes, fmtPrice, fmtPct, fmtVol, fmtUsd, fmtQty, tone } from '../market.js';
import { label, axiomUrl, dexscreenerUrl, dexParts } from '../data.js';
import { scan, cachedScan } from './scan.js';
import { sim, quoteBuy, quoteSell, START, PLATFORM_FEE, LESSONS, nativeOf, NATIVE_QUOTE, ICON } from './sim.js';
import { createCandleChart, candlesFromTrades } from './candles.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (a) => (a && a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a || '');
const COLS = [['fresh', 'New pairs', 'Just launched. Highest risk.'], ['stretch', 'Final stretch', 'On the bonding curve, filling up.'], ['migrated', 'Migrated', 'Graduated to a full DEX pool.']];
const TFS = ['1s', '1m', '5m', '15m', '1h', '1D'];

function age(t) {
  if (!t) return '—';
  const s = Math.max(0, Date.now() / 1000 - t);
  return s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
}
const amt = (v, cur, d) => `${ICON[cur]}${(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: d ?? (cur === 'SOL' ? 3 : 4), maximumFractionDigits: d ?? (cur === 'SOL' ? 3 : 4) })}`;
const signed = (v, digits = 4) => `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;

export function createAxiom(root) {
  root.innerHTML = `
    <div class="ax">
      <nav class="ax-nav">
        <b class="ax-logo">AXIOM<span>SIM</span></b>
        <button data-v="pulse" class="on">⚡ Pulse</button>
        <button data-v="scanner">⌖ Dex Scanner</button>
        <button data-v="positions">◧ Portfolio</button>
        <button data-v="learn">✎ Learn</button>
        <div class="ax-chain"><button data-chain="solana" class="on">SOL</button><button data-chain="robinhood">HOOD</button></div>
        <span class="ax-fake" title="Everything here uses fake money">FAKE MONEY</span>
        <div class="ax-wallet"></div>
        <button class="ax-connect wallet-btn" data-wallet-button><i>⬡</i><span>Connect wallet</span></button>
      </nav>
      <section class="ax-view" data-view="pulse"></section>
      <section class="ax-view ax-view-token" data-view="token" hidden></section>
      <section class="ax-view" data-view="scanner" hidden></section>
      <section class="ax-view" data-view="positions" hidden></section>
      <section class="ax-view" data-view="learn" hidden></section>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const views = Object.fromEntries([...root.querySelectorAll('.ax-view')].map((v) => [v.dataset.view, v]));

  let view = 'pulse', chain = 'solana', pulse = null, pulseAt = 0, pulseTimer = null;
  let token = null, tf = '1m', mode = 'price', side = 'buy', amount = '', bottomTab = 'trades', trades = [], lastReport = null;
  let chart = null, liveTimer = null, tradesTimer = null, active = false, loadId = 0;

  const nativePrice = (cur) => quotes.get(NATIVE_QUOTE[cur])?.price ?? null;
  watch(Object.values(NATIVE_QUOTE));

  // ------------------------------------------------ wallet pill
  function walletValue() {
    const w = sim.wallet;
    let usd = 0, startUsd = 0;
    for (const cur of Object.keys(START)) {
      const p = nativePrice(cur);
      if (!p) continue;
      usd += w.bal[cur] * p;
      startUsd += START[cur] * p;
    }
    for (const [s, pos] of Object.entries(w.positions)) {
      const q = quotes.get(s), p = nativePrice(pos.cur);
      if (!p) continue;
      usd += q?.price ? quoteSell({ tokens: pos.tokens, price: q.price, liquidity: q.liquidity }).usdOut : pos.cost * p;
    }
    return { usd, pnlUsd: startUsd ? usd - startUsd : 0 };
  }
  function renderWallet() {
    const w = sim.wallet, { usd, pnlUsd } = walletValue();
    $('.ax-wallet').innerHTML = `<span>${amt(w.bal.SOL, 'SOL', 2)}</span><span>${amt(w.bal.ETH, 'ETH', 3)}</span><small>${usd ? fmtUsd(usd) : ''}</small><em style="color:${tone(pnlUsd)}">${pnlUsd >= 0 ? '+' : ''}${fmtUsd(pnlUsd)}</em>`;
  }

  // ------------------------------------------------ navigation
  function show(v, arg) {
    if (view === 'token' && v !== 'token') stopLive();
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
    const cur = nativeOf(q.network);
    const quick = sim.presets(cur)[0];
    return `<div class="ax-card${held ? ' held' : ''}" data-open="${esc(q.symbol)}">
      <div class="ax-card-top"><i class="ax-avatar">${esc((q.ticker || '?').slice(0, 1))}</i><b>${esc(q.ticker)}</b><span>${esc(q.name?.split(' / ')[0] || '')}</span><em>${age(q.createdAt)}</em></div>
      <div class="ax-card-mid">
        <span>MC <b>$${fmtVol(q.marketCap)}</b></span><span>L <b>$${fmtVol(q.liquidity)}</b></span><span>V <b>$${fmtVol(q.volume)}</b></span>
      </div>
      <div class="ax-card-bot">
        <span style="color:${tone(q.change1h)}">1h ${fmtPct(q.change1h)}</span>
        <span style="color:${tone(q.changePct)}">24h ${fmtPct(q.changePct)}</span>
        ${q.buys != null ? `<span class="dim">${q.buys ? fmtVol(q.buys) : 0}B/${q.sells ? fmtVol(q.sells) : 0}S</span>` : ''}
        <button class="ax-quick" data-quick="${esc(q.symbol)}" title="Quick buy ${quick} ${cur}">⚡ ${ICON[cur]}${quick}</button>
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
  function stopLive() {
    clearInterval(liveTimer);
    clearInterval(tradesTimer);
    liveTimer = tradesTimer = null;
  }

  function openToken(symbol) {
    if (!symbol) return show('pulse');
    stopLive();
    token = symbol;
    amount = '';
    trades = [];
    lastReport = cachedScan(symbol);
    watch([symbol]);
    buildToken();
    loadCandles();
    loadTrades();
    liveTimer = setInterval(liveTick, 3000);
    tradesTimer = setInterval(() => { loadTrades(); if (tf === '1s') loadCandles(true); }, 6000);
    scan({ symbol }).then((r) => { if (token === symbol) { lastReport = r; refreshToken(); } }).catch(() => {});
    quoteNow(symbol).then(() => token === symbol && refreshToken());
  }

  function buildToken() {
    const { network } = dexParts(token);
    views.token.innerHTML = `
      <div class="axt">
        <header class="axt-top"></header>
        <div class="axt-body">
          <div class="axt-left">
            <div class="axt-toolbar">
              <div class="axt-tfs">${TFS.map((x) => `<button data-tf="${x}" class="${x === tf ? 'on' : ''}">${x}</button>`).join('')}</div>
              <div class="axt-mode"><button data-mode="price" class="${mode === 'price' ? 'on' : ''}">Price</button><button data-mode="mcap" class="${mode === 'mcap' ? 'on' : ''}">MarketCap</button></div>
              <span class="axt-live"><i></i>LIVE</span>
              <span class="dim axt-hint">scroll to zoom · drag to pan · <b style="color:#18c78c">B</b>/<b style="color:#f0435b">S</b> = your trades</span>
            </div>
            <div class="axt-chart">
              <div class="axt-canvas"></div>
              <div class="axt-instant">
                <header>Instant trade <small class="dim">fake ${nativeOf(network)}</small></header>
                <div class="axt-irow buy"></div>
                <div class="axt-irow sell"></div>
              </div>
            </div>
            <div class="axt-bottom">
              <nav class="axt-btabs">${[['trades', 'Trades'], ['positions', 'Positions'], ['orders', 'My orders'], ['holders', 'Holders']].map(([k, t]) => `<button data-btab="${k}" class="${k === bottomTab ? 'on' : ''}">${t}</button>`).join('')}</nav>
              <div class="axt-bcontent"></div>
            </div>
          </div>
          <aside class="axt-right"></aside>
        </div>
      </div>`;
    chart = createCandleChart(views.token.querySelector('.axt-canvas'));
    chart.message('Loading candles…');
    refreshToken();
  }

  function refreshToken() {
    if (view !== 'token' || !views.token.querySelector('.axt')) return;
    renderTop();
    renderInstant();
    renderSide();
    renderBottom();
    updateChartOpts();
  }

  function renderTop() {
    const q = quotes.get(token) || {};
    const { network, pool } = dexParts(token);
    const s = lastReport?.token?.safety || {};
    const supply = q.price && q.marketCap ? q.marketCap / q.price : null;
    views.token.querySelector('.axt-top').innerHTML = `
      <button class="ax-back" data-v="pulse" title="Back to Pulse">←</button>
      <i class="ax-avatar big">${esc((q.ticker || '?').slice(0, 1))}</i>
      <div class="axt-id">
        <div><b>${esc(q.ticker || label(token))}</b> <span>${esc(q.name?.split(' / ')[0] || '')}</span></div>
        <div class="ax-meta"><em>${age(q.createdAt)}</em><i class="lt-chain ${esc(network)}">${esc(network)}</i>${esc(q.dex || '')}
          ${q.token ? `<button class="ax-copy" data-copy="${esc(q.token)}">${esc(short(q.token))} ⧉</button>` : ''}
          <a href="${esc(dexscreenerUrl(network, pool))}" target="_blank" rel="noopener noreferrer">DexScreener ↗</a>
          ${network === 'solana' ? `<a href="${esc(axiomUrl(pool))}" target="_blank" rel="noopener noreferrer">Real Axiom ↗</a>` : ''}</div>
      </div>
      <div class="axt-mc"><b>$${fmtVol(q.marketCap)}</b><small style="color:${tone(q.changePct)}">${fmtPct(q.changePct)} 24h</small></div>
      <div class="axt-stats">
        <div><span>Price</span><b>$${fmtPrice(q.price)}</b></div>
        <div><span>Liquidity</span><b>$${fmtVol(q.liquidity)}</b></div>
        <div><span>Supply</span><b>${supply ? fmtVol(supply) : '—'}</b></div>
        <div><span>24h Vol</span><b>$${fmtVol(q.volume)}</b></div>
        <div><span>Holders</span><b>${s.holders != null ? fmtVol(s.holders) : '—'}</b></div>
        <div><span>Top 10</span><b style="color:${s.top10 > 50 ? 'var(--down)' : s.top10 > 30 ? '#ffd166' : 'inherit'}">${s.top10 != null ? `${s.top10.toFixed(1)}%` : '—'}</b></div>
        <div><span>1h</span><b style="color:${tone(q.change1h)}">${fmtPct(q.change1h)}</b></div>
        <div><span>5m</span><b style="color:${tone(q.change5m)}">${fmtPct(q.change5m)}</b></div>
      </div>`;
  }

  function renderInstant() {
    const box = views.token.querySelector('.axt-instant');
    if (!box) return;
    const q = quotes.get(token) || {};
    const cur = nativeOf(q.network || dexParts(token).network);
    const pos = sim.position(token);
    box.querySelector('.buy').innerHTML = `<span>Buy</span>${sim.presets(cur).map((v) => `<button data-instant="buy" data-n="${v}">${v}</button>`).join('')}`;
    box.querySelector('.sell').innerHTML = `<span>Sell</span>${sim.wallet.settings.sellPresets.map((v) => `<button data-instant="sell" data-n="${v}" ${pos ? '' : 'disabled'}>${v}%</button>`).join('')}`;
  }

  function pnlFor(symbol) {
    const st = sim.stats(symbol);
    const pos = sim.position(symbol);
    const q = quotes.get(symbol) || {};
    const cur = pos?.cur || st?.cur || nativeOf(q.network || dexParts(symbol).network);
    const np = nativePrice(cur);
    const holding = pos ? (q.price && np ? quoteSell({ tokens: pos.tokens, price: q.price, liquidity: q.liquidity }).usdOut / np : pos.cost) : 0;
    const bought = st?.bought || 0, sold = st?.sold || 0;
    const pnl = sold + holding - bought;
    return { cur, np, bought, sold, holding, pnl, pct: bought ? (pnl / bought) * 100 : 0, pos };
  }

  function renderSide() {
    const el = views.token.querySelector('.axt-right');
    if (!el) return;
    const q = quotes.get(token) || {};
    const t = lastReport?.token || {};
    const m5v = t.volumeAll?.m5, m5 = t.txns?.m5 || {};
    const cur = nativeOf(q.network || dexParts(token).network);
    const w = sim.wallet;
    const p = pnlFor(token);
    const report = lastReport;
    const sfy = t.safety || {};
    const msgEl = el.querySelector('.ax-msg');
    const keepMsg = msgEl ? [msgEl.textContent, msgEl.className] : null;
    el.innerHTML = `
      <div class="axt-flow">
        <div><span>5m Vol</span><b>$${fmtVol(m5v)}</b></div>
        <div><span>Buys</span><b class="up">${m5.buys ?? '—'}</b></div>
        <div><span>Sells</span><b class="down">${m5.sells ?? '—'}</b></div>
        <div><span>Liq</span><b>$${fmtVol(q.liquidity)}</b></div>
      </div>
      <div class="ax-side"><button data-side="buy" class="${side === 'buy' ? 'on' : ''}">Buy</button><button data-side="sell" class="${side === 'sell' ? 'on' : ''}">Sell</button></div>
      <div class="axt-otype"><button class="on">Market</button><button disabled title="Limit orders aren't simulated yet">Limit</button></div>
      <label class="ax-amount"><span>${side === 'buy' ? 'AMOUNT' : 'SELL'}</span><input inputmode="decimal" placeholder="0.0" value="${esc(amount)}"><em>${side === 'buy' ? `${ICON[cur]} ${cur}` : '% of bag'}</em></label>
      <div class="ax-presets">${side === 'buy' ? sim.presets(cur).map((v) => `<button data-preset="${v}">${v}</button>`).join('') : w.settings.sellPresets.map((v) => `<button data-preset="${v}">${v}%</button>`).join('')}</div>
      <div class="ax-settings">
        <label>Slippage <select data-set="slippage">${[5, 10, 15, 25, 50].map((v) => `<option ${v === w.settings.slippage ? 'selected' : ''} value="${v}">${v}%</option>`).join('')}</select></label>
        <label>Priority <select data-set="priority">${(cur === 'SOL' ? [0.0005, 0.001, 0.005] : cur === 'ETH' ? [0.0001, 0.0002, 0.001] : [0.0002, 0.0005, 0.002]).map((v) => `<option ${v === sim.priority(cur) ? 'selected' : ''} value="${v}">${ICON[cur]}${v}</option>`).join('')}</select></label>
      </div>
      <div class="ax-preview"></div>
      <button class="ax-go ${side}"></button>
      <p class="ax-msg" role="status"></p>
      <div class="axt-pnl">
        <div><span>Bought</span><b>${amt(p.bought, p.cur)}</b></div>
        <div><span>Sold</span><b>${amt(p.sold, p.cur)}</b></div>
        <div><span>Holding</span><b>${amt(p.holding, p.cur)}</b></div>
        <div><span>PnL</span><b style="color:${tone(p.pnl)}">${signed(p.pnl, p.cur === 'SOL' ? 3 : 4)}<small>${fmtPct(p.pct)}</small></b></div>
      </div>
      <p class="axt-pnlusd">${p.bought ? `PnL ≈ <b style="color:${tone(p.pnl)}">${fmtUsd(p.pnl * (p.np || 0))}</b> · wallet ${amt(w.bal[cur], cur)}` : `Wallet ${amt(w.bal[cur], cur)} · fills include ${PLATFORM_FEE * 100}% fee + price impact`}</p>
      <div class="axt-info">
        <h6>Token info ${report ? `<button class="ax-link" data-v="scanner" data-scan="${esc(token)}">Full scan →</button>` : ''}</h6>
        ${report ? `
          <div class="ax-scan-mini ${riskClass(report.score)}"><div class="ax-dial" style="--p:${report.score}"><b>${report.score}</b></div><div><b>${esc(report.level)}</b><small>${esc(sfy.source || 'Dex Scanner')}</small></div></div>
          <div class="axt-infogrid">
            <div><span>Top 10</span><b>${sfy.top10 != null ? `${sfy.top10.toFixed(1)}%` : '—'}</b></div>
            <div><span>Mint</span><b>${sfy.mintAuthority === 'no' ? 'Revoked' : sfy.mintAuthority === 'yes' ? 'Enabled' : '—'}</b></div>
            <div><span>Freeze</span><b>${sfy.freezeAuthority === 'no' ? 'Revoked' : sfy.freezeAuthority === 'yes' ? 'Enabled' : '—'}</b></div>
            <div><span>LP locked</span><b>${sfy.lpLocked != null ? `${sfy.lpLocked.toFixed(0)}%` : '—'}</b></div>
            <div><span>Honeypot</span><b>${sfy.honeypot === 'yes' ? 'Yes' : sfy.honeypot === 'no' ? 'No' : '—'}</b></div>
            <div><span>Insiders</span><b>${sfy.insiders ? 'Detected' : sfy.source === 'RugCheck' ? 'None found' : '—'}</b></div>
          </div>
          <ul class="ax-flags">${report.checks.filter((c) => c.status === 'bad' || c.status === 'warn').slice(0, 3).map((c) => `<li class="${c.status}">${c.status === 'bad' ? '✗' : '⚠'} ${esc(c.title)}: ${esc(c.detail)}</li>`).join('') || '<li class="ok">✓ No major red flags (memecoins are still risky)</li>'}</ul>`
          : '<p class="ax-empty">Scanning token…</p>'}
      </div>`;
    if (keepMsg) { const m = el.querySelector('.ax-msg'); m.textContent = keepMsg[0]; m.className = keepMsg[1]; }
    el.querySelector('.ax-amount input').addEventListener('input', (e) => { amount = e.target.value; renderPreview(); });
    renderPreview();
  }

  function renderPreview() {
    const box = views.token.querySelector('.axt-right');
    if (!box) return;
    const q = quotes.get(token) || {};
    const cur = nativeOf(q.network || dexParts(token).network);
    const np = nativePrice(cur);
    const pos = sim.position(token);
    const n = parseFloat(amount);
    const go = box.querySelector('.ax-go');
    let rows = '';
    if (side === 'buy') {
      go.textContent = `Buy ${q.ticker || ''}`;
      if (n > 0 && q.price && np) {
        const pr = quoteBuy({ usdIn: n * np, price: q.price, liquidity: q.liquidity });
        const over = pr.impact > sim.wallet.settings.slippage;
        rows = `<div><span>You get ≈</span><b>${fmtQty(pr.tokens)} ${esc(q.ticker)}</b></div>
          <div class="${over ? 'bad' : pr.impact > 5 ? 'warn' : ''}"><span>Price impact</span><b>${pr.impact.toFixed(2)}%${over ? ' · will fail' : ''}</b></div>
          <div><span>Fees</span><b>${fmtUsd(pr.feeUsd)} + ${ICON[cur]}${sim.priority(cur)}</b></div>`;
      }
      go.disabled = false;
    } else {
      go.textContent = pos ? `Sell ${pos.ticker}` : 'Nothing to sell';
      if (pos && n > 0 && q.price && np) {
        const pr = quoteSell({ tokens: (pos.tokens * Math.min(100, n)) / 100, price: q.price, liquidity: q.liquidity });
        rows = `<div><span>You get ≈</span><b>${amt(pr.usdOut / np - sim.priority(cur), cur)}</b></div>
          <div class="${pr.impact > sim.wallet.settings.slippage ? 'bad' : pr.impact > 5 ? 'warn' : ''}"><span>Price impact</span><b>${pr.impact.toFixed(2)}%</b></div>`;
      }
      go.disabled = !pos;
    }
    box.querySelector('.ax-preview').innerHTML = rows;
  }

  function renderBottom() {
    const el = views.token.querySelector('.axt-bcontent');
    if (!el) return;
    views.token.querySelectorAll('[data-btab]').forEach((b) => b.classList.toggle('on', b.dataset.btab === bottomTab));
    const q = quotes.get(token) || {};
    const factor = q.price && q.marketCap ? q.marketCap / q.price : null;
    if (bottomTab === 'trades') {
      el.innerHTML = trades.length ? `<table class="ax-table"><thead><tr><th>Age</th><th>Type</th><th>MC</th><th>Amount</th><th>USD</th><th>Trader</th></tr></thead><tbody>${trades.slice(0, 60).map((t) => `
        <tr><td>${age(t.t)}</td><td class="${t.side === 'buy' ? 'up' : 'down'}">${t.side === 'buy' ? 'Buy' : 'Sell'}</td><td>${factor ? `$${fmtVol(t.price * factor)}` : `$${fmtPrice(t.price)}`}</td>
        <td>${fmtVol(t.tokens)}</td><td class="${t.side === 'buy' ? 'up' : 'down'}">$${t.usd >= 1 ? fmtVol(t.usd) : t.usd.toFixed(2)}</td><td class="dim">${esc(short(t.maker))}</td></tr>`).join('')}</tbody></table>`
        : '<p class="ax-empty">Loading live trades…</p>';
    } else if (bottomTab === 'positions') {
      const rows = Object.entries(sim.wallet.positions).map(([s, pos]) => {
        const p = pnlFor(s);
        return `<tr><td><button class="ax-link" data-open="${esc(s)}"><b>${esc(pos.ticker)}</b></button></td><td>${fmtQty(pos.tokens)}</td><td>${amt(p.bought, p.cur)}</td><td>${amt(p.holding, p.cur)}</td>
          <td style="color:${tone(p.pnl)}">${signed(p.pnl)} (${fmtPct(p.pct)})</td><td><button class="ax-mini" data-sell="${esc(s)}" data-pct="50">50%</button><button class="ax-mini" data-sell="${esc(s)}" data-pct="100">All</button></td></tr>`;
      }).join('');
      el.innerHTML = rows ? `<table class="ax-table"><thead><tr><th>Token</th><th>Amount</th><th>Bought</th><th>Holding</th><th>PnL</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="ax-empty">No open positions.</p>';
    } else if (bottomTab === 'orders') {
      const mine = sim.wallet.history.filter((t) => t.symbol === token);
      el.innerHTML = mine.length ? `<table class="ax-table"><thead><tr><th>Time</th><th>Type</th><th>MC</th><th>Amount</th><th>Paid / got</th><th>Impact</th><th>PnL</th></tr></thead><tbody>${mine.map((t) => `
        <tr><td>${new Date(t.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td><td class="${t.side === 'BUY' ? 'up' : 'down'}">${t.side}</td><td>$${fmtVol(t.mc)}</td><td>${fmtQty(t.tokens)}</td>
        <td>${amt(t.amount, t.cur)}</td><td>${t.impact.toFixed(2)}%</td><td style="color:${tone(t.pnl)}">${t.pnl != null ? signed(t.pnl) : ''}</td></tr>`).join('')}</tbody></table>`
        : '<p class="ax-empty">You haven’t traded this token yet.</p>';
    } else {
      const hs = lastReport?.token?.safety?.topHolders || [];
      el.innerHTML = hs.length ? `<table class="ax-table"><thead><tr><th>#</th><th>Wallet</th><th>% of supply</th><th></th></tr></thead><tbody>${hs.map((h, i) => `
        <tr><td>${i + 1}</td><td class="dim">${esc(short(h.address))}</td><td>${h.pct.toFixed(2)}%</td><td>${h.insider ? '<span class="down">insider</span>' : h.locked ? 'locked' : h.contract ? 'contract' : ''}</td></tr>`).join('')}</tbody></table>
        <p class="ax-disclaimer">${esc(lastReport.token.safety.top10Note || '')} · source ${esc(lastReport.token.safety.source)}</p>`
        : `<p class="ax-empty">${lastReport ? 'Holder list isn’t available for this token.' : 'Scanning holders…'}</p>`;
    }
  }

  function updateChartOpts() {
    if (!chart) return;
    const q = quotes.get(token) || {};
    const pos = sim.position(token);
    chart.update({
      label: q.ticker || label(token),
      mode,
      mcapFactor: q.price && q.marketCap ? q.marketCap / q.price : null,
      entry: pos ? avgEntry(token) : null,
      markers: sim.wallet.history.filter((t) => t.symbol === token),
    });
  }

  function avgEntry(symbol) {
    const buys = sim.wallet.history.filter((t) => t.symbol === symbol && t.side === 'BUY');
    const tokens = buys.reduce((a, t) => a + t.tokens, 0);
    return tokens ? buys.reduce((a, t) => a + t.tokens * t.price, 0) / tokens : null;
  }

  async function fetchTrades(symbol) {
    const { network, pool } = dexParts(symbol);
    const r = await fetch(`/api/dex?op=trades&network=${network}&pool=${encodeURIComponent(pool)}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d.trades || [];
  }

  async function loadTrades() {
    const s = token;
    try {
      const list = await fetchTrades(s);
      if (s !== token) return;
      trades = list;
      if (bottomTab === 'trades') renderBottom();
    } catch { /* keep the last list */ }
  }

  async function loadCandles(silent) {
    const s = token, frame = tf, id = ++loadId;
    if (!silent) chart.message('Loading candles…');
    let points = [];
    try {
      if (frame === '1s') points = candlesFromTrades(trades.length ? trades : await fetchTrades(s), '1s');
      else {
        const d = await getChart(s, frame).catch(() => null);
        points = d?.points || [];
        // young pools: build candles straight from their trades
        if (points.length < 8) {
          const fromTrades = candlesFromTrades(trades.length ? trades : await fetchTrades(s).catch(() => []), frame);
          if (fromTrades.length > points.length) points = fromTrades;
        }
      }
    } catch { /* fall through to the empty state */ }
    if (s !== token || id !== loadId) return;
    const q = quotes.get(s) || {};
    if (!points.length && q.price) {
      const now = Math.floor(Date.now() / 1000);
      chart.set([[now, q.price, q.price, q.price, q.price, 0]], { tf: frame });
      chart.message(frame === '1s' ? 'Building 1s candles live from price updates…' : 'No trades yet on this pool. The chart fills in live as trades happen.');
    } else {
      chart.set(points, { tf: frame });
      if (!points.length) chart.message('Candles are busy on the free API. Retrying…');
    }
    updateChartOpts();
    if (!points.length && active) setTimeout(() => token === s && tf === frame && loadCandles(true), 5000);
  }

  async function liveTick() {
    if (!active || view !== 'token' || !token) return;
    const s = token;
    try {
      const r = await fetch(`/api/dex?op=quotes&fresh=1&ids=${encodeURIComponent(s.slice(4))}`);
      const d = await r.json();
      if (s !== token) return;
      storeQuotes(d.quotes || []);
      const q = quotes.get(s);
      if (q?.price) chart.tick(q.price, Math.floor(Date.now() / 1000));
    } catch { /* next tick */ }
  }

  async function trade(symbol, s, n) {
    const onPage = () => view === 'token' && token === symbol;
    const say = (text, cls) => { const m = onPage() && views.token.querySelector('.ax-msg'); if (m) { m.textContent = text; m.className = `ax-msg ${cls || ''}`; } };
    say('Sending order…');
    const [q] = await Promise.all([quoteNow(symbol), ...Object.values(NATIVE_QUOTE).map((x) => quoteNow(x))]);
    const cur = nativeOf(q?.network || dexParts(symbol).network);
    let result, message;
    try {
      result = s === 'buy'
        ? sim.buy({ symbol, amount: n, quote: q, nativePrice: nativePrice(cur), scan: cachedScan(symbol) })
        : sim.sell({ symbol, pct: n, quote: q, nativePrice: nativePrice(cur) });
      watch([symbol]);
      message = [s === 'buy'
        ? `Bought ${fmtQty(result.tokens)} ${result.ticker} for ${amt(n, cur)} · impact ${result.impact.toFixed(2)}%`
        : `Sold ${fmtQty(result.tokens)} ${result.ticker} for ${amt(result.amount, cur)} · PnL ${signed(result.pnl)} ${cur}`, 'ok'];
    } catch (e) {
      message = [e.message, 'err'];
    }
    if (onPage()) { renderSide(); renderInstant(); renderBottom(); updateChartOpts(); }
    say(...message);
    const tip = sim.wallet.coach[0];
    if (tip && Date.now() - tip.t < 2500) toast(tip);
    if (message[1] === 'err') throw new Error(message[0]);
    return result;
  }

  function toast(tip) {
    let el = root.querySelector('.ax-coach-toast');
    if (!el) { el = document.createElement('div'); el.className = 'ax-coach-toast'; root.querySelector('.ax').appendChild(el); }
    el.className = `ax-coach-toast ${tip.tone}`;
    el.innerHTML = `<b>Coach</b><p>${esc(tip.text)}</p><button data-v="learn">See all tips</button><button class="ax-toast-x" aria-label="Dismiss">✕</button>`;
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
          <p>The Dex Scanner checks liquidity, pool age, holder concentration, mint &amp; freeze authority, locked liquidity, honeypots, taxes, insiders, buy/sell flow, pumps and socials, then explains each result. Paste any contract address to start.</p>
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

  const STEPS = ['Finding the pool', 'Reading liquidity & volume', 'Checking top holders', 'Checking mint, freeze & LP lock', 'Looking for honeypots & taxes', 'Scoring risk'];

  async function runScan(target) {
    const box = views.scanner.querySelector('.ax-report');
    box.innerHTML = `<div class="ax-scanning"><div class="ax-laser"></div><ol>${STEPS.map((s) => `<li>${s}</li>`).join('')}</ol></div>`;
    const items = [...box.querySelectorAll('li')];
    let i = 0;
    const ticker = setInterval(() => { items[i]?.classList.add('done'); i++; }, 320);
    const started = Date.now();
    try {
      const report = await scan(target.startsWith('dex:') ? { symbol: target } : { q: target });
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
            <div class="ax-socials">${[...(t.websites || []).map((u) => ['web', u]), ...(t.socials || []).map((x) => [x.type, x.url])].map(([k, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(k)} ↗</a>`).join('')}</div>
            <p class="ax-disclaimer">Safety data: ${esc(s.source || 'unavailable')} · pool data: DexScreener. Scores are a teaching aid built from public data. A low score does not make a memecoin safe.</p>
          </div>
        </div>
      </div>`;
  }

  // ------------------------------------------------ portfolio
  function renderPositions() {
    const w = sim.wallet;
    const { usd, pnlUsd } = walletValue();
    const st = sim.summary();
    const rows = Object.entries(w.positions).map(([s, pos]) => {
      const p = pnlFor(s);
      return `<tr>
        <td><button class="ax-link" data-open="${esc(s)}"><b>${esc(pos.ticker)}</b></button> <i class="lt-chain ${esc(pos.network)}">${esc(pos.network)}</i></td>
        <td>${fmtQty(pos.tokens)}</td><td>${amt(p.bought, p.cur)}</td><td>${amt(p.holding, p.cur)}</td>
        <td style="color:${tone(p.pnl)}">${signed(p.pnl)} (${fmtPct(p.pct)}) <small class="dim">${fmtUsd(p.pnl * (p.np || 0))}</small></td>
        <td><button class="ax-mini" data-sell="${esc(s)}" data-pct="50">50%</button><button class="ax-mini" data-sell="${esc(s)}" data-pct="100">All</button></td></tr>`;
    }).join('');
    const hist = w.history.slice(0, 30).map((t) => `<tr><td>${new Date(t.t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
      <td class="${t.side === 'BUY' ? 'up' : 'down'}">${t.side}</td><td><button class="ax-link" data-open="${esc(t.symbol)}"><b>${esc(t.ticker)}</b></button></td><td>${fmtQty(t.tokens)}</td><td>${amt(t.amount, t.cur)}</td>
      <td>${t.impact.toFixed(2)}%</td><td style="color:${tone(t.pnl)}">${t.pnl != null ? signed(t.pnl) : ''}</td></tr>`).join('');
    views.positions.innerHTML = `
      <div class="ax-cards">
        <div><span>Wallets</span><b>${amt(w.bal.SOL, 'SOL', 2)}</b><small>${amt(w.bal.ETH, 'ETH')} · ${amt(w.bal.BNB, 'BNB', 2)}</small></div>
        <div><span>Total value</span><b>${fmtUsd(usd)}</b><small>incl. open positions</small></div>
        <div><span>PnL</span><b style="color:${tone(pnlUsd)}">${pnlUsd >= 0 ? '+' : ''}${fmtUsd(pnlUsd)}</b><small>vs starting balances · realised ${fmtUsd(w.realizedUsd)}</small></div>
        <div><span>Win rate</span><b>${st.winRate == null ? '—' : `${st.winRate.toFixed(0)}%`}</b><small>${st.closed} closed · fees ${fmtUsd(w.feesUsd)} · slippage ${fmtUsd(w.slippageUsd)}</small></div>
      </div>
      <h5>Open positions <small>· value = what you'd get selling now, after impact &amp; fees</small></h5>
      ${rows ? `<table class="ax-table wide"><thead><tr><th>Token</th><th>Amount</th><th>Bought</th><th>Holding</th><th>PnL</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="ax-empty">No open positions. Head to Pulse, scan something, and try a small buy.</p>'}
      <h5>Trade history</h5>
      ${hist ? `<table class="ax-table wide"><thead><tr><th>Time</th><th>Side</th><th>Token</th><th>Amount</th><th>Paid / got</th><th>Impact</th><th>PnL</th></tr></thead><tbody>${hist}</tbody></table>` : '<p class="ax-empty">No trades yet.</p>'}
      <p class="ax-foot">Fake starting balances: ◎${START.SOL} SOL, Ξ${START.ETH} ETH, ⓑ${START.BNB} BNB · <button class="ax-reset">Reset wallets</button></p>`;
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
            <li>Open <b>Pulse</b> and pick a pair.</li><li>Check <b>Token info</b> or run the <b>Dex Scanner</b> and read every red flag.</li>
            <li>Buy a small size and note your exit plan.</li><li>Watch your <b>PnL</b> box, take profit or cut the loss, then read the coach’s notes.</li></ol></div>
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
    if (b.classList.contains('ax-toast-x')) { b.parentElement.hidden = true; return; }
    if (b.dataset.copy) { try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied ✓'; } catch { b.textContent = b.dataset.copy; } return; }
    if (b.dataset.quick) {
      e.stopPropagation();
      const q = quotes.get(b.dataset.quick) || {};
      const n = sim.presets(nativeOf(q.network || dexParts(b.dataset.quick).network))[0];
      b.disabled = true;
      b.textContent = '…';
      try { await trade(b.dataset.quick, 'buy', n); b.textContent = '✓'; } catch { b.textContent = '✗'; }
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
    if (b.dataset.tf) {
      tf = b.dataset.tf;
      views.token.querySelectorAll('[data-tf]').forEach((x) => x.classList.toggle('on', x.dataset.tf === tf));
      return loadCandles();
    }
    if (b.dataset.mode) {
      mode = b.dataset.mode;
      views.token.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x.dataset.mode === mode));
      return updateChartOpts();
    }
    if (b.dataset.btab) { bottomTab = b.dataset.btab; return renderBottom(); }
    if (b.dataset.instant) {
      b.disabled = true;
      try { await trade(token, b.dataset.instant, Number(b.dataset.n)); } catch { /* message + coach shown */ }
      b.disabled = false;
      return;
    }
    if (b.dataset.side) { side = b.dataset.side; amount = ''; return renderSide(); }
    if (b.dataset.preset) { amount = b.dataset.preset; views.token.querySelector('.ax-amount input').value = amount; return renderPreview(); }
    if (b.classList.contains('ax-go') && view === 'token') {
      const n = parseFloat(amount);
      if (!(n > 0)) { const m = views.token.querySelector('.ax-msg'); m.textContent = side === 'buy' ? 'Pick an amount first.' : 'Pick how much to sell.'; m.className = 'ax-msg err'; return; }
      b.disabled = true;
      try { await trade(token, side, n); amount = ''; } catch { /* shown */ }
      const go = views.token.querySelector('.ax-go');
      if (go) go.disabled = false;
      return;
    }
    if (b.dataset.sell) {
      b.disabled = true;
      try { await trade(b.dataset.sell, 'sell', Number(b.dataset.pct)); } catch { /* shown in coach */ }
      if (view === 'positions') renderPositions();
      return;
    }
    if (b.classList.contains('ax-reset') && confirm('Reset all sim wallets? Positions, history and coach notes are cleared.')) { sim.reset(); return renderPositions(); }
  });

  root.addEventListener('change', (e) => {
    const k = e.target.dataset.set;
    if (!k) return;
    const q = quotes.get(token) || {};
    if (k === 'slippage') sim.setSlippage(Number(e.target.value));
    if (k === 'priority') sim.setPriority(nativeOf(q.network || dexParts(token).network), Number(e.target.value));
    renderPreview();
  });
  root.addEventListener('submit', (e) => {
    if (!e.target.classList.contains('ax-scanform')) return;
    e.preventDefault();
    const v = e.target.querySelector('input').value.trim();
    if (v) runScan(v);
  });
  root.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });

  sim.on(() => renderWallet());
  let lastRefresh = 0;
  onQuotes(() => {
    if (!active) return;
    renderWallet();
    if (view === 'token' && Date.now() - lastRefresh > 1500) {
      lastRefresh = Date.now();
      renderTop();
      const typing = document.activeElement?.closest?.('.axt-right');
      if (!typing) renderSide(); else renderPreview();
      if (bottomTab === 'positions') renderBottom();
      updateChartOpts();
    }
    if (view === 'positions') renderPositions();
  });

  return {
    open(v = 'pulse', arg) {
      active = true;
      renderWallet();
      const pos = Object.keys(sim.wallet.positions);
      if (pos.length) watch(pos);
      show(v, arg);
    },
    close() { active = false; clearInterval(pulseTimer); stopLive(); },
  };
}
