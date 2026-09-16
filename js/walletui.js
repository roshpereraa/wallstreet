// Wallet picker modal + "Connect" buttons. Shows the connected addresses; nothing is ever signed.
import { wallets, chainName, INSTALL, mobileLinks } from './wallet.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const shortAddr = (a) => (a ? `${a.slice(0, a.startsWith('0x') ? 6 : 4)}…${a.slice(-4)}` : '');
const EXPLORERS = { 1: 'https://etherscan.io/address/', 8453: 'https://basescan.org/address/', 42161: 'https://arbiscan.io/address/', 56: 'https://bscscan.com/address/', 10: 'https://optimistic.etherscan.io/address/', 137: 'https://polygonscan.com/address/', 59144: 'https://lineascan.build/address/' };
const isTouch = matchMedia('(pointer: coarse)').matches;

const modal = document.createElement('div');
modal.id = 'wallets';
modal.hidden = true;
modal.setAttribute('role', 'dialog');
modal.setAttribute('aria-label', 'Connect a wallet');
document.body.appendChild(modal);

const errors = { evm: '', solana: '' };
let busy = null;

function icon(entry) {
  return entry.icon ? `<img src="${esc(entry.icon)}" alt="" width="28" height="28">` : `<i class="wl-fallback">${esc(entry.name.slice(0, 1))}</i>`;
}

function column(kind) {
  const isEvm = kind === 'evm';
  const s = isEvm ? wallets.state.evm : wallets.state.solana;
  const list = [...(isEvm ? s.providers.values() : s.wallets.values())];
  const c = s.connected;
  const explorer = c && (isEvm ? (EXPLORERS[c.chainId] ? EXPLORERS[c.chainId] + c.address : null) : `https://solscan.io/account/${c.address}`);
  return `
    <section class="wl-col">
      <h3><span class="wl-chain ${kind}">${isEvm ? 'Ξ' : '◎'}</span>${isEvm ? 'Ethereum &amp; EVM' : 'Solana'}</h3>
      ${c ? `
        <div class="wl-connected">
          ${icon(c)}
          <div class="wl-who"><b>${esc(c.name)}</b><code title="${esc(c.address)}">${esc(shortAddr(c.address))}</code>
            <small>${isEvm ? esc(chainName(c.chainId)) : 'Solana mainnet'} · connected</small></div>
          <div class="wl-actions">
            <button data-copy="${esc(c.address)}">Copy</button>
            ${explorer ? `<a href="${esc(explorer)}" target="_blank" rel="noopener noreferrer">Explorer ↗</a>` : ''}
            <button class="wl-disconnect" data-disconnect="${kind}">Disconnect</button>
          </div>
        </div>
        <p class="wl-full">${esc(c.address)}</p>` : ''}
      <div class="wl-list">
        ${list.length ? list.map((w) => `
          <button class="wl-option${c?.id === w.id ? ' on' : ''}" data-connect="${kind}" data-id="${esc(w.id)}" ${busy ? 'disabled' : ''}>
            ${icon(w)}<span>${esc(w.name)}</span><em>${busy === `${kind}:${w.id}` ? 'Check your wallet…' : c?.id === w.id ? 'Connected' : 'Detected'}</em>
          </button>`).join('') : `<p class="wl-none">No ${isEvm ? 'Ethereum' : 'Solana'} wallet extension found in this browser.</p>`}
      </div>
      ${errors[kind] ? `<p class="wl-error">${esc(errors[kind])}</p>` : ''}
    </section>`;
}

function render() {
  const none = !wallets.state.evm.providers.size && !wallets.state.solana.wallets.size;
  modal.innerHTML = `
    <div class="wl-card">
      <header><h2>Connect a wallet</h2><button class="wl-close" aria-label="Close">✕</button></header>
      <p class="wl-note">Read-only: the site only reads your public address. It never asks you to sign or send anything, and trading here stays paper/fake money.</p>
      <div class="wl-cols">${column('evm')}${column('solana')}</div>
      ${none && isTouch ? `
        <div class="wl-mobile"><h4>On your phone?</h4><p>Browser extensions don’t run on mobile. Open this page inside your wallet app’s browser:</p>
          <div>${mobileLinks().map((l) => `<a href="${esc(l.url)}" rel="noopener noreferrer">${esc(l.name)}</a>`).join('')}</div></div>` : ''}
      <details class="wl-install"${none ? ' open' : ''}><summary>Don’t have a wallet extension?</summary>
        <div>${INSTALL.map((i) => `<a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(i.name)}</b><small>${esc(i.chains)}</small></a>`).join('')}</div>
        <p>Brave has a built-in wallet (Brave menu → Wallet). After installing, refresh this page.</p>
      </details>
    </div>`;
}

export function openWallets() {
  wallets.rescan();
  errors.evm = errors.solana = '';
  render();
  modal.hidden = false;
}

function friendly(err) {
  if (err?.code === 4001 || /reject|denied|cancel/i.test(err?.message || '')) return 'Request rejected in the wallet.';
  if (err?.code === -32002) return 'A request is already open in your wallet. Open the extension to approve it.';
  return err?.message || 'Could not connect. Unlock the wallet and try again.';
}

modal.addEventListener('click', async (e) => {
  if (e.target === modal || e.target.closest('.wl-close')) { modal.hidden = true; return; }
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.copy) {
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied ✓'; } catch { b.textContent = 'Copy failed'; }
    return;
  }
  if (b.dataset.disconnect) { await wallets.disconnect(b.dataset.disconnect); return; }
  if (b.dataset.connect) {
    const kind = b.dataset.connect;
    busy = `${kind}:${b.dataset.id}`;
    errors[kind] = '';
    render();
    try { await wallets.connect(kind, b.dataset.id); } catch (err) { errors[kind] = friendly(err); }
    busy = null;
    render();
  }
});
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) { modal.hidden = true; e.stopPropagation(); } }, true);

// Every element with [data-wallet-button] becomes a live connect / address button.
export function renderWalletButtons() {
  const { evm, solana } = wallets.state;
  const parts = [evm.connected && `Ξ ${shortAddr(evm.connected.address)}`, solana.connected && `◎ ${shortAddr(solana.connected.address)}`].filter(Boolean);
  document.querySelectorAll('[data-wallet-button]').forEach((el) => {
    el.classList.toggle('connected', parts.length > 0);
    const label = el.querySelector('span') || el;
    label.textContent = parts.length ? parts.join('  ') : 'Connect wallet';
    el.title = parts.length ? [evm.connected && `${evm.connected.name}: ${evm.connected.address}`, solana.connected && `${solana.connected.name}: ${solana.connected.address}`].filter(Boolean).join('\n') : 'Connect MetaMask, Rabby, Phantom, Coinbase, Brave…';
  });
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-wallet-button]')) { e.preventDefault(); e.stopPropagation(); openWallets(); }
}, true);

wallets.on(() => { renderWalletButtons(); if (!modal.hidden) render(); });
renderWalletButtons();
