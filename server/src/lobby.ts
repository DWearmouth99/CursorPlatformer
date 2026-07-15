import { WebSocket } from "ws";
import {
  CLASS_CHANGE_COOLDOWN_MS,
  GUN_GAME_LENGTH,
  MAX_HP,
  RESPAWN_MS,
  TICK_DT,
  TICK_MS,
  TICK_RATE,
  TEAM,
  applyMovement,
  bitsToButtons,
  buttonsToBits,
  clonePoses,
  createMoveState,
  emptyStatus,
  eyePosition,
  getClass,
  getPlayerPoseAtTime,
  gunGameWeapon,
  isClassId,
  lagCompRewindTicks,
  pickFfaSpawn,
  pickSpawn,
  serverHitscan,
  spreadAngles,
  type AABB,
  type ClassId,
  type ClientMsg,
  type GameMode,
  type InputCmd,
  type PlayerMoveState,
  type PlayerStatus,
  type PoseHistoryFrame,
  type ServerMsg,
  type SnapshotPlayer,
  type Team,
  type WeaponDef,
} from "@fps/shared";
import { cdRemainingMs, createAbilityRuntime } from "./abilities.js";

const RESPAWN_TICKS = Math.round((RESPAWN_MS / 1000) * TICK_RATE);
const CLASS_CHANGE_TICKS = Math.round(
  (CLASS_CHANGE_COOLDOWN_MS / 1000) * TICK_RATE,
);
const INPUT_QUEUE_MAX = 12;
const HISTORY_MAX = Math.ceil(350 / TICK_MS);

export type NetPlayer = {
  id: string;
  team: Team;
  classId: ClassId;
  ws: WebSocket;
  state: PlayerMoveState;
  hp: number;
  alive: boolean;
  ammo: number;
  reloading: boolean;
  reloadDoneTick: number;
  lastFireTick: number;
  sprayIndex: number;
  fireHeld: boolean;
  reloadHeld: boolean;
  kills: number;
  deaths: number;
  respawnTick: number;
  lastProcessedSeq: number;
  inputQueue: InputCmd[];
  lastButtons: number;
  lean: number;
  status: PlayerStatus;
  ab1ReadyTick: number;
  ab2ReadyTick: number;
  ability1Held: boolean;
  ability2Held: boolean;
  lastClassChangeTick: number;
  gunLevel: number;
};

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export type Lobby = {
  mode: GameMode;
  players: Map<string, NetPlayer>;
  tickOnce: () => void;
  spawnPlayer: (ws: WebSocket, classId: ClassId) => NetPlayer;
  handleMessage: (player: NetPlayer, msg: ClientMsg) => void;
  findByWs: (ws: WebSocket) => NetPlayer | null;
  removeByWs: (ws: WebSocket) => void;
};

export function createLobby(
  mode: GameMode,
  solids: readonly AABB[],
  allocId: () => string,
): Lobby {
  const players = new Map<string, NetPlayer>();
  const poseHistory: PoseHistoryFrame[] = [];
  const abilityRt =
    mode === "ability" ? createAbilityRuntime(() => solids) : null;
  let tick = 0;
  let gunGameWinnerId: string | null = null;

  function broadcast(msg: ServerMsg, exceptId?: string): void {
    const raw = JSON.stringify(msg);
    for (const p of players.values()) {
      if (exceptId && p.id === exceptId) continue;
      if (p.ws.readyState === WebSocket.OPEN) p.ws.send(raw);
    }
  }

  function weaponOf(p: NetPlayer): WeaponDef {
    if (mode === "gun_game") return gunGameWeapon(p.gunLevel);
    return getClass(p.classId).weapon;
  }

  function speedOf(p: NetPlayer) {
    const base = mode === "gun_game" ? 1.05 : getClass(p.classId).speedMult;
    return base * (p.status.moveMult || 1);
  }

  function toSnapshot(p: NetPlayer): SnapshotPlayer {
    const w = weaponOf(p);
    return {
      id: p.id,
      team: p.team,
      classId: p.classId,
      position: {
        x: p.state.position.x,
        y: p.state.position.y,
        z: p.state.position.z,
      },
      velocity: {
        x: p.state.velocity.x,
        y: p.state.velocity.y,
        z: p.state.velocity.z,
      },
      yaw: p.state.yaw,
      pitch: p.state.pitch,
      lean: p.lean,
      crouching: p.state.crouching,
      grounded: p.state.grounded,
      jumpHeld: p.state.jumpHeld,
      hp: p.hp,
      alive: p.alive,
      ammo: p.ammo,
      magSize: w.magSize,
      reloading: p.reloading,
      kills: p.kills,
      deaths: p.deaths,
      ab1CdMs: cdRemainingMs(p.ab1ReadyTick, tick),
      ab2CdMs: cdRemainingMs(p.ab2ReadyTick, tick),
      status: { ...p.status },
      gunLevel: p.gunLevel,
      weaponName: w.name,
    };
  }

  function pickTeam(): Team {
    const tCount = [...players.values()].filter((p) => p.team === TEAM.T)
      .length;
    const ctCount = [...players.values()].filter((p) => p.team === TEAM.CT)
      .length;
    return tCount <= ctCount ? TEAM.T : TEAM.CT;
  }

  function enemyPositions(forTeam: Team) {
    return [...players.values()]
      .filter((p) => p.alive && p.team !== forTeam)
      .map((p) => ({
        x: p.state.position.x,
        y: p.state.position.y,
        z: p.state.position.z,
      }));
  }

  function allAlivePositions(exceptId?: string) {
    return [...players.values()]
      .filter((p) => p.alive && p.id !== exceptId)
      .map((p) => ({
        x: p.state.position.x,
        y: p.state.position.y,
        z: p.state.position.z,
      }));
  }

  function assignSpawn(team: Team, playerId?: string): PlayerMoveState {
    if (mode === "gun_game") {
      const spawn = pickFfaSpawn(allAlivePositions(playerId), 22);
      return createMoveState(
        spawn.position.x,
        spawn.position.y,
        spawn.position.z,
        spawn.yaw,
      );
    }
    const spawn = pickSpawn(team, enemyPositions(team), 24);
    return createMoveState(
      spawn.position.x,
      spawn.position.y,
      spawn.position.z,
      spawn.yaw,
    );
  }

  function currentPoses() {
    return [...players.values()].map((p) => ({
      id: p.id,
      position: p.state.position,
      crouching: p.state.crouching,
      alive: p.alive,
    }));
  }

  function onGunGameKill(shooter: NetPlayer): void {
    if (mode !== "gun_game" || gunGameWinnerId) return;
    if (shooter.gunLevel >= GUN_GAME_LENGTH - 1) {
      gunGameWinnerId = shooter.id;
      broadcast({ type: "gunGameWin", playerId: shooter.id });
      console.log(`[lobby:${mode}] winner ${shooter.id}`);
      return;
    }
    shooter.gunLevel += 1;
    const w = gunGameWeapon(shooter.gunLevel);
    shooter.ammo = w.magSize;
    shooter.reloading = false;
    shooter.sprayIndex = 0;
    broadcast({
      type: "gunAdvance",
      playerId: shooter.id,
      gunLevel: shooter.gunLevel,
      weaponName: w.name,
    });
    console.log(
      `[lobby:${mode}] ${shooter.id} advanced → ${shooter.gunLevel + 1} ${w.name}`,
    );
  }

  function applyRawDamage(
    attackerId: string,
    victim: NetPlayer,
    amount: number,
    headshot = false,
  ): void {
    if (!victim.alive || amount <= 0) return;
    victim.hp = Math.max(0, victim.hp - amount);
    send(victim.ws, {
      type: "damage",
      amount,
      hp: victim.hp,
      attackerId,
    });
    const shooter = players.get(attackerId);
    if (shooter && shooter.id !== victim.id) {
      send(shooter.ws, {
        type: "hitConfirm",
        targetId: victim.id,
        isHeadshot: headshot,
        damage: amount,
      });
    }
    if (victim.hp <= 0) {
      victim.alive = false;
      victim.deaths += 1;
      if (shooter) shooter.kills += 1;
      victim.respawnTick = tick + RESPAWN_TICKS;
      abilityRt?.resetStatus(victim);
      broadcast({
        type: "killFeed",
        killerId: attackerId,
        victimId: victim.id,
        isHeadshot: headshot,
      });
      if (shooter) onGunGameKill(shooter);
    }
  }

  function tryFire(shooter: NetPlayer): void {
    const weapon = weaponOf(shooter);
    const fireCooldown = Math.max(1, Math.round(TICK_RATE / weapon.fireRate));
    if (!shooter.alive || shooter.reloading) return;
    if (shooter.ammo <= 0) return;
    if (tick - shooter.lastFireTick < fireCooldown) return;

    shooter.lastFireTick = tick;
    shooter.ammo -= 1;
    shooter.sprayIndex = Math.min(
      shooter.sprayIndex + 1,
      weapon.recoilPattern.length - 1,
    );

    const baseYaw = shooter.state.yaw;
    const basePitch = shooter.state.pitch;
    const origin = eyePosition(
      shooter.state.position,
      shooter.state.crouching,
      baseYaw,
      shooter.lean,
    );
    const rewind = lagCompRewindTicks(TICK_MS);
    const poses = getPlayerPoseAtTime(
      tick - rewind,
      poseHistory,
      currentPoses(),
    );

    const ads = bitsToButtons(shooter.lastButtons).ads;
    const spread = weapon.spreadDeg * (ads ? weapon.adsSpreadMult : 1);

    let anyHit = false;
    let lastEnd = origin;
    const damageByTarget = new Map<string, { dmg: number; head: boolean }>();

    for (let pellet = 0; pellet < weapon.pellets; pellet++) {
      const aim = spreadAngles(
        baseYaw,
        basePitch,
        spread,
        tick * 17 + shooter.lastProcessedSeq * 13 + pellet * 91,
      );
      const { hit, end } = serverHitscan(
        origin,
        aim.yaw,
        aim.pitch,
        shooter.id,
        poses,
        solids,
        weapon.maxRange ?? 200,
      );
      lastEnd = end;
      if (!hit) continue;
      anyHit = true;
      const dmg = hit.isHeadshot
        ? weapon.damage * weapon.headshotMultiplier
        : weapon.damage;
      const prev = damageByTarget.get(hit.playerId);
      if (!prev) {
        damageByTarget.set(hit.playerId, { dmg, head: hit.isHeadshot });
      } else {
        prev.dmg += dmg;
        prev.head = prev.head || hit.isHeadshot;
      }
    }

    broadcast({
      type: "shot",
      shooterId: shooter.id,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      end: lastEnd,
      hitPlayer: anyHit,
    });

    for (const [victimId, info] of damageByTarget) {
      const victim = players.get(victimId);
      if (!victim || !victim.alive) continue;
      const damage = Math.round(info.dmg);
      victim.hp = Math.max(0, victim.hp - damage);

      send(shooter.ws, {
        type: "hitConfirm",
        targetId: victim.id,
        isHeadshot: info.head,
        damage,
      });
      send(victim.ws, {
        type: "damage",
        amount: damage,
        hp: victim.hp,
        attackerId: shooter.id,
      });

      if (victim.hp <= 0) {
        victim.alive = false;
        victim.deaths += 1;
        shooter.kills += 1;
        victim.respawnTick = tick + RESPAWN_TICKS;
        abilityRt?.resetStatus(victim);
        broadcast({
          type: "killFeed",
          killerId: shooter.id,
          victimId: victim.id,
          isHeadshot: info.head,
        });
        onGunGameKill(shooter);
      }
    }
  }

  function tryReload(p: NetPlayer): void {
    const weapon = weaponOf(p);
    if (!p.alive || p.reloading) return;
    if (p.ammo >= weapon.magSize) return;
    p.reloading = true;
    p.reloadDoneTick =
      tick + Math.round((weapon.reloadMs / 1000) * TICK_RATE);
    p.sprayIndex = 0;
  }

  function takeQueuedInput(p: NetPlayer): InputCmd | null {
    if (p.inputQueue.length === 0) return null;
    while (p.inputQueue.length > INPUT_QUEUE_MAX) {
      const old = p.inputQueue.shift()!;
      const next = p.inputQueue[0];
      if (!next) break;
      const ob = bitsToButtons(old.buttons);
      const nb = bitsToButtons(next.buttons);
      if (ob.jump) nb.jump = true;
      if (ob.fire) nb.fire = true;
      if (ob.reload) nb.reload = true;
      if (ob.ability1) nb.ability1 = true;
      if (ob.ability2) nb.ability2 = true;
      next.buttons = buttonsToBits(nb);
    }
    return p.inputQueue.shift()!;
  }

  function simulatePlayer(p: NetPlayer): void {
    const weapon = weaponOf(p);
    const cmd = takeQueuedInput(p);

    let buttons = bitsToButtons(p.lastButtons);
    if (cmd && cmd.seq > p.lastProcessedSeq) {
      p.lastProcessedSeq = cmd.seq;
      p.lastButtons = cmd.buttons;
      buttons = bitsToButtons(cmd.buttons);
      // Gun Game never accepts ability intents.
      if (mode === "gun_game") {
        buttons.ability1 = false;
        buttons.ability2 = false;
      }
      p.state.yaw = cmd.yaw;
      p.state.pitch = cmd.pitch;
      p.lean = Math.max(-1, Math.min(1, cmd.lean || 0));
    }

    if (!p.alive) {
      if (tick >= p.respawnTick) {
        p.state = assignSpawn(p.team, p.id);
        p.hp = MAX_HP;
        p.alive = true;
        p.ammo = weapon.magSize;
        p.reloading = false;
        p.sprayIndex = 0;
        p.fireHeld = false;
        p.reloadHeld = false;
        abilityRt?.resetStatus(p);
      }
      return;
    }

    if (p.reloading && tick >= p.reloadDoneTick) {
      p.reloading = false;
      p.ammo = weapon.magSize;
    }

    const frozen = tick < p.status.frozenUntil;
    const moveButtons = frozen
      ? {
          ...buttons,
          forward: false,
          back: false,
          left: false,
          right: false,
          jump: false,
        }
      : buttons;

    applyMovement(p.state, moveButtons, TICK_DT, solids, speedOf(p));

    if (mode === "ability" && abilityRt) {
      const others = [...players.values()];
      abilityRt.tryUseAbility(
        tick,
        p,
        1,
        buttons,
        others,
        (atk, vic, amt, hs) => {
          applyRawDamage(atk.id, vic as NetPlayer, amt, hs);
        },
      );
      abilityRt.tryUseAbility(
        tick,
        p,
        2,
        buttons,
        others,
        (atk, vic, amt, hs) => {
          applyRawDamage(atk.id, vic as NetPlayer, amt, hs);
        },
      );
    }

    const reloadEdge = buttons.reload && !p.reloadHeld;
    p.fireHeld = buttons.fire;
    p.reloadHeld = buttons.reload;

    if (!buttons.fire) p.sprayIndex = 0;

    if (reloadEdge) tryReload(p);
    if (buttons.fire && !p.reloading) {
      if (mode === "ability") abilityRt?.breakVeilOnFire(p, tick);
      tryFire(p);
    }
  }

  function tickOnce(): void {
    tick += 1;
    for (const p of players.values()) {
      simulatePlayer(p);
    }

    if (mode === "ability" && abilityRt) {
      abilityRt.tickWorld(
        tick,
        [...players.values()],
        (attackerId, victim, amount) => {
          if (attackerId === "burn") {
            applyRawDamage(victim.id, victim as NetPlayer, amount, false);
            return;
          }
          applyRawDamage(attackerId, victim as NetPlayer, amount, false);
        },
      );
      for (const fx of abilityRt.flushFx()) {
        broadcast({ type: "abilityFx", ...fx });
      }
    }

    poseHistory.push({ tick, poses: clonePoses(currentPoses()) });
    while (poseHistory.length > HISTORY_MAX) poseHistory.shift();

    const all = [...players.values()].map(toSnapshot);
    const props = mode === "ability" && abilityRt ? abilityRt.listProps() : [];
    for (const p of players.values()) {
      send(p.ws, {
        type: "snapshot",
        tick,
        ackSeq: p.lastProcessedSeq,
        players: all,
        props,
      });
    }
  }

  function changePlayerClass(p: NetPlayer, classId: ClassId): void {
    if (mode !== "ability") return;
    if (tick < p.lastClassChangeTick + CLASS_CHANGE_TICKS) return;
    const cls = getClass(classId);
    p.classId = cls.id;
    p.ammo = cls.weapon.magSize;
    p.reloading = false;
    p.sprayIndex = 0;
    p.lastClassChangeTick = tick;
    abilityRt?.resetStatus(p);
    broadcast({ type: "classChanged", playerId: p.id, classId: cls.id });
  }

  function spawnPlayer(ws: WebSocket, classId: ClassId): NetPlayer {
    const id = allocId();
    const team = pickTeam();
    const cls = getClass(classId);
    const starterAmmo =
      mode === "gun_game" ? gunGameWeapon(0).magSize : cls.weapon.magSize;
    const player: NetPlayer = {
      id,
      team,
      classId: cls.id,
      ws,
      state: assignSpawn(team, id),
      hp: MAX_HP,
      alive: true,
      ammo: starterAmmo,
      reloading: false,
      reloadDoneTick: 0,
      lastFireTick: -999,
      sprayIndex: 0,
      fireHeld: false,
      reloadHeld: false,
      kills: 0,
      deaths: 0,
      respawnTick: 0,
      lastProcessedSeq: 0,
      inputQueue: [],
      lastButtons: 0,
      lean: 0,
      status: emptyStatus(),
      ab1ReadyTick: 0,
      ab2ReadyTick: 0,
      ability1Held: false,
      ability2Held: false,
      lastClassChangeTick: -CLASS_CHANGE_TICKS,
      gunLevel: 0,
    };
    players.set(id, player);

    console.log(
      `[lobby:${mode}] join ${id} team=${team} class=${cls.id} players=${players.size}`,
    );

    send(ws, {
      type: "welcome",
      playerId: id,
      team,
      classId: cls.id,
      mode,
      tick,
      players: [...players.values()].map(toSnapshot),
      props: mode === "ability" && abilityRt ? abilityRt.listProps() : [],
    });
    broadcast({ type: "playerJoined", player: toSnapshot(player) }, id);
    return player;
  }

  function handleMessage(player: NetPlayer, msg: ClientMsg): void {
    if (msg.type === "changeClass") {
      if (!isClassId(msg.classId)) return;
      changePlayerClass(player, msg.classId);
      return;
    }
    if (msg.type !== "input") return;
    if (typeof msg.seq !== "number" || typeof msg.buttons !== "number") return;
    if (typeof msg.yaw !== "number" || typeof msg.pitch !== "number") return;
    if (msg.seq <= player.lastProcessedSeq) return;
    if (typeof msg.lean !== "number" || !Number.isFinite(msg.lean)) {
      msg.lean = 0;
    }
    const q = player.inputQueue;
    if (q.length > 0 && msg.seq <= q[q.length - 1]!.seq) return;
    q.push(msg);
  }

  function findByWs(ws: WebSocket): NetPlayer | null {
    for (const p of players.values()) {
      if (p.ws === ws) return p;
    }
    return null;
  }

  function removeByWs(ws: WebSocket): void {
    for (const [id, p] of players) {
      if (p.ws !== ws) continue;
      players.delete(id);
      broadcast({ type: "playerLeft", playerId: id });
      console.log(`[lobby:${mode}] leave ${id} players=${players.size}`);
      if (players.size === 0) {
        gunGameWinnerId = null;
      }
      return;
    }
  }

  return {
    mode,
    players,
    tickOnce,
    spawnPlayer,
    handleMessage,
    findByWs,
    removeByWs,
  };
}
