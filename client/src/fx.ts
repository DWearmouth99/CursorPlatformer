import * as THREE from "three";
import {
  defaultWeaponFx,
  type Vec3,
  type WeaponDef,
  type WeaponFx,
  type WeaponShape,
} from "@fps/shared";
import {
  createGlbViewmodel,
  disposeViewmodel,
  useGlbViewmodels,
} from "./viewmodels";

type Tracer = {
  obj: THREE.Object3D;
  dispose: () => void;
  born: number;
  life: number;
};

type Impact = {
  mesh: THREE.Mesh;
  born: number;
  life: number;
};

type Spark = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  born: number;
  life: number;
};

function buildBlockyArm(root: THREE.Group, hx: number, hy: number, hz: number): void {
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
  hand.position.set(hx + 0.01, hy - 0.09, hz + 0.05);
  root.add(hand);
  const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.24), sleeve);
  forearm.position.set(hx + 0.05, hy - 0.15, hz + 0.18);
  forearm.rotation.x = 0.4;
  forearm.rotation.y = -0.28;
  root.add(forearm);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.095, 0.2), sleeve);
  upper.position.set(hx + 0.11, hy - 0.28, hz + 0.32);
  upper.rotation.x = 0.65;
  upper.rotation.y = -0.12;
  root.add(upper);
}

const DISCO_COLORS = [
  0xff006e, 0x8338ec, 0x3a86ff, 0xffbe0b, 0xfb5607, 0x00f5d4,
];

function buildViewmodel(weapon: WeaponDef): THREE.Group {
  const style = defaultWeaponFx(weapon);
  const shape: WeaponShape = style.shape;
  const primary = style.primary;
  const accent = style.accent;
  const root = new THREE.Group();
  const gunMat = new THREE.MeshStandardMaterial({
    color: primary,
    roughness: 0.42,
    metalness: 0.4,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accent,
    roughness: 0.35,
    metalness: 0.55,
  });

  const add = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    root.add(m);
    return m;
  };

  const hx = 0.22;
  const hy = -0.2;
  const hz = -0.5;
  buildBlockyArm(root, hx, hy, hz);

  // Themed meme / melee meshes by weapon id
  switch (weapon.id) {
    case "gg_slap": {
      // Giant tactical slap-hand
      add(new THREE.BoxGeometry(0.14, 0.22, 0.08), gunMat, 0.28, -0.12, -0.72);
      add(new THREE.BoxGeometry(0.05, 0.12, 0.05), accentMat, 0.22, -0.02, -0.72);
      add(new THREE.BoxGeometry(0.05, 0.14, 0.05), accentMat, 0.28, 0.0, -0.72);
      add(new THREE.BoxGeometry(0.05, 0.13, 0.05), accentMat, 0.34, -0.01, -0.72);
      add(new THREE.BoxGeometry(0.05, 0.1, 0.05), accentMat, 0.4, -0.04, -0.72);
      add(new THREE.BoxGeometry(0.06, 0.08, 0.05), gunMat, 0.18, -0.2, -0.7);
      root.userData.melee = true;
      return root;
    }
    case "gg_hammer": {
      // Gravity hammer — long haft + huge head
      add(new THREE.CylinderGeometry(0.035, 0.04, 0.85, 8), gunMat, 0.2, -0.1, -0.85, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.28, 0.22, 0.32), accentMat, 0.2, -0.08, -1.25);
      add(new THREE.BoxGeometry(0.12, 0.08, 0.12), gunMat, 0.2, -0.08, -1.42);
      root.userData.melee = true;
      return root;
    }
    case "gg_ban": {
      // Ban hammer / judge gavel
      add(new THREE.CylinderGeometry(0.03, 0.035, 0.7, 8), gunMat, 0.2, -0.12, -0.8, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.34, 0.16, 0.2), accentMat, 0.2, -0.08, -1.15);
      add(new THREE.BoxGeometry(0.18, 0.05, 0.22), gunMat, 0.2, 0.02, -1.15);
      // little "X" ban plate
      add(new THREE.BoxGeometry(0.12, 0.12, 0.04), accentMat, 0.2, -0.08, -1.28);
      root.userData.melee = true;
      return root;
    }
    case "gg_pea": {
      add(new THREE.SphereGeometry(0.09, 10, 10), gunMat, hx, hy, -0.58);
      add(new THREE.CylinderGeometry(0.04, 0.055, 0.28, 8), accentMat, hx, hy + 0.02, -0.82, Math.PI / 2, 0, 0);
      add(new THREE.SphereGeometry(0.035, 8, 8), accentMat, hx, hy + 0.08, -0.55);
      return root;
    }
    case "gg_chicken": {
      add(new THREE.SphereGeometry(0.11, 10, 10), gunMat, hx, hy, -0.62);
      add(new THREE.ConeGeometry(0.05, 0.16, 6), accentMat, hx, hy + 0.02, -0.86, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.04, 0.08, 0.03), accentMat, hx - 0.08, hy + 0.1, -0.58);
      add(new THREE.BoxGeometry(0.04, 0.08, 0.03), accentMat, hx + 0.08, hy + 0.1, -0.58);
      return root;
    }
    case "gg_potato": {
      add(new THREE.SphereGeometry(0.1, 8, 8), gunMat, hx, hy, -0.55);
      add(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 10), accentMat, hx, hy, -0.85, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.16, 0.14, 0.2), gunMat, hx, hy - 0.1, -0.4);
      return root;
    }
    case "gg_noodle": {
      add(new THREE.TorusGeometry(0.08, 0.035, 6, 12), gunMat, hx, hy, -0.55);
      add(new THREE.CylinderGeometry(0.05, 0.07, 0.4, 8), accentMat, hx, hy, -0.85, Math.PI / 2, 0, 0);
      return root;
    }
    case "gg_bubble": {
      add(new THREE.SphereGeometry(0.1, 12, 12), gunMat, hx, hy, -0.6);
      add(new THREE.SphereGeometry(0.05, 8, 8), accentMat, hx + 0.08, hy + 0.06, -0.7);
      add(new THREE.CylinderGeometry(0.04, 0.06, 0.22, 8), accentMat, hx, hy, -0.82, Math.PI / 2, 0, 0);
      return root;
    }
    case "gg_spoon": {
      add(new THREE.BoxGeometry(0.06, 0.04, 0.55), gunMat, hx, hy, -0.75);
      add(new THREE.SphereGeometry(0.08, 8, 8), accentMat, hx, hy + 0.02, -1.1);
      add(new THREE.BoxGeometry(0.1, 0.08, 0.16), gunMat, hx, hy - 0.06, -0.4);
      return root;
    }
    case "gg_soaker": {
      add(new THREE.BoxGeometry(0.1, 0.14, 0.42), gunMat, hx, hy, -0.62);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.4, 8), accentMat, hx, hy + 0.04, -0.95, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.12, 0.16, 0.14), accentMat, hx, hy - 0.08, -0.4);
      return root;
    }
    case "gg_shrink": {
      add(new THREE.BoxGeometry(0.08, 0.1, 0.28), gunMat, hx, hy, -0.55);
      add(new THREE.ConeGeometry(0.07, 0.22, 8), accentMat, hx, hy, -0.82, Math.PI / 2, 0, 0);
      add(new THREE.TorusGeometry(0.05, 0.015, 6, 10), accentMat, hx, hy, -0.95);
      return root;
    }
    case "gg_thunder": {
      add(new THREE.BoxGeometry(0.09, 0.12, 0.26), gunMat, hx, hy, -0.52);
      add(new THREE.BoxGeometry(0.04, 0.18, 0.04), accentMat, hx, hy + 0.08, -0.72, 0, 0, 0.4);
      add(new THREE.BoxGeometry(0.04, 0.14, 0.04), accentMat, hx + 0.04, hy - 0.02, -0.8, 0, 0, -0.5);
      return root;
    }
    case "gg_pointer": {
      add(new THREE.BoxGeometry(0.06, 0.06, 0.28), gunMat, hx, hy, -0.55);
      add(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 6), accentMat, hx, hy, -0.85, Math.PI / 2, 0, 0);
      add(new THREE.SphereGeometry(0.025, 6, 6), accentMat, hx, hy, -1.05);
      return root;
    }
    case "gg_golden": {
      add(new THREE.SphereGeometry(0.1, 10, 10), gunMat, hx, hy, -0.58);
      add(new THREE.CylinderGeometry(0.03, 0.05, 0.25, 8), accentMat, hx, hy + 0.08, -0.72, 0.6, 0, 0);
      return root;
    }
    case "gg_banana_peel": {
      add(new THREE.BoxGeometry(0.1, 0.1, 0.36), gunMat, hx, hy, -0.55);
      add(new THREE.BoxGeometry(0.05, 0.04, 0.22), accentMat, hx, hy + 0.05, -0.82);
      add(new THREE.SphereGeometry(0.06, 8, 8), accentMat, hx, hy - 0.02, -0.95);
      return root;
    }
    case "gg_bees": {
      add(new THREE.BoxGeometry(0.14, 0.14, 0.28), gunMat, hx, hy, -0.55);
      add(new THREE.BoxGeometry(0.16, 0.04, 0.16), accentMat, hx, hy + 0.08, -0.55);
      add(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 8), accentMat, hx, hy, -0.85, Math.PI / 2, 0, 0);
      return root;
    }
    case "gg_confetti": {
      add(new THREE.BoxGeometry(0.09, 0.11, 0.36), gunMat, hx, hy, -0.55);
      add(new THREE.BoxGeometry(0.12, 0.04, 0.12), accentMat, hx, hy + 0.08, -0.7);
      add(new THREE.BoxGeometry(0.04, 0.04, 0.22), accentMat, hx, hy, -0.88);
      return root;
    }
    case "gg_disco": {
      add(new THREE.BoxGeometry(0.12, 0.12, 0.4), gunMat, hx, hy, -0.58);
      add(new THREE.SphereGeometry(0.07, 10, 10), accentMat, hx, hy + 0.1, -0.5);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.35, 8), accentMat, hx - 0.04, hy, -0.92, Math.PI / 2, 0, 0);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.35, 8), gunMat, hx + 0.04, hy, -0.92, Math.PI / 2, 0, 0);
      return root;
    }
    case "gg_accordion": {
      add(new THREE.BoxGeometry(0.22, 0.14, 0.18), gunMat, hx, hy, -0.55);
      add(new THREE.BoxGeometry(0.18, 0.12, 0.08), accentMat, hx, hy, -0.7);
      add(new THREE.BoxGeometry(0.22, 0.14, 0.12), gunMat, hx, hy, -0.85);
      return root;
    }
    case "gg_flappy": {
      add(new THREE.BoxGeometry(0.1, 0.1, 0.3), gunMat, hx, hy, -0.55);
      add(new THREE.BoxGeometry(0.22, 0.03, 0.1), accentMat, hx, hy + 0.06, -0.7);
      add(new THREE.BoxGeometry(0.04, 0.04, 0.2), accentMat, hx, hy, -0.85);
      return root;
    }
    default:
      break;
  }

  if (shape === "melee") {
    // Generic melee fallback (e.g. before GLB board loads)
    add(new THREE.BoxGeometry(0.06, 0.06, 0.7), gunMat, 0.2, -0.14, -0.75);
    add(new THREE.BoxGeometry(0.28, 0.08, 0.35), accentMat, 0.2, -0.12, -1.15);
    root.userData.melee = true;
    return root;
  }

  switch (shape) {
    case "smg":
      add(new THREE.BoxGeometry(0.09, 0.11, 0.38), gunMat, 0.22, -0.22, -0.52);
      add(new THREE.BoxGeometry(0.04, 0.04, 0.28), accentMat, 0.22, -0.18, -0.82);
      add(new THREE.BoxGeometry(0.05, 0.16, 0.07), accentMat, 0.22, -0.34, -0.5);
      add(new THREE.BoxGeometry(0.07, 0.08, 0.12), gunMat, 0.22, -0.26, -0.3);
      break;
    case "shotgun":
      add(new THREE.BoxGeometry(0.12, 0.14, 0.48), gunMat, 0.22, -0.23, -0.55);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), accentMat, 0.18, -0.18, -0.9, Math.PI / 2, 0, 0);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), accentMat, 0.26, -0.18, -0.9, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.08, 0.12, 0.18), gunMat, 0.22, -0.28, -0.28);
      break;
    case "sniper":
      add(new THREE.BoxGeometry(0.1, 0.1, 0.62), gunMat, 0.22, -0.22, -0.6);
      add(new THREE.CylinderGeometry(0.022, 0.022, 0.7, 8), accentMat, 0.22, -0.17, -1.05, Math.PI / 2, 0, 0);
      add(new THREE.CylinderGeometry(0.045, 0.045, 0.14, 10), accentMat, 0.22, -0.08, -0.55, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.08, 0.14, 0.22), gunMat, 0.22, -0.3, -0.25);
      break;
    case "pistol":
      add(new THREE.BoxGeometry(0.08, 0.12, 0.24), gunMat, 0.22, -0.2, -0.48);
      add(new THREE.BoxGeometry(0.04, 0.04, 0.2), accentMat, 0.22, -0.16, -0.68);
      add(new THREE.BoxGeometry(0.06, 0.14, 0.08), accentMat, 0.22, -0.3, -0.42);
      break;
    case "cannon":
      add(new THREE.CylinderGeometry(0.08, 0.1, 0.55, 10), gunMat, 0.22, -0.2, -0.7, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.14, 0.16, 0.22), accentMat, 0.22, -0.28, -0.35);
      add(new THREE.BoxGeometry(0.1, 0.08, 0.12), gunMat, 0.22, -0.18, -0.42);
      break;
    case "weird":
      add(new THREE.SphereGeometry(0.09, 10, 10), gunMat, 0.22, -0.2, -0.55);
      add(new THREE.ConeGeometry(0.06, 0.35, 8), accentMat, 0.22, -0.18, -0.85, Math.PI / 2, 0, 0);
      add(new THREE.TorusGeometry(0.08, 0.02, 6, 12), accentMat, 0.22, -0.14, -0.55);
      break;
    default:
      add(new THREE.BoxGeometry(0.11, 0.13, 0.52), gunMat, 0.22, -0.22, -0.55);
      add(new THREE.BoxGeometry(0.045, 0.045, 0.42), accentMat, 0.22, -0.175, -0.92);
      add(new THREE.BoxGeometry(0.09, 0.11, 0.2), gunMat, 0.22, -0.255, -0.28);
      add(new THREE.BoxGeometry(0.06, 0.14, 0.08), accentMat, 0.22, -0.32, -0.55);
      break;
  }
  return root;
}

/**
 * Tracers, impacts, muzzle flash, per-weapon viewmodels + FOV punch.
 */
export function createEffects(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
) {
  const tracers: Tracer[] = [];
  const impacts: Impact[] = [];
  const sparks: Spark[] = [];
  const baseFov = camera.fov;

  let style: WeaponFx = defaultWeaponFx({
    id: "default",
    name: "Default",
    damage: 1,
    headshotMultiplier: 1,
    magSize: 1,
    reloadMs: 1,
    fireRate: 1,
    pellets: 1,
    spreadDeg: 0,
    adsSpreadMult: 1,
    adsFov: 75,
    adsSensMult: 1,
    scopeStyle: "iron",
    recoilPattern: [[0, 0]],
  });

  const muzzleLight = new THREE.PointLight(0xffcc66, 0, 12, 2);
  camera.add(muzzleLight);
  muzzleLight.position.set(0.18, -0.14, -0.7);

  const flashCanvas = document.createElement("canvas");
  flashCanvas.width = 64;
  flashCanvas.height = 64;
  {
    const ctx = flashCanvas.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, "rgba(255,255,220,1)");
    g.addColorStop(0.35, "rgba(255,180,40,0.9)");
    g.addColorStop(1, "rgba(255,80,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  const flashTex = new THREE.CanvasTexture(flashCanvas);
  const flashMat = new THREE.SpriteMaterial({
    map: flashTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xffffff,
  });
  const muzzleFlash = new THREE.Sprite(flashMat);
  muzzleFlash.scale.set(0.35, 0.35, 0.35);
  muzzleFlash.position.set(0.22, -0.16, -1.05);
  muzzleFlash.visible = false;
  camera.add(muzzleFlash);

  let viewmodel = buildViewmodel({
    id: "default",
    name: "Default",
    damage: 1,
    headshotMultiplier: 1,
    magSize: 1,
    reloadMs: 1,
    fireRate: 1,
    pellets: 1,
    spreadDeg: 0,
    adsSpreadMult: 1,
    adsFov: 75,
    adsSensMult: 1,
    scopeStyle: "iron",
    recoilPattern: [[0, 0]],
  });
  camera.add(viewmodel);

  let activeWeapon: WeaponDef | null = null;
  let muzzleUntil = 0;
  let kick = 0;
  let fovKick = 0;
  let bobTime = 0;
  let adsBlend = 0;
  let sprintBlend = 0;
  let spinT = 0;
  /** 1 → 0 melee swing progress. */
  let swingT = 0;
  /** 0..1 reload progress while reloading. */
  let reloadBlend = 0;
  let wasReloadingFx = false;
  let reloadPhase = 0;
  /** Camera head-bob offsets applied by caller after positioning eye. */
  let headBobY = 0;
  let headBobRoll = 0;

  const _muzzleLocal = new THREE.Vector3(0.22, -0.16, -1.05);
  const _origin = new THREE.Vector3();
  const _end = new THREE.Vector3();
  const _fwd = new THREE.Vector3();

  const hipMuzzle = new THREE.Vector3(0.22, -0.16, -1.05);
  const adsMuzzle = new THREE.Vector3(0.02, -0.08, -0.7);

  let weaponLoadToken = 0;

  function replaceViewmodel(next: THREE.Group): void {
    camera.remove(viewmodel);
    disposeViewmodel(viewmodel);
    viewmodel = next;
    camera.add(viewmodel);
  }

  function setWeapon(weapon: WeaponDef): void {
    activeWeapon = weapon;
    style = defaultWeaponFx(weapon);
    flashMat.color.setHex(style.muzzle);
    muzzleLight.color.setHex(style.muzzle);
    swingT = 0;

    // Instant procedural fallback, then upgrade to GLB when ready.
    const token = ++weaponLoadToken;
    const procedural = buildViewmodel(weapon);
    replaceViewmodel(procedural);

    if (!useGlbViewmodels() || !weapon.viewmodel) return;
    void createGlbViewmodel(weapon, style.shape).then((glb) => {
      if (!glb || token !== weaponLoadToken) {
        if (glb) disposeViewmodel(glb);
        return;
      }
      if (style.shape === "melee") glb.userData.melee = true;
      replaceViewmodel(glb);
    });
  }

  function tracerColor(fxStyle: WeaponFx, weaponId?: string): number {
    if (weaponId === "gg_disco" || weaponId === "gg_confetti") {
      return DISCO_COLORS[(Math.random() * DISCO_COLORS.length) | 0]!;
    }
    return fxStyle.tracer;
  }

  function spawnTracer(
    ox: number,
    oy: number,
    oz: number,
    ex: number,
    ey: number,
    ez: number,
    now: number,
    fxStyle: WeaponFx,
    weaponId?: string,
  ): void {
    const a = new THREE.Vector3(ox, oy, oz);
    const b = new THREE.Vector3(ex, ey, ez);
    const life = fxStyle.tracerLife;
    const color = tracerColor(fxStyle, weaponId);
    let obj: THREE.Object3D;
    let dispose: () => void;

    const disposeMesh = (mesh: THREE.Mesh) => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    };
    const disposeGroup = (group: THREE.Group) => {
      scene.remove(group);
      group.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          c.geometry.dispose();
          (c.material as THREE.Material).dispose();
        }
      });
    };

    if (fxStyle.tracerStyle === "slash") {
      // Short melee arc in front of camera / along hit
      const mid = a.clone().lerp(b, 0.35);
      mid.y += 0.15;
      const side = new THREE.Vector3(0, 1, 0).cross(b.clone().sub(a).normalize());
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
      side.normalize().multiplyScalar(0.55);
      const p0 = mid.clone().add(side);
      const p1 = mid.clone().sub(side).add(new THREE.Vector3(0, -0.25, 0));
      const curve = new THREE.QuadraticBezierCurve3(p0, mid.clone().addScaledVector(b.clone().sub(a).normalize(), 0.4), p1);
      const pts = curve.getPoints(14);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      obj = line;
      dispose = () => {
        scene.remove(line);
        geo.dispose();
        mat.dispose();
      };
    } else if (fxStyle.tracerStyle === "chunk") {
      const dir = b.clone().sub(a);
      const len = Math.min(dir.length() || 0.01, 8);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(
          weaponId === "gg_pea" ? 0.06 : 0.12,
          8,
          8,
        ),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
        }),
      );
      // Place "projectile" partway along the path for a chunky look
      mesh.position.copy(a).lerp(b, 0.45);
      mesh.scale.set(1, 0.75, 1.2);
      scene.add(mesh);
      obj = mesh;
      dispose = () => disposeMesh(mesh);
      // Also a short stub trail
      const stub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.05, Math.min(len * 0.25, 1.2), 6),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      );
      stub.position.copy(a).lerp(mesh.position, 0.5);
      stub.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.clone().normalize(),
      );
      scene.add(stub);
      tracers.push({
        obj: stub,
        dispose: () => disposeMesh(stub),
        born: now,
        life: life * 0.7,
      });
    } else if (fxStyle.tracerStyle === "bubble") {
      const group = new THREE.Group();
      const n = 5;
      for (let i = 0; i < n; i++) {
        const t = 0.15 + (i / (n - 1)) * 0.7;
        const p = a.clone().lerp(b, t);
        const soft = new THREE.Mesh(
          new THREE.SphereGeometry(0.08 + Math.random() * 0.06, 8, 8),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
            wireframe: i % 2 === 0,
          }),
        );
        soft.position.copy(p);
        group.add(soft);
      }
      scene.add(group);
      obj = group;
      dispose = () => disposeGroup(group);
    } else if (fxStyle.tracerStyle === "ribbon") {
      const mid = a.clone().lerp(b, 0.5);
      mid.y += 0.35 + Math.sin(now * 0.01) * 0.2;
      const mid2 = a.clone().lerp(b, 0.75);
      mid2.y -= 0.25;
      const curve = new THREE.CatmullRomCurve3([a, mid, mid2, b]);
      const pts = curve.getPoints(20);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      obj = line;
      dispose = () => {
        scene.remove(line);
        geo.dispose();
        mat.dispose();
      };
    } else if (fxStyle.tracerStyle === "zigzag") {
      const pts: THREE.Vector3[] = [a.clone()];
      const n = 7;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const p = a.clone().lerp(b, t);
        const side = ((i % 2) * 2 - 1) * 0.35 * (1 - t * 0.5);
        p.x += side;
        p.y += ((i % 2) * 2 - 1) * 0.2;
        pts.push(p);
      }
      pts.push(b.clone());
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      obj = line;
      dispose = () => {
        scene.remove(line);
        geo.dispose();
        mat.dispose();
      };
    } else if (fxStyle.tracerStyle === "thick" || fxStyle.tracerStyle === "beam") {
      const dir = b.clone().sub(a);
      const len = dir.length() || 0.01;
      const radius = fxStyle.tracerStyle === "beam" ? 0.035 : 0.055;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 0.7, len, 6),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
        }),
      );
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.clone().normalize(),
      );
      scene.add(mesh);
      obj = mesh;
      dispose = () => disposeMesh(mesh);
    } else if (fxStyle.tracerStyle === "dots") {
      const group = new THREE.Group();
      const n = weaponId === "gg_bees" ? 12 : 8;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const p = a.clone().lerp(b, t);
        // Bees buzz off the center line
        if (weaponId === "gg_bees") {
          p.x += Math.sin(now * 0.02 + i) * 0.12;
          p.y += Math.cos(now * 0.03 + i * 1.7) * 0.1;
        }
        const soft = new THREE.Mesh(
          new THREE.SphereGeometry(weaponId === "gg_bees" ? 0.05 : 0.04, 6, 6),
          new THREE.MeshBasicMaterial({
            color: tracerColor(fxStyle, weaponId),
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
          }),
        );
        soft.position.copy(p);
        group.add(soft);
      }
      scene.add(group);
      obj = group;
      dispose = () => disposeGroup(group);
    } else if (fxStyle.tracerStyle === "arc") {
      const mid = a.clone().lerp(b, 0.5);
      mid.y += 0.55;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const pts = curve.getPoints(12);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      obj = line;
      dispose = () => {
        scene.remove(line);
        geo.dispose();
        mat.dispose();
      };
    } else {
      const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      obj = line;
      dispose = () => {
        scene.remove(line);
        geo.dispose();
        mat.dispose();
      };
    }

    tracers.push({ obj, dispose, born: now, life });
  }

  function spawnImpact(
    at: Vec3,
    now: number,
    hitPlayer: boolean,
    fxStyle: WeaponFx,
  ): void {
    const scale = fxStyle.impactScale;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry((hitPlayer ? 0.07 : 0.04) * scale, 8, 8),
      new THREE.MeshBasicMaterial({
        color: hitPlayer ? 0xff3333 : fxStyle.muzzle,
        transparent: true,
        opacity: 0.95,
      }),
    );
    mesh.position.set(at.x, at.y, at.z);
    scene.add(mesh);
    impacts.push({ mesh, born: now, life: hitPlayer ? 0.16 : 0.1 });

    const n = Math.round((hitPlayer ? 7 : 4) * scale);
    for (let i = 0; i < n; i++) {
      const spark = new THREE.Mesh(
        new THREE.BoxGeometry(0.03 * scale, 0.03 * scale, 0.03 * scale),
        new THREE.MeshBasicMaterial({
          color: hitPlayer ? 0xff5555 : fxStyle.tracer,
          transparent: true,
          opacity: 1,
        }),
      );
      spark.position.set(at.x, at.y, at.z);
      scene.add(spark);
      sparks.push({
        mesh: spark,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 5 * scale,
          Math.random() * 3.5 * scale,
          (Math.random() - 0.5) * 5 * scale,
        ),
        born: now,
        life: 0.2 + Math.random() * 0.18,
      });
    }
  }

  function spawnExplosion(
    at: Vec3,
    now: number,
    radius: number,
    fxStyle: WeaponFx,
  ): void {
    const r = Math.max(1.5, radius);
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.35, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0xff6622,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    ball.position.set(at.x, at.y, at.z);
    scene.add(ball);
    impacts.push({ mesh: ball, born: now, life: 0.35 });

    const ring = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.55, 16, 16),
      new THREE.MeshBasicMaterial({
        color: fxStyle.muzzle,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        wireframe: true,
      }),
    );
    ring.position.set(at.x, at.y, at.z);
    scene.add(ring);
    impacts.push({ mesh: ring, born: now, life: 0.42 });

    const n = 18;
    for (let i = 0; i < n; i++) {
      const spark = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.08),
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0xffaa33 : 0xff4422,
          transparent: true,
          opacity: 1,
        }),
      );
      spark.position.set(at.x, at.y, at.z);
      scene.add(spark);
      const ang = (i / n) * Math.PI * 2;
      sparks.push({
        mesh: spark,
        vel: new THREE.Vector3(
          Math.cos(ang) * r * 2.2,
          2 + Math.random() * 4,
          Math.sin(ang) * r * 2.2,
        ),
        born: now,
        life: 0.35 + Math.random() * 0.25,
      });
    }
  }

  function localShot(
    end: Vec3,
    now: number,
    weapon?: WeaponDef,
    /** Extra shotgun pellet — skip muzzle flash / kick. */
    secondary = false,
  ): void {
    const fxStyle = weapon ? defaultWeaponFx(weapon) : style;
    const isMelee = fxStyle.shape === "melee" || !!weapon?.meleeCone;
    camera.updateMatrixWorld();
    _muzzleLocal.lerpVectors(hipMuzzle, adsMuzzle, adsBlend);
    _origin.copy(_muzzleLocal).applyMatrix4(camera.matrixWorld);
    _fwd.set(0, 0, -1).transformDirection(camera.matrixWorld);
    const dx = end.x - _origin.x;
    const dy = end.y - _origin.y;
    const dz = end.z - _origin.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.5) _end.copy(_origin).addScaledVector(_fwd, isMelee ? 4 : 40);
    else _end.set(end.x, end.y, end.z);

    spawnTracer(
      _origin.x,
      _origin.y,
      _origin.z,
      _end.x,
      _end.y,
      _end.z,
      now,
      fxStyle,
      weapon?.id,
    );

    const blast = weapon?.explosionRadius;
    if (blast != null && blast > 0) {
      spawnExplosion(
        { x: _end.x, y: _end.y, z: _end.z },
        now,
        blast,
        fxStyle,
      );
    } else {
      spawnImpact(
        { x: _end.x, y: _end.y, z: _end.z },
        now,
        false,
        fxStyle,
      );
    }

    if (secondary) return;

    if (isMelee) {
      swingT = 1;
      kick = 0.08 * fxStyle.kickScale;
      fovKick = 2.8 * fxStyle.fovKickScale;
      muzzleFlash.visible = false;
      muzzleLight.intensity = 0;
      return;
    }

    muzzleUntil = now + 55 + fxStyle.flashScale * 20;
    kick = 0.055 * fxStyle.kickScale * (1 - adsBlend * 0.4);
    fovKick = 2.2 * fxStyle.fovKickScale * (1 - adsBlend * 0.5);
    muzzleFlash.visible = adsBlend < 0.85;
    muzzleFlash.material.rotation = Math.random() * Math.PI;
    flashMat.color.setHex(fxStyle.muzzle);
    muzzleLight.color.setHex(fxStyle.muzzle);
    spinT += 0.8 * fxStyle.kickScale;
  }

  function remoteShot(
    origin: Vec3,
    end: Vec3,
    hitPlayer: boolean,
    now: number,
    weapon?: WeaponDef | null,
  ): void {
    const fxStyle = weapon ? defaultWeaponFx(weapon) : style;
    spawnTracer(
      origin.x,
      origin.y,
      origin.z,
      end.x,
      end.y,
      end.z,
      now,
      fxStyle,
      weapon?.id,
    );
    const blast = weapon?.explosionRadius;
    if (blast != null && blast > 0) {
      spawnExplosion(end, now, blast, fxStyle);
    } else {
      spawnImpact(end, now, hitPlayer, fxStyle);
    }
  }

  function update(
    now: number,
    dt: number,
    alive: boolean,
    moving: boolean,
    opts: {
      ads: boolean;
      adsFov: number;
      hideViewmodel: boolean;
      reloading?: boolean;
      reloadMs?: number;
      /** Shift-sprint active. */
      sprint?: boolean;
      /** Horizontal speed (m/s) for bob cadence. */
      moveSpeed?: number;
      grounded?: boolean;
    },
  ): void {
    adsBlend += ((opts.ads ? 1 : 0) - adsBlend) * Math.min(1, dt * 14);
    sprintBlend +=
      ((opts.sprint && !opts.ads ? 1 : 0) - sprintBlend) * Math.min(1, dt * 5);

    const reloading = !!(opts.reloading && alive);
    if (reloading && !wasReloadingFx) {
      reloadPhase = 0;
      reloadBlend = 0;
    }
    wasReloadingFx = reloading;
    if (reloading) {
      const dur = Math.max(0.25, (opts.reloadMs ?? 2000) / 1000);
      reloadPhase = Math.min(1, reloadPhase + dt / dur);
      // Smooth envelope: dive → work → recover
      const p = reloadPhase;
      const dive = p < 0.22 ? p / 0.22 : 1;
      const recover = p > 0.72 ? 1 - (p - 0.72) / 0.28 : 1;
      reloadBlend = Math.min(dive, recover);
    } else {
      reloadBlend = Math.max(0, reloadBlend - dt * 6);
      if (reloadBlend < 0.01) reloadBlend = 0;
    }

    const spd = Math.max(0, opts.moveSpeed ?? 0);
    const grounded = opts.grounded !== false;
    const loco = moving && grounded && alive && spd > 1.2;
    const sprintMul = 1 + sprintBlend * 0.65;
    const hipBobMul = (1 - adsBlend) * (1 - reloadBlend * 0.7) * sprintMul;
    const cadence = loco ? 7.5 + Math.min(spd, 16) * 0.55 * sprintMul : 2.2;
    bobTime += dt * cadence;

    const bobAmp = loco ? Math.min(1, (spd - 1.2) / 6) : 0;
    const bobX = Math.sin(bobTime) * 0.01 * bobAmp * hipBobMul;
    const bobY =
      Math.abs(Math.sin(bobTime * 2)) * 0.008 * bobAmp * hipBobMul +
      (loco ? 0 : Math.sin(bobTime) * 0.002 * hipBobMul);

    // Subtle camera head-bob (separate from gun sway)
    const headAmp = loco ? 0.018 * bobAmp * (1 - adsBlend * 0.85) * (1 + sprintBlend * 0.35) : 0;
    headBobY = Math.abs(Math.sin(bobTime * 2)) * headAmp;
    headBobRoll = Math.sin(bobTime) * headAmp * 0.55;

    kick = Math.max(0, kick - dt * 0.45);
    fovKick = Math.max(0, fovKick - dt * 8);
    spinT *= Math.max(0, 1 - dt * 4);

    // Reload pose: pull gun down/in, tilt + mag-swap roll
    const rb = reloadBlend;
    const magWiggle =
      reloading && reloadPhase > 0.2 && reloadPhase < 0.75
        ? Math.sin((reloadPhase - 0.2) * Math.PI * 3) * 0.22
        : 0;
    const rack =
      reloading && reloadPhase > 0.55 && reloadPhase < 0.85
        ? Math.sin(((reloadPhase - 0.55) / 0.3) * Math.PI) * 0.12
        : 0;

    // Melee swing: cock back → arc through → settle
    if (swingT > 0) swingT = Math.max(0, swingT - dt * 4.2);
    const st = swingT;
    const swingArc = Math.sin((1 - st) * Math.PI); // peaks mid-swing
    const swingProgress = 1 - st; // 0 → 1
    const isMeleeVm =
      !!viewmodel.userData.melee || style.shape === "melee";
    const slap = activeWeapon?.id === "gg_slap";
    let swingX = 0;
    let swingY = 0;
    let swingZ = 0;
    let swingRx = 0;
    let swingRy = 0;
    let swingRz = 0;
    if (isMeleeVm && st > 0) {
      if (slap) {
        // Forward open-hand slap
        swingZ = -swingArc * 0.45;
        swingY = swingArc * 0.12;
        swingRx = -0.35 - swingArc * 1.1;
        swingRy = -0.2 + swingProgress * 0.4;
      } else {
        // Overhead / baseball swing for hammers & board
        swingX = -0.15 + swingProgress * 0.55;
        swingY = 0.2 - swingArc * 0.35;
        swingZ = -swingArc * 0.25;
        swingRx = -0.9 + swingProgress * 1.6;
        swingRz = -0.8 + swingProgress * 1.7;
        swingRy = swingArc * 0.35;
      }
    }

    const adsX = THREE.MathUtils.lerp(0.22, 0.0, adsBlend) - 0.22;
    const adsY = THREE.MathUtils.lerp(0, 0.08, adsBlend);
    const adsZ = THREE.MathUtils.lerp(0, 0.28, adsBlend);
    viewmodel.position.set(
      bobX + adsX + magWiggle * 0.04 + swingX,
      -kick + bobY + adsY - rb * 0.14 - rack * 0.05 + swingY,
      kick * 0.4 + adsZ + rb * 0.1 + swingZ,
    );
    viewmodel.rotation.x =
      -kick * 1.8 - adsBlend * 0.02 - rb * 0.55 - rack + swingRx;
    viewmodel.rotation.y =
      -adsBlend * 0.04 + spinT * 0.05 + magWiggle * 0.35 + swingRy;
    viewmodel.rotation.z =
      bobX * 2.4 +
      kick * 0.3 * style.kickScale +
      magWiggle * 0.5 -
      rb * 0.15 +
      swingRz;
    viewmodel.visible = alive && !(opts.hideViewmodel && adsBlend > 0.55 && !reloading);

    // Sprint: slight zoom-in (narrow FOV) for a forward rush feel
    const sprintFov = baseFov - 6.5 * sprintBlend;
    const targetFov = THREE.MathUtils.lerp(sprintFov, opts.adsFov, adsBlend);
    camera.fov = targetFov + fovKick;
    camera.updateProjectionMatrix();

    muzzleFlash.position.lerpVectors(hipMuzzle, adsMuzzle, adsBlend);

    const flashOn = now < muzzleUntil && adsBlend < 0.9;
    muzzleLight.intensity = flashOn ? 5 * style.flashScale : 0;
    muzzleFlash.visible = flashOn;
    if (flashOn) {
      const t = 1 - (muzzleUntil - now) / 70;
      muzzleFlash.scale.setScalar((0.22 + t * 0.3) * style.flashScale);
    }

    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i]!;
      const age = (now - t.born) / 1000;
      t.obj.traverse((c) => {
        if (c instanceof THREE.Mesh || c instanceof THREE.Line) {
          const mat = c.material as THREE.Material & { opacity?: number };
          if (mat.opacity != null) {
            mat.opacity = Math.max(0, 1 - age / t.life);
          }
        }
      });
      if (age >= t.life) {
        t.dispose();
        tracers.splice(i, 1);
      }
    }

    for (let i = impacts.length - 1; i >= 0; i--) {
      const imp = impacts[i]!;
      const age = (now - imp.born) / 1000;
      const mat = imp.mesh.material as THREE.MeshBasicMaterial;
      const k = Math.max(0, 1 - age / imp.life);
      mat.opacity = k;
      imp.mesh.scale.setScalar(1 + (1 - k) * 2.5);
      if (age >= imp.life) {
        scene.remove(imp.mesh);
        imp.mesh.geometry.dispose();
        mat.dispose();
        impacts.splice(i, 1);
      }
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]!;
      const age = (now - s.born) / 1000;
      s.vel.y -= 12 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      const mat = s.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 1 - age / s.life);
      if (age >= s.life) {
        scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        mat.dispose();
        sparks.splice(i, 1);
      }
    }
  }

  function getHeadBob(): { y: number; roll: number } {
    return { y: headBobY, roll: headBobRoll };
  }

  return { localShot, remoteShot, update, setWeapon, getHeadBob };
}
