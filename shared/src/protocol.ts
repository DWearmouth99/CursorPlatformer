import type { Team } from "./constants.js";
import type { MoveButtons } from "./movement.js";
import type { Vec3 } from "./math.js";
import type { ClassId } from "./weapons.js";

export const BTN = {
  FORWARD: 1 << 0,
  BACK: 1 << 1,
  LEFT: 1 << 2,
  RIGHT: 1 << 3,
  JUMP: 1 << 4,
  CROUCH: 1 << 5,
  FIRE: 1 << 6,
  RELOAD: 1 << 7,
  ADS: 1 << 8,
} as const;

export type CombatButtons = MoveButtons & {
  fire: boolean;
  reload: boolean;
  ads: boolean;
};

export function buttonsToBits(b: CombatButtons): number {
  let bits = 0;
  if (b.forward) bits |= BTN.FORWARD;
  if (b.back) bits |= BTN.BACK;
  if (b.left) bits |= BTN.LEFT;
  if (b.right) bits |= BTN.RIGHT;
  if (b.jump) bits |= BTN.JUMP;
  if (b.crouch) bits |= BTN.CROUCH;
  if (b.fire) bits |= BTN.FIRE;
  if (b.reload) bits |= BTN.RELOAD;
  if (b.ads) bits |= BTN.ADS;
  return bits;
}

export function bitsToButtons(bits: number): CombatButtons {
  return {
    forward: (bits & BTN.FORWARD) !== 0,
    back: (bits & BTN.BACK) !== 0,
    left: (bits & BTN.LEFT) !== 0,
    right: (bits & BTN.RIGHT) !== 0,
    jump: (bits & BTN.JUMP) !== 0,
    crouch: (bits & BTN.CROUCH) !== 0,
    fire: (bits & BTN.FIRE) !== 0,
    reload: (bits & BTN.RELOAD) !== 0,
    ads: (bits & BTN.ADS) !== 0,
  };
}

/** Client → server: select class then enter the match. */
export type JoinMsg = {
  type: "join";
  classId: ClassId;
};

/** Client → server: wish input only (never positions or hit claims). */
export type InputCmd = {
  type: "input";
  seq: number;
  buttons: number;
  yaw: number;
  pitch: number;
  /** -1 left lean … +1 right lean. */
  lean: number;
};

export type SnapshotPlayer = {
  id: string;
  team: Team;
  classId: ClassId;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  lean: number;
  crouching: boolean;
  grounded: boolean;
  jumpHeld: boolean;
  hp: number;
  alive: boolean;
  ammo: number;
  magSize: number;
  reloading: boolean;
  kills: number;
  deaths: number;
};

export type WelcomeMsg = {
  type: "welcome";
  playerId: string;
  team: Team;
  classId: ClassId;
  tick: number;
  players: SnapshotPlayer[];
};

export type SnapshotMsg = {
  type: "snapshot";
  tick: number;
  ackSeq: number;
  players: SnapshotPlayer[];
};

export type PlayerJoinedMsg = {
  type: "playerJoined";
  player: SnapshotPlayer;
};

export type PlayerLeftMsg = {
  type: "playerLeft";
  playerId: string;
};

export type HitConfirmMsg = {
  type: "hitConfirm";
  targetId: string;
  isHeadshot: boolean;
  damage: number;
};

export type DamageMsg = {
  type: "damage";
  amount: number;
  hp: number;
  attackerId: string;
};

export type KillFeedMsg = {
  type: "killFeed";
  killerId: string;
  victimId: string;
  isHeadshot: boolean;
};

export type ShotMsg = {
  type: "shot";
  shooterId: string;
  origin: Vec3;
  end: Vec3;
  hitPlayer: boolean;
};

export type ServerMsg =
  | WelcomeMsg
  | SnapshotMsg
  | PlayerJoinedMsg
  | PlayerLeftMsg
  | HitConfirmMsg
  | DamageMsg
  | KillFeedMsg
  | ShotMsg;

export type ClientMsg = JoinMsg | InputCmd;

export function parseServerMsg(data: string): ServerMsg | null {
  try {
    const msg = JSON.parse(data) as ServerMsg;
    if (!msg || typeof msg !== "object" || !("type" in msg)) return null;
    return msg;
  } catch {
    return null;
  }
}
