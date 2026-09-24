import * as THREE from 'three';

// Chunky low-poly people built from primitives. Geometries and materials are shared.
const geo = {
  torso: new THREE.CapsuleGeometry(0.2, 0.36, 4, 12),
  head: new THREE.SphereGeometry(0.15, 18, 14),
  hair: new THREE.SphereGeometry(0.158, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
  arm: new THREE.CapsuleGeometry(0.06, 0.42, 4, 8),
  leg: new THREE.CapsuleGeometry(0.075, 0.5, 4, 8),
  shoe: new THREE.BoxGeometry(0.13, 0.08, 0.26),
  tie: new THREE.BoxGeometry(0.05, 0.26, 0.02),
  collar: new THREE.BoxGeometry(0.16, 0.08, 0.02),
  brief: new THREE.BoxGeometry(0.34, 0.24, 0.08),
  phone: new THREE.BoxGeometry(0.03, 0.14, 0.07),
};
const matCache = new Map();
export const mat = (color, o = {}) => {
  const key = color + JSON.stringify(o);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o }));
  return matCache.get(key);
};

// dark suits, so the traders read as silhouettes against the windows
export const SUITS = ['#14161c', '#0e1014', '#1b1a20', '#101319', '#1e1a17', '#161a19', '#221d18', '#0a0b0e'];
export const SHIRTS = ['#8e8578', '#7d7a72', '#978b78', '#85807a', '#a1957f'];
export const SKIN = ['#a8815f', '#96694a', '#7e5637', '#63412a', '#42291a', '#b08a67'];
export const HAIR = ['#120e0a', '#241611', '#3d2a18', '#8a6a35', '#1b1b1b', '#5d564c', '#38180f'];
export const TIES = ['#7d1f22', '#26364f', '#b6862a', '#2d5a41', '#4a3357', '#0c0c0c'];

const pick = (arr, n) => arr[Math.abs(n) % arr.length];

export function person(n = 0, { briefcase = false, vest = false } = {}) {
  const root = new THREE.Group();
  const suit = mat(pick(SUITS, n * 3 + 1));
  const shirt = mat(vest ? pick(SHIRTS, n) : pick(SHIRTS, n + 2));
  const skin = mat(pick(SKIN, n * 5 + 2), { roughness: 0.6 });
  const hair = mat(pick(HAIR, n * 7 + 3), { roughness: 0.9 });
  const pants = mat(pick(SUITS, n * 3 + 1));
  const shoes = mat('#08080a', { roughness: 0.4 });

  const hips = new THREE.Group();
  hips.position.y = 0.92;
  root.add(hips);

  const legs = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.1 * s, 0, 0);
    const leg = new THREE.Mesh(geo.leg, pants);
    leg.position.y = -0.4;
    const shoe = new THREE.Mesh(geo.shoe, shoes);
    shoe.position.set(0, -0.82, 0.05);
    pivot.add(leg, shoe);
    hips.add(pivot);
    return pivot;
  });

  const torso = new THREE.Mesh(geo.torso, vest ? shirt : suit);
  torso.position.y = 0.36;
  torso.scale.set(1.05, 1, 0.72);
  hips.add(torso);

  const collar = new THREE.Mesh(geo.collar, vest ? mat('#20242c') : shirt);
  collar.position.set(0, 0.62, 0.135);
  collar.rotation.x = -0.25;
  hips.add(collar);
  const tie = new THREE.Mesh(geo.tie, mat(pick(TIES, n * 11 + 4)));
  tie.position.set(0, 0.46, 0.15);
  tie.rotation.x = -0.12;
  hips.add(tie);
  if (vest) {
    const v = new THREE.Mesh(geo.torso, mat('#20242c'));
    v.position.y = 0.33;
    v.scale.set(1.08, 0.85, 0.66);
    hips.add(v);
  }

  const neck = new THREE.Group();
  neck.position.y = 0.78;
  hips.add(neck);
  const head = new THREE.Mesh(geo.head, skin);
  head.position.y = 0.12;
  const hairM = new THREE.Mesh(geo.hair, hair);
  hairM.position.set(0, 0.14, -0.012);
  hairM.rotation.x = -0.25;
  neck.add(head, hairM);

  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.27 * s, 0.6, 0);
    const arm = new THREE.Mesh(geo.arm, vest ? shirt : suit);
    arm.position.y = -0.24;
    const hand = new THREE.Mesh(geo.head, skin);
    hand.scale.setScalar(0.4);
    hand.position.y = -0.5;
    pivot.add(arm, hand);
    pivot.rotation.z = 0.08 * s;
    hips.add(pivot);
    return pivot;
  });

  let case_ = null;
  if (briefcase) {
    case_ = new THREE.Mesh(geo.brief, mat('#3b2616', { roughness: 0.5 }));
    case_.position.set(0, -0.58, 0.02);
    case_.rotation.y = Math.PI / 2;
    arms[1].add(case_);
  }

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, hips, legs, arms, neck, torso };
}

export function addPhone(p) {
  const ph = new THREE.Mesh(geo.phone, mat('#111'));
  ph.position.set(0.02, -0.5, 0.06);
  p.arms[0].add(ph);
  return ph;
}

// Walk cycle: phase in radians, amount 0..1
export function walk(p, phase, amount) {
  const s = Math.sin(phase) * 0.7 * amount;
  p.legs[0].rotation.x = s;
  p.legs[1].rotation.x = -s;
  p.arms[0].rotation.x = -s * 0.8;
  p.arms[1].rotation.x = s * 0.5;
  p.hips.position.y = 0.92 + Math.abs(Math.cos(phase)) * 0.04 * amount;
}

export function sit(p) {
  p.hips.position.y = 0.55;
  p.legs.forEach((l) => (l.rotation.x = -1.45));
  p.legs.forEach((l) => l.children.forEach((c) => { if (c.geometry === geo.shoe) { c.position.set(0, -0.82, 0.05); } }));
}
