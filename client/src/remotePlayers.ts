import * as THREE from "three";
import {
  HEAD_RATIO,
  LEAN_LATERAL,
  LEAN_ROLL,
  PLAYER_HEIGHT_CROUCH,
  PLAYER_HEIGHT_STAND,
  PLAYER_RADIUS,
  TEAM,
  type Team,
} from "@fps/shared";
import type { InterpolatedRemote } from "./net/interpolation";

type RemoteMesh = {
  root: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  team: Team;
  crouchT: number;
  walkPhase: number;
  lastPos: THREE.Vector3;
  deathT: number;
};

export function createRemotePlayers(scene: THREE.Scene) {
  const meshes = new Map<string, RemoteMesh>();

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
    m.castShadow = false;
    return m;
  }

  function ensure(id: string, team: Team): RemoteMesh {
    let entry = meshes.get(id);
    if (entry) return entry;

    const root = new THREE.Group();
    const height = PLAYER_HEIGHT_STAND;
    const headH = height * HEAD_RATIO;
    const bodyH = height - headH;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: teamColor(team),
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

    const torso = makeLimb(PLAYER_RADIUS * 1.9, bodyH * 0.72, PLAYER_RADIUS * 1.1, bodyMat);
    torso.position.y = bodyH * 0.55;

    const head = makeLimb(PLAYER_RADIUS * 1.45, headH, PLAYER_RADIUS * 1.45, headMat);
    head.position.y = bodyH + headH * 0.48;

    const armL = makeLimb(0.18, bodyH * 0.55, 0.18, bodyMat);
    armL.position.set(-PLAYER_RADIUS * 1.15, bodyH * 0.55, 0);
    const armR = makeLimb(0.18, bodyH * 0.55, 0.18, bodyMat);
    armR.position.set(PLAYER_RADIUS * 1.15, bodyH * 0.55, 0);

    const legL = makeLimb(0.22, bodyH * 0.45, 0.22, darkMat);
    legL.position.set(-0.18, bodyH * 0.22, 0);
    const legR = makeLimb(0.22, bodyH * 0.45, 0.22, darkMat);
    legR.position.set(0.18, bodyH * 0.22, 0);

    root.add(torso, head, armL, armR, legL, legR);
    scene.add(root);

    entry = {
      root,
      torso,
      head,
      armL,
      armR,
      legL,
      legR,
      team,
      crouchT: 0,
      walkPhase: Math.random() * Math.PI * 2,
      lastPos: new THREE.Vector3(),
      deathT: 0,
    };
    meshes.set(id, entry);
    return entry;
  }

  function sync(remotes: InterpolatedRemote[], dt: number): void {
    const seen = new Set<string>();
    for (const r of remotes) {
      seen.add(r.id);
      const entry = ensure(r.id, r.team);

      if (!r.alive) {
        entry.deathT = Math.min(1, entry.deathT + dt * 2.5);
        entry.root.rotation.x = entry.deathT * (Math.PI / 2);
        entry.root.position.y = r.position.y - entry.deathT * 0.4;
        (entry.torso.material as THREE.MeshStandardMaterial).opacity =
          1 - entry.deathT * 0.5;
        (entry.torso.material as THREE.MeshStandardMaterial).transparent = true;
        continue;
      }

      entry.deathT = 0;
      entry.root.rotation.x = 0;
      (entry.torso.material as THREE.MeshStandardMaterial).transparent = false;
      (entry.torso.material as THREE.MeshStandardMaterial).opacity = 1;

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
        r.position.x + rightX * LEAN_LATERAL * lean * 0.85,
        r.position.y,
        r.position.z + rightZ * LEAN_LATERAL * lean * 0.85,
      );
      entry.root.rotation.y = r.yaw;
      entry.root.rotation.z = -lean * LEAN_ROLL;
      entry.root.scale.y = scale;
      entry.root.scale.x = 1;
      entry.root.scale.z = 1;

      // Walk cycle
      if (speed > 1.2) {
        entry.walkPhase += dt * speed * 3.2;
      } else {
        entry.walkPhase += dt * 2;
      }
      const swing = Math.sin(entry.walkPhase) * (speed > 1.2 ? 0.55 : 0.08);
      entry.armL.rotation.x = swing;
      entry.armR.rotation.x = -swing;
      entry.legL.rotation.x = -swing * 0.9;
      entry.legR.rotation.x = swing * 0.9;

      // Idle breathe
      const breathe = Math.sin(performance.now() * 0.003 + entry.walkPhase) * 0.015;
      entry.torso.position.y =
        (PLAYER_HEIGHT_STAND - PLAYER_HEIGHT_STAND * HEAD_RATIO) * 0.55 + breathe;

      if (entry.team !== r.team) {
        entry.team = r.team;
        const c = teamColor(r.team);
        (entry.torso.material as THREE.MeshStandardMaterial).color.setHex(c);
        (entry.armL.material as THREE.MeshStandardMaterial).color.setHex(c);
        (entry.armR.material as THREE.MeshStandardMaterial).color.setHex(c);
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
    scene.remove(entry.root);
    const mats = new Set<THREE.Material>();
    for (const m of [
      entry.torso,
      entry.head,
      entry.armL,
      entry.armR,
      entry.legL,
      entry.legR,
    ]) {
      m.geometry.dispose();
      mats.add(m.material as THREE.Material);
    }
    for (const mat of mats) mat.dispose();
  }

  function remove(id: string): void {
    const entry = meshes.get(id);
    if (!entry) return;
    disposeEntry(entry);
    meshes.delete(id);
  }

  return { sync, remove };
}
