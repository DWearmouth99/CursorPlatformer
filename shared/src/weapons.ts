import { MOVE } from "./constants.js";

export type WeaponId = "rifle" | "smg" | "sniper" | "shotgun";

export type WeaponDef = {
  id: WeaponId;
  name: string;
  damage: number;
  headshotMultiplier: number;
  magSize: number;
  reloadMs: number;
  /** Shots per second. */
  fireRate: number;
  /** Extra pellets per shot (1 = single hitscan). */
  pellets: number;
  /** Cone half-angle in degrees for pellet spread (0 = perfectly accurate). */
  spreadDeg: number;
  /** Multiplier on spreadDeg while ADS. */
  adsSpreadMult: number;
  /** Camera FOV while aiming. */
  adsFov: number;
  /** Mouse sensitivity multiplier while ADS. */
  adsSensMult: number;
  /** Scope overlay style. */
  scopeStyle: "iron" | "optic" | "sniper";
  recoilPattern: readonly [number, number][];
};

export type ClassId = "rifleman" | "scout" | "sniper" | "breacher";

export type ClassDef = {
  id: ClassId;
  name: string;
  tagline: string;
  description: string;
  weapon: WeaponDef;
  /** Multiplier on MOVE.MAX_SPEED. */
  speedMult: number;
};

const RIFLE_RECOIL: readonly [number, number][] = [
  [0.35, 0.0],
  [0.4, 0.04],
  [0.45, -0.06],
  [0.5, 0.08],
  [0.55, -0.1],
  [0.58, 0.07],
  [0.62, -0.12],
  [0.65, 0.1],
  [0.7, -0.08],
  [0.72, 0.12],
  [0.75, -0.14],
  [0.78, 0.09],
  [0.8, -0.1],
  [0.82, 0.15],
  [0.85, -0.15],
];

const SMG_RECOIL: readonly [number, number][] = [
  [0.25, 0.08],
  [0.28, -0.1],
  [0.3, 0.12],
  [0.32, -0.14],
  [0.34, 0.1],
  [0.36, -0.12],
  [0.38, 0.15],
  [0.4, -0.1],
  [0.42, 0.12],
  [0.44, -0.15],
];

const SNIPER_RECOIL: readonly [number, number][] = [
  [1.8, 0.05],
  [2.0, -0.08],
  [2.1, 0.1],
];

const SHOTGUN_RECOIL: readonly [number, number][] = [
  [2.2, 0.15],
  [2.4, -0.2],
  [2.5, 0.1],
];

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  rifle: {
    id: "rifle",
    name: "Assault Rifle",
    damage: 22,
    headshotMultiplier: 2,
    magSize: 30,
    reloadMs: 2500,
    fireRate: 10,
    pellets: 1,
    spreadDeg: 0.15,
    adsSpreadMult: 0.25,
    adsFov: 55,
    adsSensMult: 0.7,
    scopeStyle: "iron",
    recoilPattern: RIFLE_RECOIL,
  },
  smg: {
    id: "smg",
    name: "SMG",
    damage: 14,
    headshotMultiplier: 1.75,
    magSize: 35,
    reloadMs: 2100,
    fireRate: 14,
    pellets: 1,
    spreadDeg: 0.45,
    adsSpreadMult: 0.35,
    adsFov: 58,
    adsSensMult: 0.75,
    scopeStyle: "iron",
    recoilPattern: SMG_RECOIL,
  },
  sniper: {
    id: "sniper",
    name: "Sniper Rifle",
    damage: 70,
    headshotMultiplier: 2,
    magSize: 10,
    reloadMs: 3200,
    fireRate: 1.15,
    pellets: 1,
    spreadDeg: 0.05,
    adsSpreadMult: 0,
    adsFov: 22,
    adsSensMult: 0.45,
    scopeStyle: "sniper",
    recoilPattern: SNIPER_RECOIL,
  },
  shotgun: {
    id: "shotgun",
    name: "Shotgun",
    damage: 16,
    headshotMultiplier: 1.5,
    magSize: 8,
    reloadMs: 2800,
    fireRate: 1.35,
    pellets: 7,
    spreadDeg: 3.2,
    adsSpreadMult: 0.55,
    adsFov: 60,
    adsSensMult: 0.8,
    scopeStyle: "optic",
    recoilPattern: SHOTGUN_RECOIL,
  },
};

export const CLASSES: Record<ClassId, ClassDef> = {
  rifleman: {
    id: "rifleman",
    name: "Rifleman",
    tagline: "Balanced mid-range",
    description: "Standard assault rifle. Reliable damage and spray control.",
    weapon: WEAPONS.rifle,
    speedMult: 1,
  },
  scout: {
    id: "scout",
    name: "Scout",
    tagline: "Fast & aggressive",
    description: "High rate-of-fire SMG. Move quicker, shred up close.",
    weapon: WEAPONS.smg,
    speedMult: 1.12,
  },
  sniper: {
    id: "sniper",
    name: "Sniper",
    tagline: "Long-range punishment",
    description: "Heavy bolt hits. Two body shots or one clean headshot.",
    weapon: WEAPONS.sniper,
    speedMult: 0.92,
  },
  breacher: {
    id: "breacher",
    name: "Breacher",
    tagline: "Close-quarters carnage",
    description: "Pump shotgun with pellet spread. Own the corners.",
    weapon: WEAPONS.shotgun,
    speedMult: 0.96,
  },
};

export const CLASS_LIST: ClassDef[] = [
  CLASSES.rifleman,
  CLASSES.scout,
  CLASSES.sniper,
  CLASSES.breacher,
];

export const DEFAULT_CLASS_ID: ClassId = "rifleman";

export function isClassId(v: unknown): v is ClassId {
  return typeof v === "string" && v in CLASSES;
}

export function getClass(id: ClassId): ClassDef {
  return CLASSES[id] ?? CLASSES[DEFAULT_CLASS_ID];
}

export function classMaxSpeed(id: ClassId): number {
  return MOVE.MAX_SPEED * getClass(id).speedMult;
}

/** @deprecated Use getClass(...).weapon — kept for older call sites. */
export const RIFLE = WEAPONS.rifle;
