import { MOVE } from "./constants.js";
import type { AbilityDef, AbilityKind } from "./abilities.js";
import { ABILITIES } from "./abilities.js";

export type WeaponId =
  | "cryo_needle"
  | "ember_burst"
  | "shade_carbine"
  | "coil_scatter";

export type WeaponDef = {
  id: string;
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
  /** Optional hitscan range clamp (meters). */
  maxRange?: number;
  /**
   * Melee / blast: also hits any enemy in a forward cone within maxRange
   * (dot product threshold vs look direction).
   */
  meleeCone?: number;
  /** Visual identity for tracers, muzzle, viewmodel. */
  fx?: WeaponFx;
};

export type WeaponShape =
  | "rifle"
  | "smg"
  | "shotgun"
  | "sniper"
  | "pistol"
  | "melee"
  | "cannon"
  | "weird";

export type TracerStyle = "line" | "thick" | "dots" | "beam" | "arc";

export type WeaponFx = {
  primary: number;
  accent: number;
  tracer: number;
  muzzle: number;
  shape: WeaponShape;
  tracerStyle: TracerStyle;
  tracerLife: number;
  kickScale: number;
  fovKickScale: number;
  flashScale: number;
  impactScale: number;
};

export type ClassId =
  | "frostbinder"
  | "emberkin"
  | "nullshade"
  | "galvanaut";

export type ClassDef = {
  id: ClassId;
  name: string;
  tagline: string;
  description: string;
  weapon: WeaponDef;
  /** Multiplier on MOVE.MAX_SPEED. */
  speedMult: number;
  accent: number;
  ability1: AbilityDef;
  ability2: AbilityDef;
};

const NEEDLE_RECOIL: readonly [number, number][] = [
  [0.28, 0.0],
  [0.32, 0.05],
  [0.36, -0.06],
  [0.4, 0.08],
  [0.44, -0.09],
  [0.48, 0.07],
  [0.52, -0.1],
  [0.55, 0.09],
];

const EMBER_RECOIL: readonly [number, number][] = [
  [0.22, 0.1],
  [0.26, -0.12],
  [0.28, 0.14],
  [0.3, -0.11],
  [0.32, 0.13],
  [0.34, -0.15],
  [0.36, 0.12],
  [0.38, -0.1],
];

const SHADE_RECOIL: readonly [number, number][] = [
  [0.4, 0.04],
  [0.48, -0.06],
  [0.55, 0.08],
  [0.6, -0.1],
  [0.65, 0.07],
];

const COIL_RECOIL: readonly [number, number][] = [
  [1.9, 0.12],
  [2.1, -0.16],
  [2.2, 0.1],
];

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  cryo_needle: {
    id: "cryo_needle",
    name: "Cryo Needle",
    damage: 20,
    headshotMultiplier: 2,
    magSize: 28,
    reloadMs: 2400,
    fireRate: 9.5,
    pellets: 1,
    spreadDeg: 0.12,
    adsSpreadMult: 0.2,
    adsFov: 52,
    adsSensMult: 0.68,
    scopeStyle: "optic",
    recoilPattern: NEEDLE_RECOIL,
    fx: {
      primary: 0x7ec8e3,
      accent: 0xd6f3ff,
      tracer: 0xa8e7ff,
      muzzle: 0xe8f7ff,
      shape: "rifle",
      tracerStyle: "beam",
      tracerLife: 0.1,
      kickScale: 0.9,
      fovKickScale: 0.85,
      flashScale: 0.9,
      impactScale: 1,
    },
  },
  ember_burst: {
    id: "ember_burst",
    name: "Ember Burst",
    damage: 13,
    headshotMultiplier: 1.7,
    magSize: 36,
    reloadMs: 2000,
    fireRate: 13.5,
    pellets: 1,
    spreadDeg: 0.5,
    adsSpreadMult: 0.4,
    adsFov: 58,
    adsSensMult: 0.75,
    scopeStyle: "iron",
    recoilPattern: EMBER_RECOIL,
    fx: {
      primary: 0xe07a3a,
      accent: 0x5c2a12,
      tracer: 0xff8c42,
      muzzle: 0xffc98b,
      shape: "smg",
      tracerStyle: "dots",
      tracerLife: 0.08,
      kickScale: 0.7,
      fovKickScale: 0.65,
      flashScale: 1.1,
      impactScale: 1,
    },
  },
  shade_carbine: {
    id: "shade_carbine",
    name: "Shade Carbine",
    damage: 26,
    headshotMultiplier: 2.1,
    magSize: 18,
    reloadMs: 2300,
    fireRate: 6.5,
    pellets: 1,
    spreadDeg: 0.1,
    adsSpreadMult: 0.15,
    adsFov: 42,
    adsSensMult: 0.55,
    scopeStyle: "optic",
    recoilPattern: SHADE_RECOIL,
    fx: {
      primary: 0x8b6bc7,
      accent: 0x2a1f3d,
      tracer: 0xc9a7ff,
      muzzle: 0xe6d6ff,
      shape: "rifle",
      tracerStyle: "line",
      tracerLife: 0.09,
      kickScale: 1.05,
      fovKickScale: 1,
      flashScale: 0.85,
      impactScale: 1.1,
    },
  },
  coil_scatter: {
    id: "coil_scatter",
    name: "Coil Scatter",
    damage: 15,
    headshotMultiplier: 1.45,
    magSize: 7,
    reloadMs: 2700,
    fireRate: 1.4,
    pellets: 6,
    spreadDeg: 2.6,
    adsSpreadMult: 0.5,
    adsFov: 60,
    adsSensMult: 0.8,
    scopeStyle: "iron",
    recoilPattern: COIL_RECOIL,
    fx: {
      primary: 0x5ec4ff,
      accent: 0x1a3344,
      tracer: 0x9ef0ff,
      muzzle: 0xd9f8ff,
      shape: "shotgun",
      tracerStyle: "dots",
      tracerLife: 0.1,
      kickScale: 1.5,
      fovKickScale: 1.4,
      flashScale: 1.3,
      impactScale: 1.2,
    },
  },
};

export const CLASSES: Record<ClassId, ClassDef> = {
  frostbinder: {
    id: "frostbinder",
    name: "Frostbinder",
    tagline: "Winter writes the floorplans",
    description:
      "Lay freezing runes and ice highways. Control space, then pin anyone who crosses your trap lines.",
    weapon: WEAPONS.cryo_needle,
    speedMult: 1.0,
    accent: 0x7ec8e3,
    ability1: ABILITIES.ice_path,
    ability2: ABILITIES.frost_trap,
  },
  emberkin: {
    id: "emberkin",
    name: "Emberkin",
    tagline: "Run hot, leave ashes",
    description:
      "A living cinder. Dash through lines of fire and plant lasting ember nests that cook campers out of cover.",
    weapon: WEAPONS.ember_burst,
    speedMult: 1.1,
    accent: 0xe07a3a,
    ability1: ABILITIES.scorch_dash,
    ability2: ABILITIES.ember_nest,
  },
  nullshade: {
    id: "nullshade",
    name: "Nullshade",
    tagline: "Gone between heartbeats",
    description:
      "Slip through seams in reality. Blink past angles and vanish into a veil when the push turns sour.",
    weapon: WEAPONS.shade_carbine,
    speedMult: 1.06,
    accent: 0x8b6bc7,
    ability1: ABILITIES.phase_step,
    ability2: ABILITIES.veil,
  },
  galvanaut: {
    id: "galvanaut",
    name: "Galvanaut",
    tagline: "Charge the room",
    description:
      "Arc artillery on legs. Chain-zap clustered foes and drop storm anchors that launch allies — or fry intruders.",
    weapon: WEAPONS.coil_scatter,
    speedMult: 0.97,
    accent: 0x5ec4ff,
    ability1: ABILITIES.arc_surge,
    ability2: ABILITIES.storm_anchor,
  },
};

export const CLASS_LIST: ClassDef[] = [
  CLASSES.frostbinder,
  CLASSES.emberkin,
  CLASSES.nullshade,
  CLASSES.galvanaut,
];

export const DEFAULT_CLASS_ID: ClassId = "frostbinder";

/** Mid-match swap cooldown (ms). */
export const CLASS_CHANGE_COOLDOWN_MS = 12_000;

export function isClassId(v: unknown): v is ClassId {
  return typeof v === "string" && v in CLASSES;
}

export function getClass(id: ClassId): ClassDef {
  return CLASSES[id] ?? CLASSES[DEFAULT_CLASS_ID];
}

export function classMaxSpeed(id: ClassId): number {
  return MOVE.MAX_SPEED * getClass(id).speedMult;
}

export function abilityOf(id: ClassId, slot: 1 | 2): AbilityDef {
  const cls = getClass(id);
  return slot === 1 ? cls.ability1 : cls.ability2;
}

export function isAbilityKind(v: unknown): v is AbilityKind {
  return typeof v === "string" && v in ABILITIES;
}

export function getWeaponById(id: string): WeaponDef | null {
  if (id in WEAPONS) return WEAPONS[id as WeaponId];
  return null;
}

/** @deprecated */
export const RIFLE = WEAPONS.cryo_needle;
