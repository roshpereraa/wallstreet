// Firms on the street (parody names), their desks and the tickers each desk watches.

export const INDICES = ['^GSPC', '^DJI', '^IXIC', '^RUT', '^VIX', '^TNX', 'CL=F', 'GC=F', 'BTC-USD', 'EURUSD=X'];

export const LABELS = {
  '^GSPC': 'S&P 500', '^DJI': 'DOW', '^IXIC': 'NASDAQ', '^RUT': 'RUSSELL', '^VIX': 'VIX', '^TNX': 'US 10Y',
  '^TYX': 'US 30Y', '^FVX': 'US 5Y', '^IRX': 'US 3M', 'CL=F': 'CRUDE', 'GC=F': 'GOLD', 'SI=F': 'SILVER',
  'NG=F': 'NAT GAS', 'HG=F': 'COPPER', 'BTC-USD': 'BITCOIN', 'ETH-USD': 'ETHER', 'SOL-USD': 'SOLANA',
  'EURUSD=X': 'EUR/USD', 'GBPUSD=X': 'GBP/USD', 'JPY=X': 'USD/JPY', 'DX-Y.NYB': 'DXY',
};
export const label = (s) => LABELS[s] || s;

export const FIRMS = [
  {
    id: 'goldman', name: 'Goldman Stacks', short: 'GS', side: -1, desk: 'Financials Desk', color: '#d9b25b', accent: '#f3d58a', stone: '#6d6150',
    symbols: ['JPM', 'GS', 'MS', 'BAC', 'C', 'WFC', 'SCHW', 'BLK'],
  },
  {
    id: 'morgain', name: 'J.P. Morgain', short: 'JPM', side: 1, desk: 'Mega-Cap Tech Desk', color: '#7fb2ff', accent: '#bcd6ff', stone: '#4c5260',
    symbols: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO'],
  },
  {
    id: 'blackrack', name: 'BlackRack', short: 'BR', side: -1, desk: 'Index & ETF Desk', color: '#e8e8e8', accent: '#ffffff', stone: '#2c2d31',
    symbols: ['SPY', 'QQQ', 'DIA', 'IWM', 'VTI', '^GSPC', '^IXIC', '^VIX'],
  },
  {
    id: 'citadull', name: 'Citadull', short: 'CT', side: 1, desk: 'Commodities & FX Desk', color: '#5fd0c0', accent: '#a6f0e4', stone: '#3f4d52',
    symbols: ['CL=F', 'GC=F', 'SI=F', 'NG=F', 'HG=F', 'EURUSD=X', 'GBPUSD=X', 'JPY=X'],
  },
  {
    id: 'bridgewaterfall', name: 'Bridgewaterfall', short: 'BW', side: -1, desk: 'Rates & Macro Desk', color: '#ff9a5a', accent: '#ffc79e', stone: '#5a4a42',
    symbols: ['^TNX', '^TYX', '^FVX', '^IRX', 'TLT', 'IEF', 'HYG', 'DX-Y.NYB'],
  },
  {
    id: 'renaissance', name: 'Renaissance Fair', short: 'RF', side: 1, desk: 'Quant & Crypto Desk', color: '#c38bff', accent: '#e0c4ff', stone: '#453d55',
    symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'COIN', 'MSTR', 'PLTR', 'HOOD', 'SMCI'],
  },
];

export const EXCHANGE = {
  id: 'exchange', name: 'The Exchange', short: 'EX', desk: 'Market Overview', color: '#f5d27a', accent: '#ffe7a8',
  symbols: ['^GSPC', '^DJI', '^IXIC', '^RUT', 'SPY', 'QQQ', 'AAPL', 'NVDA'],
};

const FIRST = ['Chad', 'Brad', 'Tripp', 'Priya', 'Mei', 'Jordan', 'Sofia', 'Marcus', 'Aisha', 'Dmitri', 'Kenji', 'Olivia', 'Raj', 'Hunter', 'Tanya', 'Luca', 'Nia', 'Blake', 'Chen', 'Isabella', 'Tyler', 'Fatima', 'Grant', 'Yuki', 'Diego', 'Hannah', 'Kwame', 'Sasha', 'Preston', 'Leah', 'Omar', 'Bianca', 'Wes', 'Anika', 'Theo', 'Carmen', 'Rohan', 'Ellie', 'Kofi', 'Maya'];
const LAST = ['Sterling', 'Vance', 'Whitmore', 'Kapoor', 'Zhang', 'Rossi', 'Okafor', 'Novak', 'Tanaka', 'Hale', 'Mercer', 'Reyes', 'Brooks', 'Ivanova', 'Carver', 'Singh', 'Adler', 'Moreau', 'Park', 'Fitzgerald'];
const ROLES = ['Senior Trader', 'Associate', 'VP, Execution', 'Analyst', 'Managing Director', 'Quant', 'Sales Trader', 'Portfolio Manager', 'Intern (unpaid)', 'Risk'];

export function trader(firmIndex, seat) {
  const n = firmIndex * 131 + seat * 17;
  return {
    name: `${FIRST[(n * 7 + seat) % FIRST.length]} ${LAST[(n * 3 + firmIndex) % LAST.length]}`,
    role: ROLES[(n + seat * 3) % ROLES.length],
  };
}

export const SHOUTS = [
  'BUY BUY BUY!', 'Where is my fill?!', 'Powell is talking!', 'Sell the rip!', 'Who is selling?!', 'Get me out!',
  'Lift the offer!', 'Hit the bid!', 'Volume is insane', 'I need a coffee', 'Risk on, baby', 'Cover! Cover!',
  'Is this the top?', 'Size it up!', 'Stop out, stop out', "What's the print?",
];
