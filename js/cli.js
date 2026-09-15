// Command-line terminal inside the laptop: quotes, CA lookups, feeds and paper orders by typing.
import { fmtPrice, fmtPct, fmtUsd, fmtQty, fmtVol } from './market.js';
import { START_CASH } from './paper.js';
import { scan } from './axiom/scan.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const HELP = [
  ['help', 'show this list'],
  ['price <ticker|CA>', 'latest price · e.g. price NVDA, price 0x39db…'],
  ['ca <address>', 'look up any token by contract address'],
  ['open <ticker|CA>', 'open the chart'],
  ['buy <ticker|CA> <$amount|qty>', 'paper buy · e.g. buy PEPE $250, buy AAPL 5'],
  ['sell <ticker|CA> <qty|$amount|50%|all>', 'paper sell'],
  ['scan <CA|ticker>', 'Dex Scanner safety report (risk score + red flags)'],
  ['axiom', 'open the Axiom trading sim (fake SOL)'],
  ['pf', 'portfolio and P&L'],
  ['history', 'recent paper trades'],
  ['pons · hood · axiom · majors', 'top of each meme feed'],
  ['music [on|off|next]', 'lo-fi radio'],
  ['reset confirm', `reset the paper account to ${fmtUsd(START_CASH)}`],
  ['clear', 'clear the screen'],
];

export function createCli(root, api) {
  root.innerHTML = `
    <div class="cli-out" aria-live="polite"></div>
    <form class="cli-form"><span class="cli-prompt">anon@wallst:~$</span><input class="cli-in" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Command"></form>`;
  const out = root.querySelector('.cli-out');
  const input = root.querySelector('.cli-in');
  const past = [];
  let cursor = 0;

  const print = (html, cls = '') => {
    const line = document.createElement('div');
    line.className = `cli-line ${cls}`;
    line.innerHTML = html;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  };
  const row = (cells) => `<span class="cli-row">${cells.map((c) => `<span>${c}</span>`).join('')}</span>`;
  const colored = (v, text) => `<span class="${v >= 0 ? 'up' : 'down'}">${text}</span>`;

  print('<span class="cli-accent">WALL ST. TERMINAL v1.0</span> · paper trading · live data');
  print('Type <b>help</b> for commands. Try <b>pons</b>, <b>price NVDA</b> or <b>buy DOGE $100</b>.', 'dim');

  async function need(q) {
    if (!q) throw new Error('Which ticker or contract address?');
    const symbol = await api.resolve(q);
    if (!symbol) throw new Error(`Couldn't find "${q}".`);
    const quote = await api.quote(symbol);
    if (!quote?.price) throw new Error(`No live price for ${api.label(symbol)} right now.`);
    return { symbol, quote };
  }

  function describe(symbol, q) {
    const bits = [`<b>${esc(api.label(symbol))}</b>`, esc(q.name || ''), `${fmtPrice(q.price, symbol)}`, colored(q.changePct ?? 0, fmtPct(q.changePct))];
    if (q.network) bits.push(`<span class="dim">${esc(q.network)} · ${esc(q.dex || '')}</span>`);
    if (q.liquidity) bits.push(`liq $${fmtVol(q.liquidity)}`);
    if (q.marketCap) bits.push(`mcap $${fmtVol(q.marketCap)}`);
    return bits.join('  ');
  }

  function parseAmount(raw, holding, price) {
    if (!raw) throw new Error('Add an amount, e.g. $100 or 10.');
    const s = raw.toLowerCase();
    if (s === 'all' || s === 'max') return { qty: holding };
    if (s.endsWith('%')) return { qty: (holding * Math.min(100, parseFloat(s))) / 100 };
    if (s.startsWith('$')) return { usd: parseFloat(s.slice(1).replace(/,/g, '')) };
    const n = parseFloat(s.replace(/,/g, ''));
    if (!(n > 0)) throw new Error(`"${raw}" isn't an amount.`);
    return { qty: n, usd: n * price };
  }

  const commands = {
    help() { HELP.forEach(([c, d]) => print(row([`<b>${esc(c)}</b>`, `<span class="dim">${esc(d)}</span>`]))); },
    clear() { out.innerHTML = ''; },

    async price([q]) {
      const { symbol, quote } = await need(q);
      print(describe(symbol, quote));
    },
    async ca([addr]) {
      if (!addr) throw new Error('Paste a contract address: ca 0x…');
      const found = await api.lookup(addr);
      if (!found.length) throw new Error('No pools found for that address.');
      found.slice(0, 5).forEach((q) => print(describe(q.symbol, q)));
      api.open(found[0].symbol);
      print('Opened the chart in Markets.', 'dim');
    },
    async scan([q]) {
      if (!q) throw new Error('Paste a contract address or ticker: scan <CA>');
      print('Scanning…', 'dim');
      let target = q;
      if (!q.startsWith('dex:')) {
        const found = await api.lookup(q);
        if (!found.length) throw new Error('No on-chain pools found for that.');
        target = found[0].symbol;
      }
      const r = await scan({ symbol: target });
      const cls = r.score < 45 ? 'up' : 'down';
      print(`<b>${esc(r.token.ticker)}</b> on ${esc(r.token.network)}  risk <span class="${cls}">${r.score}/100 · ${esc(r.level)}</span>`);
      r.checks.filter((c) => c.status !== 'ok').forEach((c) => print(`  ${c.status === 'bad' ? '<span class="down">✗</span>' : c.status === 'warn' ? '⚠' : '?'} ${esc(c.title)}: ${esc(c.detail)}`));
      print('Full report opened in Axiom Sim → Dex Scanner.', 'dim');
      api.axiom('scanner', target);
    },
    axiom() { api.axiom('pulse'); },

    async open([q]) {
      const { symbol } = await need(q);
      api.open(symbol);
    },

    async buy([q, amount]) {
      const { symbol, quote } = await need(q);
      const a = parseAmount(amount, 0, quote.price);
      const usd = a.usd ?? a.qty * quote.price;
      const t = api.paper.buy(symbol, usd, quote.price, api.meta(symbol));
      print(`<span class="up">BOUGHT</span> ${fmtQty(t.qty)} ${esc(t.ticker)} @ ${fmtPrice(t.price, symbol)} = ${fmtUsd(t.value)}  <span class="dim">cash ${fmtUsd(api.paper.account.cash)}</span>`);
    },
    async sell([q, amount]) {
      const { symbol, quote } = await need(q);
      const pos = api.paper.position(symbol);
      if (!pos) throw new Error(`You don't hold ${api.label(symbol)}.`);
      const a = parseAmount(amount || 'all', pos.qty, quote.price);
      const qty = a.qty ?? a.usd / quote.price;
      const t = api.paper.sell(symbol, qty, quote.price, api.meta(symbol));
      const pnl = (t.price - pos.cost) * t.qty;
      print(`<span class="down">SOLD</span> ${fmtQty(t.qty)} ${esc(t.ticker)} @ ${fmtPrice(t.price, symbol)} = ${fmtUsd(t.value)}  P&L ${colored(pnl, fmtUsd(pnl))}`);
    },

    async pf() {
      const acct = api.paper.account;
      const symbols = Object.keys(acct.positions);
      await Promise.all(symbols.map((s) => api.quote(s)));
      const eq = api.paper.equity((s) => api.price(s));
      print(`Equity <b>${fmtUsd(eq.total)}</b>  cash ${fmtUsd(eq.cash)}  holdings ${fmtUsd(eq.holdings)}  P&L ${colored(eq.pnl, `${fmtUsd(eq.pnl)} (${fmtPct((eq.pnl / START_CASH) * 100)})`)}`);
      if (!symbols.length) return print('No open positions. Try: buy NVDA $1000', 'dim');
      symbols.forEach((s) => {
        const p = acct.positions[s], px = api.price(s) ?? p.cost, pnl = (px - p.cost) * p.qty;
        print(row([`<b>${esc(p.ticker || api.label(s))}</b>`, fmtQty(p.qty), `avg ${fmtPrice(p.cost, s)}`, `now ${fmtPrice(px, s)}`, fmtUsd(p.qty * px), colored(pnl, `${fmtUsd(pnl)} ${fmtPct(((px - p.cost) / p.cost) * 100)}`)]));
      });
    },
    portfolio(args) { return commands.pf(args); },
    history() {
      const h = api.paper.account.history.slice(0, 15);
      if (!h.length) return print('No trades yet.', 'dim');
      h.forEach((t) => print(row([new Date(t.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), t.side === 'BUY' ? '<span class="up">BUY</span>' : '<span class="down">SELL</span>', `<b>${esc(t.ticker)}</b>`, fmtQty(t.qty), `@ ${fmtPrice(t.price, t.symbol)}`, fmtUsd(t.value)])));
    },

    async feed(view) {
      print(`Loading ${view}…`, 'dim');
      const symbols = await api.feed(view);
      symbols.slice(0, 10).forEach((s, i) => {
        const q = api.get(s) || {};
        print(row([`${String(i + 1).padStart(2, ' ')}.`, `<b>${esc(api.label(s))}</b>`, fmtPrice(q.price, s), colored(q.changePct ?? 0, fmtPct(q.changePct)), q.volume ? `vol $${fmtVol(q.volume)}` : '', q.liquidity ? `liq $${fmtVol(q.liquidity)}` : '']));
      });
      print('Open one with: open &lt;ticker&gt;', 'dim');
    },
    pons() { return commands.feed('pons'); },
    hood() { return commands.feed('robinhood'); },
    axiom() { return commands.feed('axiom'); },
    majors() { return commands.feed('majors'); },

    music([arg]) {
      if (arg === 'next') api.radio.next();
      else if (arg === 'off') api.radio.pause();
      else if (arg === 'on' || !api.radio.playing) api.radio.play();
      else api.radio.pause();
      setTimeout(() => print(api.radio.playing ? `♫ now playing: ${esc(api.radio.track.name)}` : '♫ radio off', 'dim'), 50);
    },
    reset([arg]) {
      if (arg !== 'confirm') return print('This wipes your paper account. Type <b>reset confirm</b> to do it.', 'dim');
      api.paper.reset();
      print(`Paper account reset to ${fmtUsd(START_CASH)}.`);
    },
  };

  root.querySelector('.cli-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const line = input.value.trim();
    input.value = '';
    if (!line) return;
    past.push(line);
    cursor = past.length;
    print(`<span class="cli-prompt">$</span> ${esc(line)}`, 'echo');
    const [cmd, ...args] = line.split(/\s+/);
    const fn = commands[cmd.toLowerCase()];
    if (!fn) return print(`Unknown command "${esc(cmd)}". Type <b>help</b>.`, 'err');
    input.disabled = true;
    try { await fn(args); } catch (err) { print(esc(err.message || 'Something went wrong.'), 'err'); }
    input.disabled = false;
    input.focus();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && cursor > 0) { input.value = past[--cursor]; e.preventDefault(); }
    if (e.key === 'ArrowDown') { cursor = Math.min(past.length, cursor + 1); input.value = past[cursor] || ''; e.preventDefault(); }
    if (e.key !== 'Escape') e.stopPropagation();
  });
  root.addEventListener('click', () => { if (!getSelection().toString()) input.focus(); });

  return { focus: () => input.focus(), print };
}
