import { chart, cleanSymbol, json, RANGES } from './_lib/yahoo.js';

// GET /api/chart?symbol=NVDA&range=1d   (range: 1d 5d 1mo 6mo 1y 5y)
export async function GET(request) {
  const p = new URL(request.url).searchParams;
  const symbol = cleanSymbol(p.get('symbol'));
  const range = RANGES[p.get('range')] ? p.get('range') : '1d';
  if (!symbol) return json({ error: 'Pass ?symbol=AAPL' }, { status: 400 });
  try {
    return json(await chart(symbol, range), { maxAge: range === '1d' ? 20 : 300 });
  } catch (e) {
    return json({ error: `No data for ${symbol}` }, { status: 404 });
  }
}
