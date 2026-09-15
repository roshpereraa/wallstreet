import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DESKS, SHOUTS, trader, label } from './data.js';
import { person, sit, addPhone, mat, walk } from './avatar.js';
import { carpetCanvas, skylineCanvas, drawBoard, drawLaptop, signPlate } from './textures.js';

// One open-plan trading floor, shown as a cut-away (no ceiling, no front wall):
// the meme coin desk on the left, the stock exchange desk on the right.
export const RW = 18, RD = 11, RH = 5.2;

export function buildRoom({ canvasTex, lowPower, tag, onShout }) {
  const g = new THREE.Group();
  const seats = [];

  // ------------------------------------------------ lights
  g.add(new THREE.HemisphereLight('#e8eeff', '#3a3028', 2.4));
  const key = new THREE.DirectionalLight('#fff3e0', 1.8);
  key.position.set(6, 18, 14);
  key.castShadow = !lowPower;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -22, right: 22, top: 16, bottom: -16, near: 1, far: 60 });
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.04;
  g.add(key, key.target);

  // ------------------------------------------------ shell
  const halves = [['memes', -1, '#16211a'], ['stocks', 1, '#1b2230']];
  halves.forEach(([kind, s, tint]) => {
    const t = canvasTex(carpetCanvas(tint));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(5, 6);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD * 2), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
    f.rotation.x = -Math.PI / 2;
    f.position.set((s * RW) / 2, 0, 0);
    f.receiveShadow = true;
    g.add(f);
    const light = new THREE.PointLight(DESKS[kind].color, 30, 22, 1.4);
    light.position.set(s * 9, 3.6, -RD + 2);
    g.add(light);
  });
  // floor edge so the cut-away reads as a solid slab
  const slab = new THREE.Mesh(new THREE.BoxGeometry(RW * 2 + 0.6, 0.5, RD * 2 + 0.6), mat('#0d0e12'));
  slab.position.set(0, -0.26, 0);
  g.add(slab);
  // centre line between the two desks
  const divider = new THREE.Mesh(new THREE.PlaneGeometry(0.08, RD * 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.25 }));
  divider.rotation.x = -Math.PI / 2;
  divider.position.y = 0.01;
  g.add(divider);

  const wallM = mat('#262a33', { roughness: 0.9 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(RW * 2 + 0.6, RH, 0.3), wallM);
  back.position.set(0, RH / 2, -RD - 0.15);
  back.receiveShadow = true;
  g.add(back);
  const skyTex = canvasTex(skylineCanvas());
  [-1, 1].forEach((s) => {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.3, RH, RD * 2 + 0.3), wallM);
    side.position.set(s * (RW + 0.15), RH / 2, 0);
    side.receiveShadow = true;
    g.add(side);
    for (let i = 0; i < 3; i++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.8), new THREE.MeshBasicMaterial({ map: skyTex, toneMapped: false }));
      win.position.set(s * (RW - 0.01), 2.8, -7 + i * 6.5);
      win.rotation.y = -s * Math.PI / 2;
      g.add(win);
    }
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, RD * 2), new THREE.MeshStandardMaterial({ color: s < 0 ? DESKS.memes.color : DESKS.stocks.color, emissive: s < 0 ? DESKS.memes.color : DESKS.stocks.color, emissiveIntensity: 1.5 }));
    band.position.set(s * (RW - 0.02), 0.9, 0);
    g.add(band);
  });

  // ------------------------------------------------ wall boards + hanging signs
  const boards = [];
  halves.forEach(([kind, s]) => {
    const desk = DESKS[kind];
    const c = Object.assign(document.createElement('canvas'), { width: lowPower ? 1024 : 1600, height: lowPower ? 360 : 560 });
    const tex = canvasTex(c);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(13.6, 4.76), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    board.position.set(s * 9, 2.75, -RD + 0.09);
    g.add(board);
    tag(board, 'board', kind);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(14, 5.1, 0.14), mat('#08090b', { metalness: 0.6 }));
    frame.position.set(s * 9, 2.75, -RD - 0.02);
    g.add(frame);
    boards.push({ desk, c, ctx: c.getContext('2d'), tex });

    const plate = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.2), new THREE.MeshBasicMaterial({ map: canvasTex(signPlate(desk.name, desk.color, kind === 'memes' ? 'LIVE · COINGECKO' : 'LIVE · NYSE · NASDAQ')), toneMapped: false, side: THREE.DoubleSide }));
    plate.position.set(s * 9, RH + 0.55, -RD + 0.05);
    g.add(plate);
    tag(plate, 'board', kind);
  });

  // ------------------------------------------------ desks
  const rowsZ = [2.8, -3.6];
  const perRow = 3, seatGap = 3.4, segLen = perRow * seatGap;

  const deskM = mat('#d9d3ca', { roughness: 0.5 });
  const legM = mat('#2a2d33', { metalness: 0.6, roughness: 0.4 });
  const laptopM = mat('#b9bdc4', { metalness: 0.7, roughness: 0.3 });
  const chairM = mat('#15161a', { roughness: 0.6 });
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

  // one live texture per instrument, shared by the laptops showing it
  const screens = new Map();
  const screenFor = (symbol) => {
    if (!screens.has(symbol)) {
      const c = Object.assign(document.createElement('canvas'), { width: lowPower ? 256 : 384, height: lowPower ? 160 : 240 });
      const tex = canvasTex(c);
      screens.set(symbol, { symbol, c, ctx: c.getContext('2d'), tex, mat: new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) });
    }
    return screens.get(symbol);
  };

  halves.forEach(([kind, s]) => {
    const desk = DESKS[kind];
    const x0 = s < 0 ? -RW + 3.2 : RW - 3.2 - segLen;
    rowsZ.forEach((rz) => {
      const top = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.07, 1.25), deskM);
      top.position.set(x0 + segLen / 2, 0.76, rz);
      top.castShadow = top.receiveShadow = true;
      g.add(top);
      [0.2, segLen - 0.2].forEach((dx) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.74, 1.1), legM);
        leg.position.set(x0 + dx, 0.37, rz);
        leg.userData.merge = true;
        g.add(leg);
      });
      const privacy = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.45, 0.04), mat(kind === 'memes' ? '#243326' : '#2c313b'));
      privacy.position.set(x0 + segLen / 2, 1.02, rz - 0.6);
      privacy.userData.merge = true;
      g.add(privacy);

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
        base.position.set(0, 0.81, 0.3);
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
        // laptops are drawn a little larger than life so they read from the overview camera
        base.scale.setScalar(1.7);
        hinge.scale.setScalar(1.7);
        base.position.z = 0.25;
        parts.add(base, hinge);
        if (n % 2 === 0) {
          const mug = new THREE.Mesh(geo.mug, mat(kind === 'memes' ? DESKS.memes.color : '#ffffff'));
          mug.position.set(0.45, 0.84, 0.25);
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
        const standing = n === 4;
        const p = person((kind === 'memes' ? 300 : 100) + n * 7, { vest: n % 3 === 1 });
        p.root.rotation.y = Math.PI;
        if (standing) {
          p.root.position.set(0.3, 0, 1.55);
          addPhone(p);
        } else {
          sit(p);
          p.root.position.set(0, 0, 0.92);
          p.arms.forEach((a) => (a.rotation.x = -1.15));
        }
        if (lowPower) p.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
        seat.add(p.root);
        parts.traverse((o) => { if (o.isMesh && o !== screen) o.userData.merge = true; });
        chair.traverse((o) => { if (o.isMesh) o.userData.merge = true; });

        const hit = new THREE.Mesh(hitGeo, hitMat);
        hit.position.set(0, 1, 0.55);
        seat.add(hit);
        tag(hit, 'seat', idx);
        seats.push({ index: idx, kind, desk, symbol, who, standing, person: p, seat, screen: anchor, phase: (idx * 1.37) % 6.28 });
      }
    });
  });

  // ------------------------------------------------ two managers pacing the centre aisle
  const walkers = [0, 1].map((i) => {
    const p = person(500 + i * 13, { briefcase: i === 0 });
    p.root.position.set(i ? 1.4 : -1.4, 0, i ? -6 : 6);
    g.add(p.root);
    return { p, dir: i ? 1 : -1, speed: 0.9 + i * 0.2, phase: i * 2 };
  });

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
  let lastBoard = 0, lastScreen = 0, turn = 0, nextShout = 2;
  const screenList = [...screens.values()];

  function update(t, dt, quotes, now) {
    if (now - lastBoard > 100) {
      lastBoard = now;
      boards.forEach((b) => { drawBoard(b.ctx, b.c.width, b.c.height, b.desk, quotes, t); b.tex.needsUpdate = true; });
    }
    if (now - lastScreen > 150) {
      lastScreen = now;
      const s = screenList[turn++ % screenList.length];
      drawLaptop(s.ctx, s.c.width, s.c.height, s.symbol, quotes.get(s.symbol), t);
      s.tex.needsUpdate = true;
    }

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
        p.neck.rotation.x = typing ? 0.2 : 0;
        p.hips.rotation.y = Math.sin(ph * 0.25) * 0.12;
      }
    });

    walkers.forEach((w) => {
      w.phase += dt * w.speed * 5;
      w.p.root.position.z += w.dir * w.speed * dt;
      if (w.p.root.position.z > 8) w.dir = -1;
      if (w.p.root.position.z < -8) w.dir = 1;
      w.p.root.rotation.y = w.dir > 0 ? 0 : Math.PI;
      walk(w.p, w.phase, 1);
    });

    nextShout -= dt;
    if (nextShout < 0) {
      nextShout = 3 + Math.random() * 3;
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
