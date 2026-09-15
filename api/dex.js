import { dexList, dexQuotes, dexLookup, dexChart, NETWORK_RE, ADDRESS_RE } from './_lib/dex.js';
import { json } from './_lib/yahoo.js';

// On-chain memecoins, one function to stay inside Vercel's function limit:
//   GET /api/dex?op=list&view=pons|robinhood|axiom
//   GET /api/dex?op=quotes&ids=robinhood:0xpool,solana:Pool...
//   GET /api/dex?op=lookup&q=<contract address | name | ticker>
//   GET /api/dex?op=chart&network=robinhood&pool=0x...&range=1d|5d|1mo|6mo|1y
export async function GET(request) {
  const p = new URL(request.url).searchParams;
  const op = p.get('op');
  try {
    if (op === 'list') {
      const view = ['pons', 'robinhood', 'axiom'].includes(p.get('view')) ? p.get('view') : 'pons';
      return json({ view, quotes: await dexList(view) }, { maxAge: 45 });
    }
    if (op === 'quotes') {
      const ids = (p.get('ids') || '').split(',').filter(Boolean).slice(0, 60);
      return json({ quotes: await dexQuotes(ids) }, { maxAge: 20 });
    }
    if (op === 'lookup') {
      const q = (p.get('q') || '').trim().slice(0, 80);
      if (!q) return json({ quotes: [] });
      return json({ quotes: await dexLookup(q) }, { maxAge: 60 });
    }
    if (op === 'chart') {
      const network = p.get('network'), pool = p.get('pool');
      if (!NETWORK_RE.test(network || '') || !ADDRESS_RE.test(pool || '')) return json({ error: 'Pass network and pool' }, { status: 400 });
      const range = ['1d', '5d', '1mo', '6mo', '1y'].includes(p.get('range')) ? p.get('range') : '1d';
      return json(await dexChart(network, pool, range), { maxAge: range === '1d' ? 60 : 300 });
    }
    return json({ error: 'Unknown op' }, { status: 400 });
  } catch (e) {
    return json({ error: 'On-chain data is busy, try again in a moment' }, { status: 502 });
  }
}
