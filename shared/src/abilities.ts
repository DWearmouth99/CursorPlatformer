import type { Team } from "./constants.js";
import type { Vec3 } from "./math.js";

export type AbilityKind =
  | "ice_path"
  | "frost_trap"
  | "scorch_dash"
  | "ember_nest"
  | "phase_step"
  | "veil"
  | "arc_surge"
  | "storm_anchor";

export type AbilityDef = {
  id: AbilityKind;
  name: string;
  /** Short HUD label. */
  keyHint: string;
  cooldownMs: number;
  durationMs: number;
  description: string;
};

export const ABILITIES: Record<AbilityKind, AbilityDef> = {
  ice_path: {
    id: "ice_path",
    name: "Ice Path",
    keyHint: "1",
    cooldownMs: 9000,
    durationMs: 4500,
    description: "Leave a slick frost highway — you surge, foes skate.",
  },
  frost_trap: {
    id: "frost_trap",
    name: "Frost Trap",
    keyHint: "2",
    cooldownMs: 11000,
    durationMs: 14000,
    description: "Plant a rune. The next enemy who steps on it freezes solid.",
  },
  scorch_dash: {
    id: "scorch_dash",
    name: "Scorch Dash",
    keyHint: "1",
    cooldownMs: 7000,
    durationMs: 350,
    description: "Burst forward through fire. Burns anyone in the lane.",
  },
  ember_nest: {
    id: "ember_nest",
    name: "Ember Nest",
    keyHint: "2",
    cooldownMs: 12000,
    durationMs: 8000,
    description: "Drop a smoldering zone that cooks anyone lingering inside.",
  },
  phase_step: {
    id: "phase_step",
    name: "Phase Step",
    keyHint: "1",
    cooldownMs: 6500,
    durationMs: 0,
    description: "Blink a short distance along your look direction.",
  },
  veil: {
    id: "veil",
    name: "Veil",
    keyHint: "2",
    cooldownMs: 14000,
    durationMs: 2800,
    description: "Fade from sight. Breaks if you fire.",
  },
  arc_surge: {
    id: "arc_surge",
    name: "Arc Surge",
    keyHint: "1",
    cooldownMs: 8000,
    durationMs: 0,
    description: "Chain lightning to the nearest enemies in a cone.",
  },
  storm_anchor: {
    id: "storm_anchor",
    name: "Storm Anchor",
    keyHint: "2",
    cooldownMs: 13000,
    durationMs: 10000,
    description: "Drop a charged pad — allies launch up, enemies get jolted.",
  },
};

export type WorldPropKind =
  | "ice_patch"
  | "frost_trap"
  | "ember_nest"
  | "storm_anchor";

export type WorldProp = {
  id: string;
  kind: WorldPropKind;
  position: Vec3;
  radius: number;
  expiresTick: number;
  ownerId: string;
  team: Team;
};

export type PlayerStatus = {
  /** Rooted / can't move until tick. */
  frozenUntil: number;
  /** Soft invis — remotes fade until tick (or until fire). */
  veiledUntil: number;
  /** DoT ticking. */
  burningUntil: number;
  /** Leaving ice patches while active. */
  icePathUntil: number;
  /** Move speed multiplier from floors/status (1 = normal). */
  moveMult: number;
};

export function emptyStatus(): PlayerStatus {
  return {
    frozenUntil: 0,
    veiledUntil: 0,
    burningUntil: 0,
    icePathUntil: 0,
    moveMult: 1,
  };
}

export type AbilityFxKind =
  | "ice_path"
  | "frost_trap"
  | "frost_trigger"
  | "scorch_dash"
  | "ember_nest"
  | "phase_step"
  | "veil"
  | "arc_surge"
  | "storm_anchor"
  | "storm_launch";

export type AbilityFxEvent = {
  kind: AbilityFxKind;
  ownerId: string;
  origin: Vec3;
  end?: Vec3;
  targetIds?: string[];
};
