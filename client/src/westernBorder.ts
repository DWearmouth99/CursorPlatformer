import * as THREE from "three";

/** Deterministic 0..1 from integer coords (stable western layout). */
function desertRand(ix: number, iz: number, salt: number): number {
  const s = Math.sin(ix * 91.7 + iz * 217.3 + salt * 53.1) * 43758.5453;
  return s - Math.floor(s);
}

function mat(
  color: number,
  opts: Partial<THREE.MeshStandardMaterialParameters> = {},
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.88,
    metalness: 0.05,
    ...opts,
  });
}

const WOOD = () => mat(0x6b4423, { roughness: 0.95 });

/** Saguaro-style cactus with 1–2 arms. */
function makeCactus(scale: number): THREE.Group {
  const g = new THREE.Group();
  const green = mat(0x3d7a3a, { roughness: 0.75 });
  const spine = mat(0x2a5528, { roughness: 0.9 });

  const trunkH = 2.4 + scale * 0.35;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.34, trunkH, 8),
    green,
  );
  trunk.position.y = trunkH * 0.5;
  g.add(trunk);

  const arm = (side: 1 | -1, heightFrac: number, len: number) => {
    const y = trunkH * heightFrac;
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 6), green);
    elbow.position.set(side * 0.28, y, 0);
    g.add(elbow);
    const horiz = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.2, len, 6),
      green,
    );
    horiz.rotation.z = (Math.PI / 2) * side;
    horiz.position.set(side * (0.28 + len * 0.5), y, 0);
    g.add(horiz);
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.18, 0.9, 6),
      green,
    );
    tip.position.set(side * (0.28 + len), y + 0.45, 0);
    g.add(tip);
  };

  arm(1, 0.55, 0.7 + scale * 0.08);
  if (scale > 1.2) arm(-1, 0.38, 0.55 + scale * 0.06);

  for (let i = 0; i < 6; i++) {
    const kn = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), spine);
    const a = (i / 6) * Math.PI * 2;
    kn.position.set(
      Math.cos(a) * 0.3,
      trunkH * (0.25 + i * 0.1),
      Math.sin(a) * 0.3,
    );
    g.add(kn);
  }

  g.scale.setScalar(scale);
  return g;
}

function makeTumbleweed(scale: number): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x8a6a3e, { roughness: 1 });
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), wood));
  const weave = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.05, 4, 10),
    mat(0x6b4e2e, { roughness: 1 }),
  );
  weave.rotation.x = 0.7;
  g.add(weave);
  const weave2 = weave.clone();
  weave2.rotation.y = 1.2;
  g.add(weave2);
  g.scale.setScalar(scale);
  return g;
}

function makeHorse(scale: number): THREE.Group {
  const g = new THREE.Group();
  const hide = mat(0x5c3d22, { roughness: 0.85 });
  const mane = mat(0x2a1a0c, { roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.85, 0.55), hide);
  body.position.set(0, 1.05, 0);
  g.add(body);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 0.35), hide);
  neck.position.set(0.75, 1.45, 0);
  neck.rotation.z = -0.45;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.28), hide);
  head.position.set(1.15, 1.7, 0);
  g.add(head);
  const maneMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.2), mane);
  maneMesh.position.set(0.62, 1.55, 0);
  g.add(maneMesh);
  for (const [lx, lz] of [
    [-0.5, 0.18],
    [-0.5, -0.18],
    [0.45, 0.18],
    [0.45, -0.18],
  ] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.75, 0.14), hide);
    leg.position.set(lx, 0.38, lz);
    g.add(leg);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), mane);
  tail.position.set(-0.9, 1.15, 0);
  tail.rotation.z = 0.4;
  g.add(tail);
  g.scale.setScalar(scale);
  return g;
}

function makeScrub(scale: number): THREE.Group {
  const g = new THREE.Group();
  const leaf = mat(0x6a7a3a, { roughness: 1 });
  for (let i = 0; i < 5; i++) {
    const blob = new THREE.Mesh(
      new THREE.SphereGeometry(0.28 + (i % 3) * 0.08, 6, 5),
      leaf,
    );
    blob.position.set(
      (i % 3) * 0.25 - 0.25,
      0.25,
      Math.floor(i / 3) * 0.3 - 0.15,
    );
    g.add(blob);
  }
  g.scale.setScalar(scale);
  return g;
}

function makeButte(scale: number): THREE.Group {
  const g = new THREE.Group();
  const rock = mat(0xc4a06a, { roughness: 0.95 });
  const dark = mat(0x9a7348, { roughness: 1 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.6), rock);
  base.position.y = 0.6;
  g.add(base);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 1.1), dark);
  top.position.y = 2.0;
  g.add(top);
  g.scale.setScalar(scale);
  return g;
}

/**
 * Continuous fence along a straight line — posts + dual rails that span
 * exactly between neighbor posts (no gaps / overhang stubs).
 */
function placeFenceLine(
  scene: THREE.Scene,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  spacing = 2.55,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.1) return 0;

  const ux = dx / len;
  const uz = dz / len;
  const count = Math.max(2, Math.floor(len / spacing) + 1);
  const step = len / (count - 1);
  const wood = WOOD();
  const posts: { x: number; z: number }[] = [];

  for (let i = 0; i < count; i++) {
    const t = i * step;
    const px = ax + ux * t;
    const pz = az + uz * t;
    posts.push({ x: px, z: pz });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.35, 0.16), wood);
    post.position.set(px, 0.675, pz);
    scene.add(post);
  }

  const yaw = Math.atan2(ux, uz);
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i]!;
    const b = posts[i + 1]!;
    const mx = (a.x + b.x) * 0.5;
    const mz = (a.z + b.z) * 0.5;
    const railLen = Math.hypot(b.x - a.x, b.z - a.z) - 0.04;
    for (const y of [0.62, 1.02]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.09, railLen),
        wood,
      );
      rail.position.set(mx, y, mz);
      rail.rotation.y = yaw;
      scene.add(rail);
    }
  }

  return count;
}

type WesternKind = "cactus" | "tumble" | "horse" | "scrub" | "butte";

function makeProp(kind: WesternKind, scale: number): THREE.Object3D {
  switch (kind) {
    case "cactus":
      return makeCactus(scale);
    case "tumble":
      return makeTumbleweed(scale);
    case "horse":
      return makeHorse(scale);
    case "scrub":
      return makeScrub(scale);
    case "butte":
      return makeButte(scale);
  }
}

/**
 * Visual-only Wild West ring outside the playable walls —
 * cacti, tumbleweed, connected fence lines, horses, scrub, and buttes.
 */
export function placeWesternBorder(
  scene: THREE.Scene,
  arenaW: number,
  arenaD: number,
): { update: (dt: number) => void } {
  const hw = arenaW * 0.5;
  const hd = arenaD * 0.5;
  const clear = 2.6;
  const depth = 18;
  const spacing = 5.4;
  const innerX = hw + clear;
  const innerZ = hd + clear;

  const tumbleweeds: THREE.Object3D[] = [];
  let placed = 0;

  for (let x = -(hw + depth); x <= hw + depth; x += spacing) {
    for (let z = -(hd + depth); z <= hd + depth; z += spacing) {
      const ix = Math.round(x * 10);
      const iz = Math.round(z * 10);
      const ax = Math.abs(x);
      const az = Math.abs(z);
      if (ax < innerX && az < innerZ) continue;

      const edgeDist = Math.max(ax - hw, az - hd, 0);
      if (edgeDist > depth * 0.92 && desertRand(ix, iz, 1) > 0.45) continue;
      if (desertRand(ix, iz, 2) > 0.68) continue;

      const jx = (desertRand(ix, iz, 3) - 0.5) * spacing * 0.8;
      const jz = (desertRand(ix, iz, 4) - 0.5) * spacing * 0.8;
      const px = x + jx;
      const pz = z + jz;
      if (Math.abs(px) < innerX && Math.abs(pz) < innerZ) continue;

      const roll = desertRand(ix, iz, 5);
      let kind: WesternKind;
      let scale: number;
      if (roll < 0.4) {
        kind = "cactus";
        scale = 1.1 + desertRand(ix, iz, 6) * 1.6;
      } else if (roll < 0.55) {
        kind = "tumble";
        scale = 0.7 + desertRand(ix, iz, 6) * 0.9;
      } else if (roll < 0.75) {
        kind = "scrub";
        scale = 1.0 + desertRand(ix, iz, 6) * 1.4;
      } else if (roll < 0.9) {
        kind = "butte";
        scale = 1.4 + desertRand(ix, iz, 6) * 2.2;
      } else {
        kind = "horse";
        scale = 1.15 + desertRand(ix, iz, 6) * 0.45;
      }

      const prop = makeProp(kind, scale);
      prop.position.set(px, 0, pz);
      prop.rotation.y = desertRand(ix, iz, 7) * Math.PI * 2;
      scene.add(prop);
      if (kind === "tumble") tumbleweeds.push(prop);
      placed += 1;
    }
  }

  // Connected fence belt just outside the walls (inset from outer clutter)
  const belt = 3.6;
  const pad = 1.2;
  placed += placeFenceLine(
    scene,
    -hw - pad,
    hd + belt,
    hw + pad,
    hd + belt,
  );
  placed += placeFenceLine(
    scene,
    -hw - pad,
    -(hd + belt),
    hw + pad,
    -(hd + belt),
  );
  placed += placeFenceLine(
    scene,
    hw + belt,
    -hd - pad,
    hw + belt,
    hd + pad,
  );
  placed += placeFenceLine(
    scene,
    -(hw + belt),
    -hd - pad,
    -(hw + belt),
    hd + pad,
  );

  for (const [hx, hz, hyaw] of [
    [hw + 8, 12, Math.PI * 0.7],
    [hw + 10, -22, -0.4],
    [-hw - 9, 6, Math.PI * 1.2],
    [-hw - 7, -28, 0.5],
    [14, hd + 9, Math.PI],
    [-18, -hd - 10, 0.2],
  ] as const) {
    const horse = makeHorse(
      1.25 + desertRand(Math.round(hx), Math.round(hz), 30) * 0.3,
    );
    horse.position.set(hx, 0, hz);
    horse.rotation.y = hyaw;
    scene.add(horse);
    placed += 1;
  }

  console.log(`[world] western border props: ${placed}`);

  return {
    update(dt: number) {
      for (let i = 0; i < tumbleweeds.length; i++) {
        const tw = tumbleweeds[i]!;
        tw.rotation.x += dt * (0.8 + (i % 5) * 0.15);
        tw.rotation.z += dt * 0.45;
        tw.position.x += Math.sin(i + tw.position.z * 0.1) * dt * 0.35;
        const ax = Math.abs(tw.position.x);
        const az = Math.abs(tw.position.z);
        if (ax < hw + 1 && az < hd + 1) {
          tw.position.x += Math.sign(tw.position.x || 1) * 4;
        }
      }
    },
  };
}
