import { memeTrending } from './_lib/memes.js';
import { json } from './_lib/yahoo.js';

// GET /api/meme-trending  →  the coins trending on CoinGecko right now
export async function GET() {
  try {
    return json({ coins: await memeTrending() }, { maxAge: 300 });
  } catch {
    return json({ coins: [] }, { maxAge: 30 });
  }
}
