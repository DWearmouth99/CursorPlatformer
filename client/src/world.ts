import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  ACTIVE_ARENA_URL,
  buildArena,
  setActiveLevel,
  type LevelFile,
  type MapDecoration,
} from "@fps/shared";

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

function addBaseGround(
  scene: THREE.Scene,
  arenaW: number,
  arenaD: number,
): void {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(arenaW + 2, arenaD + 2),
    new THREE.MeshStandardMaterial({
      color: 0x4f8f45,
      roughness: 0.92,
      metalness: 0.02,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.0;
  scene.add(ground);

  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(9, arenaD * 0.88),
    new THREE.MeshStandardMaterial({
      color: 0x3a9fc4,
      roughness: 0.3,
      metalness: 0.08,
    }),
  );
  river.rotation.x = -Math.PI / 2;
  river.position.set(0, 0.02, 0);
  scene.add(river);

  const skirt = new THREE.Mesh(
    new THREE.PlaneGeometry(arenaW + 40, arenaD + 40),
    new THREE.MeshStandardMaterial({
      color: 0x3a5c32,
      roughness: 1,
      metalness: 0,
    }),
  );
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.y = -0.05;
  scene.add(skirt);
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
  const lib = await loadModelLibrary(arena.decorations.map((d) => d.model));

  addBaseGround(scene, arena.arenaW, arena.arenaD);

  for (const d of arena.decorations) {
    placeDecoration(scene, lib, d);
  }

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

  scene.background = new THREE.Color(0x8ec4e8);
  scene.fog = new THREE.Fog(0xa8d0ec, 55, 140);

  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x3d6b35, 1.1));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.2);
  sun.position.set(35, 70, 25);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9ec0e0, 0.3);
  fill.position.set(-30, 20, -20);
  scene.add(fill);

  return {
    solids: arena.solids,
    spawns: arena.spawns,
  };
}
