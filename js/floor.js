import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FIRMS, INDICES, SHOUTS, trader } from './data.js';
import { person, sit, addPhone, mat, walk } from './avatar.js';
import { carpetCanvas, skylineCanvas, signCanvas, drawBoard, drawLaptop } from './textures.js';

const RW = 22, RD = 17, RH = 5.6;

export function buildFloor(fi, { canvasTex, lowPower, tag, onShout }) {
  const firm = FIRMS[fi];
  const g = new THREE.Group();
  const colliders = [];
  const seats = [];

  // ------------------------------------------------ lights
  g.add(new THREE.HemisphereLight('#dfe8ff', '#30261e', 1.6));
  const key = new THREE.DirectionalLight('#fff3e0', 1.6);
  key.position.set(8, 14, 10);
  key.castShadow = false; // too many small meshes indoors: skip shadows, keep the frame rate
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -24, right: 24, top: 20, bottom: -20, near: 1, far: 50 });
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.04;
  g.add(key, key.target);
  const boardLight = new THREE.PointLight(firm.color, 40, 26, 1.4);
  boardLight.position.set(0, 3.5, -RD + 2);
  g.add(boardLight);

  // ------------------------------------------------ shell
  const carpet = canvasTex(carpetCanvas());
  carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping;
  carpet.repeat.set(12, 9);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW * 2, RD * 2), new THREE.MeshStandardMaterial({ map: carpet, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);
  tag(floor, 'floor', fi);

  const wallM = mat('#262a33', { roughness: 0.9 });
  const wall = (w, h, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallM);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  wall(RW * 2, RH, 0, RH / 2, -RD);
  wall(RW * 2, RH, 0, RH / 2, RD, Math.PI);
  wall(RD * 2, RH, -RW, RH / 2, 0, Math.PI / 2);
  wall(RD * 2, RH, RW, RH / 2, 0, -Math.PI / 2);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RW * 2, RD * 2), mat('#15171c'));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = RH;
  g.add(ceil);

  // light strips
  const stripM = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#f4f7ff', emissiveIntensity: 2.2 });
  for (let z = -13; z <= 13; z += 4.5) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(34, 0.06, 0.25), stripM);
    s.position.set(0, RH - 0.05, z);
    g.add(s);
  }

  // skyline windows on side walls
  const skyTex = canvasTex(skylineCanvas());
  [-1, 1].forEach((s) => {
    for (let i = 0; i < 4; i++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 3.2), new THREE.MeshBasicMaterial({ map: skyTex, toneMapped: false }));
      win.position.set(s * (RW - 0.02), 2.9, -12 + i * 7.6);
      win.rotation.y = -s * Math.PI / 2;
      g.add(win);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.2, 0.08), mat('#0e0f12'));
      inner.position.set(s * (RW - 0.08), 2.9, -12 + i * 7.6);
      g.add(inner);
    }
  });

  // accent line in firm colour
  [-1, 1].forEach((s) => {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, RD * 2), new THREE.MeshStandardMaterial({ color: firm.color, emissive: firm.color, emissiveIntensity: 1.5 }));
    band.position.set(s * (RW - 0.03), 0.9, 0);
    g.add(band);
  });

  // ------------------------------------------------ big board
  const boardCanvas = Object.assign(document.createElement('canvas'), { width: lowPower ? 1024 : 1600, height: lowPower ? 360 : 560 });
  const boardCtx = boardCanvas.getContext('2d');
  const boardTex = canvasTex(boardCanvas);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(22, 7.7), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }));
  board.scale.setScalar(0.62);
  board.position.set(0, 3.05, -RD + 0.08);
  g.add(board);
  tag(board, 'board', fi);
  const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(14.2, 5.1, 0.2), mat('#08090b', { metalness: 0.6 }));
  boardFrame.position.set(0, 3.05, -RD + 0.02);
  g.add(boardFrame);
  // side boards: indices
  const sideCanvas = Object.assign(document.createElement('canvas'), { width: 1024, height: 96 });
  const sideCtx = sideCanvas.getContext('2d');
  const sideTex = canvasTex(sideCanvas);
  [-1, 1].forEach((s) => {
    const sb = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.66), new THREE.MeshBasicMaterial({ map: sideTex, toneMapped: false }));
    sb.position.set(s * 11.5, 4.9, -RD + 0.08);
    g.add(sb);
    tag(sb, 'board', fi);
  });

  // ------------------------------------------------ exit
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.82), new THREE.MeshBasicMaterial({ map: canvasTex(signCanvas('Exit to Wall St.', '#ff5b4d', `${firm.name.toUpperCase()} · LOBBY`)), toneMapped: false }));
  exitSign.position.set(0, 3.8, RD - 0.05);
  exitSign.rotation.y = Math.PI;
  g.add(exitSign);
  const exitDoor = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.2), new THREE.MeshStandardMaterial({ color: '#111', emissive: firm.accent, emissiveIntensity: 0.9 }));
  exitDoor.position.set(0, 1.6, RD - 0.05);
  exitDoor.rotation.y = Math.PI;
  g.add(exitDoor);
  tag(exitDoor, 'exit', fi);
  tag(exitSign, 'exit', fi);

  // ------------------------------------------------ desks
  const rowsZ = lowPower ? [7, 1, -5] : [8, 3.5, -1, -5.5, -10];
  const perSide = lowPower ? 4 : 5;
  const segLen = 16.5, seatGap = segLen / perSide;

  const deskM = mat('#d9d3ca', { roughness: 0.5 });
  const legM = mat('#2a2d33', { metalness: 0.6, roughness: 0.4 });
  const laptopM = mat('#b9bdc4', { metalness: 0.7, roughness: 0.3 });
  const monM = mat('#101114', { roughness: 0.4 });
  const chairM = mat('#15161a', { roughness: 0.6 });
  const g_ = {
    lapBase: new THREE.BoxGeometry(0.4, 0.025, 0.28),
    lapLid: new THREE.BoxGeometry(0.4, 0.27, 0.014),
    lapScreen: new THREE.PlaneGeometry(0.37, 0.24),
    mon: new THREE.BoxGeometry(0.66, 0.4, 0.035),
    monScreen: new THREE.PlaneGeometry(0.62, 0.36),
    stand: new THREE.BoxGeometry(0.05, 0.4, 0.05),
    seat: new THREE.BoxGeometry(0.5, 0.08, 0.5),
    back: new THREE.BoxGeometry(0.5, 0.6, 0.07),
    pole: new THREE.CylinderGeometry(0.03, 0.03, 0.45),
    mug: new THREE.CylinderGeometry(0.04, 0.035, 0.1, 12),
  };

  // one live texture per symbol, shared by every screen showing it
  const screens = firm.symbols.map((symbol) => {
    const c = Object.assign(document.createElement('canvas'), { width: lowPower ? 256 : 384, height: lowPower ? 160 : 240 });
    return { symbol, c, ctx: c.getContext('2d'), tex: canvasTex(c), mat: null };
  });
  screens.forEach((s) => (s.mat = new THREE.MeshBasicMaterial({ map: s.tex, toneMapped: false })));

  const hitGeo = new THREE.BoxGeometry(seatGap * 0.95, 1.8, 2.2);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  let seatNo = 0;
  rowsZ.forEach((rz, ri) => {
    [-1, 1].forEach((side) => {
      const x0 = side < 0 ? -19 : 2.5;
      const desk = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.07, 1.25), deskM);
      desk.position.set(x0 + segLen / 2, 0.76, rz);
      desk.castShadow = desk.receiveShadow = true;
      g.add(desk);
      [0.2, segLen - 0.2].forEach((dx) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.74, 1.1), legM);
        leg.position.set(x0 + dx, 0.37, rz);
        g.add(leg);
      });
      const privacy = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.5, 0.04), mat('#2c313b'));
      privacy.position.set(x0 + segLen / 2, 1.04, rz - 0.6);
      g.add(privacy);
      colliders.push(new THREE.Box3(new THREE.Vector3(x0 - 0.1, 0, rz - 0.75), new THREE.Vector3(x0 + segLen + 0.1, 2, rz + 1.45)));

      for (let k = 0; k < perSide; k++) {
        const x = x0 + seatGap * (k + 0.5);
        const idx = seatNo++;
        const scr = screens[idx % screens.length];
        const seat = new THREE.Group();
        seat.position.set(x, 0, rz);
        g.add(seat);
        const parts = new THREE.Group();
        seat.add(parts);

        // laptop
        const base = new THREE.Mesh(g_.lapBase, laptopM);
        base.position.set(0, 0.81, 0.3);
        const hinge = new THREE.Group();
        hinge.position.set(0, 0.82, 0.17);
        hinge.rotation.x = -0.28;
        const lid = new THREE.Mesh(g_.lapLid, laptopM);
        lid.position.y = 0.135;
        const screen = new THREE.Mesh(g_.lapScreen, scr.mat);
        screen.position.set(0, 0.135, 0.0075);
        const anchor = new THREE.Object3D();
        anchor.position.copy(screen.position);
        hinge.add(lid, screen, anchor);
        parts.add(base, hinge);

        // two monitors on an arm
        const stand = new THREE.Mesh(g_.stand, legM);
        stand.position.set(0, 1.0, -0.35);
        parts.add(stand);
        [-0.34, 0.34].forEach((mx, m) => {
          const mon = new THREE.Mesh(g_.mon, monM);
          mon.position.set(mx, 1.36, -0.34);
          mon.rotation.y = -mx * 0.5;
          const ms = new THREE.Mesh(g_.monScreen, screens[(idx + 3 + m * 2) % screens.length].mat);
          ms.position.z = 0.019;
          mon.add(ms);
          parts.add(mon);
        });
        if (idx % 3 === 0) {
          const mug = new THREE.Mesh(g_.mug, mat(['#ffffff', firm.color, '#c23b3b'][idx % 3]));
          mug.position.set(0.42, 0.84, 0.25);
          parts.add(mug);
        }

        // chair
        const chair = new THREE.Group();
        chair.position.set(0, 0, 1.0);
        const cs = new THREE.Mesh(g_.seat, chairM);
        cs.position.y = 0.5;
        const cb = new THREE.Mesh(g_.back, chairM);
        cb.position.set(0, 0.86, 0.26);
        const cp = new THREE.Mesh(g_.pole, legM);
        cp.position.y = 0.24;
        chair.add(cs, cb, cp);
        seat.add(chair);

        // trader
        const who = trader(fi, idx);
        const standing = (idx * 7 + fi) % 9 === 4;
        const p = person(fi * 50 + idx * 5 + 3, { vest: idx % 4 === 1 });
        p.root.rotation.y = Math.PI;
        if (standing) {
          p.root.position.set(0.25, 0, 1.5);
          addPhone(p);
        } else {
          sit(p);
          p.root.position.set(0, 0, 0.92);
          p.arms.forEach((a) => (a.rotation.x = -1.15));
        }
        p.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
        parts.traverse((o) => { if (o.isMesh) o.userData.merge = true; });
        chair.traverse((o) => { if (o.isMesh) o.userData.merge = true; });
        seat.add(p.root);

        // one invisible box per seat catches clicks for the laptop, desk and trader
        const hit = new THREE.Mesh(hitGeo, hitMat);
        hit.position.set(0, 0.9, 0.55);
        seat.add(hit);
        tag(hit, 'seat', idx);
        seats.push({
          index: idx, firm: fi, symbol: scr.symbol, who, standing, person: p, seat, screen: anchor,
          phase: (idx * 1.37) % 6.28, look: 0,
        });
      }
    });
  });

  // merge all static desk furniture and screens: one draw call per material instead of hundreds
  g.updateMatrixWorld(true);
  const buckets = new Map();
  const doomed = [];
  g.traverse((o) => {
    if (!o.isMesh || !o.userData.merge) return;
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(geo);
    doomed.push(o);
  });
  doomed.forEach((o) => o.parent.remove(o));
  buckets.forEach((geos, material) => {
    const merged = new THREE.Mesh(mergeGeometries(geos), material);
    merged.receiveShadow = true;
    g.add(merged);
  });

  // ------------------------------------------------ a few floor walkers
  const walkers = [];
  for (let i = 0; i < (lowPower ? 2 : 5); i++) {
    const p = person(fi * 9 + i * 13 + 40, { briefcase: i === 0 });
    p.root.position.set(-18 + i * 7, 0, rowsZ[i % rowsZ.length] - 1.9);
    g.add(p.root);
    walkers.push({ p, dir: i % 2 ? 1 : -1, speed: 1 + (i % 3) * 0.25, phase: i });
  }

  let lastBoard = 0, lastScreens = 0, screenTurn = 0, nextShout = 3;
  const tapeSymbols = INDICES;

  function update(t, dt, quotes, now) {
    if (now - lastBoard > 90) {
      lastBoard = now;
      drawBoard(boardCtx, boardCanvas.width, boardCanvas.height, firm, quotes, t, tapeSymbols);
      boardTex.needsUpdate = true;
      drawSide(sideCtx, sideCanvas, quotes, t);
      sideTex.needsUpdate = true;
    }
    if (now - lastScreens > 120) {
      lastScreens = now;
      const s = screens[screenTurn++ % screens.length];
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
      w.p.root.position.x += w.dir * w.speed * dt;
      if (w.p.root.position.x > 19) w.dir = -1;
      if (w.p.root.position.x < -19) w.dir = 1;
      w.p.root.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      walk(w.p, w.phase, 1);
    });

    nextShout -= dt;
    if (nextShout < 0) {
      nextShout = 2.5 + Math.random() * 3.5;
      const s = seats[(Math.random() * seats.length) | 0];
      const q = quotes.get(s.symbol);
      const live = q && Math.random() < 0.45;
      const text = live ? `${s.symbol.replace(/[=^].*$|-USD/, '') || s.symbol} ${q.changePct >= 0 ? 'up' : 'down'} ${Math.abs(q.changePct).toFixed(2)}%!` : SHOUTS[(Math.random() * SHOUTS.length) | 0];
      onShout?.(s, text);
    }
  }

  function drawSide(ctx, c, quotes, t) {
    ctx.fillStyle = '#030406';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.font = '600 40px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'middle';
    const s = INDICES[Math.floor(t / 4) % 4];
    const q = quotes.get(s);
    ctx.fillStyle = '#ffb000';
    ctx.fillText({ '^GSPC': 'S&P 500', '^DJI': 'DOW JONES', '^IXIC': 'NASDAQ', '^RUT': 'RUSSELL 2000' }[s], 24, 48);
    ctx.textAlign = 'right';
    ctx.fillStyle = q ? (q.change >= 0 ? '#27d47e' : '#ff4d5e') : '#777';
    ctx.fillText(q ? `${q.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}  ${q.changePct >= 0 ? '▲' : '▼'}${Math.abs(q.changePct).toFixed(2)}%` : '···', c.width - 24, 48);
    ctx.textAlign = 'left';
  }

  const bounds = { minX: -RW + 0.6, maxX: RW - 0.6, minZ: -RD + 1.2, maxZ: RD - 0.6 };
  return { group: g, seats, colliders, bounds, update, spawn: new THREE.Vector3(0, 0, RD - 3.5), exit: new THREE.Vector3(0, 0, RD - 0.8), firm };
}
