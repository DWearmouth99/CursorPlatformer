import {
  buttonsToBits,
  eyePosition,
  gunGameWeapon,
  type InputCmd,
  type PlayerMoveState,
  type WeaponDef,
} from "@fps/shared";

export type BotActor = {
  id: string;
  isBot: boolean;
  alive: boolean;
  ammo: number;
  reloading: boolean;
  gunLevel: number;
  state: PlayerMoveState;
  lean: number;
  inputQueue: InputCmd[];
};

type BotMind = {
  nextSeq: number;
  fireCooldownTicks: number;
  stuckTicks: number;
  lastX: number;
  lastZ: number;
  strafeSign: number;
  strafeUntilTick: number;
  /** Smoothed look angles — bots turn slowly. */
  lookYaw: number;
  lookPitch: number;
  /** Ticks before they'll shoot a freshly acquired target. */
  acquireTicks: number;
  targetId: string | null;
};

const minds = new Map<string, BotMind>();

/** Max turn rate (rad/tick) — keeps aim from snapping. */
const TURN_YAW = 0.045;
const TURN_PITCH = 0.03;

function mindOf(id: string, state: PlayerMoveState): BotMind {
  let m = minds.get(id);
  if (!m) {
    m = {
      nextSeq: 1,
      fireCooldownTicks: 20 + Math.floor(Math.random() * 30),
      stuckTicks: 0,
      lastX: state.position.x,
      lastZ: state.position.z,
      strafeSign: Math.random() < 0.5 ? -1 : 1,
      strafeUntilTick: 0,
      lookYaw: state.yaw,
      lookPitch: state.pitch,
      acquireTicks: 0,
      targetId: null,
    };
    minds.set(id, m);
  }
  return m;
}

export function forgetBotMind(id: string): void {
  minds.delete(id);
}

function clampPitch(p: number): number {
  const lim = Math.PI / 2 - 0.08;
  return Math.max(-lim, Math.min(lim, p));
}

function aimAt(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
): { yaw: number; pitch: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const horiz = Math.hypot(dx, dz) || 1e-6;
  return {
    yaw: Math.atan2(-dx, -dz),
    pitch: clampPitch(Math.atan2(dy, horiz)),
  };
}

function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function turnToward(from: number, to: number, maxStep: number): number {
  const d = angleDelta(from, to);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}

function pickTarget(
  bot: BotActor,
  others: readonly BotActor[],
): BotActor | null {
  let bestHuman: BotActor | null = null;
  let bestHumanD = Infinity;
  let bestAny: BotActor | null = null;
  let bestAnyD = Infinity;

  const bx = bot.state.position.x;
  const bz = bot.state.position.z;

  for (const o of others) {
    if (!o.alive || o.id === bot.id) continue;
    const d =
      (o.state.position.x - bx) * (o.state.position.x - bx) +
      (o.state.position.z - bz) * (o.state.position.z - bz);
    // Ignore far humans so spawn isn't an instant death cone
    const maxChase = o.isBot ? 55 : 32;
    if (Math.sqrt(d) > maxChase) continue;

    if (!o.isBot && d < bestHumanD) {
      bestHumanD = d;
      bestHuman = o;
    }
    if (d < bestAnyD) {
      bestAnyD = d;
      bestAny = o;
    }
  }
  // Often duel other bots instead of dogpiling the player
  if (bestHuman && bestAny && bestAny.isBot && Math.random() < 0.55) {
    return bestAny;
  }
  return bestHuman ?? bestAny;
}

/**
 * Push one InputCmd for this bot onto its queue (same path as humans).
 * Intentionally imperfect: slow turns, miss bias, no sprint rush.
 */
export function thinkBot(
  bot: BotActor,
  others: readonly BotActor[],
  tick: number,
): void {
  if (!bot.alive) return;

  const mind = mindOf(bot.id, bot.state);
  const weapon: WeaponDef = gunGameWeapon(bot.gunLevel);
  const target = pickTarget(bot, others);

  const eye = eyePosition(
    bot.state.position,
    bot.state.crouching,
    mind.lookYaw,
    bot.lean,
  );

  let dist = 999;

  if (target) {
    if (mind.targetId !== target.id) {
      mind.targetId = target.id;
      mind.acquireTicks = 25 + Math.floor(Math.random() * 35); // ~0.4–1s
    }
    if (mind.acquireTicks > 0) mind.acquireTicks -= 1;

    const tEye = eyePosition(
      target.state.position,
      target.state.crouching,
      target.state.yaw,
      0,
    );
    dist = Math.hypot(
      target.state.position.x - bot.state.position.x,
      target.state.position.z - bot.state.position.z,
    );

    // Miss budget grows with range; also random height drift (legs / overshoot)
    const missScale = 0.9 + dist * 0.08;
    const desired = aimAt(eye, {
      x: tEye.x + (Math.random() - 0.5) * missScale,
      y: tEye.y + (Math.random() - 0.55) * (0.6 + missScale * 0.25),
      z: tEye.z + (Math.random() - 0.5) * missScale,
    });

    mind.lookYaw = turnToward(mind.lookYaw, desired.yaw, TURN_YAW);
    mind.lookPitch = clampPitch(
      turnToward(mind.lookPitch, desired.pitch, TURN_PITCH),
    );
  } else {
    mind.targetId = null;
    mind.acquireTicks = 0;
    mind.lookYaw += 0.015;
  }

  const moved = Math.hypot(
    bot.state.position.x - mind.lastX,
    bot.state.position.z - mind.lastZ,
  );
  if (moved < 0.02 && bot.state.grounded) mind.stuckTicks += 1;
  else mind.stuckTicks = 0;
  mind.lastX = bot.state.position.x;
  mind.lastZ = bot.state.position.z;

  if (tick >= mind.strafeUntilTick) {
    mind.strafeSign = Math.random() < 0.5 ? -1 : 1;
    mind.strafeUntilTick = tick + 35 + Math.floor(Math.random() * 55);
  }

  if (mind.fireCooldownTicks > 0) mind.fireCooldownTicks -= 1;

  const melee = weapon.meleeCone != null;
  const engageDist = melee ? 3.8 : 18;
  const closeDist = melee ? 2.4 : 10;

  let forward = false;
  let back = false;
  let left = false;
  let right = false;
  let jump = false;
  let fire = false;
  let reload = false;

  if (target) {
    // Walk — no sprint (bots were too fast)
    if (dist > closeDist) {
      forward = Math.random() < 0.85;
    } else if (dist < (melee ? 1.5 : 6) && !melee) {
      back = Math.random() < 0.45;
      forward = false;
    }

    if (dist < engageDist + 4 && dist > 2.5) {
      if (mind.strafeSign < 0) left = true;
      else right = true;
    }

    const ready =
      mind.acquireTicks <= 0 &&
      dist < engageDist &&
      bot.ammo > 0 &&
      !bot.reloading &&
      mind.fireCooldownTicks <= 0;

    if (ready) {
      // Hesitate — often hold fire even when "ready"
      if (Math.random() < (melee ? 0.55 : 0.38)) {
        fire = true;
        const cool = weapon.semiAuto || melee
          ? 18 + Math.floor(Math.random() * 22)
          : 6 + Math.floor(Math.random() * 10);
        mind.fireCooldownTicks = cool;
      } else {
        mind.fireCooldownTicks = 8 + Math.floor(Math.random() * 12);
      }
    }
  } else {
    forward = Math.random() < 0.25;
    if (mind.strafeSign < 0) left = true;
    else right = true;
  }

  if (mind.stuckTicks > 24) {
    jump = true;
    forward = true;
    mind.stuckTicks = 0;
  } else if (Math.random() < 0.002) {
    jump = true;
  }

  if (bot.ammo <= 0 && !bot.reloading) reload = true;

  const cmd: InputCmd = {
    type: "input",
    seq: mind.nextSeq++,
    buttons: buttonsToBits({
      forward,
      back,
      left,
      right,
      jump,
      crouch: false,
      sprint: false,
      fire,
      reload,
      ads: false,
      ability1: false,
      ability2: false,
    }),
    yaw: mind.lookYaw,
    pitch: mind.lookPitch,
    lean: 0,
  };
  bot.inputQueue.push(cmd);
}
