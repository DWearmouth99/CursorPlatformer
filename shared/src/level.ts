import { aabbFromCenterSize, type AABB } from "./collision.js";
import type { Vec3 } from "./math.js";
import { TEAM, type Team } from "./constants.js";
import {
  autoCollider,
  bridgeDeckTopOffset,
  isNonSolidModel,
} from "./modelCatalog.js";
import type { MapBox, MapDecoration, MapSurface, SpawnZone } from "./mapTypes.js";

export type LevelProp = {
  id?: string;
  model: string;
  x: number;
  /** Bottom of the model in world space. */
  y: number;
  z: number;
  yaw?: number;
  scale?: number;
  /** When true, generates a collision AABB. */
  solid?: boolean;
  /** Optional collider override (full size). */
  collider?: { sx: number; sy: number; sz: number };
};

/** Visual / atmosphere theme for ground, sky, and border dressings. */
export type MapTheme = "grass" | "desert";

export type LevelFile = {
  version: 1;
  name: string;
  /** Defaults to grass meadow look. */
  theme?: MapTheme;
  arenaW: number;
  arenaD: number;
  wallH?: number;
  wallT?: number;
  props: LevelProp[];
  spawns: SpawnZone[];
  /** Extra invisible collision boxes (ramps, custom decks, etc.). */
  boxes?: Array<{
    id?: string;
    cx: number;
    cy: number;
    cz: number;
    sx: number;
    sy: number;
    sz: number;
    surface?: MapSurface;
  }>;
};

export type CompiledArena = {
  boxes: MapBox[];
  solids: AABB[];
  spawns: SpawnZone[];
  decorations: MapDecoration[];
  arenaW: number;
  arenaD: number;
  theme: MapTheme;
};

function shellBoxes(
  arenaW: number,
  arenaD: number,
  wallH: number,
  wallT: number,
): MapBox[] {
  return [
    {
      id: "floor",
      cx: 0,
      cy: -0.5,
      cz: 0,
      sx: arenaW,
      sy: 1,
      sz: arenaD,
      surface: "floor",
    },
    {
      id: "wall-n",
      cx: 0,
      cy: wallH / 2,
      cz: -arenaD / 2 - wallT / 2,
      sx: arenaW + 4,
      sy: wallH,
      sz: wallT,
      surface: "wall",
    },
    {
      id: "wall-s",
      cx: 0,
      cy: wallH / 2,
      cz: arenaD / 2 + wallT / 2,
      sx: arenaW + 4,
      sy: wallH,
      sz: wallT,
      surface: "wall",
    },
    {
      id: "wall-w",
      cx: -arenaW / 2 - wallT / 2,
      cy: wallH / 2,
      cz: 0,
      sx: wallT,
      sy: wallH,
      sz: arenaD,
      surface: "wall",
    },
    {
      id: "wall-e",
      cx: arenaW / 2 + wallT / 2,
      cy: wallH / 2,
      cz: 0,
      sx: wallT,
      sy: wallH,
      sz: arenaD,
      surface: "wall",
    },
  ];
}

/** Compile a level JSON into solids + decorations for client/server. */
export function compileLevel(level: LevelFile): CompiledArena {
  const wallH = level.wallH ?? 9;
  const wallT = level.wallT ?? 1.4;
  const boxes: MapBox[] = shellBoxes(
    level.arenaW,
    level.arenaD,
    wallH,
    wallT,
  );
  const decorations: MapDecoration[] = [];
  let n = 0;

  for (const p of level.props) {
    const scale = p.scale ?? 4;
    decorations.push({
      model: p.model,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw ?? 0,
      scale,
    });
    // Rocks / mushrooms are visuals only — ignore solid + baked colliders.
    if (isNonSolidModel(p.model)) continue;
    if (!p.solid) continue;
    // Always rebuild bridge colliders — baked railing AABBs block walking.
    const col =
      p.model.startsWith("bridge")
        ? autoCollider(p.model, scale)
        : (p.collider ?? autoCollider(p.model, scale));
    const deckTop = bridgeDeckTopOffset(p.model, scale);
    const cy =
      deckTop != null ? p.y + deckTop - col.sy / 2 : p.y + col.sy / 2;
    boxes.push({
      id: p.id ?? `prop-${n++}`,
      cx: p.x,
      cy,
      cz: p.z,
      sx: col.sx,
      sy: col.sy,
      sz: col.sz,
      surface: "concrete",
    });
  }

  if (level.boxes) {
    for (const b of level.boxes) {
      boxes.push({
        id: b.id ?? `box-${n++}`,
        cx: b.cx,
        cy: b.cy,
        cz: b.cz,
        sx: b.sx,
        sy: b.sy,
        sz: b.sz,
        surface: b.surface ?? "concrete",
      });
    }
  }

  const solids = boxes.map((b) =>
    aabbFromCenterSize(b.cx, b.cy, b.cz, b.sx, b.sy, b.sz),
  );

  const spawns =
    level.spawns.length > 0
      ? level.spawns
      : defaultSpawns(level.arenaD);

  return {
    boxes,
    solids,
    spawns,
    decorations,
    arenaW: level.arenaW,
    arenaD: level.arenaD,
    theme: level.theme === "desert" ? "desert" : "grass",
  };
}

function defaultSpawns(arenaD: number): SpawnZone[] {
  const y = 0;
  const z = arenaD / 2 - 8;
  const out: SpawnZone[] = [];
  for (const x of [-8, 0, 8]) {
    out.push({ team: TEAM.T, position: { x, y, z: -z }, yaw: Math.PI });
    out.push({ team: TEAM.CT, position: { x, y, z }, yaw: 0 });
  }
  return out;
}

export function dist2(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}
