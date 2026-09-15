// Axiom-style trading simulator: fake native-coin wallets (SOL, ETH, BNB) that trade real, live pools.
// Fills model an AMM (constant product): bigger orders against thinner pools get worse prices,
// plus a platform fee and a priority fee, so the numbers feel like the real thing.

const KEY = 'ws.axiom.v2';
export const PLATFORM_FEE = 0.01; // 1% per trade, similar to trading terminals
export const START = { SOL: 10, ETH: 0.5, BNB: 2 };
export const NATIVE_QUOTE = { SOL: 'SOL-USD', ETH: 'ETH-USD', BNB: 'BNB-USD' };
export const ICON = { SOL: '◎', ETH: 'Ξ', BNB: 'ⓑ' };
const PRESETS = { SOL: [0.1, 0.5, 1, 2], ETH: [0.005, 0.01, 0.02, 0.05], BNB: [0.02, 0.05, 0.1, 0.25] };
const PRIORITY = { SOL: 0.001, ETH: 0.0002, BNB: 0.0005 };
const listeners = new Set();

export const nativeOf = (network) => (network === 'solana' ? 'SOL' : network === 'bsc' ? 'BNB' : 'ETH');

const fresh = () => ({
  bal: { ...START },
  positions: {},   // symbol -> { tokens, cost, cur, ticker, name, network, firstBuy }
  tokenStats: {},  // symbol -> { bought, sold, cur, buys, sells } (kept after closing, like Axiom's PnL box)
  history: [],
  realizedUsd: 0,
  feesUsd: 0,
  slippageUsd: 0,
  settings: { slippage: 15, sellPresets: [25, 50, 75, 100], buyPresets: { ...PRESETS }, priority: { ...PRIORITY } },
  coach: [],
  lessons: {},
  createdAt: Date.now(),
});

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.bal) {
      const f = fresh();
      return { ...f, ...s, settings: { ...f.settings, ...s.settings, buyPresets: { ...f.settings.buyPresets, ...s.settings?.buyPresets }, priority: { ...f.settings.priority, ...s.settings?.priority } } };
    }
  } catch { /* storage blocked */ }
  return fresh();
}

let w = load();
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(w)); } catch { /* storage blocked */ }
  listeners.forEach((fn) => fn(w));
};

// Constant-product price impact. Quote-side reserve ≈ half the pool's USD liquidity.
// Pools with no reported liquidity are treated as very thin ($2K) rather than bottomless.
const reserveOf = (liquidity) => Math.max(liquidity > 0 ? liquidity : 2000, 200) / 2;

export function quoteBuy({ usdIn, price, liquidity }) {
  const reserve = reserveOf(liquidity);
  const fee = usdIn * PLATFORM_FEE;
  const net = usdIn - fee;
  const avgPrice = price * (1 + net / reserve);
  const tokens = net / avgPrice;
  const impact = ((avgPrice - price) / price) * 100;
  return { tokens, avgPrice, impact, feeUsd: fee, slippageUsd: net - tokens * price };
}

export function quoteSell({ tokens, price, liquidity }) {
  const reserve = reserveOf(liquidity);
  const gross = tokens * price;
  const out = gross / (1 + gross / reserve);
  const fee = out * PLATFORM_FEE;
  const impact = gross ? ((gross - out) / gross) * 100 : 0;
  return { usdOut: out - fee, avgPrice: tokens ? out / tokens : price, impact, feeUsd: fee, slippageUsd: gross - out };
}

const fmtN = (v, cur) => `${ICON[cur]}${Number(v).toFixed(cur === 'SOL' ? 3 : 4)}`;

export const sim = {
  get wallet() { return w; },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  position: (symbol) => w.positions[symbol] || null,
  stats: (symbol) => w.tokenStats[symbol] || null,
  presets: (cur) => w.settings.buyPresets[cur] || PRESETS[cur],
  priority: (cur) => w.settings.priority[cur] ?? PRIORITY[cur],
  setSlippage(v) { w.settings.slippage = v; save(); },
  setPriority(cur, v) { w.settings.priority[cur] = v; save(); },
  markLesson(id) { w.lessons[id] = true; save(); },

  buy({ symbol, amount, quote, nativePrice, scan }) {
    const cur = nativeOf(quote?.network);
    if (!(amount > 0)) throw new Error(`Enter how much ${cur} to spend.`);
    if (!(quote?.price > 0)) throw new Error('No live price for this token right now.');
    if (!(nativePrice > 0)) throw new Error(`Waiting for the ${cur} price…`);
    const priority = sim.priority(cur);
    if (amount + priority > w.bal[cur] + 1e-12) throw new Error(`Not enough ${cur}. You have ${fmtN(w.bal[cur], cur)} (priority fee ${ICON[cur]}${priority}).`);
    const q = quoteBuy({ usdIn: amount * nativePrice, price: quote.price, liquidity: quote.liquidity });
    if (q.impact > w.settings.slippage) {
      coach('bad', `Order failed: price impact ${q.impact.toFixed(1)}% is above your ${w.settings.slippage}% slippage limit. On a real terminal this transaction reverts and you still pay the priority fee. Try a smaller size or a deeper pool.`);
      w.bal[cur] -= priority;
      w.feesUsd += priority * nativePrice;
      save();
      throw new Error(`Slippage exceeded: ${q.impact.toFixed(1)}% impact > ${w.settings.slippage}% limit. Priority fee still charged.`);
    }
    const pos = w.positions[symbol] || { tokens: 0, cost: 0, cur, ticker: quote.ticker, name: quote.name, network: quote.network, firstBuy: Date.now() };
    const hadPosition = pos.tokens > 0;
    pos.tokens += q.tokens;
    pos.cost += amount + priority;
    pos.ticker = quote.ticker;
    w.positions[symbol] = pos;
    const st = (w.tokenStats[symbol] ||= { bought: 0, sold: 0, cur, buys: 0, sells: 0 });
    st.bought += amount + priority;
    st.buys++;
    w.bal[cur] -= amount + priority;
    w.feesUsd += priority * nativePrice + q.feeUsd;
    w.slippageUsd += q.slippageUsd;
    const trade = record('BUY', symbol, quote, { cur, amount, tokens: q.tokens, price: q.avgPrice, impact: q.impact, nativePrice, mc: quote.marketCap });
    coachBuy({ amount, cur, q, quote, scan, hadPosition });
    save();
    return trade;
  },

  sell({ symbol, pct, quote, nativePrice }) {
    const pos = w.positions[symbol];
    if (!pos) throw new Error("You don't hold this token.");
    const cur = pos.cur;
    if (!(quote?.price > 0) || !(nativePrice > 0)) throw new Error('No live price right now.');
    const tokens = (pos.tokens * Math.min(100, pct)) / 100;
    const q = quoteSell({ tokens, price: quote.price, liquidity: quote.liquidity });
    const priority = sim.priority(cur);
    const out = Math.max(0, q.usdOut / nativePrice - priority);
    const costShare = pos.cost * (tokens / pos.tokens);
    const pnl = out - costShare;
    pos.tokens -= tokens;
    pos.cost -= costShare;
    if (pos.tokens * quote.price < 0.01 || pct >= 100) delete w.positions[symbol];
    const st = (w.tokenStats[symbol] ||= { bought: 0, sold: 0, cur, buys: 0, sells: 0 });
    st.sold += out;
    st.sells++;
    w.bal[cur] += out;
    w.realizedUsd += pnl * nativePrice;
    w.feesUsd += priority * nativePrice + q.feeUsd;
    w.slippageUsd += q.slippageUsd;
    const trade = record('SELL', symbol, quote, { cur, amount: out, tokens, price: q.avgPrice, impact: q.impact, pnl, nativePrice, mc: quote.marketCap });
    coachSell({ pct, pnl, costShare, q, held: Date.now() - (pos.firstBuy || Date.now()) });
    save();
    return trade;
  },

  summary() {
    const sells = w.history.filter((t) => t.side === 'SELL');
    const wins = sells.filter((t) => t.pnl > 0);
    return { trades: w.history.length, closed: sells.length, winRate: sells.length ? (wins.length / sells.length) * 100 : null };
  },

  reset() { w = fresh(); save(); },
};

function record(side, symbol, quote, d) {
  const t = { t: Date.now(), side, symbol, ticker: quote.ticker, network: quote.network, ...d };
  w.history.unshift(t);
  w.history = w.history.slice(0, 200);
  return t;
}

function coach(tone, text) {
  w.coach.unshift({ t: Date.now(), tone, text });
  w.coach = w.coach.slice(0, 40);
}

function coachBuy({ amount, cur, q, quote, scan, hadPosition }) {
  const share = (amount / (w.bal[cur] + amount)) * 100;
  const notes = [];
  if (share > 25) notes.push(`you put ${share.toFixed(0)}% of your ${cur} into one memecoin. Pros rarely risk more than 1–5% per trade`);
  if (q.impact > 5) notes.push(`price impact was ${q.impact.toFixed(1)}%, so you instantly lost that vs the chart price`);
  if (scan?.score >= 65) notes.push(`the scanner rated this ${scan.level.toLowerCase()} (${scan.score}/100)`);
  const bad = scan?.checks?.filter((c) => c.status === 'bad').map((c) => c.title.toLowerCase()) || [];
  if (bad.length) notes.push(`red flags: ${bad.slice(0, 3).join(', ')}`);
  if (!scan) notes.push('you traded without scanning first. Check liquidity, holders and authorities before you buy');
  if ((quote.changePct ?? 0) > 300) notes.push(`it was already up ${quote.changePct.toFixed(0)}% today, which is often late`);
  if (notes.length) coach(notes.length > 2 ? 'bad' : 'warn', `Bought ${quote.ticker}: ${notes.join('; ')}.`);
  else coach('ok', `Bought ${quote.ticker} with a sensible size and a clean scan. Decide your exit now: where you take profit, and where you cut the loss.`);
  if (hadPosition) coach('warn', `You added to an existing ${quote.ticker} position. Averaging into a falling memecoin is how small losses become big ones.`);
}

function coachSell({ pct, pnl, costShare, q, held }) {
  const pnlPct = costShare ? (pnl / costShare) * 100 : 0;
  if (pnl > 0 && pct < 100) coach('ok', `Took partial profit (+${pnlPct.toFixed(0)}%). Selling some into strength and letting the rest ride is a solid habit.`);
  else if (pnl > 0) coach('ok', `Closed for +${pnlPct.toFixed(0)}%. Nobody goes broke taking profits. Fees and slippage took about $${(q.feeUsd + q.slippageUsd).toFixed(2)} of it.`);
  else if (pnlPct < -50) coach('bad', `Closed at ${pnlPct.toFixed(0)}%. Deep losses usually come from having no stop-loss plan. Next time pick an exit (e.g. -20%) before you buy.`);
  else coach('warn', `Cut the trade at ${pnlPct.toFixed(0)}%. Taking small losses early is a skill: it keeps you in the game.`);
  if (held < 120000) coach('warn', 'That trade lasted under 2 minutes. Fast flips pay fees and slippage twice; make sure the move is worth it.');
}

export const LESSONS = [
  { id: 'liquidity', title: 'Liquidity & exits', body: 'Liquidity is the money in the pool. You buy from it and sell back into it. Thin pools mean big price moves when you trade, and a creator who pulls the pool (a rug pull) leaves holders with tokens nobody can buy.' },
  { id: 'slippage', title: 'Slippage & price impact', body: 'Your order moves the price. Buying $1,000 from a pool with $10,000 of liquidity pushes your average price up about 20%. The slippage setting is the most you’ll accept; above it the order fails and you still pay the priority fee.' },
  { id: 'curve', title: 'Bonding curves & migration', body: 'Launchpads like pump.fun and pons.family sell tokens on a bonding curve: the price rises as people buy. When the curve fills, the token “migrates” to a normal DEX pool. Pulse shows New pairs → Final stretch → Migrated.' },
  { id: 'rugs', title: 'Spotting rugs & honeypots', body: 'Red flags: mint authority still on (more tokens can be printed), freeze authority on (your tokens can be frozen), liquidity not locked, top wallets holding most of the supply, sell taxes, and lots of buys but no sells.' },
  { id: 'sizing', title: 'Position sizing', body: 'Most memecoins go to zero. Risking 1–5% of your wallet per trade means one bad pick can’t wipe you out. The coach flags trades bigger than 25% of your balance.' },
  { id: 'charts', title: 'Reading 1s–1D candles', body: 'Short timeframes (1s, 1m) show every burst of buying and selling and are noisy. 15m–1h shows the trend; 1D shows whether a token has survived. Watch volume bars: price moving up on falling volume often fades.' },
  { id: 'exits', title: 'Plan your exit', body: 'Decide before buying: take profit at a target (for example sell half at 2x) and cut losses at a stop (for example -25%). Fees and slippage apply on the way out too. Your PnL box shows it live.' },
];
