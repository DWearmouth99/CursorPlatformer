import * as THREE from "three";
import {
  HEAD_RATIO,
  LEAN_LATERAL,
  LEAN_ROLL,
  PLAYER_HEIGHT_CROUCH,
  PLAYER_HEIGHT_STAND,
  PLAYER_RADIUS,
  TEAM,
  defaultWeaponFx,
  getWeaponById,
  gunGameWeaponById,
  type Team,
  type WeaponShape,
} from "@fps/shared";
import type { InterpolatedRemote } from "./net/interpolation";

/** Tuning — hit reactions / death / shadow (CHANGE 2). */
const HIT_FLASH_SEC = 0.12;
const HIT_FLASH_COLOR = 0xff2222;
const FLINCH_DECAY = 10;
const DEATH_FADE_SEC = 2.5;
const DEATH_KNOCK_SPEED = 2.4;
const DEATH_TOPPLE_RATE = 2.1;
const SHADOW_BASE_SCALE = 1.35;
const SHADOW_POOL_SIZE = 16;

type RemoteMesh = {
  root: THREE.Group;
  torso: THREE.Mesh;
  upper: THREE.Group;
  head: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  gun: THREE.Group | null;
  gunTip: THREE.Object3D | null;
  weaponId: string;
  weaponShape: WeaponShape | null;
  team: Team;
  crouchT: number;
  walkPhase: number;
  lastPos: THREE.Vector3;
  bodyH: number;
  bodyMat: THREE.MeshStandardMaterial;
  headMat: THREE.MeshStandardMaterial;
  darkMat: THREE.MeshStandardMaterial;
  baseBodyColor: number;
  baseHeadColor: number;
  hitFlashT: number;
  flinchX: number;
  flinchZ: number;
  dying: boolean;
  deathAge: number;
  deathDirX: number;
  deathDirZ: number;
  deathAngVel: number;
  deathRoll: number;
  deathBounceT: number;
  deathBaseY: number;
  deathBaseX: number;
  deathBaseZ: number;
  deathYaw: number;
  splayArmL: number;
  splayArmR: number;
  splayLegL: number;
  splayLegR: number;
  shadow: THREE.Sprite | null;
};

function resolveWeaponShape(weaponId: string): WeaponShape {
  const w = gunGameWeaponById(weaponId) ?? getWeaponById(weaponId);
  if (!w) return "rifle";
  return defaultWeaponFx(w).shape;
}

function disposeObject3D(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) m.dispose();
  });
}

function matStd(
  color: number,
  opts: { metalness?: number; roughness?: number } = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.45,
    metalness: opts.metalness ?? 0.35,
  });
}

/** Compact third-person procedural gun by WeaponShape (always boxy; ignores GLBs). */
function buildTpGun(
  shape: WeaponShape,
  primary: number,
  accent: number,
): { root: THREE.Group; tip: THREE.Object3D } {
  const root = new THREE.Group();
  const gunMat = matStd(primary);
  const accentMat = matStd(accent, { metalness: 0.55, roughness: 0.35 });
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
    m.castShadow = true;
    m.receiveShadow = true;
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    root.add(m);
    return m;
  };

  const tip = new THREE.Object3D();
  tip.name = "tpGunTip";

  switch (shape) {
    case "pistol":
      add(new THREE.BoxGeometry(0.06, 0.09, 0.16), gunMat, 0, 0, -0.08);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.12), accentMat, 0, 0.02, -0.2);
      add(new THREE.BoxGeometry(0.04, 0.1, 0.05), accentMat, 0, -0.08, -0.04);
      tip.position.set(0, 0.02, -0.28);
      break;
    case "smg":
      add(new THREE.BoxGeometry(0.07, 0.08, 0.26), gunMat, 0, 0, -0.12);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.18), accentMat, 0, 0.03, -0.3);
      add(new THREE.BoxGeometry(0.04, 0.12, 0.05), accentMat, 0, -0.1, -0.06);
      add(new THREE.BoxGeometry(0.05, 0.06, 0.08), gunMat, 0, -0.04, 0.04);
      tip.position.set(0, 0.03, -0.4);
      break;
    case "shotgun":
      add(new THREE.BoxGeometry(0.08, 0.09, 0.32), gunMat, 0, 0, -0.14);
      add(new THREE.BoxGeometry(0.06, 0.05, 0.1), accentMat, 0, 0.01, -0.28);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 6), accentMat, -0.025, 0.02, -0.38, Math.PI / 2, 0, 0);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 6), accentMat, 0.025, 0.02, -0.38, Math.PI / 2, 0, 0);
      tip.position.set(0, 0.02, -0.52);
      break;
    case "sniper":
      add(new THREE.BoxGeometry(0.065, 0.07, 0.42), gunMat, 0, 0, -0.16);
      add(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 6), accentMat, 0, 0.02, -0.48, Math.PI / 2, 0, 0);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), accentMat, 0, 0.06, -0.12, Math.PI / 2, 0, 0);
      tip.position.set(0, 0.02, -0.7);
      break;
    case "cannon":
      add(new THREE.CylinderGeometry(0.055, 0.07, 0.36, 8), gunMat, 0, 0, -0.2, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.1, 0.1, 0.14), accentMat, 0, -0.06, 0.02);
      tip.position.set(0, 0, -0.42);
      break;
    case "melee":
      add(new THREE.BoxGeometry(0.04, 0.04, 0.42), gunMat, 0, 0, -0.18);
      add(new THREE.BoxGeometry(0.16, 0.05, 0.18), accentMat, 0, 0.01, -0.42);
      tip.position.set(0, 0, -0.52);
      break;
    case "weird":
      add(new THREE.SphereGeometry(0.06, 8, 8), gunMat, 0, 0, -0.1);
      add(new THREE.ConeGeometry(0.04, 0.22, 8), accentMat, 0, 0, -0.28, Math.PI / 2, 0, 0);
      tip.position.set(0, 0, -0.4);
      break;
    default: // rifle
      add(new THREE.BoxGeometry(0.07, 0.08, 0.34), gunMat, 0, 0, -0.14);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.28), accentMat, 0, 0.025, -0.38);
      add(new THREE.BoxGeometry(0.05, 0.1, 0.06), accentMat, 0, -0.08, -0.04);
      add(new THREE.BoxGeometry(0.06, 0.07, 0.12), gunMat, 0, -0.02, 0.06);
      tip.position.set(0, 0.025, -0.54);
      break;
  }

  root.add(tip);
  root.scale.setScalar(0.92);
  return { root, tip };
}

export function createRemotePlayers(scene: THREE.Scene) {
  const meshes = new Map<string, RemoteMesh>();

  // Shared blob-shadow texture; per-sprite materials for independent opacity
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = 64;
  shadowCanvas.height = 64;
  {
    const ctx = shadowCanvas.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(0.55, "rgba(0,0,0,0.22)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const shadowPool: THREE.Sprite[] = [];
  for (let i = 0; i < SHADOW_POOL_SIZE; i++) {
    const mat = new THREE.SpriteMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.4,
    });
    const spr = new THREE.Sprite(mat);
    spr.visible = false;
    spr.scale.set(SHADOW_BASE_SCALE, SHADOW_BASE_SCALE, 1);
    spr.center.set(0.5, 0.5);
    scene.add(spr);
    shadowPool.push(spr);
  }

  function acquireShadow(): THREE.Sprite | null {
    for (const s of shadowPool) {
      if (!s.visible) {
        s.visible = true;
        return s;
      }
    }
    return null;
  }

  function releaseShadow(spr: THREE.Sprite | null): void {
    if (!spr) return;
    spr.visible = false;
  }

  function teamColor(team: Team): number {
    return team === TEAM.T ? 0xd4622d : 0x3a7fd4;
  }

  function makeLimb(
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
  ): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function ensure(id: string, team: Team): RemoteMesh {
    let entry = meshes.get(id);
    if (entry) return entry;

    const root = new THREE.Group();
    const height = PLAYER_HEIGHT_STAND;
    const headH = height * HEAD_RATIO;
    const bodyH = height - headH;
    const bodyCol = teamColor(team);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyCol,
      roughness: 0.55,
      metalness: 0.08,
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xe8c4a8,
      roughness: 0.72,
      metalness: 0.02,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a2e,
      roughness: 0.7,
      metalness: 0.1,
    });

    const torso = makeLimb(
      PLAYER_RADIUS * 1.9,
      bodyH * 0.72,
      PLAYER_RADIUS * 1.1,
      bodyMat,
    );
    torso.position.y = bodyH * 0.55;

    const upper = new THREE.Group();
    upper.position.y = bodyH * 0.72;

    const head = makeLimb(
      PLAYER_RADIUS * 1.45,
      headH,
      PLAYER_RADIUS * 1.45,
      headMat,
    );
    head.position.y = bodyH * 0.28 + headH * 0.48;

    const armL = makeLimb(0.18, bodyH * 0.55, 0.18, bodyMat);
    armL.position.set(-PLAYER_RADIUS * 1.15, bodyH * 0.05, 0);
    const armR = makeLimb(0.18, bodyH * 0.55, 0.18, bodyMat);
    armR.position.set(PLAYER_RADIUS * 1.15, bodyH * 0.05, 0);

    upper.add(head, armL, armR);

    const legL = makeLimb(0.22, bodyH * 0.45, 0.22, darkMat);
    legL.position.set(-0.18, bodyH * 0.22, 0);
    const legR = makeLimb(0.22, bodyH * 0.45, 0.22, darkMat);
    legR.position.set(0.18, bodyH * 0.22, 0);

    root.add(torso, upper, legL, legR);
    scene.add(root);

    entry = {
      root,
      torso,
      upper,
      head,
      armL,
      armR,
      legL,
      legR,
      gun: null,
      gunTip: null,
      weaponId: "",
      weaponShape: null,
      team,
      crouchT: 0,
      walkPhase: Math.random() * Math.PI * 2,
      lastPos: new THREE.Vector3(),
      bodyH,
      bodyMat,
      headMat,
      darkMat,
      baseBodyColor: bodyCol,
      baseHeadColor: 0xe8c4a8,
      hitFlashT: 0,
      flinchX: 0,
      flinchZ: 0,
      dying: false,
      deathAge: 0,
      deathDirX: 0,
      deathDirZ: 1,
      deathAngVel: DEATH_TOPPLE_RATE,
      deathRoll: 0,
      deathBounceT: 0,
      deathBaseY: 0,
      deathBaseX: 0,
      deathBaseZ: 0,
      deathYaw: 0,
      splayArmL: 0,
      splayArmR: 0,
      splayLegL: 0,
      splayLegR: 0,
      shadow: acquireShadow(),
    };
    meshes.set(id, entry);
    return entry;
  }

  function setWeapon(entry: RemoteMesh, weaponId: string): void {
    if (entry.weaponId === weaponId && entry.gun) return;
    if (entry.gun) {
      entry.armR.remove(entry.gun);
      disposeObject3D(entry.gun);
      entry.gun = null;
      entry.gunTip = null;
    }
    entry.weaponId = weaponId;
    const shape = resolveWeaponShape(weaponId);
    entry.weaponShape = shape;
    const w = gunGameWeaponById(weaponId) ?? getWeaponById(weaponId);
    const fx = w ? defaultWeaponFx(w) : { primary: 0x2c3136, accent: 0x1a1c1e };
    const built = buildTpGun(shape, fx.primary, fx.accent);
    built.root.position.set(0.02, -entry.bodyH * 0.22, 0.06);
    built.root.rotation.set(-0.15, 0, 0.08);
    entry.armR.add(built.root);
    entry.gun = built.root;
    entry.gunTip = built.tip;
  }

  function poseArms(entry: RemoteMesh, walkSwing: number): void {
    const melee = entry.weaponShape === "melee";
    if (melee) {
      entry.armR.rotation.x = -0.85 + walkSwing * 0.15;
      entry.armR.rotation.z = -0.15;
      entry.armL.rotation.x = walkSwing * 0.35;
      entry.armL.rotation.z = 0.12;
    } else {
      entry.armR.rotation.x = -1.15 + walkSwing * 0.08;
      entry.armR.rotation.z = -0.35;
      entry.armL.rotation.x = -1.05 - walkSwing * 0.06;
      entry.armL.rotation.z = 0.4;
    }
  }

  function applyHitFlash(entry: RemoteMesh, dt: number): void {
    if (entry.hitFlashT > 0) {
      entry.hitFlashT = Math.max(0, entry.hitFlashT - dt);
      entry.bodyMat.color.setHex(HIT_FLASH_COLOR);
      entry.headMat.color.setHex(HIT_FLASH_COLOR);
    } else {
      entry.bodyMat.color.setHex(entry.baseBodyColor);
      entry.headMat.color.setHex(entry.baseHeadColor);
    }
    entry.flinchX *= Math.max(0, 1 - dt * FLINCH_DECAY);
    entry.flinchZ *= Math.max(0, 1 - dt * FLINCH_DECAY);
    if (Math.abs(entry.flinchX) < 0.001) entry.flinchX = 0;
    if (Math.abs(entry.flinchZ) < 0.001) entry.flinchZ = 0;
  }

  function beginDeath(
    entry: RemoteMesh,
    fromX: number | null,
    fromZ: number | null,
  ): void {
    if (entry.dying) return;
    entry.dying = true;
    entry.deathAge = 0;
    entry.deathBounceT = 0;
    entry.deathBaseX = entry.root.position.x;
    entry.deathBaseY = entry.root.position.y;
    entry.deathBaseZ = entry.root.position.z;
    entry.deathYaw = entry.root.rotation.y;
    entry.deathRoll = (Math.random() - 0.5) * 0.9;
    entry.deathAngVel = DEATH_TOPPLE_RATE * (0.85 + Math.random() * 0.35);
    entry.splayArmL = -0.4 - Math.random() * 0.8;
    entry.splayArmR = 0.4 + Math.random() * 0.8;
    entry.splayLegL = -0.3 - Math.random() * 0.5;
    entry.splayLegR = 0.3 + Math.random() * 0.5;
    if (fromX != null && fromZ != null) {
      let dx = entry.deathBaseX - fromX;
      let dz = entry.deathBaseZ - fromZ;
      const len = Math.hypot(dx, dz) || 1;
      entry.deathDirX = dx / len;
      entry.deathDirZ = dz / len;
    } else {
      entry.deathDirX = Math.sin(entry.deathYaw);
      entry.deathDirZ = Math.cos(entry.deathYaw);
    }
    releaseShadow(entry.shadow);
    entry.shadow = null;
  }

  function updateDeath(entry: RemoteMesh, dt: number): void {
    entry.deathAge += dt;
    const t = Math.min(1, entry.deathAge / DEATH_FADE_SEC);
    const knock = Math.min(1.4, entry.deathAge * DEATH_KNOCK_SPEED);
    entry.root.position.x = entry.deathBaseX + entry.deathDirX * knock;
    entry.root.position.z = entry.deathBaseZ + entry.deathDirZ * knock;

    const topple = Math.min(Math.PI / 2, entry.deathAge * entry.deathAngVel);
    entry.root.rotation.y = entry.deathYaw;
    entry.root.rotation.x = topple;
    entry.root.rotation.z = entry.deathRoll * (topple / (Math.PI / 2));

    // Slight bounce once nearly flat
    if (topple > 1.15 && entry.deathBounceT < 0.45) {
      entry.deathBounceT += dt;
      entry.root.position.y =
        entry.deathBaseY +
        Math.sin(entry.deathBounceT * Math.PI * 2.2) * 0.14 * (1 - entry.deathBounceT / 0.45);
    } else {
      entry.root.position.y = entry.deathBaseY - topple * 0.35;
    }

    entry.armL.rotation.x = entry.splayArmL * t;
    entry.armL.rotation.z = -0.5 * t;
    entry.armR.rotation.x = entry.splayArmR * t;
    entry.armR.rotation.z = 0.5 * t;
    entry.legL.rotation.x = entry.splayLegL * t;
    entry.legR.rotation.x = entry.splayLegR * t;

    const fade = 1 - t;
    entry.bodyMat.transparent = true;
    entry.headMat.transparent = true;
    entry.darkMat.transparent = true;
    entry.bodyMat.opacity = fade;
    entry.headMat.opacity = fade;
    entry.darkMat.opacity = fade;
    entry.bodyMat.depthWrite = fade > 0.2;
    if (t >= 1) {
      entry.root.visible = false;
    }
  }

  function sync(
    remotes: InterpolatedRemote[],
    dt: number,
    protectedIds?: ReadonlySet<string>,
  ): void {
    const seen = new Set<string>();
    for (const r of remotes) {
      seen.add(r.id);
      const entry = ensure(r.id, r.team);

      if (!r.alive) {
        if (!entry.dying) beginDeath(entry, null, null);
        updateDeath(entry, dt);
        continue;
      }

      // Respawned
      if (entry.dying) {
        entry.dying = false;
        entry.deathAge = 0;
        entry.root.visible = true;
        entry.root.rotation.x = 0;
        entry.root.rotation.z = 0;
        entry.bodyMat.opacity = 1;
        entry.headMat.opacity = 1;
        entry.darkMat.opacity = 1;
        entry.bodyMat.transparent = false;
        entry.headMat.transparent = false;
        entry.darkMat.transparent = false;
        entry.bodyMat.depthWrite = true;
        if (!entry.shadow) entry.shadow = acquireShadow();
      }

      if (r.weaponId) setWeapon(entry, r.weaponId);
      applyHitFlash(entry, dt);

      const veiled = !!r.veiled;
      const spawnProtected = protectedIds?.has(r.id) ?? false;
      const mats = [entry.bodyMat, entry.headMat, entry.darkMat];
      for (const mat of mats) {
        if (entry.hitFlashT > 0) {
          // flash owns color; still handle veil opacity
          mat.transparent = veiled || spawnProtected || true;
        }
        mat.transparent = veiled || spawnProtected || entry.hitFlashT > 0;
        const baseOp = veiled ? 0.22 : spawnProtected ? 0.82 : 1;
        mat.opacity = baseOp;
        mat.depthWrite = !veiled;
        if (spawnProtected && !veiled && entry.hitFlashT <= 0) {
          mat.emissive.setHex(0x66ddff);
          mat.emissiveIntensity = 0.35;
        } else if (entry.hitFlashT > 0) {
          mat.emissive.setHex(HIT_FLASH_COLOR);
          mat.emissiveIntensity = 0.55;
        } else {
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        }
      }
      if (entry.gun) {
        entry.gun.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (!mat?.color) return;
          mat.transparent = veiled;
          mat.opacity = veiled ? 0.22 : 1;
          mat.depthWrite = !veiled;
        });
      }

      const dx = r.position.x - entry.lastPos.x;
      const dz = r.position.z - entry.lastPos.z;
      const speed = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
      entry.lastPos.set(r.position.x, r.position.y, r.position.z);

      const targetCrouch = r.crouching ? 1 : 0;
      entry.crouchT += (targetCrouch - entry.crouchT) * Math.min(1, dt * 12);
      const h =
        PLAYER_HEIGHT_STAND * (1 - entry.crouchT) +
        PLAYER_HEIGHT_CROUCH * entry.crouchT;
      const scale = h / PLAYER_HEIGHT_STAND;

      entry.root.visible = true;
      const lean = r.lean ?? 0;
      const rightX = Math.cos(r.yaw);
      const rightZ = -Math.sin(r.yaw);
      entry.root.position.set(
        r.position.x + rightX * LEAN_LATERAL * lean * 0.85 + entry.flinchX,
        r.position.y,
        r.position.z + rightZ * LEAN_LATERAL * lean * 0.85 + entry.flinchZ,
      );
      entry.root.rotation.y = r.yaw;
      entry.root.rotation.z = -lean * LEAN_ROLL;
      const shrink = r.shrunk ? 0.45 : 1;
      entry.root.scale.y = scale * shrink;
      entry.root.scale.x = shrink;
      entry.root.scale.z = shrink;

      entry.upper.rotation.x = -r.pitch;

      if (speed > 1.2) {
        entry.walkPhase += dt * speed * 3.2;
      } else {
        entry.walkPhase += dt * 2;
      }
      const swing = Math.sin(entry.walkPhase) * (speed > 1.2 ? 0.55 : 0.08);
      poseArms(entry, swing);

      if (!r.grounded) {
        // Air: tuck / bend legs
        entry.legL.rotation.x = -0.85;
        entry.legR.rotation.x = -0.65;
      } else {
        entry.legL.rotation.x = -swing * 0.9;
        entry.legR.rotation.x = swing * 0.9;
      }

      const breathe =
        Math.sin(performance.now() * 0.003 + entry.walkPhase) * 0.015;
      entry.torso.position.y = entry.bodyH * 0.55 + breathe;

      if (entry.team !== r.team) {
        entry.team = r.team;
        entry.baseBodyColor = teamColor(r.team);
        if (entry.hitFlashT <= 0) entry.bodyMat.color.setHex(entry.baseBodyColor);
      }

      // Blob shadow under feet
      if (entry.shadow) {
        const height = Math.max(0, r.position.y);
        const s = SHADOW_BASE_SCALE / (1 + height * 0.4);
        entry.shadow.position.set(
          entry.root.position.x,
          0.04,
          entry.root.position.z,
        );
        entry.shadow.scale.set(s, s, 1);
        (entry.shadow.material as THREE.SpriteMaterial).opacity =
          (veiled ? 0.12 : 0.38) / (1 + height * 0.55);
        entry.shadow.visible = !veiled || true;
      }
    }

    for (const [id, entry] of meshes) {
      if (!seen.has(id)) {
        disposeEntry(entry);
        meshes.delete(id);
      }
    }
  }

  function disposeEntry(entry: RemoteMesh): void {
    if (entry.gun) {
      entry.armR.remove(entry.gun);
      disposeObject3D(entry.gun);
      entry.gun = null;
      entry.gunTip = null;
    }
    releaseShadow(entry.shadow);
    entry.shadow = null;
    scene.remove(entry.root);
    for (const m of [
      entry.torso,
      entry.head,
      entry.armL,
      entry.armR,
      entry.legL,
      entry.legR,
    ]) {
      m.geometry.dispose();
    }
    entry.bodyMat.dispose();
    entry.headMat.dispose();
    entry.darkMat.dispose();
  }

  function remove(id: string): void {
    const entry = meshes.get(id);
    if (!entry) return;
    disposeEntry(entry);
    meshes.delete(id);
  }

  function getMuzzleWorld(id: string, out: THREE.Vector3): boolean {
    const entry = meshes.get(id);
    if (!entry?.gunTip || !entry.root.visible || entry.dying) {
      return false;
    }
    entry.gunTip.getWorldPosition(out);
    return true;
  }

  function pulseHit(
    id: string,
    fromX?: number | null,
    fromZ?: number | null,
  ): void {
    const entry = meshes.get(id);
    if (!entry || entry.dying) return;
    entry.hitFlashT = HIT_FLASH_SEC;
    if (fromX != null && fromZ != null) {
      let dx = entry.root.position.x - fromX;
      let dz = entry.root.position.z - fromZ;
      const len = Math.hypot(dx, dz) || 1;
      entry.flinchX = (dx / len) * 0.14;
      entry.flinchZ = (dz / len) * 0.14;
    } else {
      entry.flinchX = (Math.random() - 0.5) * 0.1;
      entry.flinchZ = (Math.random() - 0.5) * 0.1;
    }
  }

  function startDeath(
    id: string,
    fromX?: number | null,
    fromZ?: number | null,
  ): void {
    const entry = meshes.get(id);
    if (!entry) return;
    beginDeath(entry, fromX ?? null, fromZ ?? null);
    pulseHit(id, fromX, fromZ);
  }

  return { sync, remove, getMuzzleWorld, pulseHit, startDeath };
}
