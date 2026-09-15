// Axiom-style trading simulator: a fake SOL wallet that trades real, live pools.
// Fills model an AMM (constant product): bigger orders against thinner pools get worse prices,
// plus a platform fee and a priority fee, so the numbers feel like the real thing.

const KEY = 'ws.axiom.v1';
export const START_SOL = 10;
export const PLATFORM_FEE = 0.01; // 1% per trade, similar to trading terminals
const listeners = new Set();

const fresh = () => ({
  sol: START_SOL,
  positions: {},
  history: [],
  realizedSol: 0,
  feesSol: 0,
  slippageUsd: 0,
  settings: { slippage: 15, priority: 0.001, buyPresets: [0.1, 0.5, 1, 2], sellPresets: [25, 50, 100] },
  coach: [],
  lessons: {},
  createdAt: Date.now(),
});

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s.sol === 'number') return { ...fresh(), ...s, settings: { ...fresh().settings, ...s.settings } };
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
  const impact = ((gross - out) / gross) * 100;
  return { usdOut: out - fee, avgPrice: out / tokens, impact, feeUsd: fee, slippageUsd: gross - out };
}

export const sim = {
  get wallet() { return w; },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  position: (symbol) => w.positions[symbol] || null,
  setSetting(k, v) { w.settings[k] = v; save(); },
  markLesson(id) { w.lessons[id] = true; save(); },

  buy({ symbol, sol, quote, solPrice, scan }) {
    if (!(sol > 0)) throw new Error('Enter how much SOL to spend.');
    if (!(quote?.price > 0)) throw new Error('No live price for this token right now.');
    if (!(solPrice > 0)) throw new Error('Waiting for the SOL price…');
    const priority = w.settings.priority;
    if (sol + priority > w.sol + 1e-9) throw new Error(`Not enough SOL. You have ◎${w.sol.toFixed(3)} (priority fee ◎${priority}).`);
    const q = quoteBuy({ usdIn: sol * solPrice, price: quote.price, liquidity: quote.liquidity });
    if (q.impact > w.settings.slippage) {
      coach('bad', `Order failed: price impact ${q.impact.toFixed(1)}% is above your ${w.settings.slippage}% slippage limit. On a real terminal this transaction would revert (and you'd still pay the priority fee). Try a smaller size or a deeper pool.`);
      w.sol -= priority;
      w.feesSol += priority;
      save();
      throw new Error(`Slippage exceeded: ${q.impact.toFixed(1)}% impact > ${w.settings.slippage}% limit. Priority fee still charged.`);
    }
    const pos = w.positions[symbol] || { tokens: 0, costSol: 0, costUsd: 0, ticker: quote.ticker, name: quote.name, network: quote.network, firstBuy: Date.now() };
    pos.tokens += q.tokens;
    pos.costSol += sol + priority;
    pos.costUsd += sol * solPrice;
    pos.ticker = quote.ticker;
    w.positions[symbol] = pos;
    w.sol -= sol + priority;
    w.feesSol += priority + q.feeUsd / solPrice;
    w.slippageUsd += q.slippageUsd;
    const trade = record('BUY', symbol, quote, { sol, tokens: q.tokens, price: q.avgPrice, impact: q.impact, feeUsd: q.feeUsd, solPrice });
    coachBuy({ sol, q, quote, scan, pos });
    save();
    return trade;
  },

  sell({ symbol, pct, quote, solPrice }) {
    const pos = w.positions[symbol];
    if (!pos) throw new Error("You don't hold this token.");
    if (!(quote?.price > 0) || !(solPrice > 0)) throw new Error('No live price right now.');
    const tokens = pos.tokens * Math.min(100, pct) / 100;
    const q = quoteSell({ tokens, price: quote.price, liquidity: quote.liquidity });
    const priority = w.settings.priority;
    const solOut = q.usdOut / solPrice - priority;
    const costShare = pos.costSol * (tokens / pos.tokens);
    const pnlSol = solOut - costShare;
    pos.tokens -= tokens;
    pos.costSol -= costShare;
    pos.costUsd -= pos.costUsd * (tokens / (pos.tokens + tokens));
    if (pos.tokens * quote.price < 0.01 || pct >= 100) delete w.positions[symbol];
    w.sol += Math.max(0, solOut);
    w.realizedSol += pnlSol;
    w.feesSol += priority + q.feeUsd / solPrice;
    w.slippageUsd += q.slippageUsd;
    const trade = record('SELL', symbol, quote, { sol: solOut, tokens, price: q.avgPrice, impact: q.impact, feeUsd: q.feeUsd, pnlSol, solPrice });
    coachSell({ pct, pnlSol, costShare, q, held: Date.now() - (pos.firstBuy || Date.now()) });
    save();
    return trade;
  },

  stats() {
    const sells = w.history.filter((t) => t.side === 'SELL');
    const wins = sells.filter((t) => t.pnlSol > 0);
    const best = sells.reduce((a, t) => (t.pnlSol > (a?.pnlSol ?? -Infinity) ? t : a), null);
    const worst = sells.reduce((a, t) => (t.pnlSol < (a?.pnlSol ?? Infinity) ? t : a), null);
    return { trades: w.history.length, closed: sells.length, winRate: sells.length ? (wins.length / sells.length) * 100 : null, best, worst };
  },

  reset() { w = fresh(); save(); },
};

function record(side, symbol, quote, d) {
  const t = { t: Date.now(), side, symbol, ticker: quote.ticker, network: quote.network, ...d };
  w.history.unshift(t);
  w.history = w.history.slice(0, 150);
  return t;
}

function coach(tone, text) {
  w.coach.unshift({ t: Date.now(), tone, text });
  w.coach = w.coach.slice(0, 40);
}

function coachBuy({ sol, q, quote, scan, pos }) {
  const total = w.sol + sol;
  const share = (sol / total) * 100;
  const notes = [];
  if (share > 25) notes.push(`you put ${share.toFixed(0)}% of your wallet into one memecoin. Pros rarely risk more than 1–5% per trade`);
  if (q.impact > 5) notes.push(`price impact was ${q.impact.toFixed(1)}%, so you instantly lost that vs the chart price`);
  if (scan?.score >= 65) notes.push(`the scanner rated this ${scan.level.toLowerCase()} (${scan.score}/100)`);
  const bad = scan?.checks?.filter((c) => c.status === 'bad').map((c) => c.title.toLowerCase()) || [];
  if (bad.length) notes.push(`red flags: ${bad.slice(0, 3).join(', ')}`);
  if (!scan) notes.push('you traded without scanning first. Get in the habit of checking liquidity, holders and authorities');
  if ((quote.changePct ?? 0) > 300) notes.push(`it was already up ${quote.changePct.toFixed(0)}% today, which is often late`);
  if (notes.length) coach(notes.length > 2 ? 'bad' : 'warn', `Bought ${quote.ticker}: ${notes.join('; ')}.`);
  else coach('ok', `Bought ${quote.ticker} with a sensible size and a clean scan. Now decide your exit before the price moves: where you take profit, and where you cut the loss.`);
  if (pos.costSol > sol + 0.0011) coach('warn', `You added to an existing ${quote.ticker} position. Averaging into a falling memecoin is how small losses become big ones.`);
}

function coachSell({ pct, pnlSol, costShare, q, held }) {
  const pnlPct = costShare ? (pnlSol / costShare) * 100 : 0;
  const mins = held / 60000;
  if (pnlSol > 0 && pct < 100) coach('ok', `Took partial profit (+${pnlPct.toFixed(0)}%). Selling some into strength and letting the rest ride is a solid habit.`);
  else if (pnlSol > 0) coach('ok', `Closed for +${pnlPct.toFixed(0)}%. Nobody goes broke taking profits. Fees and slippage took about $${(q.feeUsd + q.slippageUsd).toFixed(2)} of it.`);
  else if (pnlPct < -50) coach('bad', `Closed at ${pnlPct.toFixed(0)}%. Deep losses usually come from no stop-loss plan. Next time pick an exit (e.g. -20%) before you buy.`);
  else coach('warn', `Cut the trade at ${pnlPct.toFixed(0)}%. Taking small losses early is a skill: it keeps you in the game.`);
  if (mins < 2) coach('warn', 'That trade lasted under 2 minutes. Fast flips pay fees and slippage twice; make sure the move is worth it.');
}

export const LESSONS = [
  { id: 'liquidity', title: 'Liquidity & exits', body: 'Liquidity is the money in the pool. You buy from it and sell back into it. Thin pools mean big price moves when you trade, and a creator who pulls the pool (a rug pull) leaves holders with tokens nobody can buy.' },
  { id: 'slippage', title: 'Slippage & price impact', body: 'Your order moves the price. In the sim, buying $1,000 from a pool with $10,000 of liquidity pushes your average price up about 20%. The slippage setting is the most you’ll accept; above it the order fails and you still pay the priority fee.' },
  { id: 'curve', title: 'Bonding curves & migration', body: 'Launchpads like pump.fun and pons.family sell tokens on a bonding curve: the price rises as people buy. When the curve fills, the token “migrates” to a normal DEX pool. Pulse shows New pairs → Final stretch → Migrated.' },
  { id: 'rugs', title: 'Spotting rugs & honeypots', body: 'Red flags: mint authority still on (more tokens can be printed), freeze authority on (your tokens can be frozen), top 10 wallets holding most of the supply, brand-new pools with tiny liquidity, and lots of buys but no sells.' },
  { id: 'sizing', title: 'Position sizing', body: 'Most memecoins go to zero. Risking 1–5% of your wallet per trade means one bad pick can’t wipe you out. The coach flags trades bigger than 25% of your wallet.' },
  { id: 'exits', title: 'Plan your exit', body: 'Decide before buying: take profit at a target (for example sell half at 2x) and cut losses at a stop (for example -25%). Fees and slippage apply on the way out too.' },
];
