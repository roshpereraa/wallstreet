// The two desks on the floor and the instruments each one watches.
// Stock symbols are Yahoo tickers; meme coins are CoinGecko ids prefixed with "cg:";
// on-chain tokens (Pons, Robinhood Chain, Solana) are pools: "dex:<network>:<pool address>".

export const INDICES = ['^GSPC', '^DJI', '^IXIC', '^RUT', '^VIX', '^TNX', 'CL=F', 'GC=F', 'BTC-USD', 'EURUSD=X'];

export const DESKS = {
  memes: {
    id: 'memes', kind: 'memes', name: 'Meme Coins', desk: 'Meme Coin Desk', color: '#ff3ea5', accent: '#ffb3dc',
    symbols: ['cg:dogecoin', 'cg:shiba-inu', 'cg:pepe', 'cg:official-trump', 'cg:bonk', 'cg:dogwifcoin', 'cg:floki', 'cg:fartcoin'],
    tape: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'cg:dogecoin', 'cg:shiba-inu', 'cg:pepe', 'cg:bonk', 'cg:dogwifcoin', 'cg:spx6900', 'cg:pudgy-penguins'],
  },
  stocks: {
    id: 'stocks', kind: 'stocks', name: 'Stock Exchange', desk: 'Stock Exchange Desk', color: '#2de2ff', accent: '#b8f6ff',
    symbols: ['^GSPC', '^DJI', '^IXIC', 'AAPL', 'NVDA', 'MSFT', 'TSLA', 'JPM'],
    tape: INDICES,
  },
};

// Where the meme desk can pull a watchlist from
export const SOURCES = [
  { id: 'majors', label: 'Majors', hint: 'Biggest meme coins · CoinGecko' },
  { id: 'pons', label: 'Pons', hint: 'pons.family launches on Robinhood Chain' },
  { id: 'robinhood', label: 'Hood', hint: 'Trending on Robinhood Chain' },
  { id: 'axiom', label: 'Axiom', hint: 'Trending Solana pairs · open them on Axiom' },
];

export const LABELS = {
  '^GSPC': 'S&P 500', '^DJI': 'DOW', '^IXIC': 'NASDAQ', '^RUT': 'RUSSELL', '^VIX': 'VIX', '^TNX': 'US 10Y',
  'CL=F': 'CRUDE', 'GC=F': 'GOLD', 'BTC-USD': 'BITCOIN', 'ETH-USD': 'ETHER', 'SOL-USD': 'SOLANA', 'EURUSD=X': 'EUR/USD',
};

// meme coin tickers arrive with the quotes; until then show the id
const tickers = new Map();
export const setTicker = (symbol, ticker) => tickers.set(symbol, ticker);
export const isMeme = (s) => s.startsWith('cg:');
export const isDex = (s) => s.startsWith('dex:');
export const isCrypto = (s) => isMeme(s) || isDex(s);
export const label = (s) => LABELS[s] || tickers.get(s) || (isMeme(s) ? s.slice(3).split('-')[0].toUpperCase() : isDex(s) ? `${s.split(':')[2].slice(0, 6)}…` : s);
export const dexParts = (s) => { const [, network, pool] = s.split(':'); return { network, pool }; };

export const axiomUrl = (pool) => `https://axiom.trade/meme/${pool}`;
export const dexscreenerUrl = (network, pool) => `https://dexscreener.com/${network === 'eth' ? 'ethereum' : network}/${pool}`;

const FIRST = ['Chad', 'Brad', 'Tripp', 'Priya', 'Mei', 'Jordan', 'Sofia', 'Marcus', 'Aisha', 'Dmitri', 'Kenji', 'Olivia', 'Raj', 'Hunter', 'Tanya', 'Luca', 'Nia', 'Blake', 'Chen', 'Isabella', 'Tyler', 'Fatima', 'Grant', 'Yuki'];
const LAST = ['Sterling', 'Vance', 'Whitmore', 'Kapoor', 'Zhang', 'Rossi', 'Okafor', 'Novak', 'Tanaka', 'Hale', 'Mercer', 'Reyes', 'Brooks', 'Ivanova', 'Carver', 'Singh'];
const ROLES = {
  stocks: ['Senior Trader', 'Associate', 'VP, Execution', 'Analyst', 'Managing Director', 'Portfolio Manager'],
  memes: ['Degen-in-Chief', 'On-chain Analyst', 'Memecoin Sniper', 'Community Lead', 'Chart Wizard', 'Intern (paid in DOGE)'],
};

export function trader(kind, seat) {
  const n = seat * 17 + (kind === 'memes' ? 5 : 11);
  return {
    name: `${FIRST[(n * 7 + seat) % FIRST.length]} ${LAST[(n * 3 + seat) % LAST.length]}`,
    role: ROLES[kind][(n + seat) % ROLES[kind].length],
  };
}

export const SHOUTS = {
  stocks: ['BUY BUY BUY!', 'Where is my fill?!', 'Powell is talking!', 'Sell the rip!', 'Lift the offer!', 'Hit the bid!', "What's the print?", 'Cover! Cover!'],
  memes: ['To the moon!', 'WAGMI', 'Diamond hands!', 'Is this a rug?!', 'Ape in!', 'Much wow', 'Send it!', 'Buy the dip, anon'],
};
