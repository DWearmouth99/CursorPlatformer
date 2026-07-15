import {
  LEAN_LATERAL,
  PLAYER_EYE_CROUCH,
  PLAYER_EYE_STAND,
  PLAYER_HEIGHT_CROUCH,
  PLAYER_HEIGHT_STAND,
  PLAYER_RADIUS,
  INTERP_DELAY_MS,
} from "./constants.js";
import type { AABB } from "./collision.js";
import { forwardFromAngles, rightFlat, type Vec3, vec3 } from "./math.js";

/** Top portion of the player capsule treated as head (matches remote mesh). */
export const HEAD_RATIO = 0.28;

/**
 * Visual mesh uses width = 2 * radius for body and 1.5 * radius for head.
 * Slightly inflate hitboxes so rendered center shots register at range.
 */
export const HITBOX_SCALE = 1.12;

export type HitscanHit = {
  playerId: string;
  isHeadshot: boolean;
  distance: number;
  point: Vec3;
};

export type PoseSample = {
  id: string;
  position: Vec3;
  crouching: boolean;
  alive: boolean;
};

export type PoseHistoryFrame = {
  tick: number;
  poses: PoseSample[];
};

/** Copy poses (positions must be snapshotted — live state mutates). */
export function clonePoses(poses: readonly PoseSample[]): PoseSample[] {
  return poses.map((p) => ({
    id: p.id,
    position: { x: p.position.x, y: p.position.y, z: p.position.z },
    crouching: p.crouching,
    alive: p.alive,
  }));
}

/**
 * Lag compensation: sample pose history nearest to a past tick.
 * Prefer the frame at or before targetTick (matches client interp delay).
 */
export function getPlayerPoseAtTime(
  targetTick: number,
  history: readonly PoseHistoryFrame[],
  fallback: readonly PoseSample[],
): PoseSample[] {
  if (history.length === 0) return clonePoses(fallback);

  let best = history[0]!;
  for (const frame of history) {
    if (frame.tick <= targetTick) best = frame;
    else break;
  }
  // If target is newer than anything stored, use newest
  const last = history[history.length - 1]!;
  if (targetTick >= last.tick) return clonePoses(last.poses);
  return clonePoses(best.poses);
}

/** Recommended rewind for hitscan given client entity interpolation. */
export function lagCompRewindTicks(tickMs: number): number {
  return Math.max(1, Math.round(INTERP_DELAY_MS / tickMs));
}

function headAABB(pos: Vec3, height: number, radius: number): AABB {
  const r = radius * HITBOX_SCALE;
  const headH = height * HEAD_RATIO;
  const bodyH = height - headH;
  // Match mesh: head width ≈ 1.5 * player radius
  const hx = r * 0.75;
  return {
    cx: pos.x,
    cy: pos.y + bodyH + headH * 0.5,
    cz: pos.z,
    hx,
    hy: (headH * 0.5) * HITBOX_SCALE,
    hz: hx,
  };
}

function bodyAABB(pos: Vec3, height: number, radius: number): AABB {
  const r = radius * HITBOX_SCALE;
  const headH = height * HEAD_RATIO;
  const bodyH = height - headH;
  return {
    cx: pos.x,
    cy: pos.y + bodyH * 0.5,
    cz: pos.z,
    hx: r,
    hy: (bodyH * 0.5) * HITBOX_SCALE,
    hz: r,
  };
}

/** Ray–AABB; returns entry distance or null. */
function rayAABB(origin: Vec3, dir: Vec3, box: AABB): number | null {
  const tests: Array<[number, number, number, number]> = [
    [origin.x, dir.x, box.cx - box.hx, box.cx + box.hx],
    [origin.y, dir.y, box.cy - box.hy, box.cy + box.hy],
    [origin.z, dir.z, box.cz - box.hz, box.cz + box.hz],
  ];

  let tmin = 0;
  let tmax = Infinity;

  for (const [o, d, mn, mx] of tests) {
    if (Math.abs(d) < 1e-8) {
      if (o < mn || o > mx) return null;
      continue;
    }
    let t1 = (mn - o) / d;
    let t2 = (mx - o) / d;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : tmax >= 0 ? tmax : null;
}

export function recoilOffsetRad(
  shotIndex: number,
  pattern: readonly [number, number][],
): { pitch: number; yaw: number } {
  if (pattern.length === 0) return { pitch: 0, yaw: 0 };
  const idx = Math.min(Math.max(shotIndex, 0), pattern.length - 1);
  const [pitchDeg, yawDeg] = pattern[idx]!;
  const deg2rad = Math.PI / 180;
  return { pitch: pitchDeg * deg2rad, yaw: yawDeg * deg2rad };
}

export function eyePosition(
  pos: Vec3,
  crouching: boolean,
  yaw = 0,
  lean = 0,
): Vec3 {
  const eye = crouching ? PLAYER_EYE_CROUCH : PLAYER_EYE_STAND;
  const out = vec3(pos.x, pos.y + eye, pos.z);
  if (Math.abs(lean) > 1e-4) {
    const right = rightFlat(yaw, vec3());
    out.x += right.x * LEAN_LATERAL * lean;
    out.z += right.z * LEAN_LATERAL * lean;
  }
  return out;
}

/** Deterministic-ish spread from seed (seq + pellet index). */
export function spreadAngles(
  yaw: number,
  pitch: number,
  spreadDeg: number,
  seed: number,
): { yaw: number; pitch: number } {
  if (spreadDeg <= 0) return { yaw, pitch };
  const rad = (spreadDeg * Math.PI) / 180;
  // Hash seed into [0,1) pairs
  const s1 = Math.sin(seed * 12.9898) * 43758.5453;
  const s2 = Math.sin(seed * 78.233) * 43758.5453;
  const u = s1 - Math.floor(s1);
  const v = s2 - Math.floor(s2);
  const r = Math.sqrt(u) * rad;
  const theta = v * Math.PI * 2;
  return {
    yaw: yaw + Math.cos(theta) * r,
    pitch: pitch + Math.sin(theta) * r,
  };
}

/**
 * Authoritative hitscan: walls then players.
 * Prefer closer of head / body.
 */
export function serverHitscan(
  origin: Vec3,
  yaw: number,
  pitch: number,
  shooterId: string,
  poses: readonly PoseSample[],
  solids: readonly AABB[],
  maxDist = 200,
): { hit: HitscanHit | null; end: Vec3; dir: Vec3 } {
  const dir = forwardFromAngles(yaw, pitch, vec3());
  let bestWall = maxDist;

  for (const solid of solids) {
    const t = rayAABB(origin, dir, solid);
    if (t != null && t > 0.05 && t < bestWall) bestWall = t;
  }

  let best: HitscanHit | null = null;

  for (const pose of poses) {
    if (pose.id === shooterId || !pose.alive) continue;
    const height = pose.crouching ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT_STAND;

    const th = rayAABB(
      origin,
      dir,
      headAABB(pose.position, height, PLAYER_RADIUS),
    );
    const tb = rayAABB(
      origin,
      dir,
      bodyAABB(pose.position, height, PLAYER_RADIUS),
    );

    let chosenT: number | null = null;
    let chosenHead = false;
    if (th != null && th > 0.05 && th < bestWall) {
      chosenT = th;
      chosenHead = true;
    }
    if (tb != null && tb > 0.05 && tb < bestWall) {
      if (chosenT == null || tb + 0.01 < chosenT) {
        chosenT = tb;
        chosenHead = false;
      }
    }

    if (chosenT == null) continue;
    if (!best || chosenT < best.distance) {
      best = {
        playerId: pose.id,
        isHeadshot: chosenHead,
        distance: chosenT,
        point: {
          x: origin.x + dir.x * chosenT,
          y: origin.y + dir.y * chosenT,
          z: origin.z + dir.z * chosenT,
        },
      };
    }
  }

  const dist = best ? best.distance : bestWall;
  return {
    hit: best,
    dir,
    end: {
      x: origin.x + dir.x * dist,
      y: origin.y + dir.y * dist,
      z: origin.z + dir.z * dist,
    },
  };
}

/**
 * Forward-cone blast for melee / slap weapons.
 * Returns living enemies within range whose direction aligns with look (dot >= coneDot).
 */
export function meleeConeHits(
  origin: Vec3,
  yaw: number,
  pitch: number,
  shooterId: string,
  poses: readonly PoseSample[],
  maxRange: number,
  coneDot = 0.35,
): HitscanHit[] {
  const dir = forwardFromAngles(yaw, pitch, vec3());
  const hits: HitscanHit[] = [];
  for (const pose of poses) {
    if (pose.id === shooterId || !pose.alive) continue;
    const tx = pose.position.x - origin.x;
    const ty = pose.position.y + 1 - origin.y;
    const tz = pose.position.z - origin.z;
    const dist = Math.hypot(tx, ty, tz);
    if (dist < 0.2 || dist > maxRange) continue;
    const nd = 1 / dist;
    const dot = tx * nd * dir.x + ty * nd * dir.y + tz * nd * dir.z;
    if (dot < coneDot) continue;
    hits.push({
      playerId: pose.id,
      isHeadshot: false,
      distance: dist,
      point: {
        x: pose.position.x,
        y: pose.position.y + 1,
        z: pose.position.z,
      },
    });
  }
  hits.sort((a, b) => a.distance - b.distance);
  return hits;
}
