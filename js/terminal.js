// The laptop: Markets (watchlists, charts, CA search, order ticket), Portfolio (paper account) and a command-line Terminal.
import { DESKS, SOURCES, label, isMeme, isDex, isCrypto, dexParts, axiomUrl, dexscreenerUrl } from './data.js';
import {
  quotes, watch, onQuotes, refresh, getChart, search, searchMemes, dexList, dexLookup, quoteNow,
  fmtPrice, fmtPct, fmtChg, fmtVol, fmtUsd, fmtQty, tone,
} from './market.js';
import { drawChart } from './chart.js';
import { paper, START_CASH } from './paper.js';
import { createCli } from './cli.js';
import { radio } from './music.js';
import { createAxiom } from './axiom/ui.js';

const RANGES = [['1d', '24H'], ['5d', '7D'], ['1mo', '1M'], ['6mo', '6M'], ['1y', '1Y']];
const STOCK_RANGES = [['1d', '1D'], ['5d', '5D'], ['1mo', '1M'], ['6mo', '6M'], ['1y', '1Y'], ['5y', '5Y']];
const STATE_TEXT = { OPEN: 'Market open', PRE: 'Pre-market', AFTER: 'After hours', CLOSED: 'Market closed' };
const ADDRESS_RE = /^(0x[a-fA-F0-9]{40}([a-fA-F0-9]{24})?|[1-9A-HJ-NP-Za-km-z]{32,48})$/;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (a) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');

function loadList(kind) {
  try { return JSON.parse(localStorage.getItem(`ws.mylist.${kind}`)) || []; } catch { return []; }
}
function saveList(kind, l) {
  try { localStorage.setItem(`ws.mylist.${kind}`, JSON.stringify(l)); } catch { /* private mode */ }
}

export function createTerminal(root, { onClose }) {
  root.innerHTML = `
    <div class="lt-bezel">
      <div class="lt-cam"></div>
      <div class="lt-screen">
        <header class="lt-top">
          <div class="lt-firm"><i class="lt-dot"></i><b class="lt-firm-name"></b><span class="lt-desk"></span></div>
          <nav class="lt-tabs" role="tablist">
            <button data-tab="markets" class="on">Markets</button>
            <button data-tab="axiom" class="tab-axiom">Axiom Sim</button>
            <button data-tab="portfolio">Portfolio</button>
            <button data-tab="cli">Terminal</button>
          </nav>
          <div class="lt-equity" title="Paper account equity"></div>
          <button class="lt-radio" title="Lo-fi radio">♫ <span>Radio off</span></button>
          <div class="lt-clock"><span class="lt-state"></span><b class="lt-ny"></b></div>
          <button class="lt-close" aria-label="Close laptop (Esc)">✕</button>
        </header>
        <div class="lt-tape" aria-label="Live prices"></div>

        <section class="lt-view lt-markets" data-view="markets">
          <aside class="lt-side">
            <div class="lt-sources" hidden></div>
            <div class="lt-search">
              <input type="search" aria-label="Search" autocomplete="off" spellcheck="false">
              <div class="lt-results" hidden></div>
            </div>
            <div class="lt-lists"></div>
          </aside>
          <section class="lt-center">
            <div class="lt-head">
              <div class="lt-title">
                <div class="lt-sym"><b></b><button class="lt-star" title="Add to My list">☆</button></div>
                <div class="lt-name"></div>
                <div class="lt-links"></div>
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
            <form class="lt-ticket">
              <div class="tk-side"><button type="button" data-side="buy" class="on">Buy</button><button type="button" data-side="sell">Sell</button></div>
              <label class="tk-amount"><span class="tk-unit">$</span><input inputmode="decimal" placeholder="0.00" aria-label="Amount"></label>
              <div class="tk-chips"></div>
              <p class="tk-est"></p>
              <button class="tk-go" type="submit">Buy</button>
              <p class="tk-msg" role="status"></p>
              <p class="tk-note">Paper trading · fills at the latest price · no real money</p>
            </form>
            <h4>Key stats</h4>
            <dl class="lt-stats"></dl>
            <h4 class="lt-panel-title"></h4>
            <ul class="lt-panel"></ul>
          </aside>
        </section>

        <section class="lt-view lt-axiom" data-view="axiom" hidden></section>
        <section class="lt-view lt-portfolio" data-view="portfolio" hidden></section>
        <section class="lt-view lt-cli" data-view="cli" hidden></section>

        <footer class="lt-foot"><span class="lt-src"></span><span class="lt-upd"></span></footer>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const el = {
    firmName: $('.lt-firm-name'), desk: $('.lt-desk'), state: $('.lt-state'), ny: $('.lt-ny'), equity: $('.lt-equity'), radio: $('.lt-radio span'),
    tape: $('.lt-tape'), sources: $('.lt-sources'), input: $('.lt-search input'), results: $('.lt-results'), lists: $('.lt-lists'),
    sym: $('.lt-sym b'), star: $('.lt-star'), name: $('.lt-name'), links: $('.lt-links'), px: $('.lt-px b'), chg: $('.lt-px span'),
    ranges: $('.lt-ranges'), kinds: $('.lt-kinds'), canvas: $('.lt-chart canvas'), tip: $('.lt-tip'), msg: $('.lt-msg'),
    stats: $('.lt-stats'), panelTitle: $('.lt-panel-title'), panel: $('.lt-panel'), src: $('.lt-src'), upd: $('.lt-upd'),
    ticket: $('.lt-ticket'), tkUnit: $('.tk-unit'), tkInput: $('.tk-amount input'), tkChips: $('.tk-chips'), tkEst: $('.tk-est'), tkGo: $('.tk-go'), tkMsg: $('.tk-msg'),
    portfolio: $('.lt-portfolio'), cliRoot: $('.lt-cli'), axRoot: $('.lt-axiom'),
  };

  let desk = DESKS.stocks, symbol = 'AAPL', range = '1d', kind = 'line', chart = null, hover = null;
  let open = false, tab = 'markets', source = 'majors', feed = [], side = 'buy';
  let chartTimer = null, clockTimer = null, reqId = 0, myList = loadList('stocks');
  const feedCache = new Map();

  // ------------------------------------------------ helpers shared with the CLI
  const priceOf = (s) => quotes.get(s)?.price ?? null;
  const meta = (s) => {
    const q = quotes.get(s) || {};
    return { ticker: label(s), name: q.name || label(s), kind: isDex(s) ? 'dex' : isMeme(s) ? 'meme' : 'stock', network: q.network, token: q.token };
  };

  async function resolve(q) {
    q = q.trim();
    if (!q) return null;
    if (/^(cg|dex):/.test(q)) return q;
    if (ADDRESS_RE.test(q)) return (await dexLookup(q))[0]?.symbol || null;
    const up = q.toUpperCase();
    // anything already loaded with that ticker (desk lists, feeds, positions)
    const pool = [...quotes.values()].filter((x) => (x.ticker || '').toUpperCase() === up || label(x.symbol).toUpperCase() === up);
    if (pool.length) return pool.sort((a, b) => (b.liquidity || b.marketCap || 0) - (a.liquidity || a.marketCap || 0))[0].symbol;
    if (/^[A-Z.^=\-]{1,10}$/.test(up)) {
      const s = await quoteNow(up);
      if (s?.price) return up;
    }
    const coins = (await searchMemes(q)).quotes || [];
    if (coins[0]) return coins[0].symbol;
    return (await dexLookup(q))[0]?.symbol || null;
  }

  async function loadFeed(view) {
    if (view === 'majors') return DESKS.memes.symbols;
    const hit = feedCache.get(view);
    if (hit && Date.now() - hit.at < 60000) return hit.symbols;
    const symbols = await dexList(view);
    feedCache.set(view, { symbols, at: Date.now() });
    return symbols;
  }

  const openSymbol = (s) => {
    if (isCrypto(s) && desk.kind !== 'memes') setDesk(DESKS.memes);
    else if (!isCrypto(s) && desk.kind !== 'stocks') setDesk(DESKS.stocks);
    setTab('markets');
    select(s);
  };

  const cli = createCli(el.cliRoot, {
    resolve, lookup: dexLookup, quote: quoteNow, label, meta, paper, radio, feed: loadFeed,
    price: priceOf, get: (s) => quotes.get(s), open: openSymbol,
    axiom: (v, arg) => { setTab('axiom', v, arg); },
  });

  let axiom = null;
  const ensureAxiom = () => (axiom ||= createAxiom(el.axRoot));

  // ------------------------------------------------ rendering: markets
  function renderTape() {
    el.tape.innerHTML = desk.tape.map((s) => {
      const q = quotes.get(s);
      return `<button data-s="${esc(s)}"><b>${esc(label(s))}</b> ${q ? fmtPrice(q.price, s) : '···'} <em style="color:${tone(q?.changePct)}">${q ? fmtPct(q.changePct) : ''}</em></button>`;
    }).join('');
  }

  function row(s) {
    const q = quotes.get(s);
    let right;
    const pts = q?.spark || [];
    if (pts.length > 1) {
      const lo = Math.min(...pts), hi = Math.max(...pts), sp = hi - lo || 1;
      const path = pts.map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * 60).toFixed(1)},${(18 - ((v - lo) / sp) * 16).toFixed(1)}`).join('');
      right = `<svg viewBox="0 0 60 20" preserveAspectRatio="none"><path d="${path}" stroke="${tone(q?.changePct)}" fill="none" stroke-width="1.4" vector-effect="non-scaling-stroke"/></svg>`;
    } else if (isDex(s)) {
      right = `<span class="lt-chain ${esc(q?.network)}">${esc(q?.network === 'robinhood' ? 'HOOD' : (q?.network || '').slice(0, 4).toUpperCase())}</span>`;
    } else right = '<span></span>';
    const sub = isDex(s) ? (q?.liquidity ? `liq $${fmtVol(q.liquidity)}` : q?.dex || 'on-chain') : q?.name || (isMeme(s) ? 'Meme coin' : s);
    const held = paper.position(s) ? '<i class="lt-held" title="In your paper portfolio"></i>' : '';
    return `<button class="lt-row${s === symbol ? ' on' : ''}" data-s="${esc(s)}">
      <span class="lt-rs"><b>${held}${esc(label(s))}</b><small>${esc(sub)}</small></span>${right}
      <span class="lt-rp"><b>${q ? fmtPrice(q.price, s) : '···'}</b><small style="color:${tone(q?.changePct)}">${q ? fmtPct(q.changePct) : ''}</small></span>
    </button>`;
  }

  function renderLists() {
    const title = desk.kind === 'memes' ? SOURCES.find((x) => x.id === source)?.hint : desk.desk;
    el.lists.innerHTML = `
      <h5>${esc(title)}</h5>${feed.length ? feed.map(row).join('') : '<p class="lt-empty">Loading…</p>'}
      <h5>My list ${myList.length ? '' : '<small>· tap ☆ to add</small>'}</h5>${myList.map(row).join('')}`;
  }

  function renderSources() {
    el.sources.hidden = desk.kind !== 'memes';
    el.sources.innerHTML = SOURCES.map((x) => `<button data-src="${x.id}" class="${x.id === source ? 'on' : ''}" title="${esc(x.hint)}">${x.label}</button>`).join('');
  }

  const stat = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;

  function renderHeader() {
    const q = quotes.get(symbol);
    const c = chart && chart.symbol === symbol ? chart : null;
    const src = q || c;
    el.sym.textContent = isCrypto(symbol) || label(symbol) === symbol ? label(symbol) : `${label(symbol)} · ${symbol}`;
    el.star.textContent = myList.includes(symbol) ? '★' : '☆';
    el.px.textContent = src ? fmtPrice(src.price, symbol) : '—';
    el.chg.textContent = src ? `${fmtChg(src.change, symbol)}  (${fmtPct(src.changePct)})` : '';
    el.chg.style.color = tone(src?.changePct);
    el.state.textContent = isCrypto(symbol) ? 'Trading 24/7' : STATE_TEXT[src?.marketState || 'CLOSED'];
    el.state.dataset.s = isCrypto(symbol) ? 'OPEN' : src?.marketState || 'CLOSED';
    renderTicket();

    if (!src) { el.name.textContent = 'Loading…'; el.stats.innerHTML = ''; el.links.innerHTML = ''; return; }

    if (isDex(symbol)) {
      const { network, pool } = dexParts(symbol);
      const pons = /pons/.test(src.dex || '');
      el.name.innerHTML = `${esc(src.name || '')} · <span class="lt-chain ${esc(network)}">${esc(network)}</span>${pons ? ' <span class="lt-badge">PONS.FAMILY</span>' : ''} · ${esc(src.dex || '')}`;
      if (el.links.dataset.for !== symbol) {
        el.links.dataset.for = symbol;
        el.links.innerHTML = `
          ${src.token ? `<button type="button" class="lt-link" data-copy="${esc(src.token)}" title="Copy contract address">CA ${esc(short(src.token))} ⧉</button>` : ''}
          <a class="lt-link" href="${esc(src.url || dexscreenerUrl(network, pool))}" target="_blank" rel="noopener noreferrer">DexScreener ↗</a>
          ${network === 'solana' ? `<a class="lt-link axiom" href="${esc(axiomUrl(pool))}" target="_blank" rel="noopener noreferrer">Open on Axiom ↗</a>` : ''}`;
      }
      const age = src.createdAt ? Math.max(0, (Date.now() / 1000 - src.createdAt) / 3600) : null;
      el.stats.innerHTML = [
        stat('5m', `<span style="color:${tone(src.change5m)}">${fmtPct(src.change5m)}</span>`),
        stat('1h', `<span style="color:${tone(src.change1h)}">${fmtPct(src.change1h)}</span>`),
        stat('24h', `<span style="color:${tone(src.changePct)}">${fmtPct(src.changePct)}</span>`),
        stat('24h volume', src.volume ? '$' + fmtVol(src.volume) : '—'),
        stat('Liquidity', src.liquidity ? '$' + fmtVol(src.liquidity) : '—'),
        stat('Market cap', src.marketCap ? '$' + fmtVol(src.marketCap) : '—'),
        stat('24h buys / sells', src.buys != null ? `${fmtVol(src.buys)} / ${fmtVol(src.sells)}` : '—'),
        stat('Pool age', age == null ? '—' : age < 48 ? `${age.toFixed(1)}h` : `${Math.round(age / 24)}d`),
      ].join('');
    } else if (isMeme(symbol)) {
      el.name.textContent = `${src.name} · Meme coin${src.rank ? ` · Rank #${src.rank}` : ''} · USD`;
      el.links.dataset.for = symbol;
      el.links.innerHTML = `<a class="lt-link" href="https://www.coingecko.com/en/coins/${esc(symbol.slice(3))}" target="_blank" rel="noopener noreferrer">CoinGecko ↗</a>`;
      el.stats.innerHTML = [
        stat('24h high', fmtPrice(src.dayHigh, symbol)),
        stat('24h low', fmtPrice(src.dayLow, symbol)),
        stat('24h volume', src.volume ? '$' + fmtVol(src.volume) : '—'),
        stat('Market cap', src.marketCap ? '$' + fmtVol(src.marketCap) : '—'),
        stat('7d change', `<span style="color:${tone(src.change7d)}">${fmtPct(src.change7d)}</span>`),
        stat('All-time high', fmtPrice(src.ath, symbol)),
        stat('From ATH', fmtPct(src.athChangePct)),
      ].join('');
    } else {
      el.name.textContent = `${src.name} · ${src.exchange || ''} · ${src.currency || ''}`;
      el.links.dataset.for = symbol;
      el.links.innerHTML = '';
      el.stats.innerHTML = [
        stat('Open', fmtPrice(c?.open ?? q?.open, symbol)),
        stat('Prev close', fmtPrice(src.prevClose, symbol)),
        stat('Day high', fmtPrice(src.dayHigh, symbol)),
        stat('Day low', fmtPrice(src.dayLow, symbol)),
        stat('Volume', fmtVol(src.volume)),
        stat('52W high', fmtPrice(src.high52, symbol)),
        stat('52W low', fmtPrice(src.low52, symbol)),
      ].join('');
    }
    if (src.time) el.upd.textContent = `Updated ${new Date(src.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  function renderRanges() {
    const set = isCrypto(symbol) ? RANGES : STOCK_RANGES;
    if (!set.some(([r]) => r === range)) range = '1d';
    el.ranges.innerHTML = set.map(([r, t]) => `<button data-r="${r}" class="${r === range ? 'on' : ''}">${t}</button>`).join('');
    el.kinds.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === kind));
  }

  const redraw = () => drawChart(el.canvas, el.tip, { chart, symbol, range, kind, hover });

  async function loadChart(silent, retry) {
    const id = ++reqId;
    if (!silent) { el.msg.textContent = 'Loading chart…'; if (chart?.symbol !== symbol) chart = null; redraw(); }
    try {
      const data = await getChart(symbol, range);
      if (id !== reqId) return;
      chart = data;
      el.msg.textContent = data.points.length ? '' : 'No trades in this range yet.';
    } catch {
      if (id !== reqId) return;
      if (!silent) chart = null;
      if (isDex(symbol) && (retry || 0) < 4) {
        // the free candle API rate-limits bursts: back off and try again
        el.msg.textContent = 'Candles are busy on the free on-chain API, retrying…';
        setTimeout(() => { if (id === reqId && open) loadChart(true, (retry || 0) + 1); }, 4000 + (retry || 0) * 3000);
        renderHeader();
        return;
      }
      el.msg.textContent = isDex(symbol) ? 'Candles unavailable right now. Stats above are live; try the chart again shortly.' : `Couldn't load ${label(symbol)}.`;
    }
    renderHeader();
    redraw();
  }

  // side panel: headlines for stocks, trending coins for the meme desk
  let trending = null, trendingAt = 0;
  async function loadPanel() {
    const s = symbol;
    if (isCrypto(s)) {
      el.panelTitle.textContent = 'Trending on CoinGecko';
      if (!trending || Date.now() - trendingAt > 300000) {
        trending = (await fetch('/api/meme-trending').then((r) => r.json()).catch(() => ({}))).coins || [];
        trendingAt = Date.now();
      }
      if (s !== symbol) return;
      el.panel.innerHTML = trending.length ? trending.map((c) => `
        <li><button class="lt-trend" data-s="${esc(c.symbol)}"><b>${esc(c.ticker)}</b><span>${esc(c.name)}${c.rank ? ` · #${c.rank}` : ''}</span>
        <em style="color:${tone(c.changePct)}">${fmtPrice(c.price)} ${fmtPct(c.changePct)}</em></button></li>`).join('') : '<li class="lt-empty">Trending list unavailable.</li>';
      return;
    }
    el.panelTitle.textContent = 'Headlines';
    el.panel.innerHTML = '<li class="lt-empty">Loading…</li>';
    const q = quotes.get(s);
    const { news = [] } = await search(s.startsWith('^') || s.includes('=') ? q?.name || label(s) : s).catch(() => ({}));
    if (s !== symbol) return;
    el.panel.innerHTML = news.length ? news.slice(0, 6).map((n) => `
      <li><a href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>
      <small>${esc(n.publisher)} · ${ago(n.time)}</small></li>`).join('') : '<li class="lt-empty">No recent headlines.</li>';
  }

  function ago(ts) {
    const m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60));
    return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
  }

  function select(s) {
    if (!s) return;
    // on-chain tokens open in the Axiom-style trading page (candles 1s–1D, PnL, instant trade)
    if (isDex(s)) { setTab('axiom', 'token', s); return; }
    symbol = s;
    watch([s]);
    el.tkMsg.textContent = '';
    el.tkInput.value = '';
    renderRanges();
    renderLists();
    renderHeader();
    loadChart();
    loadPanel();
  }

  // ------------------------------------------------ order ticket
  function renderTicket() {
    const q = quotes.get(symbol);
    const pos = paper.position(symbol);
    const tradable = !symbol.startsWith('^');
    el.ticket.classList.toggle('disabled', !tradable);
    el.ticket.querySelectorAll('[data-side]').forEach((b) => b.classList.toggle('on', b.dataset.side === side));
    el.tkUnit.textContent = side === 'buy' ? '$' : 'QTY';
    el.tkGo.textContent = !tradable ? 'Indices can’t be traded · try SPY' : `${side === 'buy' ? 'Buy' : 'Sell'} ${label(symbol)}`;
    el.tkGo.className = `tk-go ${side}`;
    el.tkGo.disabled = !tradable;
    const chips = side === 'buy'
      ? [['100', '$100'], ['1000', '$1K'], ['10000', '$10K'], ['max', 'Max']]
      : [['25%', '25%'], ['50%', '50%'], ['100%', 'All']];
    const chipHtml = chips.map(([v, t]) => `<button type="button" data-chip="${v}">${t}</button>`).join('');
    if (el.tkChips.innerHTML !== chipHtml) el.tkChips.innerHTML = chipHtml;
    const amt = parseFloat(el.tkInput.value);
    const px = q?.price;
    let est = `Cash ${fmtUsd(paper.account.cash)}`;
    if (pos) est += ` · Holding ${fmtQty(pos.qty)} (${fmtUsd(pos.qty * (px ?? pos.cost))})`;
    if (amt > 0 && px) est += side === 'buy' ? ` · ≈ ${fmtQty(amt / px)} ${label(symbol)}` : ` · ≈ ${fmtUsd(amt * px)}`;
    el.tkEst.textContent = est;
  }

  el.ticket.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.side) { side = b.dataset.side; el.tkInput.value = ''; el.tkMsg.textContent = ''; renderTicket(); }
    if (b.dataset.chip) {
      const pos = paper.position(symbol);
      if (b.dataset.chip === 'max') el.tkInput.value = Math.floor(paper.account.cash * 100) / 100;
      else if (b.dataset.chip.endsWith('%')) el.tkInput.value = pos ? +((pos.qty * parseFloat(b.dataset.chip)) / 100).toPrecision(10) : '';
      else el.tkInput.value = b.dataset.chip;
      renderTicket();
    }
  });
  el.tkInput.addEventListener('input', renderTicket);
  el.ticket.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amt = parseFloat(el.tkInput.value);
    el.tkGo.disabled = true;
    el.tkMsg.className = 'tk-msg';
    el.tkMsg.textContent = 'Getting the latest price…';
    try {
      const q = await quoteNow(symbol);
      const t = side === 'buy'
        ? paper.buy(symbol, amt, q?.price, meta(symbol))
        : paper.sell(symbol, amt, q?.price, meta(symbol));
      el.tkMsg.className = 'tk-msg ok';
      el.tkMsg.textContent = `${t.side === 'BUY' ? 'Bought' : 'Sold'} ${fmtQty(t.qty)} ${t.ticker} at ${fmtPrice(t.price, symbol)} (${fmtUsd(t.value)})`;
      el.tkInput.value = '';
    } catch (err) {
      el.tkMsg.className = 'tk-msg err';
      el.tkMsg.textContent = err.message;
    }
    el.tkGo.disabled = false;
    renderTicket();
  });

  // ------------------------------------------------ portfolio view
  function renderEquity() {
    const eq = paper.equity(priceOf);
    el.equity.innerHTML = `<small>PAPER</small> ${fmtUsd(eq.total)} <em style="color:${tone(eq.pnl)}">${fmtPct((eq.pnl / START_CASH) * 100)}</em>`;
  }

  function renderPortfolio() {
    const acct = paper.account;
    const eq = paper.equity(priceOf);
    const rows = Object.entries(acct.positions).map(([s, p]) => {
      const px = priceOf(s) ?? p.cost, value = p.qty * px, pnl = (px - p.cost) * p.qty;
      return `<tr>
        <td><button class="pf-open" data-s="${esc(s)}"><b>${esc(p.ticker || label(s))}</b><small>${esc(p.kind === 'dex' ? p.network || 'on-chain' : p.kind)}</small></button></td>
        <td>${fmtQty(p.qty)}</td><td>${fmtPrice(p.cost, s)}</td><td>${fmtPrice(px, s)}</td><td>${fmtUsd(value)}</td>
        <td style="color:${tone(pnl)}">${fmtUsd(pnl)} <small>${fmtPct(((px - p.cost) / p.cost) * 100)}</small></td>
        <td><button class="pf-close" data-close="${esc(s)}">Close</button></td></tr>`;
    }).join('');
    const hist = acct.history.slice(0, 30).map((t) => `<tr>
      <td>${new Date(t.t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
      <td class="${t.side === 'BUY' ? 'up' : 'down'}">${t.side}</td><td><b>${esc(t.ticker)}</b></td>
      <td>${fmtQty(t.qty)}</td><td>${fmtPrice(t.price, t.symbol)}</td><td>${fmtUsd(t.value)}</td></tr>`).join('');
    el.portfolio.innerHTML = `
      <div class="pf-cards">
        <div><span>Equity</span><b>${fmtUsd(eq.total)}</b></div>
        <div><span>Cash</span><b>${fmtUsd(eq.cash)}</b></div>
        <div><span>Holdings</span><b>${fmtUsd(eq.holdings)}</b></div>
        <div><span>Total P&amp;L</span><b style="color:${tone(eq.pnl)}">${fmtUsd(eq.pnl)} <small>${fmtPct((eq.pnl / START_CASH) * 100)}</small></b></div>
      </div>
      <h4>Open positions</h4>
      ${rows ? `<div class="pf-scroll"><table class="pf-table"><thead><tr><th>Asset</th><th>Qty</th><th>Avg cost</th><th>Price</th><th>Value</th><th>P&amp;L</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : '<p class="lt-empty">No positions yet. Open a chart in Markets and use the order ticket, or type <b>buy NVDA $1000</b> in the Terminal tab.</p>'}
      <h4>Trade history</h4>
      ${hist ? `<div class="pf-scroll"><table class="pf-table"><thead><tr><th>Time</th><th>Side</th><th>Asset</th><th>Qty</th><th>Price</th><th>Value</th></tr></thead><tbody>${hist}</tbody></table></div>` : '<p class="lt-empty">No trades yet.</p>'}
      <p class="pf-foot">Started with ${fmtUsd(START_CASH)} of play money · realised P&amp;L ${fmtUsd(acct.realized)} · <button class="pf-reset">Reset account</button></p>`;
  }

  el.portfolio.addEventListener('click', async (e) => {
    const openBtn = e.target.closest('[data-s]');
    if (openBtn) return openSymbol(openBtn.dataset.s);
    const close = e.target.closest('[data-close]');
    if (close) {
      const s = close.dataset.close, pos = paper.position(s);
      close.disabled = true;
      try { const q = await quoteNow(s); paper.sell(s, pos.qty, q?.price, meta(s)); } catch (err) { close.disabled = false; close.textContent = err.message.slice(0, 24); }
      return;
    }
    if (e.target.closest('.pf-reset') && confirm('Reset your paper account to $100,000? This clears positions and history.')) paper.reset();
  });

  paper.on(() => { renderEquity(); if (tab === 'portfolio') renderPortfolio(); renderTicket(); renderLists(); });

  function setTab(t, axView, axArg) {
    if (tab === 'axiom' && t !== 'axiom') axiom?.close();
    tab = t;
    root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    root.querySelectorAll('.lt-view').forEach((v) => (v.hidden = v.dataset.view !== t));
    if (t === 'portfolio') { watch(Object.keys(paper.account.positions)); refresh(); renderPortfolio(); }
    if (t === 'cli') cli.focus();
    if (t === 'axiom') ensureAxiom().open(axView || 'pulse', axArg);
    root.classList.toggle('ax-mode', t === 'axiom');
    if (t === 'markets') requestAnimationFrame(redraw);
  }

  // ------------------------------------------------ desk + source
  async function setSource(id) {
    source = id;
    renderSources();
    feed = [];
    renderLists();
    let symbols;
    try { symbols = await loadFeed(id); } catch {
      if (source === id) el.lists.querySelector('.lt-empty').textContent = 'Feed is busy (free API limits). Try again in a moment.';
      return;
    }
    if (source !== id) return;
    feed = symbols;
    watch(feed);
    renderLists();
  }

  function setDesk(d) {
    desk = d;
    myList = loadList(desk.kind);
    root.style.setProperty('--firm', desk.color);
    el.firmName.textContent = desk.name;
    el.desk.textContent = desk.desk;
    el.input.placeholder = desk.kind === 'memes' ? 'Search coin or paste CA…  ( / )' : 'Search any stock…  ( / )';
    el.src.textContent = desk.kind === 'memes'
      ? 'Live data: CoinGecko · GeckoTerminal · DexScreener · on-chain tokens are extremely risky · paper trading only'
      : 'Live data: Yahoo Finance · quotes can be delayed · paper trading only';
    watch([...desk.tape, ...desk.symbols, ...myList]);
    renderTape();
    renderSources();
    if (desk.kind === 'memes') setSource(source);
    else { feed = desk.symbols; renderLists(); }
  }

  // ------------------------------------------------ search
  let searchTimer;
  el.input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = el.input.value.trim();
    if (!q) { el.results.hidden = true; return; }
    searchTimer = setTimeout(async () => {
      let html = '';
      if (desk.kind === 'memes') {
        el.results.innerHTML = '<p>Searching…</p>';
        el.results.hidden = false;
        const address = ADDRESS_RE.test(q);
        const [coins, pools] = await Promise.all([address ? { quotes: [] } : searchMemes(q), dexLookup(q)]);
        if (el.input.value.trim() !== q) return;
        if (pools.length) html += `<h6>On-chain${address ? ' · contract address' : ''}</h6>` + pools.map((x) => `<button data-s="${esc(x.symbol)}"><b>${esc(x.ticker)}</b><span>${esc(x.name)}</span><small><i class="lt-chain ${esc(x.network)}">${esc(x.network)}</i> ${esc(x.dex)} · liq $${fmtVol(x.liquidity)} · ${fmtPrice(x.price)}</small></button>`).join('');
        if (coins.quotes?.length) html += '<h6>Coins</h6>' + coins.quotes.map((x) => `<button data-s="${esc(x.symbol)}"><b>${esc((x.exchange || '').toUpperCase())}</b><span>${esc(x.name)}</span><small>${esc(x.type)}</small></button>`).join('');
      } else {
        const { quotes: qs = [] } = await search(q).catch(() => ({}));
        if (el.input.value.trim() !== q) return;
        const direct = /^[A-Za-z.^=\-]{1,10}$/.test(q) && !qs.some((x) => x.symbol === q.toUpperCase()) ? [{ symbol: q.toUpperCase(), name: 'Open ticker', exchange: '', type: '' }] : [];
        html = [...qs, ...direct].map((x) => `<button data-s="${esc(x.symbol)}"><b>${esc(x.symbol)}</b><span>${esc(x.name)}</span><small>${esc([x.exchange, x.type].filter(Boolean).join(' · '))}</small></button>`).join('');
      }
      el.results.innerHTML = html || '<p>No matches</p>';
      el.results.hidden = false;
    }, ADDRESS_RE.test(q) ? 50 : 250);
  });
  el.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = el.results.querySelector('button');
      if (first) select(first.dataset.s);
      el.input.value = '';
      el.results.hidden = true;
      el.input.blur();
    }
    if (e.key === 'Escape') { el.input.value = ''; el.results.hidden = true; el.input.blur(); e.stopPropagation(); }
  });

  // ------------------------------------------------ events
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!e.target.closest('.lt-search')) el.results.hidden = true;
    if (!b || e.target.closest('.lt-ticket, .lt-portfolio, .lt-cli, .lt-axiom')) return;
    if (b.classList.contains('lt-close')) return onClose();
    if (b.dataset.tab) return setTab(b.dataset.tab);
    if (b.classList.contains('lt-radio')) return radio.toggle();
    if (b.dataset.src) return setSource(b.dataset.src);
    if (b.dataset.copy) {
      try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied ✓'; } catch { b.textContent = b.dataset.copy; }
      return;
    }
    if (b.dataset.s) {
      el.results.hidden = true;
      el.input.value = '';
      return isCrypto(b.dataset.s) === (desk.kind === 'memes') ? select(b.dataset.s) : openSymbol(b.dataset.s);
    }
    if (b.dataset.r) { range = b.dataset.r; renderRanges(); return loadChart(); }
    if (b.dataset.k) { kind = b.dataset.k; renderRanges(); return redraw(); }
    if (b === el.star) {
      myList = myList.includes(symbol) ? myList.filter((x) => x !== symbol) : [...myList, symbol].slice(-20);
      saveList(desk.kind, myList);
      renderLists();
      renderHeader();
    }
  });

  el.canvas.addEventListener('pointermove', (e) => {
    const r = el.canvas.getBoundingClientRect();
    hover = { x: e.clientX - r.left, y: e.clientY - r.top };
    redraw();
  });
  el.canvas.addEventListener('pointerleave', () => { hover = null; redraw(); });
  new ResizeObserver(() => open && tab === 'markets' && redraw()).observe(el.canvas.parentElement);

  onQuotes(() => {
    if (!open) return;
    renderTape();
    if (tab === 'markets') { renderLists(); renderHeader(); }
    renderEquity();
    if (tab === 'portfolio') renderPortfolio();
  });
  radio.on((r) => { el.radio.textContent = r.playing ? r.track.name : 'Radio off'; el.radio.parentElement.classList.toggle('on', r.playing); });

  function tickClock() {
    el.ny.textContent = `NY ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })}`;
  }

  return {
    get isOpen() { return open; },
    open({ desk: d, symbol: s, who, view = 'markets', axView, axArg }) {
      open = true;
      setDesk(d || DESKS.stocks);
      if (who) el.desk.textContent = `${desk.desk} · ${who.name}`;
      watch(Object.keys(paper.account.positions));
      renderEquity();
      select(s || desk.symbols[0]);
      setTab(view, axView, axArg);
      refresh();
      tickClock();
      clearInterval(clockTimer);
      clockTimer = setInterval(tickClock, 15000);
      clearInterval(chartTimer);
      chartTimer = setInterval(() => { if (!document.hidden && range === '1d' && tab === 'markets') loadChart(true); }, 60000);
    },
    close() {
      open = false;
      axiom?.close();
      clearInterval(chartTimer);
      clearInterval(clockTimer);
      el.results.hidden = true;
    },
    onKey(e) {
      if (!open) return false;
      if (e.target.closest?.('input, textarea')) return e.key !== 'Escape' || e.target === el.input;
      if (e.key === '/' && tab === 'markets') { e.preventDefault(); el.input.focus(); return true; }
      if (tab === 'markets' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        const all = [...feed, ...myList];
        const i = all.indexOf(symbol);
        select(all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]);
        e.preventDefault();
        return true;
      }
      return false;
    },
  };
}
