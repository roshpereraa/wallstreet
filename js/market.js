// Client for the /api functions. Quotes are pooled: anything in the scene or the terminal
// asks for symbols, and one batched request refreshes them all.

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

export async function refresh() {
  if (inflight) return inflight;
  const list = [...wanted];
  if (!list.length) return;
  inflight = (async () => {
    try {
      for (let i = 0; i < list.length; i += 40) {
        const r = await fetch(`/api/quotes?symbols=${encodeURIComponent(list.slice(i, i + 40).join(','))}`);
        if (!r.ok) continue;
        const { quotes: qs } = await r.json();
        for (const q of qs) if (!q.error) cache.set(q.symbol, q);
      }
      listeners.forEach((fn) => fn(cache));
    } catch { /* offline: keep last values */ }
    inflight = null;
  })();
  return inflight;
}

export function startPolling(ms = 20000) {
  clearInterval(timer);
  timer = setInterval(() => { if (!document.hidden) refresh(); }, ms);
}

export async function getChart(symbol, range) {
  const r = await fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'No data');
  return data;
}

export async function search(q) {
  const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  if (!r.ok) return { quotes: [], news: [] };
  return r.json();
}

// ---------------------------------------------------------------- formatting
export function fmtPrice(v, symbol = '') {
  if (v == null || Number.isNaN(v)) return '—';
  const fx = symbol.endsWith('=X');
  const d = fx ? 4 : Math.abs(v) >= 1000 ? 2 : Math.abs(v) < 1 ? 4 : 2;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
export const fmtPct = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
export const fmtChg = (v, s) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${fmtPrice(v, s)}`);
export function fmtVol(v) {
  if (!v) return '—';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}
export const UP = '#27d47e';
export const DOWN = '#ff4d5e';
export const tone = (v) => (v == null ? '#9aa4b2' : v >= 0 ? UP : DOWN);
