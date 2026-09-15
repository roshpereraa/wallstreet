// Dex scanner: turns raw pool + on-chain data into plain-English safety checks and a risk score.
// Every check carries a short lesson, because the point of the sim is learning what to look for.

const cache = new Map(); // symbol -> { report, at }

export async function scan({ symbol, q }) {
  const url = symbol
    ? (() => { const [, network, pool] = symbol.split(':'); return `/api/dex?op=scan&network=${network}&pool=${encodeURIComponent(pool)}`; })()
    : `/api/dex?op=scan&q=${encodeURIComponent(q)}`;
  if (symbol && cache.has(symbol) && Date.now() - cache.get(symbol).at < 60000) return cache.get(symbol).report;
  const r = await fetch(url);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Scan failed');
  const report = { token: data, ...assess(data) };
  cache.set(data.symbol, { report, at: Date.now() });
  return report;
}

export const cachedScan = (symbol) => cache.get(symbol)?.report || null;

const hours = (t) => (t ? (Date.now() / 1000 - t) / 3600 : null);

export function assess(t) {
  const s = t.safety || {};
  const h1 = t.txns?.h1 || {}, h24 = t.txns?.h24 || {};
  const age = hours(t.createdAt);
  const checks = [];
  const add = (weight, status, title, detail, lesson) => checks.push({ weight, status, title, detail, lesson });

  const liq = t.liquidity;
  if (liq == null) add(3, 'unknown', 'Liquidity', 'Not reported', 'Liquidity is the money in the pool you trade against. No data means you can’t tell how hard it is to exit.');
  else if (liq < 5000) add(3, 'bad', 'Liquidity', `$${fmt(liq)} in the pool`, 'Under $5K of liquidity means even small sells crash the price, and the creator can pull it out (a rug pull) in one transaction.');
  else if (liq < 25000) add(3, 'warn', 'Liquidity', `$${fmt(liq)} in the pool`, 'Thin liquidity: expect heavy slippage. Keep positions small so you can actually get out.');
  else add(3, 'ok', 'Liquidity', `$${fmt(liq)} in the pool`, 'Healthy pool depth for a memecoin. Big orders still move the price.');

  if (age == null) add(2, 'unknown', 'Pool age', 'Unknown', 'Brand-new pools are where most rugs happen.');
  else if (age < 1) add(2, 'bad', 'Pool age', `${Math.max(1, Math.round(age * 60))} minutes old`, 'Under an hour old: no track record at all. Most launches this young go to zero.');
  else if (age < 24) add(2, 'warn', 'Pool age', `${age.toFixed(1)} hours old`, 'Less than a day old. Survivors of day one are rarer than you’d think.');
  else add(2, 'ok', 'Pool age', `${Math.round(age / 24)} days old`, 'Has traded for a while, which rules out the fastest scams (not all of them).');

  if (s.top10 == null) add(3, 'unknown', 'Top 10 holders', 'Holder data unavailable', 'When a few wallets hold most of the supply, they decide the price.');
  else if (s.top10 > 50) add(3, 'bad', 'Top 10 holders', `${s.top10.toFixed(1)}% of supply`, 'The top 10 wallets hold over half the supply. If they sell, you are their exit liquidity.');
  else if (s.top10 > 30) add(3, 'warn', 'Top 10 holders', `${s.top10.toFixed(1)}% of supply`, 'Fairly concentrated. Watch those wallets before sizing up.');
  else add(3, 'ok', 'Top 10 holders', `${s.top10.toFixed(1)}% of supply`, 'Supply is reasonably spread out.');

  // mint & freeze authority are Solana token features; EVM chains don't report them
  const solana = t.network === 'solana';
  if (s.mintAuthority === 'yes') add(3, 'bad', 'Mint authority', 'Still enabled', 'The creator can print unlimited new tokens and dump them on you.');
  else if (s.mintAuthority === 'no') add(3, 'ok', 'Mint authority', 'Revoked', 'No one can mint more supply.');
  else if (solana) add(3, 'unknown', 'Mint authority', 'Unknown', 'Check whether the creator can still mint new tokens.');

  if (s.freezeAuthority === 'yes') add(3, 'bad', 'Freeze authority', 'Still enabled', 'Your tokens can be frozen so you can never sell. Classic honeypot setup.');
  else if (s.freezeAuthority === 'no') add(3, 'ok', 'Freeze authority', 'Revoked', 'Nobody can freeze holders’ tokens.');
  else if (solana) add(2, 'unknown', 'Freeze authority', 'Unknown', 'On Solana, check the freeze authority is revoked before buying.');

  if (s.honeypot === 'yes') add(4, 'bad', 'Honeypot check', 'Flagged as honeypot', 'You can buy but not sell. Never trade these.');
  else if (s.honeypot === 'no') add(4, 'ok', 'Honeypot check', 'Sells work', 'Test sells go through.');

  const b = h1.buys || 0, sl = h1.sells || 0;
  if (b + sl === 0) add(2, 'warn', 'Last hour activity', 'No trades', 'Dead volume: you may not find a buyer when you want out.');
  else if (sl > b * 2) add(2, 'warn', 'Last hour activity', `${b} buys / ${sl} sells`, 'Sellers are outnumbering buyers 2:1. Holders are heading for the exit.');
  else if (sl === 0 && b > 20) add(2, 'warn', 'Last hour activity', `${b} buys / 0 sells`, 'Lots of buys and zero sells can mean nobody is able to sell. Be careful.');
  else add(2, 'ok', 'Last hour activity', `${b} buys / ${sl} sells`, 'Two-way trading, so there are buyers and sellers.');

  const ch24 = t.priceChangeAll?.h24 ?? t.changePct, ch1 = t.priceChangeAll?.h1 ?? t.change1h;
  if (ch1 != null && ch1 < -50) add(2, 'bad', 'Price action', `${ch1.toFixed(0)}% in 1h`, 'Down over 50% in an hour: this looks like a dump or rug in progress.');
  else if (ch24 != null && ch24 > 500) add(2, 'warn', 'Price action', `+${ch24.toFixed(0)}% in 24h`, 'Already up 5x+ today. Buying after a huge pump often means buying the top.');
  else if (ch24 != null) add(2, 'ok', 'Price action', `${ch24 >= 0 ? '+' : ''}${ch24.toFixed(1)}% in 24h`, 'No extreme move right now.');

  if (liq && t.volume) {
    const ratio = t.volume / liq;
    if (ratio > 50) add(1, 'warn', 'Volume vs liquidity', `${ratio.toFixed(0)}x`, 'Volume far above liquidity can be bots trading with themselves (wash trading) to fake hype.');
    else add(1, 'ok', 'Volume vs liquidity', `${ratio.toFixed(1)}x`, 'Volume looks proportionate to the pool.');
  }
  if (liq && t.marketCap && liq < 250000) {
    const ratio = t.marketCap / liq;
    if (ratio > 25) add(2, 'warn', 'Market cap vs liquidity', `${ratio.toFixed(0)}x`, 'The valuation sits on a thin pool. Paper gains here are hard to cash out.');
    else add(1, 'ok', 'Market cap vs liquidity', `${ratio.toFixed(1)}x`, 'Market cap is backed by a reasonable pool.');
  }

  const hasSocial = (t.socials?.length || 0) + (t.websites?.length || 0) > 0 || s.twitter;
  add(1, hasSocial ? 'ok' : 'warn', 'Socials & website', hasSocial ? 'Listed' : 'None listed', hasSocial ? 'Has a public presence. Anyone can make a website, so this proves little.' : 'No website or socials. Anonymous tokens with nothing to lose are easy to abandon.');

  if (s.score != null) {
    const sc = Number(s.score);
    add(2, sc < 30 ? 'bad' : sc < 60 ? 'warn' : 'ok', 'GeckoTerminal trust score', `${sc.toFixed(0)} / 100`, 'A combined score from pool, transactions, creation and holder data.');
  }

  let total = 0, risk = 0;
  for (const c of checks) {
    if (c.status === 'unknown') { total += c.weight * 0.5; risk += c.weight * 0.25; continue; }
    total += c.weight;
    risk += c.status === 'bad' ? c.weight : c.status === 'warn' ? c.weight * 0.5 : 0;
  }
  // any critical red flag keeps the verdict at medium risk or worse, however clean the rest looks
  const critical = checks.filter((c) => c.status === 'bad' && ['Liquidity', 'Top 10 holders', 'Mint authority', 'Freeze authority', 'Honeypot check', 'Price action'].includes(c.title)).length;
  const score = Math.min(100, Math.max(Math.round((risk / (total || 1)) * 100), critical ? 35 + critical * 12 : 0));
  const level = score < 25 ? 'Lower risk' : score < 45 ? 'Medium risk' : score < 65 ? 'High risk' : 'Extreme risk';
  return { checks, score, level };
}

function fmt(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return Math.round(v).toString();
}
