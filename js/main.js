import * as THREE from 'three';
import { buildStreet } from './street.js';
import { buildFloor } from './floor.js';
import { person, walk } from './avatar.js';
import { createTerminal } from './terminal.js';
import { FIRMS, EXCHANGE, INDICES, label } from './data.js';
import { quotes, watch, onQuotes, refresh, startPolling, fmtPrice, fmtPct, tone } from './market.js';
import { blip, bell, setMurmur, toggleMute, sound } from './sound.js';

// ---------------------------------------------------------------- setup
const isTouch = matchMedia('(pointer: coarse)').matches;
const lowPower = isTouch || innerWidth < 760;

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 900);
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

// ---------------------------------------------------------------- worlds
const streetHits = [];
const street = buildStreet({ canvasTex, lowPower, tag: tagger(streetHits) });
const floors = new Map();
let world = { kind: 'street', data: street, hits: streetHits, firm: -1 };
scene.add(street.group);
scene.fog = new THREE.Fog('#2a2540', 60, 260);

const bubbles = [];
function getFloor(fi) {
  if (!floors.has(fi)) {
    const hits = [];
    const data = buildFloor(fi, { canvasTex, lowPower, tag: tagger(hits), onShout: (seat, text) => shout(seat, text) });
    floors.set(fi, { kind: 'floor', data, hits, firm: fi });
  }
  return floors.get(fi);
}

// ---------------------------------------------------------------- player
const me = person(777, { briefcase: true });
scene.add(me.root);
const pos = street.spawn.clone();
const player = { yaw: Math.PI, speed: 0, phase: 0, target: null, onArrive: null };
let camYaw = 0, camPitch = 0.32, camDist = 7.5;
const camLook = new THREE.Vector3();

// ---------------------------------------------------------------- terminal
const terminalRoot = $('#terminal');
const terminal = createTerminal(terminalRoot, { onClose: () => closeLaptop(), blip });

// ---------------------------------------------------------------- modes
let mode = 'boot'; // boot | intro | walk | fade | zoom | laptop
let tween = null;
let activeSeat = null;
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
function flyTo(p, look, dur, done) {
  tween = { p0: camera.position.clone(), l0: camLook.clone(), p1: p.clone(), l1: look.clone(), start: performance.now(), dur, done };
}

function followCamera() {
  const inside = world.kind === 'floor';
  const dist = inside ? Math.min(camDist, 4.6) : camDist;
  const pitch = inside ? Math.min(camPitch, 0.26) : camPitch;
  const h = Math.sin(pitch) * dist + 1.6;
  const flat = Math.cos(pitch) * dist;
  const p = new THREE.Vector3(pos.x + Math.sin(camYaw) * flat, pos.y + h, pos.z + Math.cos(camYaw) * flat);
  const b = world.data.bounds;
  if (world.kind === 'street') p.x = THREE.MathUtils.clamp(p.x, -8.4, 8.4);
  else {
    p.x = THREE.MathUtils.clamp(p.x, b.minX - 0.3, b.maxX + 0.3);
    p.z = THREE.MathUtils.clamp(p.z, b.minZ - 0.8, b.maxZ + 0.4);
    p.y = Math.min(p.y, 5.1);
  }
  return { p, look: new THREE.Vector3(pos.x, pos.y + 1.45, pos.z) };
}

function setWorld(next, spawn, yaw) {
  scene.remove(world.data.group);
  world = next;
  scene.add(world.data.group);
  pos.copy(spawn);
  player.yaw = yaw + Math.PI;
  player.target = null;
  camYaw = yaw;
  scene.fog = world.kind === 'street' ? new THREE.Fog('#2a2540', 60, 260) : null;
  scene.background = world.kind === 'street' ? null : new THREE.Color('#0b0c10');
  const { p, look } = followCamera();
  camera.position.copy(p);
  camLook.copy(look);
  bubbles.forEach((b) => (b.el.hidden = true));
  setMurmur(world.kind === 'floor' && !sound.muted);
  syncHud();
}

function transition(fn) {
  mode = 'fade';
  fade.classList.add('on');
  hint.hidden = true;
  setTimeout(() => {
    fn();
    requestAnimationFrame(() => {
      fade.classList.remove('on');
      mode = 'walk';
    });
  }, 420);
}

function enterFirm(fi) {
  if (mode !== 'walk') return;
  blip(520, 0.1);
  transition(() => {
    const f = getFloor(fi);
    watch(FIRMS[fi].symbols);
    setWorld(f, f.data.spawn, 0);
    bell();
    toast(`Welcome to ${FIRMS[fi].name}. Click any laptop to open it.`);
  });
}

function exitToStreet() {
  if (mode !== 'walk' || world.kind !== 'floor') return;
  const fi = world.firm;
  blip(380, 0.1);
  transition(() => {
    const door = street.doors.find((d) => d.firm === fi);
    const spawn = door.pos.clone().add(new THREE.Vector3(-door.side * 1.6, 0, 0));
    setWorld({ kind: 'street', data: street, hits: streetHits, firm: -1 }, spawn, door.side * Math.PI / 2);
  });
}

function openLaptop(seat) {
  if (mode !== 'walk') return;
  mode = 'zoom';
  activeSeat = seat;
  hint.hidden = true;
  prompt.hidden = true;
  player.target = null;
  blip(660, 0.08);
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

function openOverview(firm, who = null) {
  if (mode !== 'walk') return;
  mode = 'laptop';
  activeSeat = null;
  hint.hidden = prompt.hidden = true;
  blip(660, 0.08);
  document.body.classList.add('in-laptop');
  terminal.open({ firm, symbol: firm.symbols[0], who });
  startPolling(15000);
}

function closeLaptop() {
  if (mode !== 'laptop') return;
  terminal.close();
  document.body.classList.remove('in-laptop');
  startPolling(30000);
  blip(420, 0.08);
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
for (let i = 0; i < 3; i++) {
  const el = document.createElement('div');
  el.className = 'bubble';
  el.hidden = true;
  document.body.appendChild(el);
  bubbles.push({ el, seat: null, until: 0 });
}
function shout(seat, text) {
  if (mode !== 'walk' || world.kind !== 'floor') return;
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
  if (world.kind === 'street') {
    place.innerHTML = '<b>Wall Street</b><span>Financial District · New York</span>';
  } else {
    const f = FIRMS[world.firm];
    place.innerHTML = `<b style="color:${f.color}">${f.name}</b><span>${f.desk} · ${world.data.seats.length} traders</span>`;
  }
  dock.innerHTML = `
    ${world.kind === 'floor' ? '<button data-a="exit" title="Back to the street (Esc)"><i>⟵</i><span>Street</span></button>' : '<button data-a="exchange" title="Market overview"><i>▤</i><span>Markets</span></button>'}
    <button data-a="sound" title="Sound (M)"><i>${sound.muted ? '🔇' : '🔊'}</i><span>${sound.muted ? 'Muted' : 'Sound'}</span></button>
    <button data-a="help" title="Controls (?)"><i>?</i><span>Help</span></button>`;
}
dock.addEventListener('click', (e) => {
  const a = e.target.closest('[data-a]')?.dataset.a;
  if (a === 'exit') exitToStreet();
  else if (a === 'exchange') openOverview(EXCHANGE);
  else if (a === 'sound') { toggleMute(); setMurmur(world.kind === 'floor' && !sound.muted); syncHud(); }
  else if (a === 'help') toggleHelp();
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
  if (e.target.closest?.('input, textarea')) return;
  if (e.key === 'Escape') {
    if (!helpEl.hidden) return toggleHelp(false);
    if (world.kind === 'floor') exitToStreet();
    return;
  }
  if (mode !== 'walk' || e.metaKey || e.ctrlKey) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (k === 'e' || k === 'enter') nearest?.run();
  else if (k === 'm') { toggleMute(); setMurmur(world.kind === 'floor' && !sound.muted); syncHud(); }
  else if (k === '?' || k === 'h') toggleHelp();
  else if (k === 'q') openOverview(world.kind === 'floor' ? FIRMS[world.firm] : EXCHANGE);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function pick(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(world.hits, false).find((h) => h.object.visible);
  return hit;
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
      camPitch = THREE.MathUtils.clamp(camPitch + dy * 0.004, 0.05, 1.2);
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
  // click on the ground: walk there
  const pt = raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
  if (pt && pt.distanceTo(pos) < 60) { player.target = pt; player.onArrive = null; spawnMarker(pt); }
});
canvas.addEventListener('wheel', (e) => {
  camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.01, 3, 14);
}, { passive: true });

function describe(o) {
  const { action, data } = o.userData;
  if (action === 'building' || action === 'door') return `Enter ${FIRMS[data].name}`;
  if (action === 'exchange') return 'The Exchange · market overview';
  if (action === 'bull') return 'The Charging Bull';
  if (action === 'board') return `${FIRMS[data].name} board · open overview`;
  if (action === 'exit') return 'Exit to Wall Street';
  if (action === 'seat') {
    const s = world.data.seats[data];
    return `${s.who.name} · ${label(s.symbol)} · open laptop`;
  }
  return null;
}

function act(o) {
  const { action, data } = o.userData;
  if (action === 'building' || action === 'door') {
    const door = street.doors.find((d) => d.firm === data);
    if (door.pos.distanceTo(pos) > 28) enterFirm(data);
    else walkTo(door.pos, () => enterFirm(data));
    return true;
  }
  if (action === 'exchange') { openOverview(EXCHANGE); return true; }
  if (action === 'bull') {
    const q = quotes.get('^GSPC');
    toast(q ? `The bull says: S&P 500 is ${q.changePct >= 0 ? 'up' : 'down'} ${Math.abs(q.changePct).toFixed(2)}% (${fmtPrice(q.price)})` : 'The bull is waiting for the market data…');
    blip(140, 0.3, 'sawtooth', 0.08);
    return true;
  }
  if (action === 'board') { openOverview(FIRMS[data]); return true; }
  if (action === 'exit') { walkTo(world.data.exit, exitToStreet); return true; }
  if (action === 'seat') { openLaptop(world.data.seats[data]); return true; }
  return false;
}

function walkTo(p, cb) {
  player.target = p.clone();
  player.onArrive = cb;
}

// tap marker
const marker = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.36, 24), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, depthWrite: false }));
marker.rotation.x = -Math.PI / 2;
marker.visible = false;
scene.add(marker);
function spawnMarker(p) {
  marker.position.set(p.x, 0.2, p.z);
  marker.visible = true;
  marker.userData.t = 0;
}

// ---------------------------------------------------------------- movement
const tmpBox = new THREE.Box3();
const R = 0.35;
function blocked(x, z) {
  const b = world.data.bounds;
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return true;
  for (const c of world.data.colliders) {
    if (x > c.min.x - R && x < c.max.x + R && z > c.min.z - R && z < c.max.z + R && c.min.y < 1.5) return true;
  }
  return false;
}

let nearest = null;
function updatePlayer(dt) {
  let ix = 0, iz = 0;
  if (keys.has('w') || keys.has('arrowup')) iz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) iz += 1;
  if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
  if (keys.has('d') || keys.has('arrowright')) ix += 1;
  const run = keys.has('shift');
  let mx = 0, mz = 0;
  if (ix || iz) {
    player.target = null;
    const len = Math.hypot(ix, iz);
    ix /= len; iz /= len;
    const cs = Math.cos(camYaw), sn = Math.sin(camYaw);
    mx = ix * cs + iz * sn;
    mz = -ix * sn + iz * cs;
  } else if (player.target) {
    const dx = player.target.x - pos.x, dz = player.target.z - pos.z, d = Math.hypot(dx, dz);
    if (d < 0.4) {
      player.target = null;
      marker.visible = false;
      const cb = player.onArrive;
      player.onArrive = null;
      cb?.();
    } else { mx = dx / d; mz = dz / d; }
  }
  const speed = (run || player.onArrive ? 8 : 4.2) * (mx || mz ? 1 : 0);
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
    if (!moved && player.target) { player.target = null; player.onArrive = null; marker.visible = false; }
  }
  pos.y = world.kind === 'street' && Math.abs(pos.x) > 5.1 ? 0.16 : 0;
  me.root.position.copy(pos);
  me.root.rotation.y = player.yaw;
  player.phase += dt * player.speed * 2.2;
  walk(me, player.phase, Math.min(1, player.speed / 4));

  // interaction prompt
  nearest = null;
  if (world.kind === 'street') {
    for (const d of street.doors) {
      if (Math.abs(pos.z - d.pos.z) < 3 && Math.abs(pos.x - d.pos.x) < 2.4) {
        nearest = { text: `Enter ${FIRMS[d.firm].name}`, run: () => enterFirm(d.firm) };
      }
    }
  } else {
    const ex = world.data.exit;
    if (pos.distanceTo(ex) < 2.6) nearest = { text: 'Exit to Wall Street', run: exitToStreet };
    else {
      let best = 2.6;
      for (const s of world.data.seats) {
        const sp = s.seat.getWorldPosition(tmpV);
        const d = Math.hypot(sp.x - pos.x, sp.z + 1.4 - pos.z);
        if (d < best) { best = d; nearest = { text: `Open ${s.who.name.split(' ')[0]}'s laptop · ${label(s.symbol)}`, run: () => openLaptop(s) }; }
      }
    }
  }
  if (nearest) {
    prompt.hidden = false;
    prompt.innerHTML = `<kbd>${isTouch ? 'Tap' : 'E'}</kbd>${nearest.text}`;
  } else prompt.hidden = true;
}
const tmpV = new THREE.Vector3();

// ---------------------------------------------------------------- boot
const bootEl = $('#boot');
$('#enter').addEventListener('click', start);
$('#enter').disabled = false;
function start() {
  if (mode !== 'boot') return;
  blip(520, 0.12);
  bootEl.classList.add('leaving');
  setTimeout(() => (bootEl.hidden = true), 900);
  document.body.classList.add('entered');
  mode = 'intro';
  const { p, look } = followCamera();
  flyTo(p, look, lowPower ? 1800 : 2800, () => {
    mode = 'walk';
    toast(isTouch ? 'Tap to walk, drag to look. Tap a building to go inside.' : 'WASD to walk, drag to look. Click a building to go inside.');
  });
  syncHud();
}
addEventListener('keydown', (e) => { if (mode === 'boot' && (e.key === 'Enter' || e.key === ' ')) start(); });

camera.position.set(0, 90, 60);
camLook.set(0, 10, -60);
camera.lookAt(camLook);

watch([...INDICES, ...street.tapeSymbols]);
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
    camera.position.set(Math.sin(t * 0.05) * 6, 60 + Math.sin(t * 0.2) * 3, 50);
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

  if (mode !== 'laptop') {
    if (world.kind === 'street') street.update(t, dt, quotes, pos);
    else world.data.update(t, dt, quotes, now);
  }

  // speech bubbles follow their trader
  bubbles.forEach((b) => {
    if (b.el.hidden) return;
    if (now > b.until || mode !== 'walk' || world.kind !== 'floor') { b.el.hidden = true; return; }
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

// deep link: #floor-<firm id> jumps inside
const deep = location.hash.slice(1);
const deepFirm = FIRMS.findIndex((f) => `floor-${f.id}` === deep);
if (deep === 'street' || deepFirm >= 0) {
  bootEl.hidden = true;
  document.body.classList.add('entered');
  mode = 'walk';
  syncHud();
  if (deepFirm >= 0) {
    const f = getFloor(deepFirm);
    watch(FIRMS[deepFirm].symbols);
    setWorld(f, f.data.spawn, 0);
  }
}

// handy for debugging from the console
window.__ws = { renderer, scene, camera };
