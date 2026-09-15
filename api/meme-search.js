import { memeSearch } from './_lib/memes.js';
import { json } from './_lib/yahoo.js';

// GET /api/meme-search?q=pepe  →  matching coins on CoinGecko
export async function GET(request) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 40);
  if (!q) return json({ quotes: [] });
  try {
    return json({ quotes: await memeSearch(q) }, { maxAge: 300 });
  } catch {
    return json({ quotes: [] }, { maxAge: 30 });
  }
}
