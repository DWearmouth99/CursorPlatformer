import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { WeaponDef, WeaponShape } from "@fps/shared";

/**
 * GLB first-person guns live in `/weapons/`.
 * Only weapons with `weapon.viewmodel` use GLBs; meme guns stay procedural.
 *
 * Rollback all GLBs: `?boxguns=1` or localStorage `cursorfps_boxguns=1`.
 */
export function useGlbViewmodels(): boolean {
  try {
    if (typeof location !== "undefined") {
      const q = new URLSearchParams(location.search);
      if (q.get("boxguns") === "1") return false;
      if (q.get("glbguns") === "0") return false;
    }
    if (typeof localStorage !== "undefined") {
      if (localStorage.getItem("cursorfps_boxguns") === "1") return false;
    }
  } catch {
    /* ignore */
  }
  return true;
}

export type ViewmodelSpec = {
  file: string;
  scale?: number;
  rotY?: number;
  rotX?: number;
  rotZ?: number;
  hip?: [number, number, number];
  length?: number;
};

const BASE = "/weapons/";

/** Pack files are long on +X; +90° Y → barrel along camera −Z. */
const FACE_FORWARD_Y = Math.PI / 2;

const LENGTH_BY_SHAPE: Record<WeaponShape, number> = {
  pistol: 0.28,
  smg: 0.4,
  shotgun: 0.55,
  sniper: 0.72,
  rifle: 0.58,
  cannon: 0.62,
  melee: 0.55,
  weird: 0.32,
};

/** Same hold pocket as procedural box guns. */
const HIP_DEFAULT: [number, number, number] = [0.22, -0.2, -0.5];

const loader = new GLTFLoader();
const templateCache = new Map<string, Promise<THREE.Object3D>>();

function specFor(weapon: WeaponDef, shape: WeaponShape): ViewmodelSpec | null {
  if (!weapon.viewmodel) return null;
  return {
    file: weapon.viewmodel,
    rotY: FACE_FORWARD_Y,
    length: LENGTH_BY_SHAPE[shape] ?? 0.55,
    scale: shape === "melee" ? 0.72 : 0.88,
    hip: HIP_DEFAULT,
  };
}

function loadTemplate(file: string): Promise<THREE.Object3D> {
  let pending = templateCache.get(file);
  if (!pending) {
    pending = loader.loadAsync(`${BASE}${file}`).then((gltf) => {
      const root = gltf.scene;
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const m of mats) {
          const std = m as THREE.MeshStandardMaterial;
          if (std?.map) std.map.colorSpace = THREE.SRGBColorSpace;
          if (std) std.side = THREE.FrontSide;
        }
      });
      return root;
    });
    templateCache.set(file, pending);
  }
  return pending;
}

function buildBlockyArm(): THREE.Group {
  const arm = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({
    color: 0xc4a07a,
    roughness: 0.88,
    metalness: 0.02,
  });
  const sleeve = new THREE.MeshStandardMaterial({
    color: 0x2a4538,
    roughness: 0.78,
    metalness: 0.08,
  });

  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.1), skin);
  hand.position.set(0.01, -0.09, 0.05);
  arm.add(hand);

  const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.06), skin);
  knuckle.position.set(0.01, -0.05, 0.02);
  arm.add(knuckle);

  const forearm = new THREE.Mesh(
    new THREE.BoxGeometry(0.075, 0.075, 0.24),
    sleeve,
  );
  forearm.position.set(0.05, -0.15, 0.18);
  forearm.rotation.x = 0.4;
  forearm.rotation.y = -0.28;
  arm.add(forearm);

  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.095, 0.2), sleeve);
  upper.position.set(0.11, -0.28, 0.32);
  upper.rotation.x = 0.65;
  upper.rotation.y = -0.12;
  arm.add(upper);

  arm.traverse((o) => {
    o.userData.disposeOk = true;
  });
  return arm;
}

export function fitViewmodel(
  source: THREE.Object3D,
  spec: ViewmodelSpec,
): THREE.Group {
  const root = new THREE.Group();
  const hold = new THREE.Group();
  const hip = spec.hip ?? HIP_DEFAULT;
  hold.position.set(hip[0], hip[1], hip[2]);
  root.add(hold);
  hold.add(buildBlockyArm());

  const pivot = new THREE.Group();
  hold.add(pivot);

  const model = source.clone(true);
  pivot.add(model);

  pivot.rotation.order = "YXZ";
  pivot.rotation.y = spec.rotY ?? FACE_FORWARD_Y;
  pivot.rotation.x = spec.rotX ?? 0;
  pivot.rotation.z = spec.rotZ ?? 0;
  root.updateMatrixWorld(true);

  const box0 = new THREE.Box3().setFromObject(pivot);
  const center = box0.getCenter(new THREE.Vector3());
  hold.worldToLocal(center);
  pivot.position.sub(center);
  root.updateMatrixWorld(true);

  const box1 = new THREE.Box3().setFromObject(pivot);
  const size = box1.getSize(new THREE.Vector3());
  const along = Math.max(size.z, size.x, 0.05);
  const target = spec.length ?? 0.55;
  const s = (target / along) * (spec.scale ?? 1);
  pivot.scale.multiplyScalar(s);
  root.updateMatrixWorld(true);

  const box2 = new THREE.Box3().setFromObject(pivot);
  const c2 = box2.getCenter(new THREE.Vector3());
  hold.worldToLocal(c2);
  pivot.position.sub(c2);

  root.userData.viewmodelFile = spec.file;
  root.userData.sharedAssets = true;
  return root;
}

export async function createGlbViewmodel(
  weapon: WeaponDef,
  shape: WeaponShape,
): Promise<THREE.Group | null> {
  if (!useGlbViewmodels()) return null;
  const spec = specFor(weapon, shape);
  if (!spec) return null;
  try {
    const template = await loadTemplate(spec.file);
    return fitViewmodel(template, spec);
  } catch (err) {
    console.warn(`[viewmodels] failed ${spec.file}`, err);
    return null;
  }
}

export function disposeViewmodel(root: THREE.Object3D): void {
  const sharedRoot = !!root.userData.sharedAssets;
  root.traverse((o) => {
    if (sharedRoot && !o.userData.disposeOk) return;
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const m of mats) m?.dispose?.();
  });
}
