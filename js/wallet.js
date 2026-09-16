// Real browser-extension wallet connection (address only: no signing, no transactions).
// EVM: EIP-6963 multi-provider discovery (MetaMask, Rabby, Phantom, Brave, Coinbase, OKX, Trust…),
//      falling back to window.ethereum.
// Solana: Wallet Standard discovery (Phantom, Solflare, Backpack, Coinbase, Brave…),
//      falling back to the legacy injected providers.

const KEY = 'ws.wallets.v1';
const listeners = new Set();

const state = {
  evm: { providers: new Map(), connected: null },    // connected: { id, name, icon, address, chainId }
  solana: { wallets: new Map(), connected: null },   // connected: { id, name, icon, address }
};

const emit = () => listeners.forEach((fn) => fn(state));
const safeIcon = (icon) => (typeof icon === 'string' && /^data:image\/(svg\+xml|png|jpeg|webp|gif)[;,]/.test(icon) ? icon : null);

function remember() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ evm: state.evm.connected?.id || null, solana: state.solana.connected?.id || null }));
  } catch { /* storage blocked */ }
}
function remembered() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

export const CHAINS = {
  1: 'Ethereum', 10: 'Optimism', 56: 'BNB Chain', 137: 'Polygon', 8453: 'Base', 42161: 'Arbitrum',
  43114: 'Avalanche', 59144: 'Linea', 324: 'zkSync', 81457: 'Blast', 4663: 'Robinhood Chain', 11155111: 'Sepolia',
};
export const chainName = (id) => CHAINS[id] || (id ? `Chain ${id}` : '');

// ------------------------------------------------ EVM discovery (EIP-6963)
window.addEventListener('eip6963:announceProvider', (e) => {
  const { info, provider } = e.detail || {};
  if (!info?.uuid || !provider?.request) return;
  const id = info.rdns || info.uuid;
  state.evm.providers.set(id, { id, name: info.name, icon: safeIcon(info.icon), rdns: info.rdns, provider });
  emit();
});
window.dispatchEvent(new Event('eip6963:requestProvider'));

function legacyEvm() {
  const eth = window.ethereum;
  if (!eth?.request || state.evm.providers.size) return;
  const list = eth.providers?.length ? eth.providers : [eth];
  for (const p of list) {
    const name = p.isRabby ? 'Rabby' : p.isPhantom ? 'Phantom' : p.isBraveWallet ? 'Brave Wallet' : p.isCoinbaseWallet ? 'Coinbase Wallet' : p.isOkxWallet ? 'OKX Wallet' : p.isMetaMask ? 'MetaMask' : 'Browser wallet';
    const id = `legacy:${name}`;
    if (!state.evm.providers.has(id)) state.evm.providers.set(id, { id, name, icon: null, provider: p });
  }
  emit();
}

function watchEvm(entry) {
  const p = entry.provider;
  if (p.__wsWatched) return;
  p.__wsWatched = true;
  p.on?.('accountsChanged', (accounts) => {
    if (state.evm.connected?.id !== entry.id) return;
    if (!accounts?.length) { state.evm.connected = null; remember(); }
    else state.evm.connected = { ...state.evm.connected, address: accounts[0] };
    emit();
  });
  p.on?.('chainChanged', (chainId) => {
    if (state.evm.connected?.id !== entry.id) return;
    state.evm.connected = { ...state.evm.connected, chainId: parseInt(chainId, 16) };
    emit();
  });
  p.on?.('disconnect', () => {
    if (state.evm.connected?.id !== entry.id) return;
    state.evm.connected = null;
    remember();
    emit();
  });
}

async function connectEvm(id, { silent = false } = {}) {
  const entry = state.evm.providers.get(id);
  if (!entry) throw new Error('That wallet is no longer available. Refresh and try again.');
  const accounts = await entry.provider.request({ method: silent ? 'eth_accounts' : 'eth_requestAccounts' });
  if (!accounts?.length) {
    if (silent) return null;
    throw new Error('No account was shared. Unlock the wallet and try again.');
  }
  const chainId = parseInt(await entry.provider.request({ method: 'eth_chainId' }).catch(() => '0x1'), 16);
  state.evm.connected = { id, name: entry.name, icon: entry.icon, address: accounts[0], chainId };
  watchEvm(entry);
  remember();
  emit();
  return state.evm.connected;
}

async function disconnectEvm() {
  const entry = state.evm.providers.get(state.evm.connected?.id);
  // Not every wallet supports revoking; where it does, this removes the site's permission.
  await entry?.provider.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }).catch(() => {});
  state.evm.connected = null;
  remember();
  emit();
}

// ------------------------------------------------ Solana discovery (Wallet Standard)
function registerStandard(...wallets) {
  for (const w of wallets) {
    const isSolana = (w.chains || []).some((c) => String(c).startsWith('solana:'));
    if (!isSolana || !w.features?.['standard:connect']) continue;
    const id = `std:${w.name}`;
    state.solana.wallets.set(id, { id, name: w.name, icon: safeIcon(w.icon), standard: w });
  }
  emit();
  return () => {};
}
window.addEventListener('wallet-standard:register-wallet', (e) => {
  try { e.detail?.({ register: registerStandard }); } catch { /* ignore bad wallets */ }
});
try {
  window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: { register: registerStandard } }));
} catch { /* old browsers */ }

function legacySolana() {
  const found = [
    ['Phantom', window.phantom?.solana],
    ['Solflare', window.solflare],
    ['Backpack', window.backpack],
    ['Brave Wallet', window.braveSolana],
    ['Coinbase Wallet', window.coinbaseSolana],
    ['OKX Wallet', window.okxwallet?.solana],
  ];
  for (const [name, p] of found) {
    if (!p?.connect) continue;
    if ([...state.solana.wallets.values()].some((w) => w.name.toLowerCase().startsWith(name.split(' ')[0].toLowerCase()))) continue;
    state.solana.wallets.set(`legacy:${name}`, { id: `legacy:${name}`, name, icon: null, legacy: p });
  }
  emit();
}

async function connectSolana(id, { silent = false } = {}) {
  const w = state.solana.wallets.get(id);
  if (!w) throw new Error('That wallet is no longer available. Refresh and try again.');
  let address;
  if (w.standard) {
    const res = await w.standard.features['standard:connect'].connect(silent ? { silent: true } : undefined);
    const accounts = res?.accounts?.length ? res.accounts : w.standard.accounts;
    address = accounts?.[0]?.address;
    if (!w.__wsWatched && w.standard.features['standard:events']) {
      w.__wsWatched = true;
      w.standard.features['standard:events'].on('change', ({ accounts: next }) => {
        if (state.solana.connected?.id !== id || !next) return;
        if (!next.length) { state.solana.connected = null; remember(); }
        else state.solana.connected = { ...state.solana.connected, address: next[0].address };
        emit();
      });
    }
  } else {
    const res = await w.legacy.connect(silent ? { onlyIfTrusted: true } : undefined);
    address = (res?.publicKey || w.legacy.publicKey)?.toString();
    if (!w.__wsWatched) {
      w.__wsWatched = true;
      w.legacy.on?.('accountChanged', (pk) => {
        if (state.solana.connected?.id !== id) return;
        if (!pk) { state.solana.connected = null; remember(); }
        else state.solana.connected = { ...state.solana.connected, address: pk.toString() };
        emit();
      });
      w.legacy.on?.('disconnect', () => { if (state.solana.connected?.id === id) { state.solana.connected = null; remember(); emit(); } });
    }
  }
  if (!address) {
    if (silent) return null;
    throw new Error('No account was shared. Unlock the wallet and try again.');
  }
  state.solana.connected = { id, name: w.name, icon: w.icon, address };
  remember();
  emit();
  return state.solana.connected;
}

async function disconnectSolana() {
  const w = state.solana.wallets.get(state.solana.connected?.id);
  try {
    if (w?.standard?.features['standard:disconnect']) await w.standard.features['standard:disconnect'].disconnect();
    else await w?.legacy?.disconnect?.();
  } catch { /* wallet refused; forget it locally anyway */ }
  state.solana.connected = null;
  remember();
  emit();
}

// ------------------------------------------------ public API
export const wallets = {
  state,
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  connect: (kind, id) => (kind === 'evm' ? connectEvm(id) : connectSolana(id)),
  disconnect: (kind) => (kind === 'evm' ? disconnectEvm() : disconnectSolana()),
  get anyConnected() { return !!(state.evm.connected || state.solana.connected); },
  // Extensions inject at slightly different times: look again for late arrivals.
  rescan() {
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    legacyEvm();
    legacySolana();
  },
};

// Pick up late-injecting extensions, then quietly restore the last session (no popups).
setTimeout(async () => {
  wallets.rescan();
  const last = remembered();
  if (last.evm && state.evm.providers.has(last.evm)) await connectEvm(last.evm, { silent: true }).catch(() => {});
  if (last.solana && state.solana.wallets.has(last.solana)) await connectSolana(last.solana, { silent: true }).catch(() => {});
}, 600);

export const INSTALL = [
  { name: 'MetaMask', url: 'https://metamask.io/download/', chains: 'ETH' },
  { name: 'Rabby', url: 'https://rabby.io/', chains: 'ETH' },
  { name: 'Phantom', url: 'https://phantom.com/download', chains: 'SOL + ETH' },
  { name: 'Coinbase Wallet', url: 'https://www.coinbase.com/wallet/downloads', chains: 'SOL + ETH' },
  { name: 'Solflare', url: 'https://solflare.com/download', chains: 'SOL' },
  { name: 'Backpack', url: 'https://backpack.app/download', chains: 'SOL' },
];

// On phones there are no extensions: open this page inside the wallet's own browser instead.
export function mobileLinks(href = location.href) {
  const url = encodeURIComponent(href);
  return [
    { name: 'Phantom', url: `https://phantom.app/ul/browse/${url}?ref=${encodeURIComponent(location.origin)}` },
    { name: 'MetaMask', url: `https://metamask.app.link/dapp/${location.host}${location.pathname}` },
    { name: 'Coinbase Wallet', url: `https://go.cb-w.com/dapp?cb_url=${url}` },
    { name: 'Solflare', url: `https://solflare.com/ul/v1/browse/${url}?ref=${encodeURIComponent(location.origin)}` },
  ];
}
