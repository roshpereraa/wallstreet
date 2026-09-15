// Paper trading: one play-money account for stocks, meme coins and on-chain tokens.
// Orders fill instantly at the latest quote. Everything lives in this browser's localStorage.

const KEY = 'ws.paper.v1';
export const START_CASH = 100000;
const listeners = new Set();

function fresh() {
  return { cash: START_CASH, positions: {}, history: [], realized: 0, createdAt: Date.now() };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s.cash === 'number' && s.positions) return s;
  } catch { /* storage blocked */ }
  return fresh();
}

let account = load();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(account)); } catch { /* storage blocked */ }
  listeners.forEach((fn) => fn(account));
}

export const paper = {
  get account() { return account; },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  position(symbol) { return account.positions[symbol] || null; },

  // meta: { ticker, name, kind }
  buy(symbol, usd, price, meta = {}) {
    if (!(price > 0)) throw new Error('No live price for this instrument yet.');
    if (!(usd > 0)) throw new Error('Enter an amount to buy.');
    if (usd > account.cash + 1e-9) throw new Error(`Not enough cash. You have $${account.cash.toFixed(2)}.`);
    const qty = usd / price;
    const pos = account.positions[symbol] || { qty: 0, cost: 0, ...meta };
    pos.cost = (pos.cost * pos.qty + usd) / (pos.qty + qty);
    pos.qty += qty;
    Object.assign(pos, meta);
    account.positions[symbol] = pos;
    account.cash -= usd;
    return record('BUY', symbol, qty, price, meta);
  },

  sell(symbol, qty, price, meta = {}) {
    const pos = account.positions[symbol];
    if (!pos || pos.qty <= 0) throw new Error("You don't hold this.");
    if (!(price > 0)) throw new Error('No live price for this instrument yet.');
    qty = Math.min(qty, pos.qty);
    if (!(qty > 0)) throw new Error('Enter an amount to sell.');
    const usd = qty * price;
    account.realized += (price - pos.cost) * qty;
    pos.qty -= qty;
    account.cash += usd;
    if (pos.qty * price < 0.005) delete account.positions[symbol];
    return record('SELL', symbol, qty, price, { ...pos, ...meta });
  },

  equity(priceOf) {
    let value = 0;
    for (const [s, p] of Object.entries(account.positions)) value += p.qty * (priceOf(s) ?? p.cost);
    return { cash: account.cash, holdings: value, total: account.cash + value, pnl: account.cash + value - START_CASH };
  },

  reset() {
    account = fresh();
    persist();
  },
};

function record(side, symbol, qty, price, meta) {
  const trade = { t: Date.now(), side, symbol, ticker: meta.ticker || symbol, kind: meta.kind || 'stock', qty, price, value: qty * price };
  account.history.unshift(trade);
  account.history = account.history.slice(0, 200);
  persist();
  return trade;
}
