import { aabbFromCenterSize, type AABB } from "./collision.js";
import type { Vec3 } from "./math.js";
import { TEAM, type Team } from "./constants.js";

/** Visual/collision description of a greybox prop. */
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
};

export type SpawnZone = {
  team: Team;
  /** Spawn position (feet). */
  position: Vec3;
  yaw: number;
};

const ARENA_W = 40;
const ARENA_D = 60;
const WALL_H = 6;
const WALL_T = 1;

/**
 * Simple greybox arena: floor, perimeter walls, crates, two spawn zones.
 * Coordinates: Y-up, meters. Origin at arena center on floor.
 */
export function buildArena(): { boxes: MapBox[]; solids: AABB[]; spawns: SpawnZone[] } {
  const boxes: MapBox[] = [];

  // Floor
  boxes.push({
    id: "floor",
    cx: 0,
    cy: -0.5,
    cz: 0,
    sx: ARENA_W,
    sy: 1,
    sz: ARENA_D,
    color: 0x6a6a6a,
  });

  // Walls (N/S/E/W)
  boxes.push({
    id: "wall-n",
    cx: 0,
    cy: WALL_H / 2,
    cz: -ARENA_D / 2 - WALL_T / 2,
    sx: ARENA_W + WALL_T * 2,
    sy: WALL_H,
    sz: WALL_T,
    color: 0x808080,
  });
  boxes.push({
    id: "wall-s",
    cx: 0,
    cy: WALL_H / 2,
    cz: ARENA_D / 2 + WALL_T / 2,
    sx: ARENA_W + WALL_T * 2,
    sy: WALL_H,
    sz: WALL_T,
    color: 0x808080,
  });
  boxes.push({
    id: "wall-w",
    cx: -ARENA_W / 2 - WALL_T / 2,
    cy: WALL_H / 2,
    cz: 0,
    sx: WALL_T,
    sy: WALL_H,
    sz: ARENA_D,
    color: 0x787878,
  });
  boxes.push({
    id: "wall-e",
    cx: ARENA_W / 2 + WALL_T / 2,
    cy: WALL_H / 2,
    cz: 0,
    sx: WALL_T,
    sy: WALL_H,
    sz: ARENA_D,
    color: 0x787878,
  });

  // Cover crates — mid and flanks
  const crates: Array<[string, number, number, number, number, number, number]> = [
    ["crate-mid-a", -4, 0.75, -2, 1.5, 1.5, 1.5],
    ["crate-mid-b", -4, 0.75, 0, 1.5, 1.5, 1.5],
    ["crate-mid-c", 4, 0.75, 2, 1.5, 1.5, 1.5],
    ["crate-mid-d", 4, 0.75, 0, 1.5, 1.5, 1.5],
    ["crate-stack-a", 0, 0.75, -8, 2, 1.5, 2],
    ["crate-stack-b", 0, 2.25, -8, 2, 1.5, 2],
    ["crate-t-cover", -8, 1, -22, 3, 2, 2],
    ["crate-ct-cover", 8, 1, 22, 3, 2, 2],
    ["crate-left", -12, 0.6, 5, 1.2, 1.2, 1.2],
    ["crate-right", 12, 0.6, -5, 1.2, 1.2, 1.2],
    ["ramp-block", 0, 0.5, 0, 4, 1, 2],
  ];

  for (const [id, cx, cy, cz, sx, sy, sz] of crates) {
    boxes.push({ id, cx, cy, cz, sx, sy, sz, color: 0x9a8f7a });
  }

  const solids = boxes.map((b) =>
    aabbFromCenterSize(b.cx, b.cy, b.cz, b.sx, b.sy, b.sz),
  );

  // yaw 0 looks down -Z; T is on -Z side so faces +Z (π) toward mid
  const spawns: SpawnZone[] = [
    {
      team: TEAM.T,
      position: { x: 0, y: 0, z: -ARENA_D / 2 + 4 },
      yaw: Math.PI,
    },
    {
      team: TEAM.CT,
      position: { x: 0, y: 0, z: ARENA_D / 2 - 4 },
      yaw: 0,
    },
  ];

  return { boxes, solids, spawns };
}

export function spawnForTeam(team: Team): SpawnZone {
  const { spawns } = buildArena();
  return spawns.find((s) => s.team === team) ?? spawns[0]!;
}
