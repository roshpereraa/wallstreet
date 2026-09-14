import * as THREE from 'three';
import { FIRMS, INDICES } from './data.js';
import { person, walk, mat } from './avatar.js';
import { facadeCanvas, facadeGlow, stoneCanvas, roadCanvas, cobbleCanvas, signCanvas, skyCanvas, drawTape, glowCanvas, rand } from './textures.js';

const FRONT = 9;          // building frontage distance from street centre
const Z_START = 14, Z_END = -104;
export const FIRM_Z = { '-1': [-8, -42, -76], '1': [-24, -58, -92] };

export function buildStreet({ canvasTex, lowPower, tag }) {
  const g = new THREE.Group();
  const doors = [];
  const tickers = [];
  const colliders = [];

  const sky = canvasTex(skyCanvas());
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false, depthWrite: false }));
  g.add(skyDome);

  // ------------------------------------------------ lights
  g.add(new THREE.HemisphereLight('#8aa0d8', '#2a2018', 1.3));
  const sun = new THREE.DirectionalLight('#ffb070', 2.4);
  sun.position.set(30, 60, -80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  g.add(sun, sun.target);

  // ------------------------------------------------ ground
  const roadTex = canvasTex(roadCanvas());
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  roadTex.repeat.set(1, 16);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(10, 140), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -45);
  road.receiveShadow = true;
  g.add(road);

  const walkTex = canvasTex(stoneCanvas('#8c867c'));
  walkTex.wrapS = walkTex.wrapT = THREE.RepeatWrapping;
  walkTex.repeat.set(2, 36);
  [-1, 1].forEach((s) => {
    const walkway = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 140), new THREE.MeshStandardMaterial({ map: walkTex, roughness: 0.9 }));
    walkway.position.set(s * 7.1, 0.08, -45);
    walkway.receiveShadow = true;
    g.add(walkway);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 140), mat('#9d978d'));
    curb.position.set(s * 5.05, 0.09, -45);
    g.add(curb);
  });

  const cobTex = canvasTex(cobbleCanvas());
  cobTex.wrapS = cobTex.wrapT = THREE.RepeatWrapping;
  cobTex.repeat.set(10, 3);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(60, 18), new THREE.MeshStandardMaterial({ map: cobTex, roughness: 0.95 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.01, 22);
  plaza.receiveShadow = true;
  g.add(plaza);

  // ------------------------------------------------ facades
  const facades = [
    facadeCanvas({ cols: 8, rows: 16, base: '#18202c', lit: 0.5 }),
    facadeCanvas({ cols: 6, rows: 14, base: '#2a2622', lit: 0.42 }),
    facadeCanvas({ cols: 10, rows: 20, base: '#141a24', lit: 0.55, warm: false }),
    facadeCanvas({ cols: 5, rows: 12, base: '#3a332c', lit: 0.38 }),
  ].map((c) => ({ c, glow: facadeGlow(c) }));

  function facadeMaterial(i, w, h) {
    const f = facades[i % facades.length];
    const map = canvasTex(f.c), em = canvasTex(f.glow);
    for (const t of [map, em]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(w / 10)), Math.max(1, Math.round(h / 22))); }
    return new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.6, metalness: 0.1 });
  }
  const roofM = mat('#101218');

  function tower(x, z, w, d, h, style) {
    const m = facadeMaterial(style, Math.max(w, d), h);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(d, h, w), [m, m, roofM, roofM, m, m]);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  }

  const stoneTexCache = {};
  const stoneMat = (color) => {
    if (!stoneTexCache[color]) {
      const t = canvasTex(stoneCanvas(color));
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(3, 2);
      stoneTexCache[color] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
    }
    return stoneTexCache[color];
  };

  const colGeo = new THREE.CylinderGeometry(0.45, 0.5, 7, 16);
  const flagGeo = new THREE.PlaneGeometry(1.8, 1.1);

  function firmBuilding(firm, fi, side, z) {
    const W = 16, D = 20, H = 70 + ((fi * 13) % 4) * 10;
    const cx = side * (FRONT + D / 2);
    const t = tower(cx, z, W - 1.5, D, H, fi);
    tag(t, 'building', fi);

    // crown band glowing in firm colour
    const crown = new THREE.Mesh(new THREE.BoxGeometry(D + 0.4, 2, W - 1.1), new THREE.MeshStandardMaterial({ color: firm.color, emissive: firm.color, emissiveIntensity: 1.6 }));
    crown.position.set(cx, H - 3, z);
    g.add(crown);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(2.4, 12, 4), mat('#1a1c22', { metalness: 0.6, roughness: 0.4 }));
    spire.position.set(cx, H + 6, z);
    spire.rotation.y = Math.PI / 4;
    g.add(spire);

    // stone podium
    const pod = new THREE.Mesh(new THREE.BoxGeometry(D + 1, 10, W), stoneMat(firm.stone));
    pod.position.set(side * (FRONT - 0.5 + (D + 1) / 2), 5, z);
    pod.receiveShadow = pod.castShadow = true;
    g.add(pod);
    tag(pod, 'building', fi);
    colliders.push(new THREE.Box3().setFromObject(pod));

    const fx = side * (FRONT - 0.6);
    // columns
    [-5.5, -3, 3, 5.5].forEach((dz) => {
      const c = new THREE.Mesh(colGeo, stoneMat('#b9b0a2'));
      c.position.set(fx - side * 0.4, 3.5 + 0.16, z + dz);
      c.castShadow = true;
      g.add(c);
      tag(c, 'building', fi);
      colliders.push(new THREE.Box3().setFromObject(c));
    });
    // lintel + sign
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 14), stoneMat('#b9b0a2'));
    lintel.position.set(fx - side * 0.4, 7.7, z);
    g.add(lintel);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.95), new THREE.MeshBasicMaterial({ map: canvasTex(signCanvas(firm.name, firm.color)), toneMapped: false }));
    sign.position.set(fx - side * 1.12, 7.7, z);
    sign.rotation.y = -side * Math.PI / 2;
    g.add(sign);
    tag(sign, 'building', fi);

    // glowing doorway
    const door = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.6), new THREE.MeshStandardMaterial({ color: '#1a1206', emissive: firm.accent, emissiveIntensity: 1.1 }));
    door.position.set(fx - side * 0.02, 2.46, z);
    door.rotation.y = -side * Math.PI / 2;
    g.add(door);
    tag(door, 'door', fi);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.2, 4), mat('#2a2218', { metalness: 0.6, roughness: 0.3 }));
    frame.position.set(fx + side * 0.25, 2.6, z);
    g.add(frame);

    const spill = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: canvasTex(glowCanvas(firm.accent + '88')), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(side * 7.4, 0.18, z);
    g.add(spill);
    const light = new THREE.PointLight(firm.accent, 30, 14, 1.6);
    light.position.set(side * 6.5, 3.5, z);
    g.add(light);

    // flags
    [-7.2, 7.2].forEach((dz) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2), mat('#c8c2b8', { metalness: 0.8, roughness: 0.3 }));
      pole.rotation.z = side * -0.9;
      pole.position.set(fx - side * 1.2, 9.4, z + dz);
      g.add(pole);
      const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: firm.color, side: THREE.DoubleSide, emissive: firm.color, emissiveIntensity: 0.25 }));
      flag.position.set(fx - side * 2.1, 9.4, z + dz);
      flag.rotation.y = Math.PI / 2;
      g.add(flag);
      tickers.push({ flag, base: dz });
    });

    doors.push({ firm: fi, pos: new THREE.Vector3(side * 7.9, 0, z), face: new THREE.Vector3(side, 0, 0), side });
  }

  function fillerBuilding(side, z0, z1, n) {
    const W = z0 - z1, D = 16 + rand() * 8, H = 30 + rand() * 70;
    const cx = side * (FRONT + D / 2);
    tower(cx, (z0 + z1) / 2, W - 0.4, D, H, n + 1);
    const pod = new THREE.Mesh(new THREE.BoxGeometry(D, 5, W - 0.2), stoneMat(['#5a534b', '#46423d', '#6a6158'][n % 3]));
    pod.position.set(cx - side * 0.3, 2.5, (z0 + z1) / 2);
    pod.receiveShadow = true;
    g.add(pod);
    colliders.push(new THREE.Box3().setFromObject(pod));
    const shop = new THREE.Mesh(new THREE.PlaneGeometry(W - 2, 2.6), new THREE.MeshStandardMaterial({ color: '#111', emissive: ['#ffd9a0', '#bfe0ff', '#ffc0a0'][n % 3], emissiveIntensity: 0.55 }));
    shop.position.set(side * (FRONT - 0.32), 1.9, (z0 + z1) / 2);
    shop.rotation.y = -side * Math.PI / 2;
    g.add(shop);
  }

  FIRMS.forEach((f, fi) => {
    const list = FIRM_Z[f.side];
    const idx = FIRMS.filter((x, j) => x.side === f.side && j < fi).length;
    firmBuilding(f, fi, f.side, list[idx]);
  });

  [-1, 1].forEach((side) => {
    const firmSpans = FIRM_Z[side].map((z) => [z + 8, z - 8]);
    let z = Z_START + 10, n = 0;
    while (z > Z_END - 4) {
      const hit = firmSpans.find(([a, b]) => z <= a + 0.01 && z > b);
      if (hit) { z = hit[1]; continue; }
      const next = firmSpans.find(([a]) => a < z);
      let w = 8 + Math.floor(rand() * 7);
      if (next && z - w < next[0]) w = z - next[0];
      if (w < 0.5) { z = next[1]; continue; }
      fillerBuilding(side, z, z - w, n++);
      z -= w;
    }
  });

  // backdrop behind the plaza and beyond the exchange
  tower(0, 42, 14, 70, 60, 2);
  tower(-24, Z_END - 30, 24, 20, 90, 1);
  tower(24, Z_END - 30, 24, 20, 110, 3);

  // ------------------------------------------------ The Exchange
  const ex = new THREE.Group();
  ex.position.set(0, 0, Z_END - 8);
  g.add(ex);
  const exStone = stoneMat('#a89f90');
  const exBody = new THREE.Mesh(new THREE.BoxGeometry(34, 20, 12), exStone);
  exBody.position.set(0, 10, -4);
  exBody.receiveShadow = true;
  ex.add(exBody);
  for (let i = 0; i < 4; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(26 - i, 0.3, 3 - i * 0.6), exStone);
    step.position.set(0, 0.15 + i * 0.3, 4 - i * 0.6);
    ex.add(step);
  }
  const bigCol = new THREE.CylinderGeometry(0.8, 0.9, 13, 18);
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(bigCol, stoneMat('#c7bfb1'));
    c.position.set(-10 + i * 4, 7.7, 2.6);
    c.castShadow = true;
    ex.add(c);
  }
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 3, 3, 1), stoneMat('#b6ad9e'));
  ped.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  ped.scale.set(0.34, 1, 1);
  ped.position.set(0, 16.4, 2.4);
  ex.add(ped);
  const exSign = new THREE.Mesh(new THREE.PlaneGeometry(18, 2.2), new THREE.MeshBasicMaterial({ map: canvasTex(signCanvas('The Exchange', '#f5d27a', 'NEW YORK · LIVE MARKET DATA')), toneMapped: false }));
  exSign.position.set(0, 20.6, 2.1);
  ex.add(exSign);
  tag(exSign, 'exchange', -1);

  const tapeCanvas = Object.assign(document.createElement('canvas'), { width: lowPower ? 1024 : 2048, height: lowPower ? 64 : 128 });
  const tapeTex = canvasTex(tapeCanvas);
  const tape = new THREE.Mesh(new THREE.PlaneGeometry(30, 1.9), new THREE.MeshBasicMaterial({ map: tapeTex, toneMapped: false }));
  tape.position.set(0, 13.6, 3.6);
  ex.add(tape);
  tag(tape, 'exchange', -1);
  const tapeFrame = new THREE.Mesh(new THREE.BoxGeometry(30.6, 2.3, 0.4), mat('#0b0b0c', { metalness: 0.5 }));
  tapeFrame.position.set(0, 13.6, 3.35);
  ex.add(tapeFrame);

  // ------------------------------------------------ Charging bull
  const bull = new THREE.Group();
  bull.position.set(-0.5, 0, 22);
  bull.rotation.y = -Math.PI / 2 - 0.3;
  g.add(bull);
  const bronze = new THREE.MeshStandardMaterial({ color: '#7a4e25', metalness: 0.75, roughness: 0.32 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.5, 2.6), stoneMat('#3a3632'));
  base.position.y = 0.25;
  bull.add(base);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 2.2, 6, 16), bronze);
  body.rotation.z = Math.PI / 2 - 0.12;
  body.position.set(0, 2.0, 0);
  body.scale.set(1, 1, 0.85);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(1.05, 20, 14), bronze);
  chest.position.set(1.1, 2.05, 0);
  chest.scale.set(1, 1.05, 0.9);
  const headB = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.7, 4, 12), bronze);
  headB.position.set(2.15, 1.55, 0);
  headB.rotation.z = 1.1;
  bull.add(body, chest, headB);
  [-1, 1].forEach((s) => {
    const horn = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.08, 8, 16, Math.PI * 0.8), mat('#c9a870', { metalness: 0.8, roughness: 0.25 }));
    horn.position.set(2.0, 2.0, 0.35 * s);
    horn.rotation.set(0, s > 0 ? -0.4 : 0.4, 0.4);
    bull.add(horn);
  });
  [[1.3, 0.5, -0.6], [1.3, 0.5, 0.6], [-1.3, 0.2, -0.55], [-1.3, 0.2, 0.55]].forEach(([x, rz, z], i) => {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.1, 4, 8), bronze);
    leg.position.set(x + (i < 2 ? 0.25 : -0.2), 1.0, z);
    leg.rotation.z = i < 2 ? -0.5 : 0.35;
    bull.add(leg);
  });
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 6, 16, Math.PI), bronze);
  tail.position.set(-2.1, 2.5, 0);
  tail.rotation.z = 1.2;
  bull.add(tail);
  bull.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  tag(bull, 'bull', -1);
  colliders.push(new THREE.Box3(new THREE.Vector3(-3.4, 0, 19.6), new THREE.Vector3(2.4, 3, 24.4)));

  // ------------------------------------------------ street lamps
  const lampPole = new THREE.CylinderGeometry(0.08, 0.12, 5.2, 8);
  const lampHead = new THREE.SphereGeometry(0.28, 12, 8);
  const bulbM = new THREE.MeshStandardMaterial({ color: '#fff2d0', emissive: '#ffd89a', emissiveIntensity: 3 });
  const poleM = mat('#1e2328', { metalness: 0.6, roughness: 0.4 });
  for (let z = 8; z > Z_END; z -= 16) {
    [-1, 1].forEach((s) => {
      const p = new THREE.Mesh(lampPole, poleM);
      p.position.set(s * 5.5, 2.6, z + (s > 0 ? 8 : 0));
      g.add(p);
      const b = new THREE.Mesh(lampHead, bulbM);
      b.position.set(s * 5.5, 5.3, z + (s > 0 ? 8 : 0));
      g.add(b);
    });
  }

  // ------------------------------------------------ taxis
  const taxis = [];
  const yellow = mat('#f2b705', { roughness: 0.35, metalness: 0.3 });
  const glassM = mat('#1a2230', { roughness: 0.1, metalness: 0.6 });
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 14);
  const wheelM = mat('#111');
  const headM = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff4d0', emissiveIntensity: 2.5 });
  const tailM = new THREE.MeshStandardMaterial({ color: '#f00', emissive: '#ff2020', emissiveIntensity: 2 });
  for (let i = 0; i < (lowPower ? 4 : 7); i++) {
    const car = new THREE.Group();
    const bodyC = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.75, 4.4), yellow);
    bodyC.position.y = 0.75;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), glassM);
    cab.position.set(0, 1.4, -0.2);
    const roofSign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.25), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffe9a0', emissiveIntensity: 1.2 }));
    roofSign.position.set(0, 1.8, -0.2);
    car.add(bodyC, cab, roofSign);
    [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]].forEach(([x, z]) => {
      const w = new THREE.Mesh(wheelGeo, wheelM);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.36, z);
      car.add(w);
    });
    [-0.6, 0.6].forEach((x) => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.05), headM);
      hl.position.set(x, 0.8, 2.22);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.05), tailM);
      tl.position.set(x, 0.8, -2.22);
      car.add(hl, tl);
    });
    car.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const dir = i % 2 ? 1 : -1;
    car.position.set(dir > 0 ? -2.5 : 2.5, 0, Z_START - rand() * 118);
    car.rotation.y = dir > 0 ? 0 : Math.PI;
    g.add(car);
    taxis.push({ car, dir, speed: 5 + rand() * 5 });
  }

  // ------------------------------------------------ pedestrians
  const peds = [];
  for (let i = 0; i < (lowPower ? 8 : 16); i++) {
    const p = person(i * 3 + 11, { briefcase: i % 3 === 0 });
    const side = i % 2 ? 1 : -1;
    const dir = rand() < 0.5 ? 1 : -1;
    p.root.position.set(side * (6 + rand() * 2), 0.16, Z_START - rand() * 118);
    p.root.rotation.y = dir > 0 ? 0 : Math.PI;
    g.add(p.root);
    peds.push({ p, dir, speed: 1.1 + rand() * 0.8, phase: rand() * 6 });
  }

  // ------------------------------------------------ manhole steam
  const steam = [];
  const steamM = new THREE.MeshBasicMaterial({ color: '#dfe6f0', transparent: true, opacity: 0.2, depthWrite: false });
  [[1.2, -33], [-2, -66]].forEach(([x, z]) => {
    const cover = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), mat('#1d1d1f', { metalness: 0.5 }));
    cover.rotation.x = -Math.PI / 2;
    cover.position.set(x, 0.02, z);
    g.add(cover);
    for (let k = 0; k < 8; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), steamM.clone());
      g.add(s);
      steam.push({ s, x, z, off: k / 8 });
    }
  });

  const tapeCtx = tapeCanvas.getContext('2d');
  const tapeSymbols = [...INDICES, 'AAPL', 'NVDA', 'MSFT', 'JPM', 'GS', 'TSLA', 'AMZN', 'META'];

  function update(t, dt, quotes, player) {
    sun.target.position.set(player.x, 0, player.z);
    sun.position.set(player.x + 30, 60, player.z - 80);

    drawTape(tapeCtx, tapeCanvas.width, tapeCanvas.height, tapeSymbols, quotes, t * (tapeCanvas.width / 12));
    tapeTex.needsUpdate = true;

    tickers.forEach(({ flag, base }, i) => { flag.rotation.x = Math.sin(t * 2 + i) * 0.12; });

    taxis.forEach((c) => {
      c.car.position.z += c.dir * c.speed * dt;
      if (c.car.position.z > Z_START + 6) c.car.position.z = Z_END - 4;
      if (c.car.position.z < Z_END - 4) c.car.position.z = Z_START + 6;
      // brake for the player
      const dz = (player.z - c.car.position.z) * c.dir;
      const near = Math.abs(player.x - c.car.position.x) < 1.6 && dz > 0 && dz < 6;
      c.speed += ((near ? 0 : 8) - c.speed) * Math.min(1, dt * (near ? 6 : 0.6));
    });

    peds.forEach((n) => {
      n.phase += dt * n.speed * 5;
      n.p.root.position.z += n.dir * n.speed * dt;
      if (n.p.root.position.z > Z_START + 4) { n.dir = -1; n.p.root.rotation.y = Math.PI; }
      if (n.p.root.position.z < Z_END) { n.dir = 1; n.p.root.rotation.y = 0; }
      walk(n.p, n.phase, 1);
    });

    steam.forEach((m) => {
      const k = (t * 0.3 + m.off) % 1;
      m.s.position.set(m.x + Math.sin(t + m.off * 6) * 0.3 * k, 0.2 + k * 4, m.z + k * 0.8);
      m.s.scale.setScalar(0.6 + k * 2.4);
      m.s.material.opacity = (1 - k) * 0.18;
    });
  }

  const bounds = { minX: -8.2, maxX: 8.2, minZ: Z_END + 1, maxZ: Z_START + 14 };
  return { group: g, doors, update, colliders, bounds, spawn: new THREE.Vector3(0, 0, 10), tapeSymbols };
}
