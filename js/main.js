import * as THREE from 'three';
import { buildRoom } from './room.js';
import { createTerminal } from './terminal.js';
import { DESKS, INDICES, label } from './data.js';
import { quotes, watch, onQuotes, refresh, startPolling, fmtPrice, fmtPct, tone } from './market.js';
import { radio } from './music.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------------------------------------------------------------- setup
const isTouch = matchMedia('(pointer: coarse)').matches;
const lowPower = isTouch || innerWidth < 760 || new URLSearchParams(location.search).has('low');

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#07040f');
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 200);
const maxAniso = renderer.capabilities.getMaxAnisotropy();
function canvasTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, maxAniso);
  return t;
}

const $ = (s) => document.querySelector(s);
if (isTouch) $('#notice').lastChild.textContent = 'Tap on any computer to see the live market';
const hint = $('#hint'), helpEl = $('#help'), tapeEl = $('#tape');

// ---------------------------------------------------------------- room
const hits = [];
const tag = (obj, action, data) => obj.traverse((o) => { if (o.isMesh) { o.userData.action = action; o.userData.data = data; hits.push(o); } });
// neon signs are painted with web fonts: wait for them before building textures
await Promise.race([Promise.all(['40px Monoton', '40px VT323'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
const room = buildRoom({ canvasTex, lowPower, tag, onShout: (seat, text) => shout(seat, text) });
scene.add(room.group);

// neon glow
const composer = lowPower ? null : new EffectComposer(renderer);
if (composer) {
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.86));
  composer.addPass(new OutputPass());
}

// ---------------------------------------------------------------- overview camera
// A fixed view of the whole floor that drifts gently; the pointer adds a little parallax.
const LOOK = new THREE.Vector3(0, 1.3, -1.4);
const view = { dist: 30, height: 15 };
function fitView() {
  const a = innerWidth / innerHeight;
  camera.aspect = a;
  camera.fov = a < 0.8 ? 58 : 42;
  camera.updateProjectionMatrix();
  // pull back until the room's width fits the screen
  const halfW = 11.5, vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * a);
  view.dist = Math.max(14, halfW / Math.tan(hFov / 2));
  view.height = view.dist * 0.52;
}
fitView();
const pointer = new THREE.Vector2();
const parallax = new THREE.Vector2();
function overviewPose(t) {
  const yaw = Math.sin(t * 0.06) * 0.1 + parallax.x * 0.08;
  const p = new THREE.Vector3(Math.sin(yaw) * view.dist, view.height - parallax.y * 1.2, Math.cos(yaw) * view.dist).add(new THREE.Vector3(LOOK.x, 0, LOOK.z));
  return { p, look: LOOK.clone() };
}
const camLook = new THREE.Vector3();

// ---------------------------------------------------------------- terminal
const terminal = createTerminal($('#terminal'), { onClose: () => closeLaptop() });

let mode = 'boot'; // boot | view | zoom | laptop
let tween = null;
let activeSeat = null;
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
function flyTo(p, look, dur, done) {
  tween = { p0: camera.position.clone(), l0: camLook.clone(), p1: p.clone(), l1: look.clone(), start: performance.now(), dur, done };
}

function openLaptop(seat) {
  if (mode !== 'view') return;
  mode = 'zoom';
  activeSeat = seat;
  hint.hidden = true;
  const sp = seat.screen.getWorldPosition(new THREE.Vector3());
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(seat.screen.getWorldQuaternion(new THREE.Quaternion()));
  seat.person.root.visible = false;
  document.body.classList.add('zooming');
  flyTo(sp.clone().add(n.multiplyScalar(0.9)).add(new THREE.Vector3(0, 0.05, 0)), sp, 1100, () => {
    mode = 'laptop';
    document.body.classList.remove('zooming');
    document.body.classList.add('in-laptop');
    terminal.open({ desk: seat.desk, symbol: seat.symbol, who: seat.who });
    startPolling(15000);
  });
}

function openBoard(kind, view = 'markets') {
  if (mode !== 'view') return;
  mode = 'laptop';
  activeSeat = null;
  hint.hidden = true;
  document.body.classList.add('in-laptop');
  terminal.open({ desk: DESKS[kind], symbol: DESKS[kind].symbols[0], who: null, view });
  startPolling(15000);
}

function closeLaptop() {
  if (mode !== 'laptop') return;
  terminal.close();
  document.body.classList.remove('in-laptop');
  startPolling(30000);
  if (!activeSeat) { mode = 'view'; return; }
  mode = 'zoom';
  const seat = activeSeat;
  flyTo(overviewPose((performance.now() - clock0) / 1000).p, LOOK, 1000, () => {
    seat.person.root.visible = true;
    activeSeat = null;
    mode = 'view';
  });
}

// ---------------------------------------------------------------- shouts
const bubbles = [];
for (let i = 0; i < 3; i++) {
  const el = document.createElement('div');
  el.className = 'bubble';
  el.hidden = true;
  document.body.appendChild(el);
  bubbles.push({ el, seat: null, until: 0 });
}
function shout(seat, text) {
  if (mode !== 'view') return;
  const b = bubbles.reduce((a, c) => (c.until < a.until ? c : a));
  b.seat = seat;
  b.until = performance.now() + 2600;
  b.el.textContent = text;
  b.el.style.setProperty('--c', seat.desk.color);
  b.el.hidden = false;
  b.el.classList.remove('pop');
  void b.el.offsetWidth;
  b.el.classList.add('pop');
}

// ---------------------------------------------------------------- HUD
function toggleHelp(force) { helpEl.hidden = force === undefined ? !helpEl.hidden : !force; }
helpEl.addEventListener('click', (e) => { if (e.target === helpEl || e.target.closest('[data-close]')) toggleHelp(false); });
$('#dock').addEventListener('click', (e) => {
  const a = e.target.closest('[data-a]')?.dataset.a;
  if (a === 'memes' || a === 'stocks') openBoard(a);
  else if (a === 'portfolio') openBoard('memes', 'portfolio');
  else if (a === 'cli') openBoard('memes', 'cli');
  else if (a === 'radio') radio.toggle();
  else if (a === 'help') toggleHelp();
});

function renderTape(el, symbols) {
  el.innerHTML = symbols.map((s) => {
    const q = quotes.get(s);
    return `<span><b>${label(s)}</b> ${q ? fmtPrice(q.price, s) : '···'} <em style="color:${tone(q?.changePct)}">${q ? fmtPct(q.changePct) : ''}</em></span>`;
  }).join('');
}
radio.on((r) => {
  const btn = $('.radio-btn');
  btn.classList.toggle('on', r.playing);
  btn.querySelector('span').textContent = r.playing ? r.track.name : 'Music off';
});

const hudTape = [...DESKS.memes.symbols.slice(0, 5), ...INDICES.slice(0, 5)];
onQuotes(() => { renderTape(tapeEl, hudTape); renderTape($('#boot-tape'), hudTape); });

// ---------------------------------------------------------------- input
addEventListener('keydown', (e) => {
  if (mode === 'laptop') {
    if (terminal.onKey(e)) return;
    if (e.key === 'Escape') closeLaptop();
    return;
  }
  if (mode === 'boot' && (e.key === 'Enter' || e.key === ' ')) return start();
  if (e.key === 'Escape') toggleHelp(false);
  else if (e.key === '?') toggleHelp();
});

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObjects(hits, false)[0]?.object;
}
function describe(o) {
  const { action, data } = o.userData;
  if (action === 'board') return `${DESKS[data].name} board · open`;
  if (action === 'radio') return radio.playing ? 'Lo-fi radio · stop' : 'Lo-fi radio · play';
  if (action === 'seat') {
    const s = room.seats[data];
    return `${s.who.name} · ${label(s.symbol)} · open computer`;
  }
  return null;
}

addEventListener('pointermove', (e) => {
  pointer.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5);
  if (mode !== 'view' || e.pointerType === 'touch' || e.target !== canvas) { hint.hidden = true; return; }
  const o = pick(e.clientX, e.clientY);
  const text = o && describe(o);
  canvas.style.cursor = text ? 'pointer' : 'default';
  hint.hidden = !text;
  if (text) {
    hint.textContent = text;
    hint.style.transform = `translate(${Math.min(e.clientX + 16, innerWidth - 260)}px, ${e.clientY + 18}px)`;
  }
});
canvas.addEventListener('click', (e) => {
  if (mode !== 'view') return;
  const o = pick(e.clientX, e.clientY);
  if (!o) return;
  if (o.userData.action === 'seat') openLaptop(room.seats[o.userData.data]);
  else if (o.userData.action === 'board') openBoard(o.userData.data);
  else if (o.userData.action === 'radio') radio.toggle();
});

// ---------------------------------------------------------------- boot
const bootEl = $('#boot');
$('#enter').addEventListener('click', start);
$('#enter').disabled = false;
function start() {
  if (mode !== 'boot') return;
  bootEl.classList.add('leaving');
  setTimeout(() => (bootEl.hidden = true), 900);
  document.body.classList.add('entered');
  mode = 'zoom';
  flyTo(overviewPose((performance.now() - clock0) / 1000 + 2.6).p, LOOK, lowPower ? 1800 : 2600, () => (mode = 'view'));
}

// boot view: low over the front of the floor
camera.position.set(0, 5, 20);
camLook.set(0, 2, -6);
camera.lookAt(camLook);

watch([...INDICES, ...DESKS.memes.symbols, ...DESKS.memes.tape, ...DESKS.stocks.symbols]);
startPolling(30000);
refresh();

// ---------------------------------------------------------------- loop
const clock0 = performance.now();
let lastT = clock0;
const hv = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const t = (now - clock0) / 1000;
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  parallax.lerp(pointer, isTouch ? 0 : Math.min(1, dt * 2));
  if (tween) {
    const k = Math.min(1, (now - tween.start) / tween.dur), e = ease(k);
    camera.position.lerpVectors(tween.p0, tween.p1, e);
    camLook.lerpVectors(tween.l0, tween.l1, e);
    if (k >= 1) { const d = tween.done; tween = null; d?.(); }
  } else if (mode === 'view') {
    const { p, look } = overviewPose(t);
    camera.position.copy(p);
    camLook.copy(look);
  } else if (mode === 'boot') {
    camera.position.set(Math.sin(t * 0.15) * 3, 5, 20);
  }
  camera.lookAt(camLook);

  if (mode !== 'laptop') room.update(t, dt, quotes, now, radio);

  bubbles.forEach((b) => {
    if (b.el.hidden) return;
    if (now > b.until || mode !== 'view') { b.el.hidden = true; return; }
    b.seat.person.neck.getWorldPosition(hv);
    hv.y += 0.6;
    hv.project(camera);
    b.el.style.left = `${((hv.x + 1) / 2) * innerWidth}px`;
    b.el.style.top = `${((1 - hv.y) / 2) * innerHeight}px`;
  });

  if (mode !== 'laptop') composer ? composer.render() : renderer.render(scene, camera);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
  fitView();
});

// #floor skips the title screen
if (location.hash === '#floor') {
  bootEl.hidden = true;
  document.body.classList.add('entered');
  mode = 'view';
}

// handy for debugging from the console
window.__ws = { renderer, scene, camera, room };
