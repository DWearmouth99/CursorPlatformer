import * as THREE from "three";
import {
  defaultWeaponFx,
  resolveAnimProfile,
  resolveFireStyle,
  type Vec3,
  type WeaponAnimProfile,
  type WeaponDef,
  type WeaponFx,
  type WeaponShape,
} from "@fps/shared";
import {
  createGlbViewmodel,
  disposeViewmodel,
  useGlbViewmodels,
} from "./viewmodels";

/**
 * Per-WeaponShape first-person shot animation magnitudes (CHANGE 3).
 * Tunable in one place — values are kick meters / recover rates / FOV degrees.
 */
const SHOT_FAM = {
  pistol: {
    kick: 0.034,
    recover: 16,
    fov: 1.1,
    yaw: 0.018,
    slide: 1,
    slideRecover: 11,
  },
  smg: {
    kick: 0.016,
    recover: 7,
    fov: 0.55,
    rattleAmp: 0.01,
    rattleHz: 62,
  },
  shotgun: {
    kick: 0.058,
    recover: 3.0,
    fov: 2.35,
    pumpRecover: 2.8,
  },
  sniper: {
    kick: 0.068,
    recover: 2.6,
    fov: 3.4,
    boltRecover: 2.4,
  },
  rifle: {
    kick: 0.038,
    recover: 8.5,
    fov: 1.35,
  },
  melee: {
    swingSpeed: 4.6,
    kick: 0.042,
    fov: 1.5,
  },
  cannon: {
    kick: 0.072,
    recover: 2.4,
    fov: 2.9,
    squash: 0.2,
    squashRecover: 5.5,
  },
  weird: {
    kick: 0.064,
    recover: 3.1,
    fov: 2.5,
    squash: 0.26,
    squashRecover: 6.0,
  },
} as const;

type ShotFamily = keyof typeof SHOT_FAM;

function shotFamilyFromShape(shape: WeaponShape): ShotFamily {
  if (shape in SHOT_FAM) return shape as ShotFamily;
  return "rifle";
}

/** Weapon-draw rise duration (seconds). */
const DRAW_SEC = 0.25;
/** Mag drop pool for reload FX. */
const MAG_POOL_SIZE = 8;
const MAG_GRAVITY = 18;
const RELOAD_SLAM_KICK = 0.022;
const RELOAD_SLAM_FOV = 0.55;

/** Persistent world bullet holes (CHANGE 5). */
const DECAL_CAP = 60;
const DECAL_SIZE = 0.14;
/** Muzzle smoke after this many shots in a rapid streak. */
const SMOKE_STREAK_NEED = 4;
const SMOKE_STREAK_GAP_MS = 220;
const SMOKE_POOL_SIZE = 12;
const SHELL_POOL_SIZE = 24;

type Tracer = {
  obj: THREE.Object3D;
  dispose: () => void;
  born: number;
  life: number;
  /** Optional mid-flight update (traveling projectiles). */
  tick?: (age: number, dt: number) => void;
  /** Called once when life ends (before dispose). */
  onEnd?: () => void;
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

function matStd(
  color: number,
  opts: { metalness?: number; roughness?: number; emissive?: number; emissiveIntensity?: number } = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.42,
    metalness: opts.metalness ?? 0.4,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

/** Compact FPS-style framing — never dominates the viewport. */
function finishVm(root: THREE.Group): THREE.Group {
  if (root.userData.meme) root.scale.setScalar(0.95);
  return root;
}

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
  // Smaller arm so it doesn't fight the gun for FOV
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.06, 0.07), skin);
  hand.position.set(hx + 0.01, hy - 0.07, hz + 0.04);
  root.add(hand);
  const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.18), sleeve);
  forearm.position.set(hx + 0.04, hy - 0.12, hz + 0.14);
  forearm.rotation.x = 0.4;
  forearm.rotation.y = -0.28;
  root.add(forearm);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.07, 0.14), sleeve);
  upper.position.set(hx + 0.08, hy - 0.2, hz + 0.24);
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
  const gunMat = matStd(primary, { metalness: 0.45, roughness: 0.4 });
  const accentMat = matStd(accent, { metalness: 0.6, roughness: 0.32 });
  const glowMat = matStd(style.muzzle, {
    metalness: 0.2,
    roughness: 0.25,
    emissive: style.tracer,
    emissiveIntensity: 0.85,
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

  const hx = 0.24;
  const hy = -0.22;
  const hz = -0.45;
  buildBlockyArm(root, hx, hy, hz);
  root.userData.animProfile = resolveAnimProfile(weapon);
  root.userData.idle = weapon.id;
  root.userData.meme = weapon.id.startsWith("gg_");
  // Mild hip offset — readable guns, clear crosshair
  const restById: Record<string, { x: number; y: number; z: number; rx: number; ry: number; rz: number }> = {
    gg_pea: { x: 0.02, y: -0.02, z: 0.02, rx: 0.04, ry: -0.04, rz: 0.03 },
    gg_chicken: { x: 0.02, y: -0.01, z: 0.02, rx: 0.02, ry: 0.04, rz: -0.04 },
    gg_potato: { x: 0.03, y: -0.02, z: 0.01, rx: 0.05, ry: 0, rz: 0.02 },
    gg_confetti: { x: 0.02, y: -0.01, z: 0.02, rx: 0.02, ry: -0.04, rz: 0.03 },
    gg_bees: { x: 0.02, y: -0.02, z: 0.01, rx: 0.03, ry: 0.02, rz: 0 },
    gg_noodle: { x: 0.02, y: -0.01, z: 0.02, rx: 0, ry: 0.03, rz: -0.02 },
    gg_slap: { x: 0.03, y: 0, z: 0.04, rx: 0.05, ry: -0.06, rz: 0.05 },
    gg_bubble: { x: 0.02, y: -0.01, z: 0.02, rx: 0.02, ry: 0, rz: -0.02 },
    gg_disco: { x: 0.02, y: -0.02, z: 0.01, rx: 0.02, ry: 0.04, rz: 0.03 },
    gg_spoon: { x: 0.02, y: -0.02, z: 0.01, rx: 0.04, ry: 0, rz: 0 },
    gg_soaker: { x: 0.02, y: -0.02, z: 0.02, rx: 0, ry: -0.02, rz: 0.02 },
    gg_accordion: { x: 0.02, y: -0.02, z: 0.01, rx: 0.03, ry: 0.03, rz: -0.03 },
    gg_shrink: { x: 0.02, y: -0.01, z: 0.02, rx: 0.02, ry: -0.03, rz: 0 },
    gg_thunder: { x: 0.02, y: -0.02, z: 0.02, rx: 0.04, ry: 0.02, rz: 0.03 },
    gg_flappy: { x: 0.02, y: -0.01, z: 0.02, rx: 0, ry: 0.04, rz: 0 },
    gg_hammer: { x: 0.03, y: -0.02, z: 0.01, rx: -0.05, ry: 0.03, rz: -0.04 },
    gg_pointer: { x: 0.02, y: -0.01, z: 0.02, rx: 0.02, ry: 0, rz: 0 },
    gg_banana_peel: { x: 0.02, y: -0.02, z: 0.02, rx: 0.03, ry: -0.04, rz: 0.02 },
    gg_ban: { x: 0.03, y: -0.02, z: 0.01, rx: -0.05, ry: 0.04, rz: -0.05 },
    gg_golden: { x: 0.02, y: -0.01, z: 0.02, rx: 0.03, ry: 0.02, rz: 0.02 },
  };
  root.userData.rest = restById[weapon.id] ?? { x: 0.02, y: -0.02, z: 0.02, rx: 0.02, ry: 0, rz: 0 };

  // Weird but gun-shaped — grip + receiver + barrel, themed accents
  const grip = () =>
    add(new THREE.BoxGeometry(0.05, 0.11, 0.07), gunMat, hx, hy - 0.06, -0.38);
  const stock = () =>
    add(new THREE.BoxGeometry(0.045, 0.06, 0.12), accentMat, hx, hy - 0.02, -0.28);

  switch (weapon.id) {
    case "gg_slap": {
      add(new THREE.BoxGeometry(0.14, 0.2, 0.06), gunMat, 0.3, hy + 0.05, -0.62);
      add(new THREE.BoxGeometry(0.045, 0.12, 0.04), accentMat, 0.23, hy + 0.12, -0.62);
      add(new THREE.BoxGeometry(0.045, 0.14, 0.04), accentMat, 0.29, hy + 0.13, -0.62);
      add(new THREE.BoxGeometry(0.045, 0.13, 0.04), accentMat, 0.35, hy + 0.12, -0.62);
      add(new THREE.BoxGeometry(0.045, 0.11, 0.04), accentMat, 0.41, hy + 0.08, -0.62);
      add(new THREE.BoxGeometry(0.05, 0.07, 0.05), gunMat, 0.18, hy - 0.04, -0.56);
      add(new THREE.SphereGeometry(0.025, 6, 6), glowMat, 0.3, hy - 0.08, -0.55);
      root.userData.melee = true;
      return finishVm(root);
    }
    case "gg_hammer": {
      const haft = add(
        new THREE.CylinderGeometry(0.03, 0.035, 0.72, 8),
        gunMat,
        hx,
        hy,
        -0.78,
        Math.PI / 2,
        0,
        0,
      );
      root.userData.animParts = { haft };
      add(new THREE.BoxGeometry(0.22, 0.16, 0.26), accentMat, hx, hy, -1.12);
      add(new THREE.BoxGeometry(0.26, 0.05, 0.12), glowMat, hx, hy + 0.09, -1.12);
      add(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 8), gunMat, hx, hy, -0.4, Math.PI / 2, 0, 0);
      root.userData.melee = true;
      return finishVm(root);
    }
    case "gg_ban": {
      add(new THREE.CylinderGeometry(0.028, 0.032, 0.62, 8), gunMat, hx, hy, -0.74, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.26, 0.12, 0.16), accentMat, hx, hy, -1.06);
      add(new THREE.BoxGeometry(0.14, 0.04, 0.18), gunMat, hx, hy + 0.07, -1.06);
      add(new THREE.BoxGeometry(0.09, 0.09, 0.04), glowMat, hx, hy, -1.16);
      add(new THREE.BoxGeometry(0.06, 0.015, 0.015), gunMat, hx, hy, -1.2, 0, 0, 0.7);
      add(new THREE.BoxGeometry(0.06, 0.015, 0.015), gunMat, hx, hy, -1.2, 0, 0, -0.7);
      root.userData.melee = true;
      return finishVm(root);
    }
    case "gg_pea": {
      // Pod SMG — real gun bones + pea accents
      grip();
      stock();
      add(new THREE.BoxGeometry(0.09, 0.08, 0.28), gunMat, hx, hy + 0.02, -0.58);
      add(new THREE.SphereGeometry(0.045, 10, 10), accentMat, hx - 0.04, hy + 0.06, -0.52);
      add(new THREE.SphereGeometry(0.04, 10, 10), accentMat, hx + 0.045, hy + 0.05, -0.56);
      add(new THREE.SphereGeometry(0.035, 8, 8), glowMat, hx, hy + 0.07, -0.66);
      const barrel = add(
        new THREE.CylinderGeometry(0.028, 0.038, 0.28, 10),
        accentMat,
        hx,
        hy + 0.03,
        -0.88,
        Math.PI / 2,
        0,
        0,
      );
      add(new THREE.SphereGeometry(0.022, 6, 6), glowMat, hx, hy + 0.03, -1.04);
      add(new THREE.BoxGeometry(0.04, 0.03, 0.08), gunMat, hx, hy + 0.08, -0.48);
      root.userData.animParts = { barrel };
      return finishVm(root);
    }
    case "gg_chicken": {
      grip();
      add(new THREE.BoxGeometry(0.1, 0.09, 0.22), gunMat, hx, hy + 0.02, -0.56);
      add(new THREE.SphereGeometry(0.08, 12, 12), gunMat, hx, hy + 0.05, -0.5);
      add(new THREE.SphereGeometry(0.05, 10, 10), gunMat, hx, hy + 0.1, -0.44);
      add(new THREE.ConeGeometry(0.045, 0.2, 8), accentMat, hx, hy + 0.04, -0.82, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.055, 0.1, 0.025), accentMat, hx - 0.08, hy + 0.12, -0.48, 0, 0, 0.35);
      add(new THREE.BoxGeometry(0.055, 0.1, 0.025), accentMat, hx + 0.08, hy + 0.12, -0.48, 0, 0, -0.35);
      add(new THREE.SphereGeometry(0.015, 5, 5), glowMat, hx + 0.025, hy + 0.12, -0.42);
      add(new THREE.SphereGeometry(0.015, 5, 5), glowMat, hx - 0.025, hy + 0.12, -0.42);
      add(new THREE.BoxGeometry(0.05, 0.04, 0.1), accentMat, hx, hy + 0.08, -0.62);
      return finishVm(root);
    }
    case "gg_potato": {
      // Cannon silhouette — fat tube, stock, potato chamber
      grip();
      stock();
      add(new THREE.BoxGeometry(0.12, 0.1, 0.22), gunMat, hx, hy + 0.02, -0.54);
      add(new THREE.CylinderGeometry(0.065, 0.078, 0.42, 12), accentMat, hx, hy + 0.03, -0.88, Math.PI / 2, 0, 0);
      add(new THREE.TorusGeometry(0.075, 0.014, 6, 14), glowMat, hx, hy + 0.03, -0.64, Math.PI / 2, 0, 0);
      add(new THREE.TorusGeometry(0.07, 0.012, 6, 12), glowMat, hx, hy + 0.03, -1.06, Math.PI / 2, 0, 0);
      const potato = add(new THREE.SphereGeometry(0.05, 10, 10), gunMat, hx, hy + 0.03, -0.72);
      potato.scale.set(1.3, 0.85, 0.95);
      add(new THREE.BoxGeometry(0.05, 0.07, 0.06), accentMat, hx + 0.07, hy + 0.07, -0.48);
      add(new THREE.BoxGeometry(0.08, 0.04, 0.12), gunMat, hx, hy + 0.09, -0.5);
      root.userData.animParts = { potato };
      return finishVm(root);
    }
    case "gg_noodle": {
      grip();
      stock();
      add(new THREE.BoxGeometry(0.1, 0.085, 0.2), gunMat, hx, hy + 0.02, -0.54);
      add(new THREE.TorusGeometry(0.06, 0.022, 6, 14), gunMat, hx, hy + 0.04, -0.62);
      add(new THREE.TorusGeometry(0.045, 0.016, 5, 12), accentMat, hx + 0.02, hy + 0.06, -0.72);
      add(new THREE.CylinderGeometry(0.035, 0.05, 0.36, 10), accentMat, hx, hy + 0.03, -0.94, Math.PI / 2, 0, 0);
      add(new THREE.SphereGeometry(0.03, 8, 8), glowMat, hx, hy + 0.03, -1.14);
      return finishVm(root);
    }
    case "gg_bubble": {
      grip();
      stock();
      add(new THREE.BoxGeometry(0.09, 0.08, 0.18), gunMat, hx, hy + 0.02, -0.52);
      add(new THREE.SphereGeometry(0.09, 14, 14), gunMat, hx, hy + 0.04, -0.6);
      add(new THREE.SphereGeometry(0.04, 10, 10), accentMat, hx + 0.07, hy + 0.08, -0.66);
      add(new THREE.SphereGeometry(0.03, 8, 8), glowMat, hx - 0.06, hy + 0.08, -0.54);
      add(new THREE.CylinderGeometry(0.032, 0.045, 0.26, 10), accentMat, hx, hy + 0.03, -0.86, Math.PI / 2, 0, 0);
      add(new THREE.TorusGeometry(0.045, 0.012, 6, 12), glowMat, hx, hy + 0.03, -1.0, Math.PI / 2, 0, 0);
      return finishVm(root);
    }
    case "gg_spoon": {
      grip();
      stock();
      const bolt = add(new THREE.BoxGeometry(0.035, 0.025, 0.18), glowMat, hx, hy + 0.06, -0.55);
      root.userData.animParts = { bolt };
      add(new THREE.BoxGeometry(0.07, 0.055, 0.52), gunMat, hx, hy + 0.02, -0.78);
      add(new THREE.SphereGeometry(0.07, 12, 12), accentMat, hx, hy + 0.03, -1.12);
      add(new THREE.SphereGeometry(0.045, 10, 10), accentMat, hx, hy + 0.03, -1.2);
      add(new THREE.CylinderGeometry(0.022, 0.022, 0.08, 6), glowMat, hx, hy + 0.08, -0.5, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.05, 0.04, 0.1), gunMat, hx, hy + 0.08, -0.62);
      return finishVm(root);
    }
    case "gg_soaker": {
      grip();
      stock();
      add(new THREE.BoxGeometry(0.11, 0.12, 0.36), gunMat, hx, hy + 0.02, -0.62);
      add(new THREE.BoxGeometry(0.13, 0.14, 0.14), accentMat, hx, hy - 0.02, -0.42);
      const nozzle = add(
        new THREE.CylinderGeometry(0.035, 0.028, 0.38, 10),
        glowMat,
        hx,
        hy + 0.05,
        -0.98,
        Math.PI / 2,
        0,
        0,
      );
      add(new THREE.BoxGeometry(0.06, 0.07, 0.08), accentMat, hx, hy + 0.1, -0.55);
      add(new THREE.SphereGeometry(0.025, 6, 6), glowMat, hx, hy + 0.05, -1.18);
      root.userData.animParts = { nozzle };
      return finishVm(root);
    }
    case "gg_shrink": {
      grip();
      add(new THREE.BoxGeometry(0.08, 0.09, 0.22), gunMat, hx, hy + 0.02, -0.54);
      const cone = add(new THREE.ConeGeometry(0.07, 0.28, 12), glowMat, hx, hy + 0.02, -0.88, Math.PI / 2, 0, 0);
      add(new THREE.TorusGeometry(0.05, 0.012, 6, 14), accentMat, hx, hy + 0.02, -1.02, Math.PI / 2, 0, 0);
      add(new THREE.TorusGeometry(0.032, 0.008, 6, 12), glowMat, hx, hy + 0.02, -1.1, Math.PI / 2, 0, 0);
      add(new THREE.SphereGeometry(0.02, 6, 6), glowMat, hx, hy + 0.02, -1.16);
      add(new THREE.BoxGeometry(0.05, 0.04, 0.06), accentMat, hx, hy + 0.08, -0.45);
      root.userData.animParts = { cone };
      return finishVm(root);
    }
    case "gg_thunder": {
      grip();
      stock();
      add(new THREE.BoxGeometry(0.09, 0.1, 0.22), gunMat, hx, hy + 0.02, -0.54);
      add(new THREE.BoxGeometry(0.04, 0.16, 0.04), glowMat, hx, hy + 0.08, -0.72, 0, 0, 0.45);
      add(new THREE.BoxGeometry(0.04, 0.14, 0.04), glowMat, hx + 0.04, hy, -0.86, 0, 0, -0.5);
      add(new THREE.BoxGeometry(0.032, 0.1, 0.032), accentMat, hx - 0.035, hy + 0.04, -0.96, 0, 0, 0.25);
      add(new THREE.BoxGeometry(0.03, 0.08, 0.03), glowMat, hx + 0.015, hy + 0.06, -1.06, 0, 0, -0.3);
      add(new THREE.SphereGeometry(0.028, 8, 8), glowMat, hx, hy + 0.02, -1.12);
      return finishVm(root);
    }
    case "gg_pointer": {
      grip();
      add(new THREE.BoxGeometry(0.06, 0.07, 0.26), gunMat, hx, hy + 0.01, -0.58);
      add(new THREE.CylinderGeometry(0.014, 0.014, 0.42, 8), glowMat, hx, hy + 0.02, -0.96, Math.PI / 2, 0, 0);
      add(new THREE.SphereGeometry(0.025, 8, 8), glowMat, hx, hy + 0.02, -1.2);
      add(new THREE.ConeGeometry(0.03, 0.06, 6), accentMat, hx, hy + 0.02, -1.26, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.06, 0.035, 0.06), accentMat, hx, hy + 0.06, -0.45);
      add(new THREE.BoxGeometry(0.04, 0.03, 0.08), gunMat, hx, hy + 0.07, -0.62);
      return finishVm(root);
    }
    case "gg_golden": {
      const glow = matStd(0xffe566, {
        metalness: 0.85,
        roughness: 0.18,
        emissive: 0xffd700,
        emissiveIntensity: 1.0,
      });
      grip();
      add(new THREE.BoxGeometry(0.08, 0.08, 0.18), gunMat, hx, hy + 0.02, -0.52);
      add(new THREE.SphereGeometry(0.085, 14, 14), glow, hx, hy + 0.04, -0.58);
      add(new THREE.CylinderGeometry(0.025, 0.04, 0.22, 8), accentMat, hx, hy + 0.08, -0.8, 0.45, 0, 0);
      add(new THREE.TorusGeometry(0.06, 0.014, 6, 14), glow, hx, hy + 0.04, -0.52, 0.35, 0, 0);
      add(new THREE.BoxGeometry(0.04, 0.04, 0.04), glow, hx + 0.07, hy + 0.08, -0.55);
      return finishVm(root);
    }
    case "gg_banana_peel": {
      grip();
      stock();
      add(new THREE.BoxGeometry(0.1, 0.09, 0.28), gunMat, hx, hy + 0.02, -0.6);
      add(new THREE.BoxGeometry(0.055, 0.045, 0.22), accentMat, hx, hy + 0.07, -0.88);
      add(new THREE.SphereGeometry(0.055, 10, 10), accentMat, hx, hy + 0.01, -1.04);
      add(new THREE.BoxGeometry(0.035, 0.08, 0.035), gunMat, hx - 0.06, hy + 0.05, -0.72, 0, 0, 0.4);
      add(new THREE.BoxGeometry(0.035, 0.08, 0.035), gunMat, hx + 0.06, hy + 0.05, -0.72, 0, 0, -0.4);
      add(new THREE.BoxGeometry(0.035, 0.07, 0.035), gunMat, hx, hy + 0.09, -0.78);
      return finishVm(root);
    }
    case "gg_bees": {
      grip();
      stock();
      add(new THREE.BoxGeometry(0.13, 0.12, 0.28), gunMat, hx, hy + 0.02, -0.58);
      add(new THREE.BoxGeometry(0.14, 0.035, 0.14), accentMat, hx, hy + 0.09, -0.58);
      add(new THREE.BoxGeometry(0.14, 0.035, 0.14), accentMat, hx, hy - 0.05, -0.58);
      add(new THREE.BoxGeometry(0.14, 0.035, 0.08), accentMat, hx, hy + 0.02, -0.44);
      const pump = add(
        new THREE.CylinderGeometry(0.045, 0.055, 0.3, 10),
        accentMat,
        hx,
        hy + 0.02,
        -0.9,
        Math.PI / 2,
        0,
        0,
      );
      add(new THREE.SphereGeometry(0.022, 6, 6), glowMat, hx + 0.06, hy + 0.07, -0.5);
      add(new THREE.SphereGeometry(0.018, 5, 5), glowMat, hx - 0.06, hy - 0.02, -0.55);
      root.userData.animParts = { pump };
      return finishVm(root);
    }
    case "gg_confetti": {
      grip();
      stock();
      add(new THREE.BoxGeometry(0.09, 0.1, 0.34), gunMat, hx, hy + 0.02, -0.62);
      add(new THREE.BoxGeometry(0.11, 0.04, 0.11), accentMat, hx, hy + 0.09, -0.72);
      add(new THREE.BoxGeometry(0.04, 0.04, 0.26), glowMat, hx, hy + 0.03, -0.92);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.03), glowMat, hx + 0.055, hy + 0.07, -0.82);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.03), accentMat, hx - 0.05, hy + 0.04, -0.9);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.03), glowMat, hx + 0.02, hy + 0.1, -0.95);
      add(new THREE.BoxGeometry(0.05, 0.04, 0.08), gunMat, hx, hy + 0.09, -0.5);
      return finishVm(root);
    }
    case "gg_disco": {
      grip();
      stock();
      add(new THREE.BoxGeometry(0.11, 0.1, 0.32), gunMat, hx, hy + 0.02, -0.6);
      const ball = add(new THREE.SphereGeometry(0.065, 12, 12), glowMat, hx, hy + 0.1, -0.48);
      root.userData.animParts = { ball };
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8), accentMat, hx - 0.04, hy + 0.02, -0.94, Math.PI / 2, 0, 0);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8), gunMat, hx + 0.04, hy + 0.02, -0.94, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.055, 0.04, 0.08), accentMat, hx, hy + 0.08, -0.55);
      return finishVm(root);
    }
    case "gg_accordion": {
      grip();
      add(new THREE.BoxGeometry(0.16, 0.11, 0.14), gunMat, hx, hy + 0.02, -0.5);
      const bellows = add(new THREE.BoxGeometry(0.14, 0.09, 0.12), accentMat, hx, hy + 0.02, -0.68);
      add(new THREE.BoxGeometry(0.16, 0.11, 0.12), gunMat, hx, hy + 0.02, -0.86);
      add(new THREE.BoxGeometry(0.06, 0.06, 0.18), glowMat, hx, hy + 0.03, -1.04);
      add(new THREE.BoxGeometry(0.04, 0.12, 0.03), accentMat, hx - 0.09, hy + 0.02, -0.68);
      add(new THREE.BoxGeometry(0.04, 0.12, 0.03), accentMat, hx + 0.09, hy + 0.02, -0.68);
      root.userData.animParts = { bellows };
      return finishVm(root);
    }
    case "gg_flappy": {
      grip();
      stock();
      add(new THREE.BoxGeometry(0.09, 0.09, 0.24), gunMat, hx, hy + 0.02, -0.56);
      const wing = add(new THREE.BoxGeometry(0.24, 0.03, 0.1), accentMat, hx, hy + 0.08, -0.68);
      add(new THREE.BoxGeometry(0.22, 0.025, 0.07), glowMat, hx, hy - 0.01, -0.7);
      add(new THREE.BoxGeometry(0.04, 0.04, 0.22), glowMat, hx, hy + 0.02, -0.88);
      add(new THREE.SphereGeometry(0.04, 8, 8), gunMat, hx, hy + 0.05, -0.42);
      add(new THREE.ConeGeometry(0.028, 0.055, 6), accentMat, hx + 0.03, hy + 0.05, -0.36, Math.PI / 2, 0, 0);
      root.userData.animParts = { wing };
      return finishVm(root);
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

  // Shape fallbacks when GLBs missing — distinct silhouettes per class
  switch (shape) {
    case "smg": {
      add(new THREE.BoxGeometry(0.1, 0.12, 0.42), gunMat, 0.22, -0.21, -0.54);
      add(new THREE.BoxGeometry(0.045, 0.045, 0.32), accentMat, 0.22, -0.16, -0.86);
      add(new THREE.BoxGeometry(0.055, 0.18, 0.08), accentMat, 0.22, -0.36, -0.48);
      add(new THREE.BoxGeometry(0.08, 0.09, 0.14), gunMat, 0.22, -0.26, -0.28);
      add(new THREE.BoxGeometry(0.06, 0.04, 0.1), glowMat, 0.22, -0.12, -0.4);
      break;
    }
    case "shotgun": {
      add(new THREE.BoxGeometry(0.13, 0.15, 0.52), gunMat, 0.22, -0.22, -0.56);
      const pump = add(
        new THREE.BoxGeometry(0.1, 0.08, 0.16),
        accentMat,
        0.22,
        -0.2,
        -0.78,
      );
      add(new THREE.CylinderGeometry(0.032, 0.032, 0.55, 8), accentMat, 0.17, -0.16, -0.95, Math.PI / 2, 0, 0);
      add(new THREE.CylinderGeometry(0.032, 0.032, 0.55, 8), accentMat, 0.27, -0.16, -0.95, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.09, 0.13, 0.2), gunMat, 0.22, -0.3, -0.26);
      root.userData.animParts = { pump };
      break;
    }
    case "sniper": {
      add(new THREE.BoxGeometry(0.11, 0.11, 0.68), gunMat, 0.22, -0.2, -0.62);
      const bolt = add(new THREE.BoxGeometry(0.04, 0.03, 0.2), glowMat, 0.22, -0.12, -0.5);
      add(new THREE.CylinderGeometry(0.024, 0.024, 0.78, 8), accentMat, 0.22, -0.15, -1.12, Math.PI / 2, 0, 0);
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 10), accentMat, 0.22, -0.05, -0.52, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.09, 0.15, 0.24), gunMat, 0.22, -0.32, -0.24);
      root.userData.animParts = { bolt };
      break;
    }
    case "pistol": {
      add(new THREE.BoxGeometry(0.09, 0.13, 0.26), gunMat, 0.22, -0.18, -0.48);
      add(new THREE.BoxGeometry(0.045, 0.045, 0.22), accentMat, 0.22, -0.14, -0.72);
      add(new THREE.BoxGeometry(0.065, 0.16, 0.09), accentMat, 0.22, -0.32, -0.4);
      add(new THREE.BoxGeometry(0.04, 0.03, 0.06), glowMat, 0.22, -0.1, -0.58);
      break;
    }
    case "cannon": {
      add(new THREE.CylinderGeometry(0.09, 0.12, 0.62, 12), gunMat, 0.22, -0.18, -0.74, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.16, 0.18, 0.24), accentMat, 0.22, -0.3, -0.34);
      add(new THREE.BoxGeometry(0.11, 0.09, 0.14), gunMat, 0.22, -0.16, -0.4);
      add(new THREE.TorusGeometry(0.1, 0.02, 6, 14), glowMat, 0.22, -0.18, -0.48, Math.PI / 2, 0, 0);
      break;
    }
    case "weird": {
      add(new THREE.SphereGeometry(0.1, 12, 12), gunMat, 0.22, -0.18, -0.54);
      add(new THREE.ConeGeometry(0.07, 0.4, 10), accentMat, 0.22, -0.16, -0.9, Math.PI / 2, 0, 0);
      add(new THREE.TorusGeometry(0.09, 0.022, 6, 14), glowMat, 0.22, -0.12, -0.54);
      break;
    }
    default: {
      add(new THREE.BoxGeometry(0.12, 0.14, 0.56), gunMat, 0.22, -0.2, -0.56);
      add(new THREE.BoxGeometry(0.05, 0.05, 0.46), accentMat, 0.22, -0.15, -0.96);
      add(new THREE.BoxGeometry(0.1, 0.12, 0.22), gunMat, 0.22, -0.26, -0.28);
      add(new THREE.BoxGeometry(0.065, 0.16, 0.09), accentMat, 0.22, -0.34, -0.52);
      add(new THREE.BoxGeometry(0.06, 0.04, 0.1), glowMat, 0.22, -0.1, -0.42);
      break;
    }
  }
  return root;
}

/**
 * Tracers, impacts, muzzle flash, per-weapon viewmodels + FOV punch.
 */
export function createEffects(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  hooks?: {
    onExplosion?: (at: { x: number; y: number; z: number }) => void;
    onMuzzleFlash?: () => void;
  },
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
  let kickYaw = 0;
  let kickRoll = 0;
  let fovKick = 0;
  let bobTime = 0;
  let adsBlend = 0;
  let sprintBlend = 0;
  let spinT = 0;
  /** 1 → 0 melee / special swing progress. */
  let swingT = 0;
  let pumpT = 0;
  let boltT = 0;
  let slideT = 0;
  let squashT = 0;
  let smgRattle = 0;
  let shotAnimProfile: WeaponAnimProfile = "kick";
  let shotFamily: ShotFamily = "rifle";
  /** 0..1 reload progress while reloading. */
  let reloadBlend = 0;
  let wasReloadingFx = false;
  let reloadPhase = 0;
  let magDropped = false;
  let slamDone = false;
  let drawT = 0;
  /** Camera head-bob offsets applied by caller after positioning eye. */
  let headBobY = 0;
  let headBobRoll = 0;

  const _muzzleLocal = new THREE.Vector3(0.22, -0.16, -1.05);
  const _origin = new THREE.Vector3();
  const _end = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _magRight = new THREE.Vector3();
  const _magUp = new THREE.Vector3();
  const _decalN = new THREE.Vector3();
  const _decalUp = new THREE.Vector3(0, 1, 0);
  const _shellRight = new THREE.Vector3();
  const _shellUp = new THREE.Vector3();
  const hipMuzzle = new THREE.Vector3(0.22, -0.16, -1.05);
  const adsMuzzle = new THREE.Vector3(0.02, -0.08, -0.7);

  type MagDrop = {
    mesh: THREE.Mesh;
    vel: THREE.Vector3;
    active: boolean;
    born: number;
    life: number;
  };
  const magPool: MagDrop[] = [];
  {
    const magGeo = new THREE.BoxGeometry(0.04, 0.09, 0.055);
    for (let i = 0; i < MAG_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(
        magGeo,
        new THREE.MeshStandardMaterial({
          color: 0x2a2a2e,
          roughness: 0.55,
          metalness: 0.35,
        }),
      );
      mesh.visible = false;
      mesh.castShadow = false;
      scene.add(mesh);
      magPool.push({
        mesh,
        vel: new THREE.Vector3(),
        active: false,
        born: 0,
        life: 0.9,
      });
    }
  }

  function cancelReloadFx(): void {
    reloadBlend = 0;
    reloadPhase = 0;
    wasReloadingFx = false;
    magDropped = false;
    slamDone = false;
  }

  function spawnMagDrop(now: number): void {
    let slot: MagDrop | null = null;
    for (const m of magPool) {
      if (!m.active) {
        slot = m;
        break;
      }
    }
    if (!slot) {
      slot = magPool[0]!;
    }
    camera.updateMatrixWorld();
    _muzzleLocal.lerpVectors(hipMuzzle, adsMuzzle, adsBlend);
    _origin.copy(_muzzleLocal).applyMatrix4(camera.matrixWorld);
    _magRight.set(1, 0, 0).transformDirection(camera.matrixWorld);
    _magUp.set(0, 1, 0).transformDirection(camera.matrixWorld);
    slot.mesh.position
      .copy(_origin)
      .addScaledVector(_magRight, 0.08)
      .addScaledVector(_magUp, -0.06);
    slot.vel
      .copy(_magRight)
      .multiplyScalar(0.6 + Math.random() * 0.5)
      .addScaledVector(_magUp, -0.4)
      .addScaledVector(
        _fwd.set(0, 0, -1).transformDirection(camera.matrixWorld),
        -0.3,
      );
    slot.active = true;
    slot.born = now;
    slot.life = 0.85;
    slot.mesh.visible = true;
    slot.mesh.rotation.set(
      Math.random() * 1.2,
      Math.random() * 2,
      Math.random() * 1.2,
    );
  }

  function tickMagDrops(now: number, dt: number): void {
    for (const m of magPool) {
      if (!m.active) continue;
      const age = (now - m.born) / 1000;
      if (age >= m.life || m.mesh.position.y < -0.5) {
        m.active = false;
        m.mesh.visible = false;
        continue;
      }
      m.vel.y -= MAG_GRAVITY * dt;
      m.mesh.position.x += m.vel.x * dt;
      m.mesh.position.y += m.vel.y * dt;
      m.mesh.position.z += m.vel.z * dt;
      m.mesh.rotation.x += dt * 4;
      m.mesh.rotation.z += dt * 3;
      if (m.mesh.position.y < 0.05 && m.vel.y < 0) {
        m.mesh.position.y = 0.05;
        m.vel.y *= -0.25;
        m.vel.x *= 0.6;
        m.vel.z *= 0.6;
      }
      const mat = m.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = Math.max(0, 1 - age / m.life);
      mat.transparent = true;
    }
  }

  // ——— Bullet-hole decals (pooled) ———
  type DecalSlot = { mesh: THREE.Mesh; born: number; used: boolean };
  const decalPool: DecalSlot[] = [];
  let decalCursor = 0;
  {
    const geo = new THREE.PlaneGeometry(DECAL_SIZE, DECAL_SIZE);
    for (let i = 0; i < DECAL_CAP; i++) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: 0x1a120c,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          side: THREE.DoubleSide,
        }),
      );
      mesh.visible = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
      decalPool.push({ mesh, born: 0, used: false });
    }
  }

  function placeDecal(at: Vec3, shotDirX: number, shotDirY: number, shotDirZ: number, now: number): void {
    const slot = decalPool[decalCursor]!;
    decalCursor = (decalCursor + 1) % DECAL_CAP;
    _decalN.set(-shotDirX, -shotDirY, -shotDirZ);
    if (_decalN.lengthSq() < 1e-6) _decalN.set(0, 1, 0);
    else _decalN.normalize();
    // Bias toward upward so floors get readable holes when grazing
    if (Math.abs(_decalN.y) < 0.25) _decalN.y += 0.4;
    _decalN.normalize();
    slot.mesh.quaternion.setFromUnitVectors(_decalUp, _decalN);
    slot.mesh.position.set(
      at.x + _decalN.x * 0.015,
      at.y + _decalN.y * 0.015,
      at.z + _decalN.z * 0.015,
    );
    slot.mesh.visible = true;
    slot.used = true;
    slot.born = now;
    const mat = slot.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.75;
  }

  // ——— Muzzle smoke ———
  type SmokeSlot = {
    spr: THREE.Sprite;
    active: boolean;
    born: number;
    life: number;
    vel: THREE.Vector3;
  };
  const smokePool: SmokeSlot[] = [];
  let burstStreak = 0;
  let lastBurstShotAt = 0;
  {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
    g.addColorStop(0, "rgba(200,200,200,0.55)");
    g.addColorStop(1, "rgba(160,160,160,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    for (let i = 0; i < SMOKE_POOL_SIZE; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        opacity: 0.35,
      });
      const spr = new THREE.Sprite(mat);
      spr.visible = false;
      spr.scale.set(0.2, 0.2, 1);
      scene.add(spr);
      smokePool.push({
        spr,
        active: false,
        born: 0,
        life: 0.55,
        vel: new THREE.Vector3(),
      });
    }
  }

  function spawnMuzzleSmoke(now: number): void {
    let slot: SmokeSlot | null = null;
    for (const s of smokePool) {
      if (!s.active) {
        slot = s;
        break;
      }
    }
    if (!slot) slot = smokePool[0]!;
    camera.updateMatrixWorld();
    _muzzleLocal.lerpVectors(hipMuzzle, adsMuzzle, adsBlend);
    _origin.copy(_muzzleLocal).applyMatrix4(camera.matrixWorld);
    _fwd.set(0, 0, -1).transformDirection(camera.matrixWorld);
    slot.spr.position.copy(_origin).addScaledVector(_fwd, 0.12);
    slot.vel.copy(_fwd).multiplyScalar(0.35);
    slot.vel.y += 0.45;
    slot.active = true;
    slot.born = now;
    slot.life = 0.5 + Math.random() * 0.25;
    slot.spr.visible = true;
    slot.spr.scale.setScalar(0.18);
    (slot.spr.material as THREE.SpriteMaterial).opacity = 0.4;
  }

  function tickSmoke(now: number, dt: number): void {
    for (const s of smokePool) {
      if (!s.active) continue;
      const age = (now - s.born) / 1000;
      if (age >= s.life) {
        s.active = false;
        s.spr.visible = false;
        continue;
      }
      s.spr.position.x += s.vel.x * dt;
      s.spr.position.y += s.vel.y * dt;
      s.spr.position.z += s.vel.z * dt;
      s.vel.y += 0.4 * dt;
      const t = age / s.life;
      s.spr.scale.setScalar(0.18 + t * 0.55);
      (s.spr.material as THREE.SpriteMaterial).opacity = 0.4 * (1 - t);
    }
  }

  // ——— Shell casings (pooled, per-family) ———
  type ShellSlot = {
    mesh: THREE.Mesh;
    vel: THREE.Vector3;
    active: boolean;
    born: number;
    life: number;
  };
  const shellPool: ShellSlot[] = [];
  {
    const geo = new THREE.CylinderGeometry(0.012, 0.012, 0.04, 5);
    for (let i = 0; i < SHELL_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: 0xe8c76a }),
      );
      mesh.visible = false;
      scene.add(mesh);
      shellPool.push({
        mesh,
        vel: new THREE.Vector3(),
        active: false,
        born: 0,
        life: 0.4,
      });
    }
  }

  function shouldEjectShell(weapon?: WeaponDef | null): boolean {
    if (!weapon) return false;
    if (!weapon.shellEject) return false;
    const shape = defaultWeaponFx(weapon).shape;
    if (shape === "melee") return false;
    if (weapon.id.startsWith("gg_")) return false;
    // Energy / beam-ish
    if (
      weapon.id === "gg_pointer" ||
      weapon.id === "gg_shrink" ||
      weapon.id === "gg_thunder" ||
      weapon.id === "gg_bubble"
    ) {
      return false;
    }
    return true;
  }

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
    cancelReloadFx();
    drawT = 1;

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
      glb.userData.animProfile = resolveAnimProfile(weapon);
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
      const meme = !!weaponId?.startsWith("gg_");
      const r =
        weaponId === "gg_pea" ? 0.1 : weaponId === "gg_banana_peel" ? 0.16 : meme ? 0.18 : 0.12;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 10, 10),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.98,
          depthWrite: false,
        }),
      );
      // Place "projectile" partway along the path for a chunky look
      mesh.position.copy(a).lerp(b, 0.45);
      mesh.scale.set(1.2, 0.85, 1.35);
      scene.add(mesh);
      obj = mesh;
      dispose = () => disposeMesh(mesh);
      // Also a short stub trail
      const stub = new THREE.Mesh(
        new THREE.CylinderGeometry(
          meme ? 0.055 : 0.03,
          meme ? 0.09 : 0.05,
          Math.min(len * 0.35, meme ? 2.2 : 1.2),
          6,
        ),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.65,
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
      const n = 7;
      for (let i = 0; i < n; i++) {
        const t = 0.1 + (i / (n - 1)) * 0.8;
        const p = a.clone().lerp(b, t);
        const soft = new THREE.Mesh(
          new THREE.SphereGeometry(0.12 + Math.random() * 0.1, 10, 10),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            wireframe: i % 2 === 0,
          }),
        );
        soft.position.copy(p);
        soft.position.x += (Math.random() - 0.5) * 0.15;
        soft.position.y += (Math.random() - 0.5) * 0.12;
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
      const meme = !!weaponId?.startsWith("gg_");
      const radius =
        (fxStyle.tracerStyle === "beam" ? 0.035 : 0.055) * (meme ? 1.85 : 1);
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 0.7, len, 8),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.95,
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
      const n = weaponId === "gg_bees" ? 16 : weaponId === "gg_confetti" ? 14 : 10;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const p = a.clone().lerp(b, t);
        // Bees / confetti buzz off the center line
        if (weaponId === "gg_bees" || weaponId === "gg_confetti" || weaponId === "gg_disco") {
          p.x += Math.sin(now * 0.02 + i * 1.3) * 0.22;
          p.y += Math.cos(now * 0.03 + i * 1.7) * 0.18;
        }
        const soft = new THREE.Mesh(
          weaponId === "gg_confetti"
            ? new THREE.BoxGeometry(0.08, 0.04, 0.08)
            : new THREE.SphereGeometry(weaponId === "gg_bees" ? 0.07 : 0.055, 6, 6),
          new THREE.MeshBasicMaterial({
            color: tracerColor(fxStyle, weaponId),
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
          }),
        );
        soft.position.copy(p);
        if (weaponId === "gg_confetti") soft.rotation.set(Math.random(), Math.random(), Math.random());
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
    } else if (weaponId?.startsWith("gg_")) {
      // Meme fallback: fat cylinder streak (webgl ignores Line linewidth)
      const dir = b.clone().sub(a);
      const len = dir.length() || 0.01;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.028, len, 6),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.95,
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
    shotDir?: { x: number; y: number; z: number },
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

    if (!hitPlayer && shotDir) {
      placeDecal(at, shotDir.x, shotDir.y, shotDir.z, now);
    }

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

    hooks?.onExplosion?.(at);

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

  /** Splash / rocket / noodle — client travel presentation (server stays hitscan). */
  function wantsTravelProjectile(weapon?: WeaponDef | null): boolean {
    if (!weapon) return false;
    const style = resolveFireStyle(weapon);
    return (
      style === "splash" ||
      style === "rocket" ||
      weapon.id === "gg_noodle"
    );
  }

  function spawnTravelProjectile(
    ox: number,
    oy: number,
    oz: number,
    ex: number,
    ey: number,
    ez: number,
    now: number,
    fxStyle: WeaponFx,
    weapon: WeaponDef,
    hitPlayer: boolean,
  ): void {
    const dist = Math.hypot(ex - ox, ey - oy, ez - oz);
    const life = Math.min(
      0.55,
      (resolveFireStyle(weapon) === "rocket" ? 0.22 : 0.18) + dist * 0.01,
    );
    const isZig = fxStyle.tracerStyle === "zigzag" || weapon.id === "gg_thunder";
    const isRocket = resolveFireStyle(weapon) === "rocket";
    const id = weapon.id;
    let geo: THREE.BufferGeometry;
    if (id === "gg_potato") geo = new THREE.SphereGeometry(0.18, 10, 10);
    else if (id === "gg_noodle") geo = new THREE.TorusGeometry(0.1, 0.04, 6, 12);
    else if (id === "gg_thunder") geo = new THREE.OctahedronGeometry(0.16, 0);
    else if (isZig) geo = new THREE.OctahedronGeometry(0.14, 0);
    else if (isRocket) geo = new THREE.CylinderGeometry(0.07, 0.12, 0.42, 8);
    else geo = new THREE.SphereGeometry(0.14, 10, 10);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: fxStyle.tracer,
        transparent: true,
        opacity: 0.98,
        depthWrite: false,
      }),
    );
    if (id === "gg_potato") mesh.scale.set(1.4, 0.9, 1.1);
    if (isRocket || id === "gg_potato") {
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(ex - ox, ey - oy, ez - oz).normalize(),
      );
    }
    mesh.position.set(ox, oy, oz);
    scene.add(mesh);
    // Bright trail ribbon behind the projectile
    const trailPts = [new THREE.Vector3(ox, oy, oz), new THREE.Vector3(ox, oy, oz)];
    const trailGeo = new THREE.BufferGeometry().setFromPoints(trailPts);
    const trailMat = new THREE.LineBasicMaterial({
      color: fxStyle.muzzle,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const trail = new THREE.Line(trailGeo, trailMat);
    scene.add(trail);
    const from = new THREE.Vector3(ox, oy, oz);
    const to = new THREE.Vector3(ex, ey, ez);
    const blast = weapon.explosionRadius ?? 0;
    tracers.push({
      obj: mesh,
      born: now,
      life,
      tick: (age) => {
        const t = Math.min(1, age / life);
        const ease = t * t * (3 - 2 * t);
        mesh.position.lerpVectors(from, to, ease);
        if (isZig) {
          mesh.position.y += Math.sin(t * Math.PI * 8) * 0.22;
          mesh.position.x += Math.cos(t * Math.PI * 6) * 0.1;
          mesh.rotation.x += 0.35;
          mesh.rotation.z += 0.28;
        } else {
          mesh.rotation.y += 0.35;
          mesh.rotation.x += 0.12;
        }
        trailPts[0]!.copy(from).lerp(to, Math.max(0, ease - 0.18));
        trailPts[1]!.copy(mesh.position);
        trailGeo.setFromPoints(trailPts);
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.98;
        trailMat.opacity = 0.85 * (1 - t * 0.3);
      },
      onEnd: () => {
        scene.remove(trail);
        trailGeo.dispose();
        trailMat.dispose();
        if (blast > 0) {
          spawnExplosion({ x: ex, y: ey, z: ez }, performance.now(), blast, fxStyle);
        } else {
          spawnImpact({ x: ex, y: ey, z: ez }, performance.now(), hitPlayer, fxStyle);
        }
      },
      dispose: () => {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        scene.remove(trail);
        trailGeo.dispose();
        trailMat.dispose();
      },
    });
  }

  function ejectShell(now: number, weapon?: WeaponDef | null): void {
    if (!shouldEjectShell(weapon)) return;
    const shape = weapon ? defaultWeaponFx(weapon).shape : "rifle";
    let slot: ShellSlot | null = null;
    for (const s of shellPool) {
      if (!s.active) {
        slot = s;
        break;
      }
    }
    if (!slot) slot = shellPool[0]!;

    camera.updateMatrixWorld();
    _muzzleLocal.lerpVectors(hipMuzzle, adsMuzzle, adsBlend);
    _origin.copy(_muzzleLocal).applyMatrix4(camera.matrixWorld);
    _shellRight.set(1, 0, 0).transformDirection(camera.matrixWorld);
    _shellUp.set(0, 1, 0).transformDirection(camera.matrixWorld);
    _fwd.set(0, 0, -1).transformDirection(camera.matrixWorld);

    const mat = slot.mesh.material as THREE.MeshBasicMaterial;
    let sx = 1;
    let sy = 1;
    let sz = 1;
    if (shape === "shotgun") {
      mat.color.setHex(0xc62828);
      sx = 1.35;
      sy = 1.6;
      sz = 1.35;
    } else if (shape === "sniper") {
      mat.color.setHex(0xd4a84b);
      sx = 1.25;
      sy = 2.1;
      sz = 1.25;
    } else {
      mat.color.setHex(0xe8c76a);
    }
    slot.mesh.scale.set(sx, sy, sz);
    slot.mesh.position
      .copy(_origin)
      .addScaledVector(_shellRight, 0.08)
      .addScaledVector(_shellUp, 0.02);
    slot.vel
      .copy(_shellRight)
      .multiplyScalar(2.2 + Math.random())
      .addScaledVector(_shellUp, 1.6 + Math.random())
      .addScaledVector(_fwd, -0.4);
    slot.active = true;
    slot.born = now;
    slot.life = shape === "sniper" ? 0.55 : 0.38;
    slot.mesh.visible = true;
  }

  function tickShells(now: number, dt: number): void {
    for (const s of shellPool) {
      if (!s.active) continue;
      const age = (now - s.born) / 1000;
      if (age >= s.life) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.vel.y -= 14 * dt;
      s.mesh.position.x += s.vel.x * dt;
      s.mesh.position.y += s.vel.y * dt;
      s.mesh.position.z += s.vel.z * dt;
      s.mesh.rotation.x += dt * 10;
      s.mesh.rotation.z += dt * 7;
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

    const travel = wantsTravelProjectile(weapon);
    if (travel && weapon) {
      spawnTravelProjectile(
        _origin.x,
        _origin.y,
        _origin.z,
        _end.x,
        _end.y,
        _end.z,
        now,
        fxStyle,
        weapon,
        false,
      );
    } else {
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
          {
            x: _end.x - _origin.x,
            y: _end.y - _origin.y,
            z: _end.z - _origin.z,
          },
        );
      }
    }

    if (secondary) return;

    shotAnimProfile = weapon ? resolveAnimProfile(weapon) : "kick";
    shotFamily = shotFamilyFromShape(fxStyle.shape);
    const fam = SHOT_FAM[shotFamily];
    const adsSoft = 1 - adsBlend * 0.4;

    kickYaw =
      Math.min(weapon?.vmKickYaw ?? 0, 0.7) *
      (("yaw" in fam ? fam.yaw : 0.012) as number) *
      (Math.random() > 0.5 ? 1 : -1);
    kickRoll = Math.min(weapon?.vmKickRoll ?? 0, 0.8) * 0.03;

    if (shotFamily === "melee" || isMelee) {
      swingT = 1;
      kick = Math.min(0.06, SHOT_FAM.melee.kick * Math.min(fxStyle.kickScale, 1.5));
      fovKick = Math.min(2.4, SHOT_FAM.melee.fov * Math.min(fxStyle.fovKickScale, 1.4));
      muzzleFlash.visible = false;
      muzzleLight.intensity = 0;
      return;
    }

    if (shotFamily === "shotgun") pumpT = 1;
    if (shotFamily === "sniper") boltT = 1;
    if (shotFamily === "pistol" && "slide" in fam) slideT = fam.slide;
    if (shotFamily === "cannon" || shotFamily === "weird") {
      squashT = "squash" in fam ? fam.squash : 0.2;
      swingT = 1;
    }
    if (shotFamily === "smg") smgRattle = 1;
    if (shotAnimProfile === "spin" || shotAnimProfile === "toss") swingT = 1;
    ejectShell(now, weapon);
    if (now - lastBurstShotAt < SMOKE_STREAK_GAP_MS) burstStreak += 1;
    else burstStreak = 1;
    lastBurstShotAt = now;
    if (burstStreak >= SMOKE_STREAK_NEED) spawnMuzzleSmoke(now);

    muzzleUntil = now + 55 + fxStyle.flashScale * 20;
    const kScale = Math.min(fxStyle.kickScale, 1.55);
    const baseKick = "kick" in fam ? fam.kick : SHOT_FAM.rifle.kick;
    kick = Math.min(0.078, baseKick * kScale * adsSoft);
    const baseFov = "fov" in fam ? fam.fov : SHOT_FAM.rifle.fov;
    fovKick = Math.min(
      3.6,
      baseFov * Math.min(fxStyle.fovKickScale, 1.7) * (1 - adsBlend * 0.5),
    );
    muzzleFlash.visible = adsBlend < 0.85;
    muzzleFlash.material.rotation = Math.random() * Math.PI;
    flashMat.color.setHex(fxStyle.muzzle);
    muzzleLight.color.setHex(fxStyle.muzzle);
    spinT += 0.45 * kScale;
    hooks?.onMuzzleFlash?.();
  }

  function remoteShot(
    origin: Vec3,
    end: Vec3,
    hitPlayer: boolean,
    now: number,
    weapon?: WeaponDef | null,
  ): void {
    const fxStyle = weapon ? defaultWeaponFx(weapon) : style;
    if (weapon && wantsTravelProjectile(weapon)) {
      spawnTravelProjectile(
        origin.x,
        origin.y,
        origin.z,
        end.x,
        end.y,
        end.z,
        now,
        fxStyle,
        weapon,
        hitPlayer,
      );
      return;
    }
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
      spawnImpact(end, now, hitPlayer, fxStyle, {
        x: end.x - origin.x,
        y: end.y - origin.y,
        z: end.z - origin.z,
      });
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
    const reloadShape = style.shape;
    const noMagReload =
      reloadShape === "melee" || reloadShape === "shotgun";
    if (reloading && !wasReloadingFx) {
      reloadPhase = 0;
      reloadBlend = 0;
      magDropped = false;
      slamDone = false;
    }
    wasReloadingFx = reloading;
    if (reloading && reloadShape !== "melee") {
      const dur = Math.max(0.25, (opts.reloadMs ?? 2000) / 1000);
      reloadPhase = Math.min(1, reloadPhase + dt / dur);
      if (reloadShape === "shotgun") {
        // Shell-by-shell tilt loop
        const shells = 1 + Math.sin(reloadPhase * Math.PI * 5);
        reloadBlend = 0.35 + 0.45 * Math.max(0, shells);
      } else {
        const p = reloadPhase;
        const dive = p < 0.22 ? p / 0.22 : 1;
        const recover = p > 0.72 ? 1 - (p - 0.72) / 0.28 : 1;
        reloadBlend = Math.min(dive, recover);
        if (!noMagReload && p > 0.28 && !magDropped) {
          spawnMagDrop(now);
          magDropped = true;
        }
        if (p > 0.72 && !slamDone) {
          kick = Math.max(kick, RELOAD_SLAM_KICK);
          fovKick = Math.max(fovKick, RELOAD_SLAM_FOV);
          slamDone = true;
        }
      }
    } else {
      reloadBlend = Math.max(0, reloadBlend - dt * 6);
      if (reloadBlend < 0.01) reloadBlend = 0;
      if (!reloading) {
        magDropped = false;
        slamDone = false;
      }
    }

    if (drawT > 0) {
      drawT = Math.max(0, drawT - dt / DRAW_SEC);
    }

    tickMagDrops(now, dt);
    tickSmoke(now, dt);
    tickShells(now, dt);

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

    const fam = SHOT_FAM[shotFamily];
    const kickRecover = "recover" in fam ? fam.recover : 8;
    kick = Math.max(0, kick - dt * kick * kickRecover * 0.35 - dt * 0.02);
    kickYaw *= Math.max(0, 1 - dt * 9);
    kickRoll *= Math.max(0, 1 - dt * 8);
    fovKick = Math.max(0, fovKick - dt * Math.max(6, kickRecover * 0.9));
    spinT *= Math.max(0, 1 - dt * 4.5);
    if (pumpT > 0) {
      const pr = shotFamily === "shotgun" ? SHOT_FAM.shotgun.pumpRecover : 3.5;
      pumpT = Math.max(0, pumpT - dt * pr);
    }
    if (boltT > 0) {
      const br = shotFamily === "sniper" ? SHOT_FAM.sniper.boltRecover : 3;
      boltT = Math.max(0, boltT - dt * br);
    }
    if (slideT > 0) {
      slideT = Math.max(0, slideT - dt * SHOT_FAM.pistol.slideRecover);
    }
    if (squashT > 0) {
      const sr =
        shotFamily === "weird"
          ? SHOT_FAM.weird.squashRecover
          : SHOT_FAM.cannon.squashRecover;
      squashT = Math.max(0, squashT - dt * sr * squashT);
    }
    if (shotFamily === "smg" && kick > 0.004) {
      smgRattle = Math.min(1, smgRattle + dt * 8);
    } else {
      smgRattle = Math.max(0, smgRattle - dt * 6);
    }

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

    if (swingT > 0) {
      const swingSpeed =
        shotFamily === "melee"
          ? SHOT_FAM.melee.swingSpeed
          : shotAnimProfile === "slam"
            ? 3.2
            : shotAnimProfile === "spin"
              ? 5.5
              : shotFamily === "cannon" || shotFamily === "weird"
                ? 3.6
                : 4.2;
      swingT = Math.max(0, swingT - dt * swingSpeed);
    }
    const st = swingT;
    const swingArc = Math.sin((1 - st) * Math.PI);
    const swingProgress = 1 - st;
    const isMeleeVm =
      !!viewmodel.userData.melee ||
      style.shape === "melee" ||
      shotFamily === "melee";
    const profile = shotAnimProfile;
    let swingX = 0;
    let swingY = 0;
    let swingZ = 0;
    let swingRx = 0;
    let swingRy = 0;
    let swingRz = 0;
    const memeVm = !!viewmodel.userData.meme;
    if (st > 0) {
      if (isMeleeVm) {
        // Rotational slash arc through a forward path
        swingZ = -swingArc * 0.34;
        swingY = swingArc * 0.09;
        swingX = swingArc * 0.08;
        swingRx = -0.2 - swingArc * 0.65;
        swingRy = -0.35 + swingProgress * 0.85;
        swingRz = swingArc * 0.42;
      } else if (shotFamily === "cannon" || shotFamily === "weird") {
        swingZ = swingArc * 0.06;
        swingY = -swingArc * 0.04;
        swingRx = -swingArc * 0.35;
        swingRz = swingArc * 0.1 * (profile === "toss" ? -1 : 1);
      } else if (profile === "spin") {
        swingRy = swingArc * 0.35;
        swingRz = swingArc * 0.12;
      } else if (profile === "toss") {
        swingZ = 0.04 - swingArc * 0.12;
        swingY = swingArc * 0.05;
        swingRx = 0.12 - swingArc * 0.4;
      }
    }

    // Procedural part motion — relative to rest pose (absolute z was yanking meshes)
    const parts = viewmodel.userData.animParts as
      | Record<string, THREE.Object3D>
      | undefined;
    if (parts?.pump) {
      if (parts.pump.userData.baseZ == null) parts.pump.userData.baseZ = parts.pump.position.z;
      parts.pump.position.z = parts.pump.userData.baseZ - pumpT * 0.14;
    }
    if (parts?.bolt) {
      if (parts.bolt.userData.baseZ == null) parts.bolt.userData.baseZ = parts.bolt.position.z;
      // Sniper bolt cycle during fire cooldown
      const boltCycle = Math.sin(boltT * Math.PI);
      parts.bolt.position.z = parts.bolt.userData.baseZ + boltCycle * 0.14;
      parts.bolt.rotation.z = boltCycle * 0.55;
    }
    if (parts?.bellows) {
      parts.bellows.scale.z = 1 + pumpT * 0.4 + Math.sin(now * 0.008) * 0.04;
    }
    if (parts?.wing) {
      parts.wing.rotation.z = Math.sin(now * 0.025 + spinT) * 0.35 + swingArc * 0.25;
    }
    if (parts?.ball) {
      parts.ball.rotation.y += dt * 4;
      parts.ball.rotation.x += dt * 1.4;
      const mat = (parts.ball as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (mat?.emissive) {
        mat.emissiveIntensity = 0.6 + Math.sin(now * 0.01) * 0.35;
      }
    }
    if (parts?.cone) {
      const pulse = 1 + Math.sin(now * 0.014) * 0.1;
      parts.cone.scale.setScalar(pulse);
    }
    if (parts?.nozzle) {
      parts.nozzle.rotation.z = Math.sin(now * 0.025) * 0.14;
    }
    if (parts?.barrel) {
      parts.barrel.rotation.z = Math.sin(now * 0.03 + spinT) * (kick > 0.01 ? 0.1 : 0.03);
    }
    if (parts?.potato) {
      parts.potato.rotation.x += dt * (1.0 + kick * 6);
    }
    if (parts?.haft) {
      parts.haft.rotation.z = swingArc * 0.06;
    }

    const sprayJitter =
      shotFamily === "smg" && smgRattle > 0.01
        ? Math.sin(now * 0.001 * SHOT_FAM.smg.rattleHz) *
          SHOT_FAM.smg.rattleAmp *
          smgRattle
        : profile === "spray" && kick > 0.01
          ? Math.sin(now * 0.08) * kick * 1.4
          : 0;
    const slideKick = shotFamily === "pistol" ? slideT * 0.028 : 0;

    const rest = (viewmodel.userData.rest as
      | { x: number; y: number; z: number; rx: number; ry: number; rz: number }
      | undefined) ?? { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
    const breathe = memeVm ? Math.sin(now * 0.004) * 0.005 : 0;

    // Squash-stretch for cannon / weird
    if (squashT > 0.001) {
      const sx = 1 + squashT * 0.55;
      const sy = 1 - squashT * 0.35;
      const sz = 1 + squashT * 0.25;
      viewmodel.scale.set(sx, sy, sz);
    } else if (
      viewmodel.scale.x !== 1 ||
      viewmodel.scale.y !== 1 ||
      viewmodel.scale.z !== 1
    ) {
      viewmodel.scale.set(1, 1, 1);
    }

    // On ADS: center iron sights for real guns; drop meme guns out of FOV fast
    const adsX = THREE.MathUtils.lerp(0.22, memeVm ? 0.35 : 0.0, adsBlend) - 0.22;
    const adsY = THREE.MathUtils.lerp(0, memeVm ? -0.45 : 0.08, adsBlend);
    const adsZ = THREE.MathUtils.lerp(0, memeVm ? 0.55 : 0.28, adsBlend);
    viewmodel.position.set(
      rest.x + bobX + adsX + magWiggle * 0.04 + swingX + kickYaw + sprayJitter + breathe,
      rest.y -
        kick -
        slideKick +
        bobY +
        adsY -
        rb * 0.14 -
        rack * 0.05 +
        swingY -
        drawT * drawT * 0.48,
      rest.z + kick * 0.28 + adsZ + rb * 0.1 + swingZ + pumpT * 0.04 + boltT * 0.05 + slideT * 0.02,
    );
    viewmodel.rotation.x =
      rest.rx -
      kick * 1.25 -
      adsBlend * (memeVm ? 0.55 : 0.02) -
      rb * 0.55 -
      rack +
      swingRx -
      boltT * 0.1 +
      drawT * drawT * 0.55;
    viewmodel.rotation.y =
      rest.ry - adsBlend * 0.04 + spinT * 0.03 + magWiggle * 0.35 + swingRy + kickYaw * 2.5;
    viewmodel.rotation.z =
      rest.rz +
      bobX * 2.4 +
      kick * 0.18 * Math.min(style.kickScale, 1.5) +
      magWiggle * 0.5 -
      rb * 0.15 +
      swingRz +
      kickRoll +
      sprayJitter * 0.08;
    // Hide bulky ADS guns early so zoom isn't blocked mid-blend
    const adsHideAt = memeVm || opts.hideViewmodel ? 0.28 : 0.55;
    viewmodel.visible =
      alive && !(opts.hideViewmodel && adsBlend > adsHideAt && !reloading);

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
      if (t.tick) t.tick(age, dt);
      else {
        t.obj.traverse((c) => {
          if (c instanceof THREE.Mesh || c instanceof THREE.Line) {
            const mat = c.material as THREE.Material & { opacity?: number };
            if (mat.opacity != null) {
              mat.opacity = Math.max(0, 1 - age / t.life);
            }
          }
        });
      }
      if (age >= t.life) {
        t.onEnd?.();
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
