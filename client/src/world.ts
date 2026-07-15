import * as THREE from "three";
import { buildArena, type MapBox, type MapSurface } from "@fps/shared";

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return [canvas, canvas.getContext("2d")!];
}

function toTexture(canvas: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.repeat.set(repeat, repeat);
  return tex;
}

function createConcreteTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256);
  ctx.fillStyle = "#6a7078";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const shade = 90 + Math.floor(Math.random() * 50);
    ctx.fillStyle = `rgba(${shade},${shade + 4},${shade + 8},${0.08 + Math.random() * 0.12})`;
    ctx.fillRect(
      Math.random() * 256,
      Math.random() * 256,
      1 + Math.random() * 3,
      1 + Math.random() * 3,
    );
  }
  // Panel seams
  ctx.strokeStyle = "rgba(40,44,50,0.45)";
  ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    const p = (i / 4) * 256;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(256, p);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(200,210,220,0.12)";
  ctx.lineWidth = 1;
  ctx.strokeRect(8, 8, 240, 240);
  return toTexture(canvas);
}

function createFloorTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256);
  ctx.fillStyle = "#5c6168";
  ctx.fillRect(0, 0, 256, 256);
  // asphalt noise
  for (let i = 0; i < 1400; i++) {
    const g = 70 + Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgba(${g},${g},${g + 6},${0.15})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // lane markings
  ctx.strokeStyle = "rgba(220,200,90,0.35)";
  ctx.lineWidth = 6;
  ctx.setLineDash([18, 14]);
  ctx.beginPath();
  ctx.moveTo(128, 0);
  ctx.lineTo(128, 256);
  ctx.stroke();
  ctx.setLineDash([]);
  // grit tiles
  ctx.strokeStyle = "rgba(30,32,36,0.35)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const p = (i / 8) * 256;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(256, p);
    ctx.stroke();
  }
  return toTexture(canvas);
}

function createBrickTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256);
  ctx.fillStyle = "#4a4e55";
  ctx.fillRect(0, 0, 256, 256);
  const bw = 42;
  const bh = 20;
  for (let row = 0; row < 14; row++) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col < 8; col++) {
      const x = col * bw + off;
      const y = row * bh;
      const shade = 110 + Math.floor(Math.random() * 35);
      ctx.fillStyle = `rgb(${shade},${shade - 8},${shade - 14})`;
      ctx.fillRect(x + 1, y + 1, bw - 3, bh - 3);
      ctx.strokeStyle = "rgba(30,30,34,0.55)";
      ctx.strokeRect(x + 1, y + 1, bw - 3, bh - 3);
    }
  }
  return toTexture(canvas);
}

function createMetalTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128);
  const grad = ctx.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, "#6d757f");
  grad.addColorStop(0.5, "#545c66");
  grad.addColorStop(1, "#3f464f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(220,230,240,${0.04 + Math.random() * 0.08})`;
    ctx.beginPath();
    ctx.moveTo(0, Math.random() * 128);
    ctx.lineTo(128, Math.random() * 128);
    ctx.stroke();
  }
  // rivets
  for (let y = 16; y < 128; y += 32) {
    for (let x = 16; x < 128; x += 32) {
      ctx.fillStyle = "rgba(20,22,26,0.55)";
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(180,190,200,0.35)";
      ctx.beginPath();
      ctx.arc(x - 0.6, y - 0.6, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return toTexture(canvas);
}

function createWoodTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128);
  ctx.fillStyle = "#8b7355";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 22; i++) {
    ctx.strokeStyle = `rgba(60,40,20,${0.15 + Math.random() * 0.28})`;
    ctx.lineWidth = 1 + Math.random() * 2.5;
    const y = (i / 22) * 128 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(40, y + 4, 90, y - 4, 128, y + 2);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(40,28,14,0.5)";
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, 122, 122);
  return toTexture(canvas);
}

function createTrimTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(64);
  ctx.fillStyle = "#9a7a52";
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "rgba(40,28,12,0.35)";
  ctx.fillRect(0, 28, 64, 8);
  ctx.fillStyle = "rgba(220,200,160,0.2)";
  ctx.fillRect(0, 8, 64, 4);
  return toTexture(canvas);
}

function surfaceOf(box: MapBox): MapSurface {
  if (box.surface) return box.surface;
  if (box.id === "floor") return "floor";
  if (box.id.startsWith("wall")) return "wall";
  if (box.id.startsWith("crate")) return "crate";
  return "concrete";
}

function addBoxMesh(
  scene: THREE.Scene,
  box: MapBox,
  mats: Record<MapSurface, THREE.MeshStandardMaterial>,
): void {
  const geo = new THREE.BoxGeometry(box.sx, box.sy, box.sz);
  const surface = surfaceOf(box);
  const material = mats[surface].clone();
  if (box.color !== undefined) {
    material.color = new THREE.Color(box.color);
  }

  const repeatX = Math.max(1, box.sx / 2.5);
  const repeatY = Math.max(1, Math.max(box.sy, box.sz) / 2.5);
  if (material.map) {
    material.map = material.map.clone();
    material.map.repeat.set(repeatX, repeatY);
    material.map.needsUpdate = true;
  }
  if (material.roughnessMap) {
    material.roughnessMap = material.roughnessMap.clone();
    material.roughnessMap.repeat.set(repeatX, repeatY);
    material.roughnessMap.needsUpdate = true;
  }

  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(box.cx, box.cy, box.cz);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scene.add(mesh);
}

export function createWorld(scene: THREE.Scene) {
  const arena = buildArena();

  const floorTex = createFloorTexture();
  const wallTex = createBrickTexture();
  const concreteTex = createConcreteTexture();
  const metalTex = createMetalTexture();
  const woodTex = createWoodTexture();
  const trimTex = createTrimTexture();

  const mats: Record<MapSurface, THREE.MeshStandardMaterial> = {
    floor: new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.94,
      metalness: 0.05,
    }),
    wall: new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.9,
      metalness: 0.04,
    }),
    concrete: new THREE.MeshStandardMaterial({
      map: concreteTex,
      roughness: 0.88,
      metalness: 0.06,
    }),
    metal: new THREE.MeshStandardMaterial({
      map: metalTex,
      roughness: 0.55,
      metalness: 0.55,
    }),
    crate: new THREE.MeshStandardMaterial({
      map: woodTex,
      roughness: 0.78,
      metalness: 0.04,
      color: 0xc4a574,
    }),
    trim: new THREE.MeshStandardMaterial({
      map: trimTex,
      roughness: 0.7,
      metalness: 0.08,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: 0xd4b23a,
      roughness: 0.45,
      metalness: 0.2,
      emissive: 0x3a3008,
      emissiveIntensity: 0.15,
    }),
  };

  for (const box of arena.boxes) {
    addBoxMesh(scene, box, mats);
  }

  // Subtle team spawn markers (small so random pads stay quiet)
  for (const spawn of arena.spawns) {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.05, 12),
      new THREE.MeshStandardMaterial({
        color: spawn.team === "T" ? 0xc45c26 : 0x2a6ebd,
        transparent: true,
        opacity: 0.4,
        roughness: 0.5,
        emissive: spawn.team === "T" ? 0x3a1808 : 0x0a2040,
        emissiveIntensity: 0.25,
      }),
    );
    pad.position.set(spawn.position.x, 0.03, spawn.position.z);
    scene.add(pad);
  }

  scene.background = new THREE.Color(0x87a0b4);
  scene.fog = new THREE.Fog(0x87a0b4, 55, 160);

  const hemi = new THREE.HemisphereLight(0xe8eef6, 0x3d3830, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d4, 1.15);
  sun.position.set(40, 70, 28);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9bb6d0, 0.32);
  fill.position.set(-35, 18, -25);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd8a8, 0.18);
  rim.position.set(10, 12, -50);
  scene.add(rim);

  return {
    solids: arena.solids,
    spawns: arena.spawns,
  };
}
