// The house X account. One definition, so every screen links to the same place.
export const X_URL = 'https://x.com/wallstreetrooms';
export const X_HANDLE = '@wallstreetrooms';

const GLYPH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';

// `extra` lets a host add its own class (the laptop header, the boot card, …)
export const xLink = (extra = '', label = '') =>
  `<a class="x-link ${extra}" href="${X_URL}" target="_blank" rel="noopener noreferrer" title="Follow Wall St. on X (${X_HANDLE})" aria-label="Follow Wall St. on X">${GLYPH}${label ? `<span>${label}</span>` : ''}</a>`;

// The token contract address, shown on screen and copyable everywhere.
export const CA = '0x351a5e096140f34ca67e4f901e6813ca7c032403';
export const caShort = (n = 6) => `${CA.slice(0, n + 2)}...${CA.slice(-4)}`;

// `full` prints the whole address; otherwise it is shortened with the full value in the tooltip
export const caPill = (extra = '', full = false) =>
  `<button type="button" class="ca-pill ${extra}" data-ca title="Copy the contract address: ${CA}" aria-label="Copy the contract address">` +
  `<i>CA</i><b>${full ? CA : caShort()}</b><em>copy</em></button>`;
