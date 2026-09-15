import { memeQuotes, cleanId } from './_lib/memes.js';
import { json } from './_lib/yahoo.js';

// GET /api/memes[?ids=bonk,pepe]  →  live meme coin quotes (desk watchlist + any extra ids)
export async function GET(request) {
  const extra = (new URL(request.url).searchParams.get('ids') || '').split(',').map(cleanId).filter(Boolean);
  try {
    return json({ ...(await memeQuotes(extra)), at: Date.now() }, { maxAge: 60 });
  } catch {
    return json({ error: 'Meme coin data unavailable' }, { status: 502 });
  }
}
