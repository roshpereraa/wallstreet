import { search, json } from './_lib/yahoo.js';

// GET /api/search?q=nvidia  →  matching tickers + latest headlines
export async function GET(request) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 40);
  if (!q) return json({ quotes: [], news: [] });
  try {
    return json(await search(q), { maxAge: 120 });
  } catch {
    return json({ error: 'Search unavailable' }, { status: 502 });
  }
}
