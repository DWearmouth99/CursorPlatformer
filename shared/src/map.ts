import { aabbFromCenterSize, type AABB } from "./collision.js";
import type { Vec3 } from "./math.js";
import { TEAM, type Team } from "./constants.js";

/** Visual/collision description of a greybox prop. */
export type MapSurface =
  | "floor"
  | "wall"
  | "crate"
  | "concrete"
  | "metal"
  | "trim"
  | "accent";

export type MapBox = {
  id: string;
  /** Center position. */
  cx: number;
  cy: number;
  cz: number;
  /** Full size. */
  sx: number;
  sy: number;
  sz: number;
  /** Optional color hint for client materials. */
  color?: number;
  surface?: MapSurface;
};

export type SpawnZone = {
  team: Team;
  /** Spawn position (feet). */
  position: Vec3;
  yaw: number;
};

/** ~2.5× previous footprint — big enough for flanks and nested cover. */
export const ARENA_W = 96;
export const ARENA_D = 140;
const WALL_H = 8;
const WALL_T = 1.25;

function box(
  id: string,
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  surface: MapSurface,
  color?: number,
): MapBox {
  return { id, cx, cy, cz, sx, sy, sz, surface, color };
}

/**
 * Large industrial yard: outer walls, mid lanes, raised decks, crate nests,
 * and many team spawns tucked behind cover.
 */
export function buildArena(): {
  boxes: MapBox[];
  solids: AABB[];
  spawns: SpawnZone[];
} {
  const boxes: MapBox[] = [];

  boxes.push(
    box("floor", 0, -0.5, 0, ARENA_W, 1, ARENA_D, "floor", 0x5f646a),
  );

  // Perimeter
  boxes.push(
    box(
      "wall-n",
      0,
      WALL_H / 2,
      -ARENA_D / 2 - WALL_T / 2,
      ARENA_W + WALL_T * 2,
      WALL_H,
      WALL_T,
      "wall",
      0x7a8088,
    ),
    box(
      "wall-s",
      0,
      WALL_H / 2,
      ARENA_D / 2 + WALL_T / 2,
      ARENA_W + WALL_T * 2,
      WALL_H,
      WALL_T,
      "wall",
      0x7a8088,
    ),
    box(
      "wall-w",
      -ARENA_W / 2 - WALL_T / 2,
      WALL_H / 2,
      0,
      WALL_T,
      WALL_H,
      ARENA_D,
      "wall",
      0x70767e,
    ),
    box(
      "wall-e",
      ARENA_W / 2 + WALL_T / 2,
      WALL_H / 2,
      0,
      WALL_T,
      WALL_H,
      ARENA_D,
      "wall",
      0x70767e,
    ),
  );

  // Long mid divider walls with gaps (lanes)
  const midWallSegs: Array<[string, number, number, number, number]> = [
    ["mid-n-l", -28, -18, 18, 3.5],
    ["mid-n-r", 28, -18, 18, 3.5],
    ["mid-s-l", -28, 18, 18, 3.5],
    ["mid-s-r", 28, 18, 18, 3.5],
    ["mid-c-l", -22, 0, 10, 4],
    ["mid-c-r", 22, 0, 10, 4],
  ];
  for (const [id, cx, cz, sx, sy] of midWallSegs) {
    boxes.push(box(id, cx, sy / 2, cz, sx, sy, 1.2, "concrete", 0x8a9098));
  }

  // Raised platforms / ramps (step blocks)
  const decks: Array<[string, number, number, number, number, number, number]> = [
    ["deck-t-main", 0, 1, -48, 22, 2, 14],
    ["deck-ct-main", 0, 1, 48, 22, 2, 14],
    ["deck-t-l", -30, 0.75, -52, 12, 1.5, 10],
    ["deck-t-r", 30, 0.75, -52, 12, 1.5, 10],
    ["deck-ct-l", -30, 0.75, 52, 12, 1.5, 10],
    ["deck-ct-r", 30, 0.75, 52, 12, 1.5, 10],
    ["bridge-west", -38, 1.5, 0, 8, 3, 16],
    ["bridge-east", 38, 1.5, 0, 8, 3, 16],
  ];
  for (const [id, cx, cy, cz, sx, sy, sz] of decks) {
    boxes.push(box(id, cx, cy, cz, sx, sy, sz, "concrete", 0x6e747c));
  }

  // Approach steps onto decks
  const steps: Array<[string, number, number, number]> = [
    ["step-t-a", 0, 0.35, -38],
    ["step-t-b", -12, 0.35, -38],
    ["step-t-c", 12, 0.35, -38],
    ["step-ct-a", 0, 0.35, 38],
    ["step-ct-b", -12, 0.35, 38],
    ["step-ct-c", 12, 0.35, 38],
  ];
  for (const [id, cx, cy, cz] of steps) {
    boxes.push(box(id, cx, cy, cz, 6, 0.7, 4, "concrete", 0x757b84));
  }

  // Pillars lining lanes
  for (const z of [-28, -10, 10, 28]) {
    for (const x of [-16, 16]) {
      boxes.push(
        box(`pillar-${x}-${z}`, x, 2.5, z, 1.4, 5, 1.4, "metal", 0x5a616a),
      );
    }
  }
  for (const z of [-55, 55]) {
    for (const x of [-20, -8, 8, 20]) {
      boxes.push(
        box(`spawn-pillar-${x}-${z}`, x, 2, z, 1.2, 4, 1.2, "metal", 0x4e555e),
      );
    }
  }

  // Low cover / barricades
  const lows: Array<[string, number, number, number, number, number]> = [
    ["low-mid-a", -8, -6, 6, 1.1, 2],
    ["low-mid-b", 8, 6, 6, 1.1, 2],
    ["low-mid-c", -6, 8, 2, 1.1, 5],
    ["low-mid-d", 6, -8, 2, 1.1, 5],
    ["low-lane-l1", -34, -22, 8, 1.2, 2.2],
    ["low-lane-l2", -34, 22, 8, 1.2, 2.2],
    ["low-lane-r1", 34, -22, 8, 1.2, 2.2],
    ["low-lane-r2", 34, 22, 8, 1.2, 2.2],
    ["low-cross-n", 0, -24, 10, 1.15, 2.4],
    ["low-cross-s", 0, 24, 10, 1.15, 2.4],
  ];
  for (const [id, cx, cz, sx, sy, sz] of lows) {
    boxes.push(box(id, cx, sy / 2, cz, sx, sy, sz, "trim", 0x8d7150));
  }

  // Crate nests (stacks + singles)
  const crates: Array<[string, number, number, number, number, number, number]> =
    [
      ["crate-mid-a", -5, 0.75, -3, 1.5, 1.5, 1.5],
      ["crate-mid-b", -5, 0.75, -1.2, 1.5, 1.5, 1.5],
      ["crate-mid-c", 5, 0.75, 2, 1.5, 1.5, 1.5],
      ["crate-mid-d", 5, 0.75, 0.2, 1.5, 1.5, 1.5],
      ["crate-stack-a", 0, 0.85, -14, 2.2, 1.7, 2.2],
      ["crate-stack-b", 0, 2.55, -14, 2.2, 1.7, 2.2],
      ["crate-stack-c", -18, 0.85, -32, 2, 1.7, 2],
      ["crate-stack-d", -18, 2.55, -32, 2, 1.7, 2],
      ["crate-stack-e", 18, 0.85, 32, 2, 1.7, 2],
      ["crate-stack-f", 18, 2.55, 32, 2, 1.7, 2],
      ["crate-nest-t1", -24, 0.7, -60, 1.4, 1.4, 1.4],
      ["crate-nest-t2", -22.4, 0.7, -60, 1.4, 1.4, 1.4],
      ["crate-nest-t3", -23.2, 2.1, -60, 1.4, 1.4, 1.4],
      ["crate-nest-t4", 24, 0.7, -60, 1.4, 1.4, 1.4],
      ["crate-nest-t5", 22.4, 0.7, -58.5, 1.4, 1.4, 1.4],
      ["crate-nest-ct1", -24, 0.7, 60, 1.4, 1.4, 1.4],
      ["crate-nest-ct2", -22.4, 0.7, 58.5, 1.4, 1.4, 1.4],
      ["crate-nest-ct3", 24, 0.7, 60, 1.4, 1.4, 1.4],
      ["crate-nest-ct4", 22.4, 2.1, 60, 1.4, 1.4, 1.4],
      ["crate-flank-l", -40, 0.9, -8, 2.4, 1.8, 2.4],
      ["crate-flank-r", 40, 0.9, 8, 2.4, 1.8, 2.4],
      ["crate-yard-a", -12, 0.65, 14, 1.3, 1.3, 1.3],
      ["crate-yard-b", 14, 0.65, -16, 1.3, 1.3, 1.3],
      ["crate-yard-c", -8, 0.65, 36, 1.6, 1.3, 1.6],
      ["crate-yard-d", 10, 0.65, -36, 1.6, 1.3, 1.6],
    ];
  for (const [id, cx, cy, cz, sx, sy, sz] of crates) {
    boxes.push(box(id, cx, cy, cz, sx, sy, sz, "crate", 0xb89a6c));
  }

  // Side hangars / sheltered bays
  const hangars: Array<[string, number, number, number, number, number, number]> =
    [
      ["hangar-t-l", -40, 2.5, -45, 10, 5, 18],
      ["hangar-t-r", 40, 2.5, -45, 10, 5, 18],
      ["hangar-ct-l", -40, 2.5, 45, 10, 5, 18],
      ["hangar-ct-r", 40, 2.5, 45, 10, 5, 18],
    ];
  for (const [id, cx, cy, cz, sx, sy, sz] of hangars) {
    boxes.push(
      box(
        `${id}-rear`,
        cx,
        cy,
        cz + (cz < 0 ? -7 : 7),
        sx,
        sy,
        1.2,
        "metal",
        0x5c646e,
      ),
    );
    boxes.push(
      box(
        `${id}-roof`,
        cx,
        cy + sy / 2 + 0.35,
        cz,
        sx,
        0.7,
        sz * 0.7,
        "metal",
        0x4a525c,
      ),
    );
    boxes.push(
      box(
        `${id}-side`,
        cx + (cx < 0 ? -4 : 4),
        cy,
        cz,
        1.2,
        sy * 0.85,
        sz * 0.55,
        "metal",
        0x616974,
      ),
    );
  }

  // Accent curb markers along the long edges
  for (const z of [-70, -35, 0, 35, 70]) {
    boxes.push(
      box(
        `curb-w-${z}`,
        -ARENA_W / 2 + 2,
        0.12,
        z,
        3,
        0.24,
        8,
        "accent",
        0xc9a227,
      ),
      box(
        `curb-e-${z}`,
        ARENA_W / 2 - 2,
        0.12,
        z,
        3,
        0.24,
        8,
        "accent",
        0xc9a227,
      ),
    );
  }

  const solids = boxes.map((b) =>
    aabbFromCenterSize(b.cx, b.cy, b.cz, b.sx, b.sy, b.sz),
  );

  // Many spawns behind cover — yaw faces mid (T looks +Z, CT looks -Z)
  const spawns: SpawnZone[] = [];
  const tSpawns: Array<[number, number]> = [
    [-28, -62],
    [-14, -64],
    [0, -66],
    [14, -64],
    [28, -62],
    [-36, -50],
    [36, -50],
    [-20, -54],
    [20, -54],
    [-8, -58],
    [8, -58],
    [-40, -38],
    [40, -38],
  ];
  const ctSpawns: Array<[number, number]> = [
    [-28, 62],
    [-14, 64],
    [0, 66],
    [14, 64],
    [28, 62],
    [-36, 50],
    [36, 50],
    [-20, 54],
    [20, 54],
    [-8, 58],
    [8, 58],
    [-40, 38],
    [40, 38],
  ];
  for (const [x, z] of tSpawns) {
    spawns.push({
      team: TEAM.T,
      position: { x, y: 0, z },
      yaw: Math.PI,
    });
  }
  for (const [x, z] of ctSpawns) {
    spawns.push({
      team: TEAM.CT,
      position: { x, y: 0, z },
      yaw: 0,
    });
  }

  return { boxes, solids, spawns };
}

let cachedArena: ReturnType<typeof buildArena> | null = null;

export function getArena(): ReturnType<typeof buildArena> {
  if (!cachedArena) cachedArena = buildArena();
  return cachedArena;
}

function dist2(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

/**
 * Random team spawn, preferring points far from `avoid` (alive enemies).
 * Falls back to the farthest candidate if none clear the min distance.
 */
export function pickSpawn(
  team: Team,
  avoid: readonly Vec3[] = [],
  minDist = 22,
): SpawnZone {
  const { spawns } = getArena();
  const candidates = spawns.filter((s) => s.team === team);
  return pickFromCandidates(candidates, avoid, minDist, spawns[0]!);
}

/** FFA spawn — any team pad, preferably far from everyone alive. */
export function pickFfaSpawn(
  avoid: readonly Vec3[] = [],
  minDist = 20,
): SpawnZone {
  const { spawns } = getArena();
  return pickFromCandidates(spawns, avoid, minDist, spawns[0]!);
}

function pickFromCandidates(
  candidates: SpawnZone[],
  avoid: readonly Vec3[],
  minDist: number,
  fallback: SpawnZone,
): SpawnZone {
  if (candidates.length === 0) return fallback;

  const minDist2 = minDist * minDist;
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  const clear = shuffled.filter((s) =>
    avoid.every((p) => dist2(s.position, p) >= minDist2),
  );
  if (clear.length > 0) {
    return clear[Math.floor(Math.random() * clear.length)]!;
  }

  let best = shuffled[0]!;
  let bestScore = -1;
  for (const s of shuffled) {
    let nearest = Infinity;
    for (const p of avoid) {
      nearest = Math.min(nearest, dist2(s.position, p));
    }
    if (nearest > bestScore) {
      bestScore = nearest;
      best = s;
    }
  }
  return best;
}

/** @deprecated Prefer pickSpawn — kept for callers that only need any team spawn. */
export function spawnForTeam(team: Team): SpawnZone {
  return pickSpawn(team);
}
