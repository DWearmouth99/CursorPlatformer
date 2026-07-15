/** Fixed simulation rate (Source-style multiplayer). */
export const TICK_RATE = 64;
export const TICK_MS = 1000 / TICK_RATE;
export const TICK_DT = 1 / TICK_RATE;

/** Render remotes this many ms behind latest snapshot (interpolation buffer). */
export const INTERP_DELAY_MS = 100;
/** Extra remote interp delay as a fraction of measured RTT. */
export const INTERP_RTT_FACTOR = 0.5;
/** Clamp for adaptive remote interpolation delay (ms). */
export const INTERP_DELAY_MIN_MS = 100;
export const INTERP_DELAY_MAX_MS = 280;

/** Soft reconcile: ignore tiny prediction error (meters). */
export const RECONCILE_THRESHOLD = 0.12;
/** Hard snap if error exceeds this. */
export const RECONCILE_SNAP = 2.5;
/** Base blend toward server pose on soft corrections (lower = less rubber-band). */
export const RECONCILE_BLEND = 0.18;
/** Max simulation ticks processed per animation frame. */
export const MAX_CLIENT_CATCHUP_TICKS = 8;
/** How many unacked predicted inputs to keep (covers ~1.25s at 64 Hz). */
export const PREDICT_PENDING_MAX = 80;

export const DEFAULT_WS_URL = "ws://localhost:3001";

/**
 * Browser helper: same-origin WSS in production (e.g. Render),
 * localhost:3001 when the Vite dev server is serving the page.
 */
export function resolveWsUrl(): string {
  if (typeof window === "undefined" || typeof location === "undefined") {
    return DEFAULT_WS_URL;
  }
  const { protocol, hostname, port, host } = location;
  const local =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]";
  if (local && (port === "5173" || port === "5174" || port === "")) {
    return DEFAULT_WS_URL;
  }
  const wsProto = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${host}`;
}

/** Lateral eye offset when fully leaned (meters). */
export const LEAN_LATERAL = 0.4;
/** Camera roll at full lean (radians). */
export const LEAN_ROLL = 0.16;

/** Player dimensions (meters). Standing height includes head. */
export const PLAYER_RADIUS = 0.4;
export const PLAYER_HEIGHT_STAND = 1.8;
export const PLAYER_HEIGHT_CROUCH = 1.1;
export const PLAYER_EYE_STAND = 1.62;
export const PLAYER_EYE_CROUCH = 0.95;

/**
 * Source-engine-inspired movement constants.
 * Tunable: adjust these to change feel without touching sim code.
 */
export const MOVE = {
  /** Max ground speed (standing). */
  MAX_SPEED: 8.5,
  /** Sprint speed multiplier (Shift). */
  SPRINT_SPEED_MULT: 1.55,
  /** Extra ground accel while sprinting (snappier take-off). */
  SPRINT_ACCEL_MULT: 1.35 as number,
  /** Seconds of continuous sprint before stamina empties. */
  STAMINA_SECONDS: 3 as number,
  /** Crouch speed multiplier. */
  CROUCH_SPEED_MULT: 0.45,
  /** Ground acceleration (sv_accelerate). */
  ACCELERATE: 12,
  /** Air acceleration (sv_airaccelerate) — higher = easier air strafe. */
  AIR_ACCELERATE: 12,
  /** Max wish speed contribution while airborne (Source air control clamp). */
  AIR_SPEED_CAP: 1.2,
  /** Ground friction (sv_friction). */
  FRICTION: 6,
  /** Speed below which friction stops you hard. */
  STOP_SPEED: 1.5,
  /** Upward velocity when jumping. */
  JUMP_VELOCITY: 7.2,
  /** Gravity (m/s²). */
  GRAVITY: 20,
  /** Max fall / clamp. */
  MAX_VELOCITY: 50,
} as const;

export const MAX_HP = 100;
export const RESPAWN_MS = 3000;

export const TEAM = {
  T: "T",
  CT: "CT",
} as const;

export type Team = (typeof TEAM)[keyof typeof TEAM];
