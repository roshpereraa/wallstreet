import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DESKS, SHOUTS, trader, label } from './data.js';
import { person, sit, addPhone, mat, walk } from './avatar.js';
import { gridFloor, neonSkyline, neonSign, drawBoard, drawLaptop } from './textures.js';

// A small neon lo-fi trading room, shown as a cut-away (no ceiling, no front wall):
// the meme coin desk on the left, the stock exchange desk on the right.
export const RW = 10, RD = 6.5, RH = 4.4;

const PINK = DESKS.memes.color, CYAN = DESKS.stocks.color, PURPLE = '#8b5cff';
const neonMat = (color, intensity = 3) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, toneMapped: false });

export function buildRoom({ canvasTex, lowPower, tag, onShout }) {
  const g = new THREE.Group();
  const seats = [];
  const tube = (w, h, d, color, x, y, z, intensity) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), neonMat(color, intensity));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };

  // ------------------------------------------------ lights: dim room, coloured pools
  g.add(new THREE.HemisphereLight('#6b5cff', '#1a0b24', 1.1));
  const key = new THREE.DirectionalLight('#c9b8ff', 0.9);
  key.position.set(4, 12, 10);
  key.castShadow = !lowPower;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -12, right: 12, top: 9, bottom: -9, near: 1, far: 40 });
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.04;
  g.add(key, key.target);
  [[-1, PINK], [1, CYAN]].forEach(([s, c]) => {
    const l = new THREE.PointLight(c, 26, 14, 1.5);
    l.position.set(s * 5, 3.2, -3);
    g.add(l);
  });
  const lampLight = new THREE.PointLight('#ffb36b', 6, 6, 1.6);
  lampLight.position.set(0, 1.6, -5.2);
  g.add(lampLight);

  // ------------------------------------------------ shell
  [[-1, PINK, '#0d0819'], [1, CYAN, '#080b1a']].forEach(([s, line, bg]) => {
    const t = canvasTex(gridFloor(line, bg));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(5, 6.5);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD * 2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0.2 }));
    f.rotation.x = -Math.PI / 2;
    f.position.set((s * RW) / 2, 0, 0);
    f.receiveShadow = true;
    g.add(f);
  });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(RW * 2 + 0.5, 0.5, RD * 2 + 0.5), mat('#07050f'));
  slab.position.y = -0.26;
  g.add(slab);
  // neon edge around the cut-away floor
  tube(RW * 2 + 0.5, 0.05, 0.05, PURPLE, 0, 0.01, RD + 0.26, 2.5);
  tube(0.05, 0.05, RD * 2 + 0.5, PINK, -RW - 0.26, 0.01, 0, 2.5);
  tube(0.05, 0.05, RD * 2 + 0.5, CYAN, RW + 0.26, 0.01, 0, 2.5);
  // centre divider line
  tube(0.04, 0.012, RD * 2, PURPLE, 0, 0.01, 0, 1.6);

  const wallM = mat('#130d24', { roughness: 0.85 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(RW * 2 + 0.5, RH, 0.25), wallM);
  back.position.set(0, RH / 2, -RD - 0.13);
  back.receiveShadow = true;
  g.add(back);
  tube(RW * 2 + 0.5, 0.06, 0.06, PURPLE, 0, RH, -RD + 0.02, 3);

  const skyTex = canvasTex(neonSkyline());
  [[-1, PINK], [1, CYAN]].forEach(([s, color]) => {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.25, RH, RD * 2 + 0.25), wallM);
    side.position.set(s * (RW + 0.13), RH / 2, 0);
    side.receiveShadow = true;
    g.add(side);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 2.4), new THREE.MeshBasicMaterial({ map: skyTex, toneMapped: false }));
    win.position.set(s * (RW - 0.01), 2.5, 0.8);
    win.rotation.y = -s * Math.PI / 2;
    g.add(win);
    for (const dz of [-3.75, 0, 3.75]) tube(0.05, 2.5, 0.06, '#1b1030', s * (RW - 0.04), 2.5, 0.8 + dz, 0.2);
    tube(0.05, 0.05, RD * 2, color, s * (RW - 0.03), RH, 0, 3);
    tube(0.05, 0.05, RD * 2, color, s * (RW - 0.03), 0.05, 0, 3);
  });

  // ------------------------------------------------ wall boards + neon signs
  const boards = [];
  [['memes', -1], ['stocks', 1]].forEach(([kind, s]) => {
    const desk = DESKS[kind];
    const c = Object.assign(document.createElement('canvas'), { width: lowPower ? 1024 : 1400, height: lowPower ? 360 : 490 });
    const tex = canvasTex(c);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 2.6), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: '#d8d0ff' }));
    board.position.set(s * 5, 2.35, -RD + 0.06);
    g.add(board);
    tag(board, 'board', kind);
    tube(7.6, 0.04, 0.04, desk.color, s * 5, 3.68, -RD + 0.06, 3);
    tube(7.6, 0.04, 0.04, desk.color, s * 5, 1.02, -RD + 0.06, 3);
    boards.push({ desk, c, ctx: c.getContext('2d'), tex });

    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), new THREE.MeshBasicMaterial({ map: canvasTex(neonSign(kind === 'memes' ? 'MEME COINS' : 'STOCKS', desk.color, { backing: false })), transparent: true, toneMapped: false, depthWrite: false }));
    sign.position.set(s * 5, RH + 0.7, -RD + 0.1);
    g.add(sign);
    tag(sign, 'board', kind);
  });
  // side-wall neon slogans
  [[-1, 'WAGMI', PINK], [1, 'BUY THE DIP', CYAN]].forEach(([s, text, color]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: canvasTex(neonSign(text, color, { backing: false, size: 0.42 })), transparent: true, toneMapped: false, depthWrite: false }));
    m.position.set(s * (RW - 0.03), 4.05, -3.6);
    m.rotation.y = -s * Math.PI / 2;
    g.add(m);
  });

  // ------------------------------------------------ lo-fi corner: record player, lamp, plant
  const radioGroup = new THREE.Group();
  radioGroup.position.set(0, 0, -RD + 0.7);
  g.add(radioGroup);
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 0.6), mat('#3a2340', { roughness: 0.6 }));
  cabinet.position.y = 0.4;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.5), mat('#1a1222', { roughness: 0.4 }));
  deck.position.y = 0.85;
  const vinyl = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.012, 32), mat('#0a0a0c', { roughness: 0.25, metalness: 0.3 }));
  vinyl.position.set(-0.2, 0.91, 0);
  const labelDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.014, 20), neonMat(PINK, 1.5));
  labelDisc.position.copy(vinyl.position).add(new THREE.Vector3(0, 0.002, 0));
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.3), mat('#c9c9d6', { metalness: 0.8, roughness: 0.3 }));
  arm.position.set(0.1, 0.93, -0.02);
  arm.rotation.y = 0.5;
  const speakers = [-0.9, 0.9].map((x) => {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.4), mat('#241634'));
    sp.position.set(x, 0.3, 0.05);
    const cone = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), neonMat(x < 0 ? PINK : CYAN, 0.8));
    cone.position.set(0, 0.05, 0.201);
    sp.add(cone);
    radioGroup.add(sp);
    return sp;
  });
  radioGroup.add(cabinet, deck, vinyl, labelDisc, arm);
  radioGroup.traverse((o) => { if (o.isMesh) o.castShadow = !lowPower; });
  tag(radioGroup, 'radio', 0);

  const lamp = new THREE.Group();
  lamp.position.set(-1.9, 0, -RD + 0.6);
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.2, 16), mat('#2a1a3a'));
  lampBase.position.y = 0.1;
  const lava = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.45, 6, 16), new THREE.MeshStandardMaterial({ color: '#ff6fd0', emissive: '#ff3ea5', emissiveIntensity: 1.2, transparent: true, opacity: 0.85, toneMapped: false }));
  lava.position.y = 0.55;
  const blobs = [0, 1, 2].map(() => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), neonMat('#ffd166', 2));
    lava.add(b);
    return b;
  });
  lamp.add(lampBase, lava);
  g.add(lamp);

  const plant = new THREE.Group();
  plant.position.set(1.9, 0, -RD + 0.6);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.36, 16), mat('#5b2e6e'));
  pot.position.y = 0.18;
  plant.add(pot);
  const leafM = mat('#3fbf7f', { roughness: 0.7 });
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.6, 4), leafM);
    const a = (i / 9) * Math.PI * 2, tilt = 0.25 + (i % 3) * 0.15;
    leaf.position.set(Math.cos(a) * 0.05, 0.62, Math.sin(a) * 0.05);
    leaf.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
    plant.add(leaf);
  }
  g.add(plant);

  // ------------------------------------------------ desks: two rows of two on each side
  const rowsZ = [1.6, -2.4];
  const perRow = 2, seatGap = 3, segLen = perRow * seatGap;

  const deskM = mat('#1d1433', { roughness: 0.35, metalness: 0.3 });
  const legM = mat('#2a2340', { metalness: 0.6, roughness: 0.4 });
  const laptopM = mat('#9a93b8', { metalness: 0.7, roughness: 0.3 });
  const chairM = mat('#221733', { roughness: 0.6 });
  const geo = {
    lapBase: new THREE.BoxGeometry(0.4, 0.025, 0.28),
    lapLid: new THREE.BoxGeometry(0.4, 0.27, 0.014),
    lapScreen: new THREE.PlaneGeometry(0.37, 0.24),
    seat: new THREE.BoxGeometry(0.5, 0.08, 0.5),
    back: new THREE.BoxGeometry(0.5, 0.6, 0.07),
    pole: new THREE.CylinderGeometry(0.03, 0.03, 0.45),
    mug: new THREE.CylinderGeometry(0.04, 0.035, 0.1, 12),
  };
  const hitGeo = new THREE.BoxGeometry(seatGap * 0.9, 2, 2.4);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });

  const screens = new Map();
  const screenFor = (symbol) => {
    if (!screens.has(symbol)) {
      const c = Object.assign(document.createElement('canvas'), { width: lowPower ? 256 : 384, height: lowPower ? 160 : 240 });
      const tex = canvasTex(c);
      screens.set(symbol, { symbol, c, ctx: c.getContext('2d'), tex, mat: new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) });
    }
    return screens.get(symbol);
  };

  [['memes', -1], ['stocks', 1]].forEach(([kind, s]) => {
    const desk = DESKS[kind];
    const x0 = s < 0 ? -RW + 2 : RW - 2 - segLen;
    rowsZ.forEach((rz) => {
      const top = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.07, 1.2), deskM);
      top.position.set(x0 + segLen / 2, 0.76, rz);
      top.castShadow = top.receiveShadow = true;
      g.add(top);
      // neon underglow strip on the desk edge
      tube(segLen, 0.025, 0.025, desk.color, x0 + segLen / 2, 0.72, rz + 0.61, 2.2);
      [0.2, segLen - 0.2].forEach((dx) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.74, 1.05), legM);
        leg.position.set(x0 + dx, 0.37, rz);
        leg.userData.merge = true;
        g.add(leg);
      });

      for (let k = 0; k < perRow; k++) {
        const idx = seats.length;
        const n = seats.filter((x) => x.kind === kind).length;
        const symbol = desk.symbols[n % desk.symbols.length];
        const scr = screenFor(symbol);
        const seat = new THREE.Group();
        seat.position.set(x0 + seatGap * (k + 0.5), 0, rz);
        g.add(seat);

        const parts = new THREE.Group();
        seat.add(parts);
        const base = new THREE.Mesh(geo.lapBase, laptopM);
        const hinge = new THREE.Group();
        hinge.position.set(0, 0.82, 0.17);
        hinge.rotation.x = -0.28;
        const lid = new THREE.Mesh(geo.lapLid, laptopM);
        lid.position.y = 0.135;
        const screen = new THREE.Mesh(geo.lapScreen, scr.mat);
        screen.position.set(0, 0.135, 0.0075);
        const anchor = new THREE.Object3D();
        anchor.position.copy(screen.position);
        hinge.add(lid, screen, anchor);
        // laptops are drawn larger than life so they read from the overview camera
        base.scale.setScalar(1.8);
        hinge.scale.setScalar(1.8);
        base.position.set(0, 0.81, 0.25);
        parts.add(base, hinge);
        if (n % 2 === 0) {
          const mug = new THREE.Mesh(geo.mug, neonMat(desk.color, 0.6));
          mug.position.set(0.55, 0.84, 0.2);
          parts.add(mug);
        }
        const chair = new THREE.Group();
        chair.position.set(0, 0, 1.0);
        const cs = new THREE.Mesh(geo.seat, chairM);
        cs.position.y = 0.5;
        const cb = new THREE.Mesh(geo.back, chairM);
        cb.position.set(0, 0.86, 0.26);
        const cp = new THREE.Mesh(geo.pole, legM);
        cp.position.y = 0.24;
        chair.add(cs, cb, cp);
        seat.add(chair);

        const who = trader(kind, n);
        const standing = n === 3;
        const p = person((kind === 'memes' ? 300 : 100) + n * 7, { vest: n % 2 === 1 });
        p.root.rotation.y = Math.PI;
        if (standing) {
          p.root.position.set(0.35, 0, 1.5);
          addPhone(p);
        } else {
          sit(p);
          p.root.position.set(0, 0, 0.92);
          p.arms.forEach((a) => (a.rotation.x = -1.15));
        }
        if (lowPower) p.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
        seat.add(p.root);
        parts.traverse((o) => { if (o.isMesh && o !== screen && o.material.emissive?.getHex() === 0) o.userData.merge = true; });
        chair.traverse((o) => { if (o.isMesh) o.userData.merge = true; });

        const hit = new THREE.Mesh(hitGeo, hitMat);
        hit.position.set(0, 1, 0.55);
        seat.add(hit);
        tag(hit, 'seat', idx);
        seats.push({ index: idx, kind, desk, symbol, who, standing, person: p, seat, screen: anchor, phase: (idx * 1.37) % 6.28 });
      }
    });
  });

  // one manager pacing the centre aisle
  const walker = person(512, { briefcase: true });
  walker.root.position.set(0, 0, 3);
  g.add(walker.root);
  const pacer = { dir: -1, phase: 0 };

  // merge the static furniture: one draw call per material
  g.updateMatrixWorld(true);
  const buckets = new Map();
  const doomed = [];
  g.traverse((o) => {
    if (!o.isMesh || !o.userData.merge) return;
    const gg = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    gg.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k);
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(gg);
    doomed.push(o);
  });
  doomed.forEach((o) => o.parent.remove(o));
  buckets.forEach((geos, material) => {
    const m = new THREE.Mesh(mergeGeometries(geos), material);
    m.castShadow = !lowPower;
    m.receiveShadow = true;
    g.add(m);
  });

  // ------------------------------------------------ animation
  let lastBoard = 0, lastScreen = 0, turn = 0, nextShout = 2.5;
  const screenList = [...screens.values()];

  function update(t, dt, quotes, now, music) {
    if (now - lastBoard > 120) {
      lastBoard = now;
      boards.forEach((b) => { drawBoard(b.ctx, b.c.width, b.c.height, b.desk, quotes, t); b.tex.needsUpdate = true; });
    }
    if (now - lastScreen > 180) {
      lastScreen = now;
      const s = screenList[turn++ % screenList.length];
      drawLaptop(s.ctx, s.c.width, s.c.height, s.symbol, quotes.get(s.symbol), t);
      s.tex.needsUpdate = true;
    }

    // the room grooves when the radio is on
    const lvl = music?.playing ? music.level() : 0;
    const bob = music?.playing ? Math.abs(Math.sin(t * Math.PI * (music.track.bpm / 60))) : 0;
    vinyl.rotation.y -= dt * (music?.playing ? 3.5 : 0);
    labelDisc.rotation.y = vinyl.rotation.y;
    speakers.forEach((sp) => sp.scale.setScalar(1 + lvl * 0.15));
    blobs.forEach((b, i) => b.position.set(Math.sin(t * 0.7 + i * 2) * 0.04, Math.sin(t * 0.4 + i * 1.7) * 0.3, Math.cos(t * 0.6 + i) * 0.04));
    lampLight.intensity = 5 + Math.sin(t * 0.8) * 0.8;

    seats.forEach((s) => {
      const p = s.person, ph = t + s.phase;
      if (s.standing) {
        p.arms[1].rotation.x = -2.6 + Math.sin(ph * 5) * 0.35;
        p.arms[0].rotation.x = -2.3;
        p.arms[0].rotation.z = -0.5;
        p.neck.rotation.y = Math.sin(ph * 0.8) * 0.5;
        p.root.position.y = Math.abs(Math.sin(ph * 5)) * 0.03;
      } else {
        const typing = Math.sin(ph * 0.35) > -0.3;
        p.arms[0].rotation.x = -1.15 + (typing ? Math.sin(ph * 18) * 0.06 : 0);
        p.arms[1].rotation.x = -1.15 + (typing ? Math.cos(ph * 17) * 0.06 : 0.25);
        p.neck.rotation.y = typing ? Math.sin(ph * 0.5) * 0.15 : Math.sin(ph * 0.9) * 0.6;
        p.neck.rotation.x = (typing ? 0.2 : 0) + bob * 0.12;
        p.hips.rotation.y = Math.sin(ph * 0.25) * 0.12;
      }
    });

    pacer.phase += dt * 5;
    walker.root.position.z += pacer.dir * dt * 0.9;
    if (walker.root.position.z > 4.5) pacer.dir = -1;
    if (walker.root.position.z < -3.8) pacer.dir = 1;
    walker.root.rotation.y = pacer.dir > 0 ? 0 : Math.PI;
    walk(walker, pacer.phase, 1);

    nextShout -= dt;
    if (nextShout < 0) {
      nextShout = 3.5 + Math.random() * 3;
      const s = seats[(Math.random() * seats.length) | 0];
      const q = quotes.get(s.symbol);
      const text = q && Math.random() < 0.5
        ? `${label(s.symbol)} ${q.changePct >= 0 ? 'up' : 'down'} ${Math.abs(q.changePct).toFixed(2)}%!`
        : SHOUTS[s.kind][(Math.random() * SHOUTS[s.kind].length) | 0];
      onShout?.(s, text);
    }
  }

  return { group: g, seats, update };
}
