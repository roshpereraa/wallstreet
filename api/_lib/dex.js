// On-chain memecoin data: GeckoTerminal for pool lists, quotes and candles,
// DexScreener for contract-address (CA) and name lookups. Both are free and keyless.

const GT = 'https://api.geckoterminal.com/api/v2';
const DS = 'https://api.dexscreener.com';
const HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

// DexScreener chain ids -> GeckoTerminal network ids (only where they differ)
const DS_TO_GT = { ethereum: 'eth', polygon: 'polygon_pos', avalanche: 'avax' };
const GT_TO_DS = Object.fromEntries(Object.entries(DS_TO_GT).map(([k, v]) => [v, k]));
export const NETWORK_RE = /^[a-z0-9_-]{2,40}$/;
export const ADDRESS_RE = /^(0x[a-fA-F0-9]{40}([a-fA-F0-9]{24})?|[1-9A-HJ-NP-Za-km-z]{32,48})$/;

async function get(url, retries = 0) {
  const r = await fetch(url, { headers: HEADERS });
  if (r.status === 429 && retries > 0) {
    await new Promise((res) => setTimeout(res, 1200));
    return get(url, retries - 1);
  }
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
}

// small in-memory cache per serverless instance, on top of the CDN cache
const memo = new Map();
async function cached(key, ttl, fn) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await fn();
  memo.set(key, { value, at: Date.now() });
  if (memo.size > 300) memo.delete(memo.keys().next().value);
  return value;
}

export const dexSymbol = (network, pool) => `dex:${network}:${/^0x/.test(pool) ? pool.toLowerCase() : pool}`;

const num = (v) => (v == null || v === '' ? null : Number(v));

function fromGecko(p) {
  const a = p.attributes;
  const network = p.id.split('_')[0];
  const [base] = (a.name || '').split(' / ');
  const token = p.relationships?.base_token?.data?.id?.slice(network.length + 1) || null;
  const dex = p.relationships?.dex?.data?.id || '';
  return {
    symbol: dexSymbol(network, a.address),
    kind: 'dex',
    network,
    pool: a.address,
    token,
    ticker: base || '?',
    name: a.name,
    dex,
    price: num(a.base_token_price_usd),
    changePct: num(a.price_change_percentage?.h24),
    change1h: num(a.price_change_percentage?.h1),
    change5m: num(a.price_change_percentage?.m5),
    volume: num(a.volume_usd?.h24),
    liquidity: num(a.reserve_in_usd),
    marketCap: num(a.market_cap_usd) ?? num(a.fdv_usd),
    fdv: num(a.fdv_usd),
    buys: a.transactions?.h24?.buys ?? null,
    sells: a.transactions?.h24?.sells ?? null,
    createdAt: a.pool_created_at ? Math.floor(Date.parse(a.pool_created_at) / 1000) : null,
    marketState: 'OPEN',
    currency: 'USD',
    type: 'DEX TOKEN',
    exchange: dex,
    time: Math.floor(Date.now() / 1000),
  };
}

function fromScreener(p) {
  const network = DS_TO_GT[p.chainId] || p.chainId;
  return {
    symbol: dexSymbol(network, p.pairAddress),
    kind: 'dex',
    network,
    pool: p.pairAddress,
    token: p.baseToken?.address,
    ticker: p.baseToken?.symbol || '?',
    name: `${p.baseToken?.name || ''} / ${p.quoteToken?.symbol || ''}`,
    dex: p.dexId,
    image: p.info?.imageUrl || null,
    price: num(p.priceUsd),
    changePct: num(p.priceChange?.h24),
    change1h: num(p.priceChange?.h1),
    change5m: num(p.priceChange?.m5),
    volume: num(p.volume?.h24),
    liquidity: num(p.liquidity?.usd),
    marketCap: num(p.marketCap) ?? num(p.fdv),
    fdv: num(p.fdv),
    buys: p.txns?.h24?.buys ?? null,
    sells: p.txns?.h24?.sells ?? null,
    createdAt: p.pairCreatedAt ? Math.floor(p.pairCreatedAt / 1000) : null,
    url: p.url,
    marketState: 'OPEN',
    currency: 'USD',
    type: 'DEX TOKEN',
    exchange: p.dexId,
    time: Math.floor(Date.now() / 1000),
  };
}

// Curated feeds for the meme desk
export async function dexList(view) {
  return cached(`list:${view}`, 40000, () => loadList(view));
}

async function loadList(view) {
  if (view === 'pons') {
    // Pons.family launches on Robinhood Chain: bonding-curve dex + graduated dex
    const [a, b] = await Promise.allSettled([
      get(`${GT}/networks/robinhood/dexes/pons-v2-dex/pools?page=1&sort=h24_volume_usd_desc`),
      get(`${GT}/networks/robinhood/dexes/pons-v2/pools?page=1&sort=h24_volume_usd_desc`),
    ]);
    const pools = [a, b].flatMap((r) => (r.status === 'fulfilled' ? r.value.data || [] : [])).map(fromGecko);
    if (!pools.length) throw new Error('Pons feed unavailable');
    return pools.sort((x, y) => (y.volume || 0) - (x.volume || 0)).slice(0, 24);
  }
  const network = view === 'axiom' ? 'solana' : 'robinhood';
  const d = await get(`${GT}/networks/${network}/trending_pools?page=1`);
  return (d.data || []).map(fromGecko).slice(0, 24);
}

// Fresh quotes for pools the client is watching ("network:pool" ids)
export async function dexQuotes(ids) {
  const byNet = new Map();
  for (const id of ids) {
    const [network, pool] = id.split(':');
    if (!NETWORK_RE.test(network) || !ADDRESS_RE.test(pool)) continue;
    if (!byNet.has(network)) byNet.set(network, []);
    byNet.get(network).push(pool);
  }
  const jobs = [...byNet].map(async ([network, pools]) => {
    const out = [];
    for (let i = 0; i < pools.length; i += 30) {
      const chunk = pools.slice(i, i + 30);
      try {
        const d = await get(`${DS}/latest/dex/pairs/${GT_TO_DS[network] || network}/${chunk.join(',')}`);
        if (!d.pairs?.length) throw new Error('empty');
        out.push(...d.pairs.map(fromScreener));
      } catch {
        const d = await get(`${GT}/networks/${network}/pools/multi/${chunk.join(',')}`);
        out.push(...(d.data || []).map(fromGecko));
      }
    }
    return out;
  });
  const res = await Promise.allSettled(jobs);
  return res.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

// Search by contract address, pair address, ticker or name
export async function dexLookup(q) {
  const d = await get(`${DS}/latest/dex/search?q=${encodeURIComponent(q)}`);
  const pairs = (d.pairs || []).filter((p) => p.priceUsd);
  const isAddress = ADDRESS_RE.test(q);
  // best pool per token: most liquidity wins
  const best = new Map();
  for (const p of pairs) {
    const key = `${p.chainId}:${p.baseToken?.address}`.toLowerCase();
    if (isAddress && ![p.baseToken?.address, p.pairAddress].some((x) => x?.toLowerCase() === q.toLowerCase())) continue;
    const cur = best.get(key);
    if (!cur || (p.liquidity?.usd || 0) > (cur.liquidity?.usd || 0)) best.set(key, p);
  }
  return [...best.values()]
    .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))
    .slice(0, 12)
    .map(fromScreener);
}

const FRAMES = {
  '1d': ['minute', 15, 96],
  '5d': ['hour', 1, 168],
  '1mo': ['hour', 4, 180],
  '6mo': ['day', 1, 180],
  '1y': ['day', 1, 365],
};

export async function dexChart(network, pool, range = '1d') {
  const [tf, agg, limit] = FRAMES[range] || FRAMES['1d'];
  const [candles, info] = await Promise.all([
    cached(`ohlcv:${network}:${pool}:${range}`, range === '1d' ? 45000 : 240000, () =>
      get(`${GT}/networks/${network}/pools/${pool}/ohlcv/${tf}?aggregate=${agg}&limit=${limit}&currency=usd`, 2)),
    dexQuotes([`${network}:${pool}`]).then((q) => q[0]).catch(() => null),
  ]);
  const list = candles?.data?.attributes?.ohlcv_list || [];
  const points = list.map(([t, o, h, l, c, v]) => [t, o, h, l, c, v]).sort((a, b) => a[0] - b[0]);
  const q = info || { symbol: dexSymbol(network, pool), network, pool };
  return { ...q, range, rangeBase: points[0]?.[1] ?? null, timezone: undefined, points };
}

export const dsChain = (network) => GT_TO_DS[network] || network;
