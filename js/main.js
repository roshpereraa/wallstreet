import * as THREE from 'three';
import { buildFloor } from './floor.js';
import { person, walk } from './avatar.js';
import { createTerminal } from './terminal.js';
import { FIRMS, INDICES, label } from './data.js';
import { quotes, watch, onQuotes, refresh, startPolling, fmtPrice, fmtPct, tone } from './market.js';

// ---------------------------------------------------------------- setup
const isTouch = matchMedia('(pointer: coarse)').matches;
const lowPower = isTouch || innerWidth < 760;

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0c10');
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 200);
const maxAniso = renderer.capabilities.getMaxAnisotropy();
function canvasTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, maxAniso);
  return t;
}
const tagger = (list) => (obj, action, data) => obj.traverse((o) => { if (o.isMesh) { o.userData.action = action; o.userData.data = data; list.push(o); } });

const $ = (s) => document.querySelector(s);
const hint = $('#hint'), prompt = $('#prompt'), fade = $('#fade'), place = $('#place'), dock = $('#dock'), helpEl = $('#help'), tapeEl = $('#tape');

// ---------------------------------------------------------------- floors
const floors = new Map();
function getFloor(fi) {
  if (!floors.has(fi)) {
    const hits = [];
    const data = buildFloor(fi, { canvasTex, lowPower, tag: tagger(hits), onShout: (seat, text) => shout(seat, text) });
    floors.set(fi, { data, hits, firm: fi });
  }
  return floors.get(fi);
}

const deepFirm = FIRMS.findIndex((f) => `floor-${f.id}` === location.hash.slice(1));
let world = getFloor(Math.max(0, deepFirm));
scene.add(world.data.group);

// ---------------------------------------------------------------- player
const me = person(777, { briefcase: true });
scene.add(me.root);
const pos = world.data.spawn.clone();
const player = { yaw: Math.PI, speed: 0, phase: 0, target: null };
let camYaw = 0, camPitch = 0.26, camDist = 4.6;
const camLook = new THREE.Vector3();

// ---------------------------------------------------------------- terminal
const terminal = createTerminal($('#terminal'), { onClose: () => closeLaptop() });

// ---------------------------------------------------------------- modes
let mode = 'boot'; // boot | intro | walk | fade | zoom | laptop
let tween = null;
let activeSeat = null;
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
function flyTo(p, look, dur, done) {
  tween = { p0: camera.position.clone(), l0: camLook.clone(), p1: p.clone(), l1: look.clone(), start: performance.now(), dur, done };
}

function followCamera() {
  const dist = Math.min(camDist, 6);
  const h = Math.sin(camPitch) * dist + 1.6;
  const flat = Math.cos(camPitch) * dist;
  const b = world.data.bounds;
  const p = new THREE.Vector3(
    THREE.MathUtils.clamp(pos.x + Math.sin(camYaw) * flat, b.minX - 0.3, b.maxX + 0.3),
    Math.min(pos.y + h, 5.1),
    THREE.MathUtils.clamp(pos.z + Math.cos(camYaw) * flat, b.minZ - 0.8, b.maxZ + 0.4),
  );
  return { p, look: new THREE.Vector3(pos.x, pos.y + 1.45, pos.z) };
}

function switchFloor(fi) {
  if (mode !== 'walk' || fi === world.firm) return;
  mode = 'fade';
  fade.classList.add('on');
  hint.hidden = true;
  setTimeout(() => {
    scene.remove(world.data.group);
    world = getFloor(fi);
    scene.add(world.data.group);
    watch(FIRMS[fi].symbols);
    pos.copy(world.data.spawn);
    player.yaw = Math.PI;
    player.target = null;
    camYaw = 0;
    const { p, look } = followCamera();
    camera.position.copy(p);
    camLook.copy(look);
    bubbles.forEach((b) => (b.el.hidden = true));
    syncHud();
    requestAnimationFrame(() => {
      fade.classList.remove('on');
      mode = 'walk';
      toast(`${FIRMS[fi].name} · ${FIRMS[fi].desk}`);
    });
  }, 420);
}

function openLaptop(seat) {
  if (mode !== 'walk') return;
  mode = 'zoom';
  activeSeat = seat;
  hint.hidden = true;
  prompt.hidden = true;
  player.target = null;
  const sp = seat.screen.getWorldPosition(new THREE.Vector3());
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(seat.screen.getWorldQuaternion(new THREE.Quaternion()));
  // stand the visitor in the aisle behind the chair so the camera returns somewhere sensible
  const seatPos = seat.seat.getWorldPosition(new THREE.Vector3());
  pos.set(seatPos.x + 0.9, 0, seatPos.z + 2.25);
  seat.person.root.visible = false;
  me.root.visible = false;
  document.body.classList.add('zooming');
  flyTo(sp.clone().add(n.multiplyScalar(0.5)).add(new THREE.Vector3(0, 0.03, 0)), sp, 1000, () => {
    mode = 'laptop';
    document.body.classList.remove('zooming');
    document.body.classList.add('in-laptop');
    terminal.open({ firm: FIRMS[seat.firm], symbol: seat.symbol, who: seat.who });
    startPolling(15000);
  });
}

function openOverview(firm) {
  if (mode !== 'walk') return;
  mode = 'laptop';
  activeSeat = null;
  hint.hidden = prompt.hidden = true;
  document.body.classList.add('in-laptop');
  terminal.open({ firm, symbol: firm.symbols[0], who: null });
  startPolling(15000);
}

function closeLaptop() {
  if (mode !== 'laptop') return;
  terminal.close();
  document.body.classList.remove('in-laptop');
  startPolling(30000);
  if (!activeSeat) { mode = 'walk'; return; }
  mode = 'zoom';
  const { p, look } = followCamera();
  const seat = activeSeat;
  flyTo(p, look, 900, () => {
    seat.person.root.visible = true;
    me.root.visible = true;
    activeSeat = null;
    mode = 'walk';
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
  if (mode !== 'walk') return;
  const b = bubbles.reduce((a, c) => (c.until < a.until ? c : a));
  b.seat = seat;
  b.until = performance.now() + 2600;
  b.el.textContent = text;
  b.el.hidden = false;
  b.el.classList.remove('pop');
  void b.el.offsetWidth;
  b.el.classList.add('pop');
}

let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3600);
}

// ---------------------------------------------------------------- HUD
function syncHud() {
  const f = FIRMS[world.firm];
  place.innerHTML = `<b style="color:${f.color}">${f.name}</b><span>${f.desk} · ${world.data.seats.length} traders</span>`;
  dock.innerHTML = `
    <label class="dock-floor" title="Switch trading floor">
      <i>⇅</i>
      <select aria-label="Trading floor">${FIRMS.map((x, i) => `<option value="${i}"${i === world.firm ? ' selected' : ''}>${x.name}</option>`).join('')}</select>
    </label>
    <button data-a="overview" title="Desk overview (Q)"><i>▤</i><span>Markets</span></button>
    <button data-a="help" title="Controls (?)"><i>?</i><span>Help</span></button>`;
}
dock.addEventListener('click', (e) => {
  const a = e.target.closest('[data-a]')?.dataset.a;
  if (a === 'overview') openOverview(FIRMS[world.firm]);
  else if (a === 'help') toggleHelp();
});
dock.addEventListener('change', (e) => {
  if (e.target.matches('select')) { switchFloor(Number(e.target.value)); e.target.blur(); }
});
function toggleHelp(force) { helpEl.hidden = force === undefined ? !helpEl.hidden : !force; }
helpEl.addEventListener('click', (e) => { if (e.target === helpEl || e.target.closest('[data-close]')) toggleHelp(false); });

function renderTape(el) {
  el.innerHTML = INDICES.map((s) => {
    const q = quotes.get(s);
    return `<span><b>${label(s)}</b> ${q ? fmtPrice(q.price, s) : '···'} <em style="color:${tone(q?.change)}">${q ? fmtPct(q.changePct) : ''}</em></span>`;
  }).join('');
}
onQuotes(() => { renderTape(tapeEl); renderTape($('#boot-tape')); });

prompt.addEventListener('click', () => nearest?.run());

// ---------------------------------------------------------------- input
const keys = new Set();
addEventListener('keydown', (e) => {
  if (mode === 'laptop') {
    if (terminal.onKey(e)) return;
    if (e.key === 'Escape') closeLaptop();
    return;
  }
  if (e.target.closest?.('input, textarea, select')) return;
  if (e.key === 'Escape') { toggleHelp(false); return; }
  if (mode !== 'walk' || e.metaKey || e.ctrlKey) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (k === 'e' || k === 'enter') nearest?.run();
  else if (k === '?' || k === 'h') toggleHelp();
  else if (k === 'q') openOverview(FIRMS[world.firm]);
  else if (k === 'f') switchFloor((world.firm + 1) % FIRMS.length);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function pick(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObjects(world.hits, false).find((h) => h.object.visible);
}

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
});
addEventListener('pointermove', (e) => {
  if (drag && drag.id === e.pointerId && mode === 'walk') {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.moved > 6) {
      camYaw -= dx * 0.005;
      camPitch = THREE.MathUtils.clamp(camPitch + dy * 0.004, 0.05, 1.0);
      hint.hidden = true;
      return;
    }
  }
  if (mode !== 'walk' || e.pointerType === 'touch' || e.target !== canvas) { if (e.target !== canvas) hint.hidden = true; return; }
  const h = pick(e.clientX, e.clientY);
  const text = h && describe(h.object);
  canvas.style.cursor = text ? 'pointer' : 'grab';
  hint.hidden = !text;
  if (text) {
    hint.textContent = text;
    hint.style.transform = `translate(${Math.min(e.clientX + 16, innerWidth - 240)}px, ${e.clientY + 18}px)`;
  }
});
addEventListener('pointerup', (e) => {
  const d = drag;
  drag = null;
  if (!d || d.moved > 6 || mode !== 'walk' || e.target !== canvas) return;
  const h = pick(e.clientX, e.clientY);
  if (h && act(h.object)) return;
  // click on the floor: walk there
  const pt = raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
  if (pt && pt.distanceTo(pos) < 60) { player.target = pt; spawnMarker(pt); }
});
canvas.addEventListener('wheel', (e) => {
  camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.01, 2.5, 6);
}, { passive: true });

function describe(o) {
  const { action, data } = o.userData;
  if (action === 'board') return `${FIRMS[data].name} board · open overview`;
  if (action === 'seat') {
    const s = world.data.seats[data];
    return `${s.who.name} · ${label(s.symbol)} · open laptop`;
  }
  return null;
}

function act(o) {
  const { action, data } = o.userData;
  if (action === 'board') { openOverview(FIRMS[data]); return true; }
  if (action === 'seat') { openLaptop(world.data.seats[data]); return true; }
  return false;
}

// tap marker
const marker = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.36, 24), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, depthWrite: false }));
marker.rotation.x = -Math.PI / 2;
marker.visible = false;
scene.add(marker);
function spawnMarker(p) {
  marker.position.set(p.x, 0.02, p.z);
  marker.visible = true;
  marker.userData.t = 0;
}

// ---------------------------------------------------------------- movement
const R = 0.35;
function blocked(x, z) {
  const b = world.data.bounds;
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return true;
  for (const c of world.data.colliders) {
    if (x > c.min.x - R && x < c.max.x + R && z > c.min.z - R && z < c.max.z + R) return true;
  }
  return false;
}

let nearest = null;
const tmpV = new THREE.Vector3();
function updatePlayer(dt) {
  let ix = 0, iz = 0;
  if (keys.has('w') || keys.has('arrowup')) iz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) iz += 1;
  if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
  if (keys.has('d') || keys.has('arrowright')) ix += 1;
  let mx = 0, mz = 0;
  if (ix || iz) {
    player.target = null;
    marker.visible = false;
    const len = Math.hypot(ix, iz);
    ix /= len; iz /= len;
    const cs = Math.cos(camYaw), sn = Math.sin(camYaw);
    mx = ix * cs + iz * sn;
    mz = -ix * sn + iz * cs;
  } else if (player.target) {
    const dx = player.target.x - pos.x, dz = player.target.z - pos.z, d = Math.hypot(dx, dz);
    if (d < 0.4) { player.target = null; marker.visible = false; }
    else { mx = dx / d; mz = dz / d; }
  }
  const speed = (keys.has('shift') ? 7 : 4) * (mx || mz ? 1 : 0);
  player.speed += (speed - player.speed) * Math.min(1, dt * 10);
  if (mx || mz) {
    const want = Math.atan2(mx, mz);
    let diff = want - player.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    player.yaw += diff * Math.min(1, dt * 12);
    const step = player.speed * dt;
    const nx = pos.x + mx * step, nz = pos.z + mz * step;
    let moved = false;
    if (!blocked(nx, pos.z)) { pos.x = nx; moved = true; }
    if (!blocked(pos.x, nz)) { pos.z = nz; moved = true; }
    if (!moved && player.target) { player.target = null; marker.visible = false; }
  }
  me.root.position.copy(pos);
  me.root.rotation.y = player.yaw;
  player.phase += dt * player.speed * 2.2;
  walk(me, player.phase, Math.min(1, player.speed / 4));

  // interaction prompt for the closest laptop
  nearest = null;
  let best = 2.6;
  for (const s of world.data.seats) {
    const sp = s.seat.getWorldPosition(tmpV);
    const d = Math.hypot(sp.x - pos.x, sp.z + 1.4 - pos.z);
    if (d < best) { best = d; nearest = { text: `Open ${s.who.name.split(' ')[0]}'s laptop · ${label(s.symbol)}`, run: () => openLaptop(s) }; }
  }
  if (nearest) {
    prompt.hidden = false;
    prompt.innerHTML = `<kbd>${isTouch ? 'Tap' : 'E'}</kbd>${nearest.text}`;
  } else prompt.hidden = true;
}

// ---------------------------------------------------------------- boot
const bootEl = $('#boot');
$('#enter').addEventListener('click', start);
$('#enter').disabled = false;
function start() {
  if (mode !== 'boot') return;
  bootEl.classList.add('leaving');
  setTimeout(() => (bootEl.hidden = true), 900);
  document.body.classList.add('entered');
  mode = 'intro';
  const { p, look } = followCamera();
  flyTo(p, look, lowPower ? 1600 : 2400, () => {
    mode = 'walk';
    toast(isTouch ? 'Tap a laptop to open it. Tap the floor to walk.' : 'Click any laptop to open it. WASD to walk, drag to look.');
  });
  syncHud();
}
addEventListener('keydown', (e) => { if (mode === 'boot' && (e.key === 'Enter' || e.key === ' ')) start(); });

// boot view: high over the floor, looking at the big board
camera.position.set(0, 5, 16);
camLook.set(0, 2.5, -10);
camera.lookAt(camLook);

watch([...INDICES, ...FIRMS[world.firm].symbols]);
startPolling(30000);
refresh();

// ---------------------------------------------------------------- loop
const clock0 = performance.now();
let lastT = clock0;
const hv = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { lastT = now; return; }
  const t = (now - clock0) / 1000;
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (tween) {
    const k = Math.min(1, (now - tween.start) / tween.dur), e = ease(k);
    camera.position.lerpVectors(tween.p0, tween.p1, e);
    camLook.lerpVectors(tween.l0, tween.l1, e);
    if (k >= 1) { const d = tween.done; tween = null; d?.(); }
  } else if (mode === 'boot') {
    camera.position.set(Math.sin(t * 0.15) * 4, 5 + Math.sin(t * 0.3) * 0.2, 16);
  }

  if (mode === 'walk') {
    updatePlayer(dt);
    const { p, look } = followCamera();
    camera.position.lerp(p, Math.min(1, dt * 8));
    camLook.lerp(look, Math.min(1, dt * 12));
  }
  camera.lookAt(camLook);

  if (marker.visible) {
    marker.userData.t += dt;
    marker.scale.setScalar(1 + Math.sin(marker.userData.t * 6) * 0.15);
  }

  if (mode !== 'laptop') world.data.update(t, dt, quotes, now);

  // speech bubbles follow their trader
  bubbles.forEach((b) => {
    if (b.el.hidden) return;
    if (now > b.until || mode !== 'walk') { b.el.hidden = true; return; }
    b.seat.person.neck.getWorldPosition(hv);
    hv.y += 0.55;
    hv.project(camera);
    if (hv.z > 1) { b.el.style.opacity = 0; return; }
    b.el.style.opacity = 1;
    b.el.style.left = `${((hv.x + 1) / 2) * innerWidth}px`;
    b.el.style.top = `${((1 - hv.y) / 2) * innerHeight}px`;
  });

  if (mode !== 'laptop') renderer.render(scene, camera);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// deep link: #floor-<firm id> skips the title screen
if (deepFirm >= 0) {
  bootEl.hidden = true;
  document.body.classList.add('entered');
  mode = 'walk';
  const { p, look } = followCamera();
  camera.position.copy(p);
  camLook.copy(look);
  syncHud();
}

// handy for debugging from the console
window.__ws = { renderer, scene, camera };
