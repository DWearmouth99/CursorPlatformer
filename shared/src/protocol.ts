import type { Team } from "./constants.js";
import type { MoveButtons } from "./movement.js";
import type { Vec3 } from "./math.js";
import type { ClassId } from "./weapons.js";
import type { AbilityFxEvent, PlayerStatus, WorldProp } from "./abilities.js";

export type GameMode = "gun_game" | "snipers_only" | "king_of_the_hill";

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
  ABILITY1: 1 << 9,
  ABILITY2: 1 << 10,
  SPRINT: 1 << 11,
} as const;

export type CombatButtons = MoveButtons & {
  fire: boolean;
  reload: boolean;
  ads: boolean;
  ability1: boolean;
  ability2: boolean;
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
  if (b.ability1) bits |= BTN.ABILITY1;
  if (b.ability2) bits |= BTN.ABILITY2;
  if (b.sprint) bits |= BTN.SPRINT;
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
    sprint: (bits & BTN.SPRINT) !== 0,
    fire: (bits & BTN.FIRE) !== 0,
    reload: (bits & BTN.RELOAD) !== 0,
    ads: (bits & BTN.ADS) !== 0,
    ability1: (bits & BTN.ABILITY1) !== 0,
    ability2: (bits & BTN.ABILITY2) !== 0,
  };
}

/** Client → server: join a lobby room. */
export type JoinMsg = {
  type: "join";
  mode?: GameMode;
  lobbyId?: string;
  password?: string;
  /** Bearer token from /api/auth/login or register. */
  token?: string;
  /** Required for guests; overrides account display name when set. */
  displayName?: string;
};

/** @deprecated Classes removed — ignored by server. */
export type ChangeClassMsg = {
  type: "changeClass";
  classId: ClassId;
};

/** Client → server: pick loadout weapon (Snipers / KOTH). */
export type SelectLoadoutMsg = {
  type: "selectLoadout";
  weaponId: string;
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
  /** Optional client-measured RTT for lag compensation (ms). */
  rttMs?: number;
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
  airJumpsLeft: number;
  hp: number;
  alive: boolean;
  ammo: number;
  magSize: number;
  reloading: boolean;
  kills: number;
  deaths: number;
  /** Ability cooldown remaining in ms (approx). */
  ab1CdMs: number;
  ab2CdMs: number;
  status: PlayerStatus;
  /** Gun Game ladder index 0..n. */
  gunLevel: number;
  /** Resolved weapon display name. */
  weaponName: string;
  /** Active weapon id (all modes). */
  weaponId: string;
  /** Mode score: sniper kills-to-win progress / KOTH hill points. */
  score: number;
  /** Account or guest display name. */
  displayName: string;
};

export type WelcomeMsg = {
  type: "welcome";
  playerId: string;
  team: Team;
  classId: ClassId;
  mode: GameMode;
  tick: number;
  players: SnapshotPlayer[];
  props: WorldProp[];
  lobbyId: string;
  lobbyName: string;
  mapId: string;
  /** Weapons the player may choose (Snipers / KOTH). */
  loadoutOptions?: Array<{ id: string; name: string; blurb: string }>;
  scoreToWin?: number;
  hill?: { x: number; y: number; z: number; radius: number };
};

export type SnapshotMsg = {
  type: "snapshot";
  tick: number;
  ackSeq: number;
  players: SnapshotPlayer[];
  props: WorldProp[];
  /** Live King of the Hill zone state. */
  hill?: {
    x: number;
    y: number;
    z: number;
    radius: number;
    controllerId: string | null;
    contested: boolean;
  };
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
  weaponId?: string;
};

export type AbilityFxMsg = {
  type: "abilityFx";
} & AbilityFxEvent;

export type ClassChangedMsg = {
  type: "classChanged";
  playerId: string;
  classId: ClassId;
};

export type GunAdvanceMsg = {
  type: "gunAdvance";
  playerId: string;
  gunLevel: number;
  weaponName: string;
};

export type GunGameWinMsg = {
  type: "gunGameWin";
  playerId: string;
};

export type MatchWinMsg = {
  type: "matchWin";
  playerId: string;
  mode: GameMode;
};

export type LoadoutChangedMsg = {
  type: "loadoutChanged";
  playerId: string;
  weaponId: string;
  weaponName: string;
};

export type ServerMsg =
  | WelcomeMsg
  | SnapshotMsg
  | PlayerJoinedMsg
  | PlayerLeftMsg
  | HitConfirmMsg
  | DamageMsg
  | KillFeedMsg
  | ShotMsg
  | AbilityFxMsg
  | ClassChangedMsg
  | GunAdvanceMsg
  | GunGameWinMsg
  | MatchWinMsg
  | LoadoutChangedMsg;

export type ClientMsg = JoinMsg | ChangeClassMsg | InputCmd | SelectLoadoutMsg;

export function isGameMode(v: unknown): v is GameMode {
  return (
    v === "gun_game" || v === "snipers_only" || v === "king_of_the_hill"
  );
}

export function parseServerMsg(data: string): ServerMsg | null {
  try {
    const msg = JSON.parse(data) as ServerMsg;
    if (!msg || typeof msg !== "object" || !("type" in msg)) return null;
    return msg;
  } catch {
    return null;
  }
}
