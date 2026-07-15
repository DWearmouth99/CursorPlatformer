import * as THREE from "three";
import { buildArena, type MapBox } from "@fps/shared";

function createGridTexture(base: string, line: string, border: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  const step = size / 4;
  for (let i = 0; i <= 4; i++) {
    const p = i * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  ctx.strokeStyle = border;
  ctx.lineWidth = 4;
  ctx.strokeRect(1, 1, size - 2, size - 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createWoodTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#8b7355";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = `rgba(60,40,20,${0.15 + Math.random() * 0.25})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    const y = (i / 18) * size + Math.random() * 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.3, y + 3, size * 0.7, y - 3, size, y + 1);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addBoxMesh(
  scene: THREE.Scene,
  box: MapBox,
  floorMat: THREE.MeshStandardMaterial,
  wallMat: THREE.MeshStandardMaterial,
  crateMat: THREE.MeshStandardMaterial,
): void {
  const geo = new THREE.BoxGeometry(box.sx, box.sy, box.sz);
  let material: THREE.MeshStandardMaterial;
  if (box.id === "floor") {
    material = floorMat.clone();
  } else if (box.id.startsWith("wall")) {
    material = wallMat.clone();
    material.color = new THREE.Color(box.color ?? 0x808080);
  } else {
    material = crateMat.clone();
  }

  const repeatX = Math.max(box.sx, box.sz);
  const repeatY = Math.max(box.sy, 1);
  if (material.map) {
    material.map = material.map.clone();
    material.map.repeat.set(Math.max(1, repeatX), Math.max(1, repeatY));
    material.map.needsUpdate = true;
  }

  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(box.cx, box.cy, box.cz);
  scene.add(mesh);
}

export function createWorld(scene: THREE.Scene) {
  const arena = buildArena();
  const floorTex = createGridTexture("#6e6e6e", "#3f3f3f", "#2a2a2a");
  const wallTex = createGridTexture("#7a7d82", "#50545a", "#3a3d42");
  const woodTex = createWoodTexture();

  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.92,
    metalness: 0.04,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex,
    roughness: 0.88,
    metalness: 0.06,
  });
  const crateMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.75,
    metalness: 0.05,
    color: 0xc4a574,
  });

  for (const box of arena.boxes) {
    addBoxMesh(scene, box, floorMat, wallMat, crateMat);
  }

  for (const spawn of arena.spawns) {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.06, 4),
      new THREE.MeshStandardMaterial({
        color: spawn.team === "T" ? 0xc45c26 : 0x2a6ebd,
        transparent: true,
        opacity: 0.65,
        roughness: 0.45,
        emissive: spawn.team === "T" ? 0x3a1808 : 0x0a2040,
        emissiveIntensity: 0.35,
      }),
    );
    pad.position.set(spawn.position.x, 0.03, spawn.position.z);
    scene.add(pad);
  }

  // Soft sky gradient via fog + background
  scene.background = new THREE.Color(0x8fa8bc);
  scene.fog = new THREE.FogExp2(0x8fa8bc, 0.018);

  const hemi = new THREE.HemisphereLight(0xdfe9f5, 0x4a3f32, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.05);
  sun.position.set(22, 48, 14);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xa8c4e0, 0.25);
  fill.position.set(-20, 10, -10);
  scene.add(fill);

  return {
    solids: arena.solids,
    spawns: arena.spawns,
  };
}
