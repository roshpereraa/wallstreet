// Client for the /api functions. Quotes are pooled: the room and the terminal ask for
// symbols, and batched requests refresh them all. Stocks come from /api/quotes,
// meme coins (symbols starting "cg:") from /api/memes, on-chain pools ("dex:") from /api/dex.
import { setTicker, isMeme, isDex, dexParts } from './data.js';

const cache = new Map(); // symbol -> quote
const wanted = new Set();
const listeners = new Set();
let timer = null;
let inflight = null;

export const quotes = cache;

export function watch(symbols) {
  let added = false;
  for (const s of symbols) if (!wanted.has(s)) { wanted.add(s); added = true; }
  if (added) refresh();
}

export function onQuotes(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

export async function refresh() {
  if (inflight) return inflight;
  const list = [...wanted];
  if (!list.length) return;
  inflight = (async () => {
    const stocks = list.filter((s) => !isMeme(s) && !isDex(s));
    const memes = list.filter(isMeme).map((s) => s.slice(3));
    const pools = list.filter(isDex).map((s) => s.slice(4));
    const jobs = [];
    for (let i = 0; i < stocks.length; i += 40) {
      jobs.push(getJSON(`/api/quotes?symbols=${encodeURIComponent(stocks.slice(i, i + 40).join(','))}`));
    }
    if (memes.length) jobs.push(getJSON(`/api/memes?ids=${encodeURIComponent(memes.join(','))}`));
    for (let i = 0; i < pools.length; i += 40) {
      jobs.push(getJSON(`/api/dex?op=quotes&ids=${encodeURIComponent(pools.slice(i, i + 40).join(','))}`));
    }
    const results = await Promise.allSettled(jobs);
    for (const r of results) if (r.status === 'fulfilled') store(r.value.quotes);
    listeners.forEach((fn) => fn(cache));
    inflight = null;
  })();
  return inflight;
}

export function storeQuotes(list = []) { store(list); listeners.forEach((fn) => fn(cache)); }

function store(list = []) {
  for (const q of list) {
    if (!q || q.error) continue;
    if (q.change == null && q.changePct != null && q.price) {
      q.prevClose = q.price / (1 + q.changePct / 100);
      q.change = q.price - q.prevClose;
    }
    // don't let a source with missing fields wipe values another source already provided
    const next = { ...cache.get(q.symbol) };
    for (const [k, v] of Object.entries(q)) if (v != null && !(k === 'liquidity' && v === 0 && next.liquidity)) next[k] = v;
    cache.set(q.symbol, next);
    if (q.ticker) setTicker(q.symbol, q.ticker);
  }
}

// Load a meme-desk feed (pons / robinhood / axiom) straight into the quote pool
export async function dexList(view) {
  const d = await getJSON(`/api/dex?op=list&view=${view}`);
  store(d.quotes);
  listeners.forEach((fn) => fn(cache));
  return d.quotes.map((q) => q.symbol);
}

// Contract address, pair address, ticker or name → matching on-chain tokens
export async function dexLookup(q) {
  const d = await getJSON(`/api/dex?op=lookup&q=${encodeURIComponent(q)}`).catch(() => ({ quotes: [] }));
  store(d.quotes);
  return d.quotes || [];
}

// Latest price for one instrument, fetched fresh (used when placing paper orders)
export async function quoteNow(symbol) {
  try {
    const url = isDex(symbol) ? `/api/dex?op=quotes&ids=${encodeURIComponent(symbol.slice(4))}`
      : isMeme(symbol) ? `/api/memes?ids=${encodeURIComponent(symbol.slice(3))}`
      : `/api/quotes?symbols=${encodeURIComponent(symbol)}`;
    store((await getJSON(url)).quotes);
  } catch { /* fall back to the cached quote */ }
  return cache.get(symbol) || null;
}

export function startPolling(ms = 20000) {
  clearInterval(timer);
  timer = setInterval(() => { if (!document.hidden) refresh(); }, ms);
}

export async function getChart(symbol, range) {
  const { network, pool } = isDex(symbol) ? dexParts(symbol) : {};
  const url = isDex(symbol) ? `/api/dex?op=chart&network=${network}&pool=${encodeURIComponent(pool)}&range=${range}`
    : isMeme(symbol) ? `/api/meme-chart?id=${encodeURIComponent(symbol.slice(3))}&range=${range}`
    : `/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`;
  const r = await fetch(url);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'No data');
  if (data.ticker) setTicker(data.symbol, data.ticker);
  if (isDex(symbol) && data.price != null) store([{ ...data, points: undefined }]);
  return data;
}

export async function search(q) {
  const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  if (!r.ok) return { quotes: [], news: [] };
  return r.json();
}

export async function searchMemes(q) {
  const r = await fetch(`/api/meme-search?q=${encodeURIComponent(q)}`);
  if (!r.ok) return { quotes: [] };
  return r.json();
}

// ---------------------------------------------------------------- formatting
export function fmtPrice(v, symbol = '') {
  if (v == null || Number.isNaN(v)) return '—';
  const a = Math.abs(v);
  if (a > 0 && a < 0.01) return v.toLocaleString('en-US', { maximumSignificantDigits: 4 });
  const d = symbol.endsWith('=X') ? 4 : a >= 1000 ? 2 : a < 1 ? 4 : 2;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
export const fmtPct = (v) => (v == null || Number.isNaN(v) ? '—' : `${v >= 0 ? '+' : ''}${Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toFixed(2)}%`);
export const fmtUsd = (v) => (v == null || Number.isNaN(v) ? '—' : `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export function fmtQty(v) {
  if (v == null) return '—';
  const a = Math.abs(v);
  return a >= 1e6 ? fmtVol(v) : v.toLocaleString('en-US', { maximumFractionDigits: a >= 100 ? 2 : a >= 1 ? 4 : 6 });
}
export const fmtChg = (v, s) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${fmtPrice(v, s)}`);
export function fmtVol(v) {
  if (!v) return '—';
  if (v >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(Math.round(v));
}
export const UP = '#3dffa8';
export const DOWN = '#ff4f7b';
export const tone = (v) => (v == null ? '#9aa4b2' : v >= 0 ? UP : DOWN);
