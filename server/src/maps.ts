import fs from "node:fs";
import path from "node:path";
import {
  compileLevel,
  getMapById,
  type AABB,
  type LevelFile,
} from "@fps/shared";

const mapCache = new Map<string, { solids: readonly AABB[]; level: LevelFile }>();

export function resolveMapPaths(
  clientPublic: string,
  clientDist: string,
): string[] {
  return [
    path.join(clientPublic, "arenas"),
    path.join(clientDist, "arenas"),
  ];
}

export function loadMapSolids(
  mapId: string,
  arenaDirs: string[],
): { solids: readonly AABB[]; level: LevelFile } {
  const cached = mapCache.get(mapId);
  if (cached) return cached;

  const def = getMapById(mapId);
  if (!def) throw new Error(`Unknown map: ${mapId}`);

  for (const dir of arenaDirs) {
    const filePath = path.join(dir, def.file);
    if (!fs.existsSync(filePath)) continue;
    try {
      const level = JSON.parse(fs.readFileSync(filePath, "utf8")) as LevelFile;
      const compiled = compileLevel(level);
      const entry = { solids: compiled.solids, level };
      mapCache.set(mapId, entry);
      return entry;
    } catch (err) {
      console.warn(`[maps] failed ${filePath}`, err);
    }
  }
  throw new Error(`Map file missing for ${mapId} (${def.file})`);
}
