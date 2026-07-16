import type { GameMode } from "./protocol.js";
import { gunGameWeaponById } from "./gungame.js";
import type { WeaponDef } from "./weapons.js";

function mustWeapon(id: string): WeaponDef {
  const w = gunGameWeaponById(id);
  if (!w) throw new Error(`Missing loadout weapon: ${id}`);
  return w;
}

/** Snipers Only — everyone locked to AWP (no picker). */
export const SNIPER_LOADOUT: readonly WeaponDef[] = [mustWeapon("real_awp")];

/** King of the Hill arsenal — varied, no ladder. */
export const KOTH_LOADOUT: readonly WeaponDef[] = [
  mustWeapon("real_pew"),
  mustWeapon("real_mac10"),
  mustWeapon("real_shotgun"),
  mustWeapon("real_ak47"),
  mustWeapon("real_awp"),
  mustWeapon("gg_potato"),
  mustWeapon("gg_noodle"),
  mustWeapon("gg_slap"),
  mustWeapon("gg_spoon"),
  mustWeapon("gg_thunder"),
  mustWeapon("gg_ban"),
  mustWeapon("real_board"),
];

export const SNIPER_KILLS_TO_WIN = 20;
export const KOTH_SCORE_TO_WIN = 100;
/** Score earned per second while alone on the hill. */
export const KOTH_POINTS_PER_SEC = 8;
export const HILL_RADIUS = 8.5;
/** Move the hill after this many points are scored on the current site. */
export const HILL_ROTATE_POINTS = 25;
/** Or after this many seconds, whichever comes first. */
export const HILL_ROTATE_SEC = 45;

export type LoadoutOption = {
  id: string;
  name: string;
  blurb: string;
};

export type HillZone = {
  x: number;
  y: number;
  z: number;
  radius: number;
};

/** Rotating King of the Hill sites (arena-relative). */
export const HILL_POSITIONS: readonly HillZone[] = [
  { x: 0, y: 0, z: 0, radius: HILL_RADIUS },
  { x: 26, y: 0, z: -20, radius: HILL_RADIUS },
  { x: -28, y: 0, z: 16, radius: HILL_RADIUS },
  { x: 14, y: 0, z: 28, radius: HILL_RADIUS },
];

/** Default hill sits mid-arena (first rotation site). */
export const DEFAULT_HILL: HillZone = { ...HILL_POSITIONS[0]! };

function blunt(w: WeaponDef): string {
  if (w.scopeStyle === "sniper") return "Bolt sniper";
  if (w.scopeStyle === "optic") return "Scoped marksman";
  if (w.fireStyle === "melee") return "Melee";
  if (w.fireStyle === "shotgun" || w.pellets > 1) return "Close range";
  if (w.explosionRadius) return "Explosive";
  if (w.fireRate >= 10) return "Spray";
  return "Rifle";
}

export function loadoutOptionsForMode(mode: GameMode): LoadoutOption[] {
  if (mode !== "king_of_the_hill") return [];
  return KOTH_LOADOUT.map((w) => ({
    id: w.id,
    name: w.name,
    blurb: blunt(w),
  }));
}

export function weaponsForMode(mode: GameMode): readonly WeaponDef[] {
  if (mode === "snipers_only") return SNIPER_LOADOUT;
  if (mode === "king_of_the_hill") return KOTH_LOADOUT;
  return [];
}

export function defaultWeaponForMode(mode: GameMode): WeaponDef | null {
  const list = weaponsForMode(mode);
  return list[0] ?? null;
}

export function findLoadoutWeapon(
  mode: GameMode,
  weaponId: string,
): WeaponDef | null {
  // Snipers Only is hard-locked to AWP.
  if (mode === "snipers_only") return SNIPER_LOADOUT[0] ?? null;
  return weaponsForMode(mode).find((w) => w.id === weaponId) ?? null;
}

export function scoreToWin(mode: GameMode): number {
  if (mode === "snipers_only") return SNIPER_KILLS_TO_WIN;
  if (mode === "king_of_the_hill") return KOTH_SCORE_TO_WIN;
  return 0;
}

/** True when the client should show a weapon pick UI. */
export function modeNeedsLoadout(mode: GameMode): boolean {
  return mode === "king_of_the_hill";
}

export function modeTitle(mode: GameMode): string {
  if (mode === "snipers_only") return "Snipers Only";
  if (mode === "king_of_the_hill") return "King of the Hill";
  return "Gun Game";
}
