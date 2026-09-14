import { chart, cleanSymbol, json } from './_lib/yahoo.js';

// GET /api/quotes?symbols=AAPL,MSFT,^GSPC
// Latest price, day change and an intraday sparkline for each symbol.
export async function GET(request) {
  const raw = new URL(request.url).searchParams.get('symbols') || '';
  const symbols = [...new Set(raw.split(',').map(cleanSymbol).filter(Boolean))].slice(0, 40);
  if (!symbols.length) return json({ error: 'Pass ?symbols=AAPL,MSFT' }, { status: 400 });

  const results = await Promise.allSettled(symbols.map((s) => chart(s, '1d')));
  const quotes = results.map((r, i) => {
    if (r.status !== 'fulfilled') return { symbol: symbols[i], error: true };
    const { points, ...q } = r.value;
    const closes = points.map((p) => p[4]);
    const step = Math.max(1, Math.floor(closes.length / 60));
    return { ...q, spark: closes.filter((_, j) => j % step === 0 || j === closes.length - 1) };
  });
  return json({ quotes, at: Date.now() }, { maxAge: 15 });
}
