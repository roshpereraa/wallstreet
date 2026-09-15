// Meme coin data. Primary source is CoinGecko's public API (meme-token category);
// if it rate-limits us, the same coins are served from Yahoo Finance crypto pairs.
import { chart as yahooChart } from './yahoo.js';

const CG = 'https://api.coingecko.com/api/v3';
const UA = 'Mozilla/5.0';

// The desk's watchlist (CoinGecko ids) and the Yahoo pair used as a fallback.
export const MEMES = {
  dogecoin: 'DOGE-USD',
  'shiba-inu': 'SHIB-USD',
  pepe: 'PEPE24478-USD',
  'official-trump': null,
  bonk: 'BONK-USD',
  dogwifcoin: 'WIF-USD',
  floki: 'FLOKI-USD',
  spx6900: 'SPX28081-USD',
  'pudgy-penguins': 'PENGU34466-USD',
  fartcoin: 'FARTCOIN-USD',
  'pump-fun': null,
};

const ID_RE = /^[a-z0-9-]{1,80}$/;
export const cleanId = (s) => (typeof s === 'string' && ID_RE.test(s.trim()) ? s.trim() : null);

async function cg(path) {
  const r = await fetch(CG + path, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
  return r.json();
}

const shape = (c) => ({
  symbol: `cg:${c.id}`,
  id: c.id,
  ticker: (c.symbol || '').toUpperCase(),
  name: c.name,
  image: c.image,
  exchange: 'CoinGecko',
  currency: 'USD',
  type: 'MEME COIN',
  price: c.current_price,
  change: c.price_change_24h,
  changePct: c.price_change_percentage_24h,
  prevClose: c.current_price != null && c.price_change_24h != null ? c.current_price - c.price_change_24h : null,
  dayHigh: c.high_24h,
  dayLow: c.low_24h,
  volume: c.total_volume,
  marketCap: c.market_cap,
  rank: c.market_cap_rank,
  ath: c.ath,
  athChangePct: c.ath_change_percentage,
  supply: c.circulating_supply,
  change1h: c.price_change_percentage_1h_in_currency ?? null,
  change7d: c.price_change_percentage_7d_in_currency ?? null,
  spark: (c.sparkline_in_7d?.price || []).filter((_, i, a) => i % 3 === 0 || i === a.length - 1),
  sparkRange: '7d',
  marketState: 'OPEN',
  time: c.last_updated ? Math.floor(Date.parse(c.last_updated) / 1000) : null,
});

export async function memeQuotes(extraIds = []) {
  const ids = [...new Set([...Object.keys(MEMES), ...extraIds])].slice(0, 40);
  try {
    const list = await cg(`/coins/markets?vs_currency=usd&ids=${ids.join(',')}&order=market_cap_desc&per_page=50&sparkline=true&price_change_percentage=1h,24h,7d`);
    return { source: 'coingecko', quotes: list.map(shape) };
  } catch {
    // fallback: Yahoo crypto pairs for the coins it lists
    const pairs = ids.filter((id) => MEMES[id]);
    const res = await Promise.allSettled(pairs.map((id) => yahooChart(MEMES[id], '1d')));
    const quotes = res.flatMap((r, i) => {
      if (r.status !== 'fulfilled') return [];
      const { points, ...q } = r.value;
      const id = pairs[i];
      return [{
        ...q, symbol: `cg:${id}`, id, ticker: MEMES[id].split('-')[0].replace(/\d+$/, ''), name: q.name.replace(/ USD$/, ''),
        type: 'MEME COIN', marketState: 'OPEN', spark: points.map((p) => p[4]), sparkRange: '1d',
      }];
    });
    return { source: 'yahoo', quotes };
  }
}

const DAYS = { '1d': 1, '5d': 7, '1mo': 30, '6mo': 180, '1y': 365 };

export async function memeChart(id, range = '1d') {
  const days = DAYS[range] || 1;
  try {
    const [data, [info]] = await Promise.all([
      cg(`/coins/${id}/market_chart?vs_currency=usd&days=${days}`),
      cg(`/coins/markets?vs_currency=usd&ids=${id}`),
    ]);
    const prices = data.prices || [];
    const vols = data.total_volumes || [];
    if (!prices.length) throw new Error('No data');
    // bucket the raw price samples into candles
    const n = Math.min(120, prices.length);
    const size = prices.length / n;
    const points = [];
    for (let b = 0; b < n; b++) {
      const slice = prices.slice(Math.floor(b * size), Math.max(Math.floor(b * size) + 1, Math.floor((b + 1) * size)));
      if (!slice.length) continue;
      const vals = slice.map((p) => p[1]);
      const vi = Math.min(vols.length - 1, Math.floor((b + 0.5) * size));
      points.push([Math.floor(slice[0][0] / 1000), vals[0], Math.max(...vals), Math.min(...vals), vals.at(-1), vols[vi]?.[1] ?? 0]);
    }
    const q = info ? shape(info) : {};
    return { ...q, symbol: `cg:${id}`, rangeBase: points[0][1], range, timezone: 'UTC', points };
  } catch (e) {
    const pair = MEMES[id];
    if (!pair) throw e;
    const c = await yahooChart(pair, range === '5y' ? '1y' : range);
    return { ...c, symbol: `cg:${id}`, id, ticker: pair.split('-')[0].replace(/\d+$/, ''), name: c.name.replace(/ USD$/, ''), type: 'MEME COIN', marketState: 'OPEN', rangeBase: c.points[0]?.[1] };
  }
}

export async function memeSearch(q) {
  const data = await cg(`/search?query=${encodeURIComponent(q)}`);
  return (data.coins || []).slice(0, 10).map((c) => ({ symbol: `cg:${c.id}`, name: c.name, exchange: c.symbol, type: c.market_cap_rank ? `Rank #${c.market_cap_rank}` : 'Coin' }));
}

export async function memeTrending() {
  const data = await cg('/search/trending');
  return (data.coins || []).slice(0, 10).map(({ item: i }) => ({
    symbol: `cg:${i.id}`,
    ticker: (i.symbol || '').toUpperCase(),
    name: i.name,
    rank: i.market_cap_rank,
    price: typeof i.data?.price === 'number' ? i.data.price : Number(i.data?.price) || null,
    changePct: i.data?.price_change_percentage_24h?.usd ?? null,
  }));
}
