import type { WeaponDef } from "./weapons.js";

/** Classic ladder length — one kill advances you. Final kill with #20 wins. */
export const GUN_GAME_LENGTH = 20;

const RECOIL_SPAM: readonly [number, number][] = [
  [0.15, 0.12],
  [0.18, -0.14],
  [0.2, 0.16],
  [0.22, -0.12],
  [0.24, 0.18],
];

const RECOIL_KICK: readonly [number, number][] = [
  [2.4, 0.3],
  [2.8, -0.4],
  [3.0, 0.2],
];

const RECOIL_HEAVY: readonly [number, number][] = [
  [3.5, 0.5],
  [4.0, -0.6],
];

const RECOIL_MID: readonly [number, number][] = [
  [0.55, 0.1],
  [0.65, -0.15],
  [0.7, 0.12],
  [0.75, -0.1],
  [0.8, 0.18],
];

function gg(
  id: string,
  name: string,
  partial: Omit<WeaponDef, "id" | "name" | "adsSpreadMult" | "adsFov" | "adsSensMult" | "scopeStyle"> &
    Partial<Pick<WeaponDef, "adsSpreadMult" | "adsFov" | "adsSensMult" | "scopeStyle" | "maxRange">>,
): WeaponDef {
  return {
    id,
    name,
    adsSpreadMult: partial.adsSpreadMult ?? 0.4,
    adsFov: partial.adsFov ?? 58,
    adsSensMult: partial.adsSensMult ?? 0.75,
    scopeStyle: partial.scopeStyle ?? "iron",
    maxRange: partial.maxRange,
    damage: partial.damage,
    headshotMultiplier: partial.headshotMultiplier,
    magSize: partial.magSize,
    reloadMs: partial.reloadMs,
    fireRate: partial.fireRate,
    pellets: partial.pellets,
    spreadDeg: partial.spreadDeg,
    recoilPattern: partial.recoilPattern,
  };
}

/**
 * 20 ridiculous weapons. Index 0 is the starter; kill with index 19 to win.
 */
export const GUN_GAME_LADDER: readonly WeaponDef[] = [
  gg("gg_pea", "Pea Shooter", {
    damage: 8,
    headshotMultiplier: 1.5,
    magSize: 60,
    reloadMs: 1400,
    fireRate: 16,
    pellets: 1,
    spreadDeg: 0.9,
    recoilPattern: RECOIL_SPAM,
  }),
  gg("gg_chicken", "Rubber Chicken", {
    damage: 18,
    headshotMultiplier: 1.2,
    magSize: 12,
    reloadMs: 1800,
    fireRate: 3.2,
    pellets: 1,
    spreadDeg: 1.8,
    recoilPattern: RECOIL_KICK,
  }),
  gg("gg_potato", "Potato Cannon", {
    damage: 55,
    headshotMultiplier: 1.4,
    magSize: 4,
    reloadMs: 2600,
    fireRate: 0.85,
    pellets: 1,
    spreadDeg: 0.4,
    recoilPattern: RECOIL_HEAVY,
    adsFov: 50,
  }),
  gg("gg_confetti", "Confetti SMG", {
    damage: 11,
    headshotMultiplier: 1.6,
    magSize: 40,
    reloadMs: 1900,
    fireRate: 14,
    pellets: 1,
    spreadDeg: 0.7,
    recoilPattern: RECOIL_SPAM,
  }),
  gg("gg_bees", "Beehive Blaster", {
    damage: 6,
    headshotMultiplier: 1.3,
    magSize: 8,
    reloadMs: 2400,
    fireRate: 1.6,
    pellets: 12,
    spreadDeg: 6.5,
    recoilPattern: RECOIL_KICK,
  }),
  gg("gg_noodle", "Noodle Launcher", {
    damage: 32,
    headshotMultiplier: 1.5,
    magSize: 10,
    reloadMs: 2200,
    fireRate: 2.4,
    pellets: 1,
    spreadDeg: 0.35,
    recoilPattern: RECOIL_MID,
    scopeStyle: "optic",
    adsFov: 48,
  }),
  gg("gg_slap", "Tactical Slap", {
    damage: 90,
    headshotMultiplier: 1.1,
    magSize: 1,
    reloadMs: 900,
    fireRate: 1.8,
    pellets: 1,
    spreadDeg: 0,
    recoilPattern: RECOIL_HEAVY,
    maxRange: 3.2,
  }),
  gg("gg_bubble", "Bubble Blaster", {
    damage: 14,
    headshotMultiplier: 2,
    magSize: 24,
    reloadMs: 2000,
    fireRate: 7,
    pellets: 2,
    spreadDeg: 2.2,
    recoilPattern: RECOIL_MID,
  }),
  gg("gg_disco", "Disco Shotgun", {
    damage: 12,
    headshotMultiplier: 1.4,
    magSize: 6,
    reloadMs: 2500,
    fireRate: 1.5,
    pellets: 10,
    spreadDeg: 4.8,
    recoilPattern: RECOIL_KICK,
  }),
  gg("gg_spoon", "Rail Bent Spoon", {
    damage: 78,
    headshotMultiplier: 2.2,
    magSize: 5,
    reloadMs: 3000,
    fireRate: 0.9,
    pellets: 1,
    spreadDeg: 0.02,
    recoilPattern: RECOIL_HEAVY,
    scopeStyle: "sniper",
    adsFov: 20,
    adsSensMult: 0.4,
    adsSpreadMult: 0,
  }),
  gg("gg_soaker", "Super Soaker", {
    damage: 9,
    headshotMultiplier: 1.3,
    magSize: 80,
    reloadMs: 2800,
    fireRate: 18,
    pellets: 1,
    spreadDeg: 1.4,
    recoilPattern: RECOIL_SPAM,
  }),
  gg("gg_accordion", "Accordion Shotty", {
    damage: 10,
    headshotMultiplier: 1.35,
    magSize: 5,
    reloadMs: 2700,
    fireRate: 1.25,
    pellets: 14,
    spreadDeg: 8,
    recoilPattern: RECOIL_HEAVY,
  }),
  gg("gg_shrink", "Shrink Ray", {
    damage: 16,
    headshotMultiplier: 2.5,
    magSize: 20,
    reloadMs: 2100,
    fireRate: 5.5,
    pellets: 1,
    spreadDeg: 0.08,
    recoilPattern: RECOIL_MID,
    scopeStyle: "optic",
    adsFov: 40,
  }),
  gg("gg_thunder", "Pocket Thunder", {
    damage: 42,
    headshotMultiplier: 1.8,
    magSize: 7,
    reloadMs: 2300,
    fireRate: 2.8,
    pellets: 1,
    spreadDeg: 0.25,
    recoilPattern: RECOIL_KICK,
  }),
  gg("gg_flappy", "Flappy Burst", {
    damage: 19,
    headshotMultiplier: 1.7,
    magSize: 3,
    reloadMs: 1600,
    fireRate: 8,
    pellets: 3,
    spreadDeg: 1.6,
    recoilPattern: RECOIL_SPAM,
  }),
  gg("gg_hammer", "Gravity Hammer", {
    damage: 110,
    headshotMultiplier: 1.2,
    magSize: 2,
    reloadMs: 3200,
    fireRate: 0.7,
    pellets: 1,
    spreadDeg: 0.5,
    recoilPattern: RECOIL_HEAVY,
    maxRange: 5.5,
  }),
  gg("gg_pointer", "Laser Pointer of Doom", {
    damage: 48,
    headshotMultiplier: 3,
    magSize: 12,
    reloadMs: 2000,
    fireRate: 3.5,
    pellets: 1,
    spreadDeg: 0,
    recoilPattern: [[1.2, 0]],
    scopeStyle: "optic",
    adsFov: 35,
    adsSensMult: 0.5,
    adsSpreadMult: 0,
  }),
  gg("gg_banana_peel", "Banana Peel SMG", {
    damage: 15,
    headshotMultiplier: 1.6,
    magSize: 45,
    reloadMs: 1700,
    fireRate: 12,
    pellets: 1,
    spreadDeg: 0.55,
    recoilPattern: RECOIL_SPAM,
  }),
  gg("gg_ban", "Ban Hammer", {
    damage: 95,
    headshotMultiplier: 1.5,
    magSize: 3,
    reloadMs: 2900,
    fireRate: 1.1,
    pellets: 1,
    spreadDeg: 0.3,
    recoilPattern: RECOIL_HEAVY,
    maxRange: 6,
  }),
  gg("gg_golden", "Golden Banana", {
    damage: 70,
    headshotMultiplier: 2,
    magSize: 1,
    reloadMs: 1500,
    fireRate: 1.4,
    pellets: 1,
    spreadDeg: 0.05,
    recoilPattern: RECOIL_KICK,
    scopeStyle: "optic",
    adsFov: 45,
  }),
];

export function gunGameWeapon(level: number): WeaponDef {
  const i = Math.max(0, Math.min(GUN_GAME_LENGTH - 1, Math.floor(level)));
  return GUN_GAME_LADDER[i]!;
}

export function gunGameWeaponName(level: number): string {
  return gunGameWeapon(level).name;
}

export function isGunGameComplete(level: number): boolean {
  return level >= GUN_GAME_LENGTH;
}
