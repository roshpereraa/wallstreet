import { memeChart, cleanId } from './_lib/memes.js';
import { json } from './_lib/yahoo.js';

// GET /api/meme-chart?id=dogecoin&range=1d   (range: 1d 5d(=7 days) 1mo 6mo 1y)
export async function GET(request) {
  const p = new URL(request.url).searchParams;
  const id = cleanId(p.get('id'));
  const range = ['1d', '5d', '1mo', '6mo', '1y'].includes(p.get('range')) ? p.get('range') : '1d';
  if (!id) return json({ error: 'Pass ?id=dogecoin' }, { status: 400 });
  try {
    return json(await memeChart(id, range), { maxAge: range === '1d' ? 60 : 600 });
  } catch {
    return json({ error: `No data for ${id}` }, { status: 404 });
  }
}
