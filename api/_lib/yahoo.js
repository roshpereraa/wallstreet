// Server-side Yahoo Finance helpers. The browser can't call Yahoo directly (CORS),
// so the Vercel functions in /api proxy these endpoints and cache at the edge.

const UA = 'Mozilla/5.0';
const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

export const RANGES = {
  '1d': '5m',
  '5d': '15m',
  '1mo': '60m',
  '6mo': '1d',
  '1y': '1d',
  '5y': '1wk',
};

const SYMBOL_RE = /^[A-Za-z0-9.^=\-]{1,20}$/;
export const cleanSymbol = (s) => (typeof s === 'string' && SYMBOL_RE.test(s.trim()) ? s.trim().toUpperCase() : null);

async function yahoo(path) {
  let lastErr;
  for (const host of HOSTS) {
    try {
      const r = await fetch(host + path, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.ok) return await r.json();
      lastErr = new Error(`Yahoo ${r.status}`);
      if (r.status === 404) break;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function marketState(meta) {
  if (meta.instrumentType === 'CRYPTOCURRENCY') return 'OPEN';
  const p = meta.currentTradingPeriod;
  if (!p) return 'CLOSED';
  const now = Date.now() / 1000;
  const inP = (x) => x && now >= x.start && now < x.end;
  if (inP(p.regular)) return 'OPEN';
  if (inP(p.pre)) return 'PRE';
  if (inP(p.post)) return 'AFTER';
  return 'CLOSED';
}

export async function chart(symbol, range = '1d') {
  const interval = RANGES[range] || '5m';
  const data = await yahoo(`/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`);
  const res = data?.chart?.result?.[0];
  if (!res) throw new Error(data?.chart?.error?.description || 'No data');
  const m = res.meta;
  const q = res.indicators?.quote?.[0] || {};
  const ts = res.timestamp || [];
  const points = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.close?.[i] == null) continue;
    points.push([ts[i], q.open?.[i] ?? q.close[i], q.high?.[i] ?? q.close[i], q.low?.[i] ?? q.close[i], q.close[i], q.volume?.[i] ?? 0]);
  }
  const price = m.regularMarketPrice ?? points.at(-1)?.[4] ?? null;
  const prev = range === '1d' ? (m.previousClose ?? m.chartPreviousClose) : m.chartPreviousClose ?? m.previousClose;
  const dayPrev = m.previousClose ?? m.chartPreviousClose ?? null;
  return {
    symbol: m.symbol,
    name: m.longName || m.shortName || m.symbol,
    exchange: m.fullExchangeName || m.exchangeName,
    currency: m.currency,
    type: m.instrumentType,
    price,
    prevClose: dayPrev,
    change: price != null && dayPrev ? price - dayPrev : null,
    changePct: price != null && dayPrev ? ((price - dayPrev) / dayPrev) * 100 : null,
    rangeBase: prev,
    open: range === '1d' ? points[0]?.[1] ?? null : null,
    dayHigh: m.regularMarketDayHigh ?? null,
    dayLow: m.regularMarketDayLow ?? null,
    volume: m.regularMarketVolume ?? null,
    high52: m.fiftyTwoWeekHigh ?? null,
    low52: m.fiftyTwoWeekLow ?? null,
    time: m.regularMarketTime ?? null,
    timezone: m.exchangeTimezoneName,
    marketState: marketState(m),
    range,
    interval,
    points,
  };
}

export async function search(q) {
  const data = await yahoo(`/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=8&enableFuzzyQuery=false`);
  return {
    quotes: (data.quotes || [])
      .filter((x) => x.symbol && x.isYahooFinance !== false)
      .map((x) => ({ symbol: x.symbol, name: x.longname || x.shortname || x.symbol, exchange: x.exchDisp || x.exchange, type: x.typeDisp || x.quoteType })),
    news: (data.news || []).map((n) => ({ title: n.title, publisher: n.publisher, link: n.link, time: n.providerPublishTime })),
  };
}

export function json(body, { status = 200, maxAge = 15 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? `public, max-age=5, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}` : 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
