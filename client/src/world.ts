import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  ACTIVE_ARENA_URL,
  buildArena,
  setActiveLevel,
  type LevelFile,
  type MapDecoration,
} from "@fps/shared";
import { createAtmosphere } from "./sky";

const MODEL_BASE = "/models/";

async function loadModelLibrary(
  names: string[],
): Promise<Map<string, THREE.Object3D>> {
  const loader = new GLTFLoader();
  const lib = new Map<string, THREE.Object3D>();
  const unique = [...new Set(names)];

  await Promise.all(
    unique.map(async (name) => {
      try {
        const gltf = await loader.loadAsync(`${MODEL_BASE}${name}.glb`);
        const root = gltf.scene;
        root.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            const mats = Array.isArray(mesh.material)
              ? mesh.material
              : [mesh.material];
            for (const m of mats) {
              const std = m as THREE.MeshStandardMaterial;
              if (std.map) std.map.colorSpace = THREE.SRGBColorSpace;
              std.side = THREE.FrontSide;
            }
          }
        });
        lib.set(name, root);
      } catch (err) {
        console.warn(`[world] failed to load ${name}.glb`, err);
      }
    }),
  );

  return lib;
}

function placeDecoration(
  scene: THREE.Scene,
  lib: Map<string, THREE.Object3D>,
  d: MapDecoration,
): void {
  const template = lib.get(d.model);
  if (!template) return;
  const inst = template.clone(true);
  const scale = d.scale ?? 1;
  inst.scale.setScalar(scale);
  inst.rotation.y = d.yaw ?? 0;
  inst.position.set(d.x, d.y, d.z);
  scene.add(inst);
}

const FOREST_MODELS = [
  "tree.01",
  "tree.02",
  "tree.03",
  "tree.04",
  "spruce.01",
  "spruce.02",
] as const;

/** Deterministic 0..1 from integer coords (stable forest layout). */
function forestRand(ix: number, iz: number, salt: number): number {
  const s = Math.sin(ix * 127.1 + iz * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Dense visual-only forest ring just outside the playable walls.
 * Not added to collision — walls already keep players inside.
 */
function placeForestBorder(
  scene: THREE.Scene,
  lib: Map<string, THREE.Object3D>,
  arenaW: number,
  arenaD: number,
): void {
  const hw = arenaW * 0.5;
  const hd = arenaD * 0.5;
  // Keep a small clear strip outside the wall, then pack trees outward.
  const clear = 2.4;
  const depth = 17;
  const spacing = 5.1;

  const xMin = -(hw + depth);
  const xMax = hw + depth;
  const zMin = -(hd + depth);
  const zMax = hd + depth;
  const innerX = hw + clear;
  const innerZ = hd + clear;

  let placed = 0;
  for (let x = xMin; x <= xMax; x += spacing) {
    for (let z = zMin; z <= zMax; z += spacing) {
      const ix = Math.round(x * 10);
      const iz = Math.round(z * 10);
      const ax = Math.abs(x);
      const az = Math.abs(z);
      // Only the outer ring (not the playable interior)
      if (ax < innerX && az < innerZ) continue;

      // Thin out far corners slightly so silhouette isn't a perfect box
      const edgeDist = Math.max(ax - hw, az - hd, 0);
      if (edgeDist > depth * 0.9 && forestRand(ix, iz, 1) > 0.5) continue;
      if (forestRand(ix, iz, 2) > 0.72) continue; // irregular gaps

      const jx = (forestRand(ix, iz, 3) - 0.5) * spacing * 0.85;
      const jz = (forestRand(ix, iz, 4) - 0.5) * spacing * 0.85;
      const px = x + jx;
      const pz = z + jz;
      if (Math.abs(px) < innerX && Math.abs(pz) < innerZ) continue;

      const model =
        FOREST_MODELS[
          Math.floor(forestRand(ix, iz, 5) * FOREST_MODELS.length)
        ]!;
      const scale = 3.4 + forestRand(ix, iz, 6) * 3.2;
      const yaw = forestRand(ix, iz, 7) * Math.PI * 2;

      placeDecoration(scene, lib, {
        model,
        x: px,
        y: -0.05,
        z: pz,
        scale,
        yaw,
      });
      placed += 1;
    }
  }

  // Extra denser spruce belt right against the wall for a solid silhouette
  const belt = 4.5;
  const beltStep = 3.2;
  for (let t = -hw - 6; t <= hw + 6; t += beltStep) {
    for (const side of [-1, 1] as const) {
      const iz = Math.round(t * 10);
      const px = t + (forestRand(iz, side, 8) - 0.5) * 1.4;
      const pz =
        side * (hd + belt + forestRand(iz, side, 9) * 3.5) +
        (forestRand(iz, side, 10) - 0.5) * 1.2;
      placeDecoration(scene, lib, {
        model: forestRand(iz, side, 11) > 0.45 ? "spruce.01" : "spruce.02",
        x: px,
        y: -0.05,
        z: pz,
        scale: 4.2 + forestRand(iz, side, 12) * 2.4,
        yaw: forestRand(iz, side, 13) * Math.PI * 2,
      });
      placed += 1;
    }
  }
  for (let t = -hd - 6; t <= hd + 6; t += beltStep) {
    for (const side of [-1, 1] as const) {
      const iz = Math.round(t * 10);
      const pz = t + (forestRand(iz, side, 14) - 0.5) * 1.4;
      const px =
        side * (hw + belt + forestRand(iz, side, 15) * 3.5) +
        (forestRand(iz, side, 16) - 0.5) * 1.2;
      placeDecoration(scene, lib, {
        model: forestRand(iz, side, 17) > 0.4 ? "tree.01" : "tree.03",
        x: px,
        y: -0.05,
        z: pz,
        scale: 4.0 + forestRand(iz, side, 18) * 2.6,
        yaw: forestRand(iz, side, 19) * Math.PI * 2,
      });
      placed += 1;
    }
  }

  console.log(`[world] forest border trees: ${placed}`);
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);
  return (
    a * (1 - ux) * (1 - uy) +
    b * ux * (1 - uy) +
    c * (1 - ux) * uy +
    d * ux * uy
  );
}

function fbm(x: number, y: number, octaves = 4): number {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    v += valueNoise(x * freq, y * freq) * amp;
    amp *= 0.5;
    freq *= 2;
  }
  return v;
}

function canvasToTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  colorSpace: boolean,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  if (colorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Green turf with light/dark grass variation + subtle blade noise. */
function makeGrassMaps(size = 512): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const color = document.createElement("canvas");
  color.width = size;
  color.height = size;
  const cctx = color.getContext("2d")!;
  const cimg = cctx.createImageData(size, size);

  const bump = document.createElement("canvas");
  bump.width = size;
  bump.height = size;
  const bctx = bump.getContext("2d")!;
  const bimg = bctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const n = fbm(u * 6, v * 6, 5);
      const clumps = fbm(u * 3.5 + 8, v * 3.5 + 2, 3);
      const blades = valueNoise(u * 48, v * 48);

      // All greens — darker clumps, lighter blades, no dirt
      const r = 42 + n * 28 + blades * 14 + clumps * 12;
      const g = 105 + n * 50 + blades * 28 + clumps * 30;
      const b = 48 + n * 22 + blades * 10 + clumps * 8;

      const i = (y * size + x) * 4;
      cimg.data[i] = Math.min(255, r);
      cimg.data[i + 1] = Math.min(255, g);
      cimg.data[i + 2] = Math.min(255, b);
      cimg.data[i + 3] = 255;

      const h = Math.floor((n * 0.65 + blades * 0.35) * 255);
      bimg.data[i] = h;
      bimg.data[i + 1] = h;
      bimg.data[i + 2] = h;
      bimg.data[i + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  bctx.putImageData(bimg, 0, 0);

  return {
    map: canvasToTexture(color, 1, 1, true),
    bumpMap: canvasToTexture(bump, 1, 1, false),
  };
}

/** Soft caustic / ripple water albedo + flowing normal-ish bump. */
function makeWaterMaps(size = 512): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const color = document.createElement("canvas");
  color.width = size;
  color.height = size;
  const cctx = color.getContext("2d")!;
  const cimg = cctx.createImageData(size, size);

  const bump = document.createElement("canvas");
  bump.width = size;
  bump.height = size;
  const bctx = bump.getContext("2d")!;
  const bimg = bctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const wave =
        Math.sin(u * Math.PI * 10 + v * 4) * 0.5 +
        Math.sin(v * Math.PI * 14 - u * 3) * 0.35;
      const n = fbm(u * 5, v * 8, 4);
      const caustic = Math.pow(
        Math.max(0, Math.sin(u * 40 + n * 6) * Math.sin(v * 36 - n * 4)),
        2,
      );

      const deep = 0.35 + n * 0.25 + wave * 0.08;
      const r = 30 + deep * 40 + caustic * 70;
      const g = 120 + deep * 60 + caustic * 90;
      const b = 150 + deep * 70 + caustic * 80;

      const i = (y * size + x) * 4;
      cimg.data[i] = Math.min(255, r);
      cimg.data[i + 1] = Math.min(255, g);
      cimg.data[i + 2] = Math.min(255, b);
      cimg.data[i + 3] = 255;

      const h = Math.floor(
        Math.min(255, (0.45 + n * 0.35 + wave * 0.2 + caustic * 0.25) * 255),
      );
      bimg.data[i] = h;
      bimg.data[i + 1] = h;
      bimg.data[i + 2] = h;
      bimg.data[i + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  bctx.putImageData(bimg, 0, 0);

  return {
    map: canvasToTexture(color, 1, 1, true),
    bumpMap: canvasToTexture(bump, 1, 1, false),
  };
}

function addBaseGround(
  scene: THREE.Scene,
  arenaW: number,
  arenaD: number,
): { update: (dt: number, now: number) => void } {
  const grass = makeGrassMaps();
  const water = makeWaterMaps();

  // ~1 tile per 2–3 meters so grass reads at play scale
  const groundRepeatX = (arenaW + 2) / 2.4;
  const groundRepeatY = (arenaD + 2) / 2.4;
  grass.map.repeat.set(groundRepeatX, groundRepeatY);
  grass.bumpMap.repeat.set(groundRepeatX, groundRepeatY);

  const skirtRepX = (arenaW + 52) / 3.2;
  const skirtRepY = (arenaD + 52) / 3.2;

  const waterRepX = 9 / 1.8;
  const waterRepY = (arenaD * 0.88) / 1.8;
  water.map.repeat.set(waterRepX, waterRepY);
  water.bumpMap.repeat.set(waterRepX, waterRepY);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(arenaW + 2, arenaD + 2),
    new THREE.MeshStandardMaterial({
      map: grass.map,
      bumpMap: grass.bumpMap,
      bumpScale: 0.08,
      color: 0xb8d4a0,
      roughness: 0.92,
      metalness: 0.02,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.0;
  scene.add(ground);

  const riverMat = new THREE.MeshStandardMaterial({
    map: water.map,
    bumpMap: water.bumpMap,
    bumpScale: 0.12,
    color: 0x8ecfe0,
    roughness: 0.22,
    metalness: 0.18,
    transparent: true,
    opacity: 0.88,
    envMapIntensity: 0.6,
  });
  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(9, arenaD * 0.88, 1, 32),
    riverMat,
  );
  river.rotation.x = -Math.PI / 2;
  river.position.set(0, 0.025, 0);
  scene.add(river);

  // Soft foam strip along banks
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(9.35, arenaD * 0.88),
    new THREE.MeshStandardMaterial({
      color: 0xd0eef5,
      transparent: true,
      opacity: 0.18,
      roughness: 0.6,
      metalness: 0,
      depthWrite: false,
    }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 0.022, 0);
  scene.add(foam);

  const skirtMap = grass.map.clone();
  skirtMap.needsUpdate = true;
  skirtMap.repeat.set(skirtRepX, skirtRepY);
  const skirtBump = grass.bumpMap.clone();
  skirtBump.needsUpdate = true;
  skirtBump.repeat.set(skirtRepX, skirtRepY);

  // Wide skirt under the forest ring (darker so the woods read as deep)
  const skirt = new THREE.Mesh(
    new THREE.PlaneGeometry(arenaW + 52, arenaD + 52),
    new THREE.MeshStandardMaterial({
      map: skirtMap,
      bumpMap: skirtBump,
      bumpScale: 0.06,
      color: 0x4a6a3c,
      roughness: 1,
      metalness: 0,
    }),
  );
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.y = -0.05;
  scene.add(skirt);

  return {
    update(dt: number, now: number) {
      // Flow along the river (Z) + slight lateral drift
      water.map.offset.y -= dt * 0.045;
      water.map.offset.x += dt * 0.008;
      water.bumpMap.offset.y -= dt * 0.06;
      water.bumpMap.offset.x += dt * 0.012;
      const shimmer = 0.84 + Math.sin(now * 0.002) * 0.06;
      riverMat.opacity = shimmer;
      riverMat.emissive.setHex(0x1a4060);
      riverMat.emissiveIntensity = 0.08 + Math.sin(now * 0.003 + 1.2) * 0.04;
    },
  };
}

/**
 * Fighting arena visuals from `/arenas/*.json` + `/models/*.glb`.
 */
export async function createWorld(scene: THREE.Scene) {
  try {
    const res = await fetch(ACTIVE_ARENA_URL);
    if (res.ok) {
      const level = (await res.json()) as LevelFile;
      setActiveLevel(level);
    } else {
      console.warn(`[world] ${ACTIVE_ARENA_URL} → ${res.status}, using default`);
    }
  } catch (err) {
    console.warn(`[world] failed to load ${ACTIVE_ARENA_URL}`, err);
  }

  const arena = buildArena();
  const lib = await loadModelLibrary([
    ...arena.decorations.map((d) => d.model),
    ...FOREST_MODELS,
  ]);

  const groundFx = addBaseGround(scene, arena.arenaW, arena.arenaD);

  for (const d of arena.decorations) {
    placeDecoration(scene, lib, d);
  }

  placeForestBorder(scene, lib, arena.arenaW, arena.arenaD);

  for (const spawn of arena.spawns) {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.05, 12),
      new THREE.MeshStandardMaterial({
        color: spawn.team === "T" ? 0xc45c26 : 0x2a6ebd,
        transparent: true,
        opacity: 0.4,
        roughness: 0.5,
        emissive: spawn.team === "T" ? 0x3a1808 : 0x0a2040,
        emissiveIntensity: 0.2,
      }),
    );
    pad.position.set(
      spawn.position.x,
      spawn.position.y + 0.03,
      spawn.position.z,
    );
    scene.add(pad);
  }

  const atmosphere = createAtmosphere(scene);

  return {
    solids: arena.solids,
    spawns: arena.spawns,
    updateSky(dt: number, now: number) {
      atmosphere.update(dt, now);
      groundFx.update(dt, now);
    },
  };
}
