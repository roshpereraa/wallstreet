// Client for the /api functions. Quotes are pooled: the room and the terminal ask for
// symbols, and batched requests refresh them all. Stocks come from /api/quotes,
// meme coins (symbols starting "cg:") from /api/memes.
import { setTicker, isMeme } from './data.js';

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
    const stocks = list.filter((s) => !isMeme(s));
    const memes = list.filter(isMeme).map((s) => s.slice(3));
    const jobs = [];
    for (let i = 0; i < stocks.length; i += 40) {
      jobs.push(getJSON(`/api/quotes?symbols=${encodeURIComponent(stocks.slice(i, i + 40).join(','))}`));
    }
    if (memes.length) jobs.push(getJSON(`/api/memes?ids=${encodeURIComponent(memes.join(','))}`));
    const results = await Promise.allSettled(jobs);
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const q of r.value.quotes || []) {
        if (q.error) continue;
        cache.set(q.symbol, q);
        if (q.ticker) setTicker(q.symbol, q.ticker);
      }
    }
    listeners.forEach((fn) => fn(cache));
    inflight = null;
  })();
  return inflight;
}

export function startPolling(ms = 20000) {
  clearInterval(timer);
  timer = setInterval(() => { if (!document.hidden) refresh(); }, ms);
}

export async function getChart(symbol, range) {
  const url = isMeme(symbol)
    ? `/api/meme-chart?id=${encodeURIComponent(symbol.slice(3))}&range=${range}`
    : `/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`;
  const r = await fetch(url);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'No data');
  if (data.ticker) setTicker(data.symbol, data.ticker);
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
export const fmtPct = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
export const fmtChg = (v, s) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${fmtPrice(v, s)}`);
export function fmtVol(v) {
  if (!v) return '—';
  if (v >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(Math.round(v));
}
export const UP = '#27d47e';
export const DOWN = '#ff4d5e';
export const tone = (v) => (v == null ? '#9aa4b2' : v >= 0 ? UP : DOWN);
