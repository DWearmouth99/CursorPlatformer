import type { Team } from "./constants.js";
import { compileLevel, dist2, type CompiledArena, type LevelFile } from "./level.js";
import defaultLevel from "./levels/arena.json" with { type: "json" };
import type { MapBox, MapDecoration, MapSurface, SpawnZone } from "./mapTypes.js";
import type { Vec3 } from "./math.js";

export type { MapBox, MapDecoration, MapSurface, SpawnZone };
export type {
  LevelFile,
  LevelProp,
  CompiledArena,
  MapTheme,
} from "./level.js";
export { compileLevel } from "./level.js";
export {
  MODEL_CATALOG,
  getModelInfo,
  autoCollider,
  isNonSolidModel,
} from "./modelCatalog.js";

/** Dimensions from the active level (updated when buildArena runs). */
export let ARENA_W = (defaultLevel as LevelFile).arenaW;
export let ARENA_D = (defaultLevel as LevelFile).arenaD;
export const TILE = 4;

let cachedArena: CompiledArena | null = null;
let activeLevel: LevelFile = defaultLevel as LevelFile;

/** Replace the active level (editor / tests). Clears cache. */
export function setActiveLevel(level: LevelFile): void {
  activeLevel = level;
  cachedArena = null;
}

export function getActiveLevel(): LevelFile {
  return activeLevel;
}

/**
 * Compile the active level JSON into collision + decoration data.
 * Custom maps live in `client/public/arenas/` (see `ACTIVE_ARENA_FILE`).
 * The bundled `levels/arena.json` is the build-time fallback.
 */
export function buildArena(): CompiledArena {
  const compiled = compileLevel(activeLevel);
  ARENA_W = compiled.arenaW;
  ARENA_D = compiled.arenaD;
  return compiled;
}

export function getArena(): CompiledArena {
  if (!cachedArena) cachedArena = buildArena();
  return cachedArena;
}

export function pickSpawn(
  team: Team,
  avoid: readonly Vec3[] = [],
  minDist = 20,
): SpawnZone {
  const { spawns } = getArena();
  const candidates = spawns.filter((s) => s.team === team);
  return pickFromCandidates(candidates, avoid, minDist, spawns[0]!);
}

export function pickFfaSpawn(
  avoid: readonly Vec3[] = [],
  minDist = 18,
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

/** @deprecated Prefer pickSpawn */
export function spawnForTeam(team: Team): SpawnZone {
  return pickSpawn(team);
}
