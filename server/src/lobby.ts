import { WebSocket } from "ws";
import {
  GUN_GAME_LENGTH,
  HILL_POSITIONS,
  HILL_ROTATE_POINTS,
  HILL_ROTATE_SEC,
  KOTH_POINTS_PER_SEC,
  MAX_HP,
  PLAYER_EYE_STAND,
  RESPAWN_MS,
  SPAWN_LOS_RANGE_M,
  SPAWN_PROTECT_MS,
  TICK_DT,
  TICK_MS,
  TICK_RATE,
  TEAM,
  applyMovement,
  bitsToButtons,
  buttonsToBits,
  clonePoses,
  createMoveState,
  damageFalloffMult,
  defaultWeaponForMode,
  emptyStatus,
  eyePosition,
  findLoadoutWeapon,
  getMapById,
  getPlayerPoseAtTime,
  gunGameWeapon,
  lagCompRewindTicks,
  lineBlockedBySolids,
  loadoutOptionsForMode,
  meleeConeHits,
  modeNeedsLoadout,
  modeTitle,
  pickFfaSpawnFrom,
  resolveFireStyle,
  scoreToWin,
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
  type SpawnZone,
  type Team,
  type WeaponDef,
} from "@fps/shared";
import { forgetBotMind, thinkBot } from "./bots.js";

const RESPAWN_TICKS = Math.round((RESPAWN_MS / 1000) * TICK_RATE);
const SPAWN_PROTECT_TICKS = Math.round((SPAWN_PROTECT_MS / 1000) * TICK_RATE);
const INPUT_QUEUE_MAX = 12;
const HISTORY_MAX = Math.ceil(350 / TICK_MS);
const DUMMY_CLASS: ClassId = "frostbinder";
/** Up to 3 filler bots; seats shrink as extra humans join. */
const BOT_SLOT_NAMES = ["Bot-1", "Bot-2", "Bot-3"] as const;
const KOTH_POINTS_PER_TICK = KOTH_POINTS_PER_SEC / TICK_RATE;
const HILL_ROTATE_TICKS = Math.round(HILL_ROTATE_SEC * TICK_RATE);

export type NetPlayer = {
  id: string;
  team: Team;
  classId: ClassId;
  /** Null for AI bots. */
  ws: WebSocket | null;
  isBot: boolean;
  accountId: string | null;
  displayName: string;
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
  gunLevel: number;
  /** Locked loadout weapon id (Snipers / KOTH). */
  weaponId: string;
  /** Mode score (sniper kill race / KOTH control points). */
  score: number;
  /** Client-reported RTT (ms) for lag-comp rewind. */
  smoothedRttMs: number;
  /** Shots left in current burst (procedural burst weapons). */
  burstRemaining: number;
  burstNextTick: number;
  /** Invulnerable until this tick (spawn protection). */
  spawnProtectedUntilTick: number;
};

function send(ws: WebSocket | null, msg: ServerMsg): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

export type Lobby = {
  mode: GameMode;
  players: Map<string, NetPlayer>;
  tickOnce: () => void;
  spawnPlayer: (ws: WebSocket, meta: JoinMeta) => NetPlayer;
  handleMessage: (player: NetPlayer, msg: ClientMsg) => void;
  findByWs: (ws: WebSocket) => NetPlayer | null;
  removeByWs: (ws: WebSocket) => void;
  /** Keep bot count filled for solo / small lobbies. */
  syncBots: () => void;
};

export type LobbyCreateOptions = {
  mode: GameMode;
  solids: readonly AABB[];
  spawns: readonly SpawnZone[];
  mapId: string;
  lobbyId: string;
  lobbyName: string;
  allocId: () => string;
  onMatchComplete?: (winnerId: string) => void;
  /** Called when the victory freeze ends — return next map to rotate into. */
  nextMap?: () => {
    mapId: string;
    solids: readonly AABB[];
    spawns: readonly SpawnZone[];
  } | null;
};

export type JoinMeta = {
  accountId: string | null;
  displayName: string;
};

export function createLobby(options: LobbyCreateOptions): Lobby {
  const {
    mode,
    lobbyId,
    lobbyName,
    allocId,
    onMatchComplete,
    nextMap,
  } = options;
  let solids = options.solids;
  let spawns = options.spawns;
  let mapId = options.mapId;
  const players = new Map<string, NetPlayer>();
  const poseHistory: PoseHistoryFrame[] = [];
  let tick = 0;
  let matchWinnerId: string | null = null;
  /** After a win, freeze combat until this tick, then reset. */
  let matchFreezeUntilTick = 0;
  const hill = { ...HILL_POSITIONS[0]! };
  let hillIndex = 0;
  let hillControllerId: string | null = null;
  let hillContested = false;
  let hillPointsAcc = 0;
  let hillSinceTick = 0;

  function starterWeapon(): WeaponDef {
    if (modeNeedsLoadout(mode)) {
      return defaultWeaponForMode(mode) ?? gunGameWeapon(0);
    }
    return gunGameWeapon(0);
  }

  function pickBotWeaponId(): string {
    const opts = loadoutOptionsForMode(mode);
    if (opts.length === 0) return gunGameWeapon(0).id;
    return opts[Math.floor(Math.random() * opts.length)]!.id;
  }

  function resetMatchRound(): void {
    matchWinnerId = null;
    matchFreezeUntilTick = 0;
    hillControllerId = null;
    hillContested = false;
    hillIndex = 0;
    hillPointsAcc = 0;
    hillSinceTick = tick;
    const home = HILL_POSITIONS[0]!;
    hill.x = home.x;
    hill.y = home.y;
    hill.z = home.z;
    hill.radius = home.radius;
    // Mark dead so spawn avoid ignores stale positions from the previous map/round
    for (const p of players.values()) {
      p.alive = false;
    }
    for (const p of players.values()) {
      p.gunLevel = 0;
      p.score = 0;
      if (modeNeedsLoadout(mode)) {
        p.weaponId = p.isBot ? pickBotWeaponId() : starterWeapon().id;
      } else {
        p.weaponId = gunGameWeapon(0).id;
      }
      const w = weaponOf(p);
      p.ammo = w.magSize;
      p.reloading = false;
      p.sprayIndex = 0;
      p.kills = 0;
      p.deaths = 0;
      p.hp = MAX_HP;
      p.alive = true;
      p.respawnTick = 0;
      p.status = emptyStatus();
      p.burstRemaining = 0;
      p.inputQueue.length = 0;
      p.state = assignSpawn(p.team, p.id);
      grantSpawnProtection(p);
    }
    console.log(`[lobby:${lobbyId}] new ${modeTitle(mode)} round on ${mapId}`);
    syncBots();
  }

  function rotateAndReset(): void {
    const next = nextMap?.() ?? null;
    if (next) {
      mapId = next.mapId;
      solids = next.solids;
      spawns = next.spawns;
      broadcast({
        type: "mapChange",
        mapId,
        mapName: getMapById(mapId)?.name,
      });
      console.log(`[lobby:${lobbyId}] map → ${mapId}`);
    }
    resetMatchRound();
  }

  function broadcast(msg: ServerMsg, exceptId?: string): void {
    const raw = JSON.stringify(msg);
    for (const p of players.values()) {
      if (exceptId && p.id === exceptId) continue;
      if (!p.ws || p.ws.readyState !== WebSocket.OPEN) continue;
      p.ws.send(raw);
    }
  }

  function humanCount(): number {
    let n = 0;
    for (const p of players.values()) if (!p.isBot) n += 1;
    return n;
  }

  function desiredBotCount(): number {
    const humans = humanCount();
    if (humans === 0) return 0;
    // Solo: 3 bots. Each extra human replaces one bot seat.
    return Math.min(3, Math.max(0, 4 - humans));
  }

  function makePlayer(
    id: string,
    team: Team,
    ws: WebSocket | null,
    isBot: boolean,
    displayName: string,
    accountId: string | null = null,
  ): NetPlayer {
    const weaponId = modeNeedsLoadout(mode)
      ? isBot
        ? pickBotWeaponId()
        : starterWeapon().id
      : gunGameWeapon(0).id;
    const starterAmmo = (
      modeNeedsLoadout(mode)
        ? findLoadoutWeapon(mode, weaponId) ?? starterWeapon()
        : gunGameWeapon(0)
    ).magSize;
    return {
      id,
      team,
      classId: DUMMY_CLASS,
      ws,
      isBot,
      accountId,
      displayName,
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
      gunLevel: 0,
      weaponId,
      score: 0,
      smoothedRttMs: 120,
      burstRemaining: 0,
      burstNextTick: 0,
      spawnProtectedUntilTick: tick + SPAWN_PROTECT_TICKS,
    };
  }

  function removeBot(id: string): void {
    const p = players.get(id);
    if (!p?.isBot) return;
    players.delete(id);
    forgetBotMind(id);
    broadcast({ type: "playerLeft", playerId: id });
    console.log(`[lobby:${lobbyId}] bot leave ${id} players=${players.size}`);
  }

  function spawnBot(id: string): NetPlayer {
    const team = pickTeam();
    const bot = makePlayer(id, team, null, true, id);
    players.set(id, bot);
    broadcast({ type: "playerJoined", player: toSnapshot(bot) });
    console.log(
      `[lobby:${lobbyId}] bot join ${id} team=${team} players=${players.size}`,
    );
    return bot;
  }

  function syncBots(): void {
    const desired = desiredBotCount();
    const bots = [...players.values()].filter((p) => p.isBot);

    while (bots.length > desired) {
      const doomed = bots.pop()!;
      removeBot(doomed.id);
    }

    for (const name of BOT_SLOT_NAMES) {
      if ([...players.values()].filter((p) => p.isBot).length >= desired) break;
      if (players.has(name)) continue;
      spawnBot(name);
    }
  }

  function weaponOf(p: NetPlayer): WeaponDef {
    if (mode === "gun_game") return gunGameWeapon(p.gunLevel);
    return findLoadoutWeapon(mode, p.weaponId) ?? starterWeapon();
  }

  function speedOf(p: NetPlayer) {
    let m = 1.05 * (p.status.moveMult || 1);
    if (tick < p.status.slowUntil) m *= 0.48;
    if (tick < p.status.shrinkUntil) m *= 1.2;
    return m;
  }

  function applyOnHit(weapon: WeaponDef, victim: NetPlayer): void {
    if (!weapon.onHit) return;
    const ms = weapon.onHitMs ?? 1000;
    const until = tick + Math.max(1, Math.round((ms / 1000) * TICK_RATE));
    switch (weapon.onHit) {
      case "slip":
        victim.status.slowUntil = Math.max(victim.status.slowUntil, until);
        break;
      case "freeze":
        victim.status.frozenUntil = Math.max(victim.status.frozenUntil, until);
        break;
      case "shock": {
        // Brief stun + stumble (distinct from full freeze)
        const shockTicks = Math.max(
          1,
          Math.round(((Math.min(ms, 500) / 1000) * TICK_RATE) / 1),
        );
        victim.status.frozenUntil = Math.max(
          victim.status.frozenUntil,
          tick + shockTicks,
        );
        victim.status.slowUntil = Math.max(victim.status.slowUntil, until);
        break;
      }
      case "shrink":
        victim.status.shrinkUntil = Math.max(victim.status.shrinkUntil, until);
        break;
    }
  }

  function splashAt(
    center: { x: number; y: number; z: number },
    radius: number,
    damage: number,
    shooterId: string,
    applyHit: (
      playerId: string,
      dmg: number,
      head: boolean,
      point: { x: number; y: number; z: number },
    ) => void,
  ): void {
    for (const other of players.values()) {
      if (!other.alive || other.id === shooterId) continue;
      const dx = other.state.position.x - center.x;
      const dy =
        other.state.position.y +
        (other.state.crouching ? 0.55 : 0.9) -
        center.y;
      const dz = other.state.position.z - center.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > radius) continue;
      const falloff = 1 - dist / radius;
      applyHit(other.id, damage * Math.max(0.25, falloff), false, center);
    }
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
      airJumpsLeft: p.state.airJumpsLeft,
      hp: p.hp,
      alive: p.alive,
      ammo: p.ammo,
      magSize: w.magSize,
      reloading: p.reloading,
      kills: p.kills,
      deaths: p.deaths,
      ab1CdMs: 0,
      ab2CdMs: 0,
      status: { ...p.status },
      gunLevel: p.gunLevel,
      weaponName: w.name,
      weaponId: w.id,
      score: p.score,
      displayName: p.displayName,
      protected: tick < p.spawnProtectedUntilTick ? true : undefined,
    };
  }

  function pickTeam(): Team {
    const tCount = [...players.values()].filter((p) => p.team === TEAM.T)
      .length;
    const ctCount = [...players.values()].filter((p) => p.team === TEAM.CT)
      .length;
    return tCount <= ctCount ? TEAM.T : TEAM.CT;
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

  function assignSpawn(_team: Team, playerId?: string): PlayerMoveState {
    const eyes = [...players.values()]
      .filter((p) => p.alive && p.id !== playerId)
      .map((p) =>
        eyePosition(p.state.position, p.state.crouching, p.state.yaw, p.lean),
      );
    const spawn = pickFfaSpawnFrom(
      spawns,
      allAlivePositions(playerId),
      22,
      (candidate) => {
        const origin = {
          x: candidate.position.x,
          y: candidate.position.y + PLAYER_EYE_STAND,
          z: candidate.position.z,
        };
        for (const eye of eyes) {
          const dist = Math.hypot(
            eye.x - origin.x,
            eye.y - origin.y,
            eye.z - origin.z,
          );
          if (dist > SPAWN_LOS_RANGE_M) continue;
          if (!lineBlockedBySolids(origin, eye, solids)) return true;
        }
        return false;
      },
    );
    return createMoveState(
      spawn.position.x,
      spawn.position.y,
      spawn.position.z,
      spawn.yaw,
    );
  }

  function grantSpawnProtection(p: NetPlayer): void {
    p.spawnProtectedUntilTick = tick + SPAWN_PROTECT_TICKS;
  }

  function currentPoses() {
    return [...players.values()].map((p) => ({
      id: p.id,
      position: p.state.position,
      crouching: p.state.crouching,
      alive: p.alive,
      scale: tick < p.status.shrinkUntil ? 0.45 : 1,
    }));
  }

  /**
   * Victim poses as the shooter saw them (interpolated), plus neighbors along
   * the path so strafing targets don't slip between discrete ticks.
   */
  function posesForHitscan(shooter: NetPlayer) {
    const rttMs = Math.max(40, Math.min(280, shooter.smoothedRttMs || 120));
    const rewind = lagCompRewindTicks(TICK_MS, rttMs);
    const t = tick - rewind;
    const fallback =
      poseHistory.length > 0
        ? poseHistory[poseHistory.length - 1]!.poses
        : currentPoses();
    // Center = aim-time pose; ±0.75 tick covers interp segment / fast strafe
    return [
      ...getPlayerPoseAtTime(t - 0.75, poseHistory, fallback),
      ...getPlayerPoseAtTime(t, poseHistory, fallback),
      ...getPlayerPoseAtTime(t + 0.75, poseHistory, fallback),
    ];
  }

  function declareWinner(winner: NetPlayer): void {
    if (matchWinnerId) return;
    matchWinnerId = winner.id;
    matchFreezeUntilTick = tick + TICK_RATE * 8;
    if (mode === "gun_game") {
      broadcast({ type: "gunGameWin", playerId: winner.id });
    }
    broadcast({ type: "matchWin", playerId: winner.id, mode });
    onMatchComplete?.(winner.id);
    console.log(
      `[lobby:${lobbyId}] winner ${winner.displayName} (${modeTitle(mode)})`,
    );
  }

  function onPlayerKill(
    shooter: NetPlayer,
    victim: NetPlayer,
    weapon: WeaponDef,
  ): void {
    if (matchWinnerId) return;

    if (mode === "gun_game") {
      if (
        resolveFireStyle(weapon) === "melee" &&
        victim.gunLevel > 0
      ) {
        victim.gunLevel -= 1;
        const demoted = gunGameWeapon(victim.gunLevel);
        victim.weaponId = demoted.id;
        victim.ammo = demoted.magSize;
        victim.reloading = false;
        victim.sprayIndex = 0;
        broadcast({
          type: "gunAdvance",
          playerId: victim.id,
          gunLevel: victim.gunLevel,
          weaponName: demoted.name,
        });
        console.log(
          `[lobby:${lobbyId}] ${victim.displayName} demoted → ${victim.gunLevel + 1} ${demoted.name}`,
        );
      }

      if (shooter.gunLevel >= GUN_GAME_LENGTH - 1) {
        declareWinner(shooter);
        return;
      }
      shooter.gunLevel += 1;
      const w = gunGameWeapon(shooter.gunLevel);
      shooter.weaponId = w.id;
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
        `[lobby:${lobbyId}] ${shooter.displayName} advanced → ${shooter.gunLevel + 1} ${w.name}`,
      );
      return;
    }

    if (mode === "snipers_only") {
      shooter.score = shooter.kills;
      if (shooter.score >= scoreToWin(mode)) {
        declareWinner(shooter);
      }
    }
  }

  function applyLoadout(player: NetPlayer, weaponId: string): boolean {
    if (!modeNeedsLoadout(mode)) return false;
    const w = findLoadoutWeapon(mode, weaponId);
    if (!w) return false;
    player.weaponId = w.id;
    player.ammo = w.magSize;
    player.reloading = false;
    player.sprayIndex = 0;
    player.burstRemaining = 0;
    broadcast({
      type: "loadoutChanged",
      playerId: player.id,
      weaponId: w.id,
      weaponName: w.name,
    });
    return true;
  }

  function rotateHill(): void {
    hillIndex = (hillIndex + 1) % HILL_POSITIONS.length;
    const next = HILL_POSITIONS[hillIndex]!;
    hill.x = next.x;
    hill.y = next.y;
    hill.z = next.z;
    hill.radius = next.radius;
    hillControllerId = null;
    hillContested = false;
    hillPointsAcc = 0;
    hillSinceTick = tick;
    console.log(`[lobby:${lobbyId}] hill → #${hillIndex} (${hill.x}, ${hill.z})`);
  }

  function tickHill(): void {
    if (mode !== "king_of_the_hill" || matchWinnerId) {
      hillControllerId = null;
      hillContested = false;
      return;
    }

    // Time-based rotate even if nobody is scoring
    if (tick - hillSinceTick >= HILL_ROTATE_TICKS) {
      rotateHill();
    }

    const inside: NetPlayer[] = [];
    for (const p of players.values()) {
      if (!p.alive) continue;
      const dx = p.state.position.x - hill.x;
      const dz = p.state.position.z - hill.z;
      if (dx * dx + dz * dz <= hill.radius * hill.radius) inside.push(p);
    }

    if (inside.length === 0) {
      hillControllerId = null;
      hillContested = false;
      return;
    }
    if (inside.length > 1) {
      hillControllerId = null;
      hillContested = true;
      return;
    }

    const sole = inside[0]!;
    hillControllerId = sole.id;
    hillContested = false;
    sole.score += KOTH_POINTS_PER_TICK;
    hillPointsAcc += KOTH_POINTS_PER_TICK;
    if (sole.score >= scoreToWin(mode)) {
      sole.score = scoreToWin(mode);
      declareWinner(sole);
      return;
    }
    if (hillPointsAcc >= HILL_ROTATE_POINTS) {
      rotateHill();
    }
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
      const killWeapon = shooter ? weaponOf(shooter) : gunGameWeapon(0);
      const meleeDemote =
        mode === "gun_game" &&
        resolveFireStyle(killWeapon) === "melee" &&
        victim.gunLevel > 0;
      broadcast({
        type: "killFeed",
        killerId: attackerId,
        victimId: victim.id,
        isHeadshot: headshot,
        meleeDemote: meleeDemote || undefined,
      });
      if (shooter) onPlayerKill(shooter, victim, killWeapon);
    }
  }

  function tryFire(shooter: NetPlayer, fireEdge: boolean): void {
    const weapon = weaponOf(shooter);
    const fireCooldown = Math.max(1, Math.round(TICK_RATE / weapon.fireRate));
    const style = resolveFireStyle(weapon);
    const isBurst = style === "burst";
    if (!shooter.alive || shooter.reloading) return;
    if (shooter.ammo <= 0) {
      shooter.burstRemaining = 0;
      tryReload(shooter);
      return;
    }

    if (isBurst && shooter.burstRemaining > 0) {
      if (tick < shooter.burstNextTick) return;
    } else {
      if (tick - shooter.lastFireTick < fireCooldown) return;
      // Semi / burst: one click starts the action
      if ((weapon.semiAuto || isBurst) && !fireEdge) return;
      if (isBurst) {
        shooter.burstRemaining = Math.min(
          weapon.burstCount ?? 3,
          shooter.ammo,
        );
      }
    }

    shooter.lastFireTick = tick;
    shooter.ammo -= 1;
    shooter.spawnProtectedUntilTick = 0;
    if (shooter.ammo <= 0) tryReload(shooter);
    if (isBurst) {
      shooter.burstRemaining = Math.max(0, shooter.burstRemaining - 1);
      shooter.burstNextTick = tick + 2;
    }
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
    const poses = posesForHitscan(shooter);

    const ads = bitsToButtons(shooter.lastButtons).ads;
    const spread = weapon.spreadDeg * (ads ? weapon.adsSpreadMult : 1);

    let anyHit = false;
    let lastEnd = {
      x: origin.x,
      y: origin.y,
      z: origin.z,
    };
    const damageByTarget = new Map<string, { dmg: number; head: boolean }>();

    const applyHit = (
      playerId: string,
      dmg: number,
      head: boolean,
      point: { x: number; y: number; z: number },
    ) => {
      anyHit = true;
      lastEnd = point;
      const prev = damageByTarget.get(playerId);
      if (!prev) {
        damageByTarget.set(playerId, { dmg, head });
      } else {
        prev.dmg += dmg;
        prev.head = prev.head || head;
      }
    };

    if (style === "melee" && weapon.meleeCone != null && weapon.maxRange != null) {
      const hits = meleeConeHits(
        origin,
        baseYaw,
        basePitch,
        shooter.id,
        poses,
        weapon.maxRange,
        weapon.meleeCone,
      );
      for (const hit of hits) {
        applyHit(hit.playerId, weapon.damage, false, hit.point);
      }
      if (hits.length === 0) {
        const { end } = serverHitscan(
          origin,
          baseYaw,
          basePitch,
          shooter.id,
          poses,
          solids,
          weapon.maxRange,
        );
        lastEnd = end;
      }
      // Gravity Hammer slam etc. — splash from swing tip
      if (weapon.explosionRadius != null && weapon.explosionRadius > 0) {
        splashAt(
          lastEnd,
          weapon.explosionRadius,
          weapon.damage * 0.55,
          shooter.id,
          applyHit,
        );
      }
    } else if (
      (style === "splash" || style === "rocket") &&
      weapon.explosionRadius != null &&
      weapon.explosionRadius > 0
    ) {
      // Rocket / potato / thunder: hitscan then splash at impact.
      const { end } = serverHitscan(
        origin,
        baseYaw,
        basePitch,
        shooter.id,
        poses,
        solids,
        weapon.maxRange ?? 200,
      );
      lastEnd = end;
      splashAt(
        end,
        weapon.explosionRadius,
        weapon.damage,
        shooter.id,
        applyHit,
      );
    } else {
      // auto / semi / burst / shotgun — pelleted hitscan
      const pelletCount = style === "shotgun" ? weapon.pellets : Math.max(1, weapon.pellets);
      for (let pellet = 0; pellet < pelletCount; pellet++) {
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
        const fallen = weapon.damage * damageFalloffMult(weapon, hit.distance);
        const dmg = hit.isHeadshot
          ? fallen * weapon.headshotMultiplier
          : fallen;
        applyHit(hit.playerId, dmg, hit.isHeadshot, hit.point);
      }
    }

    broadcast({
      type: "shot",
      shooterId: shooter.id,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      end: lastEnd,
      hitPlayer: anyHit,
      weaponId: weapon.id,
    });

    for (const [victimId, info] of damageByTarget) {
      const victim = players.get(victimId);
      if (!victim || !victim.alive) continue;
      if (tick < victim.spawnProtectedUntilTick) continue;
      const damage = Math.round(info.dmg);
      victim.hp = Math.max(0, victim.hp - damage);
      applyOnHit(weapon, victim);

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
        const meleeDemote =
          mode === "gun_game" &&
          resolveFireStyle(weapon) === "melee" &&
          victim.gunLevel > 0;
        broadcast({
          type: "killFeed",
          killerId: shooter.id,
          victimId: victim.id,
          isHeadshot: info.head,
          meleeDemote: meleeDemote || undefined,
        });
        onPlayerKill(shooter, victim, weapon);
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
      buttons.ability1 = false;
      buttons.ability2 = false;
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
        grantSpawnProtection(p);
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

    const moveSpeed = speedOf(p) * (p.isBot ? 0.72 : 1);
    applyMovement(p.state, moveButtons, TICK_DT, solids, moveSpeed);

    const fireEdge = buttons.fire && !p.fireHeld;
    const reloadEdge = buttons.reload && !p.reloadHeld;
    p.fireHeld = buttons.fire;
    p.reloadHeld = buttons.reload;

    if (!buttons.fire) p.sprayIndex = 0;

    if (reloadEdge) tryReload(p);
    // Continue burst even if fire is released mid-burst
    if ((buttons.fire || p.burstRemaining > 0) && !p.reloading) {
      tryFire(p, fireEdge);
    }
  }

  function tickOnce(): void {
    tick += 1;

    if (matchWinnerId && tick >= matchFreezeUntilTick) {
      rotateAndReset();
    }

    const frozen = matchWinnerId != null;
    if (!frozen) {
      const roster = [...players.values()];
      for (const p of roster) {
        if (!p.isBot) continue;
        thinkBot(p, roster, tick);
      }
      for (const p of players.values()) {
        simulatePlayer(p);
      }
      tickHill();
    }

    poseHistory.push({ tick, poses: clonePoses(currentPoses()) });
    while (poseHistory.length > HISTORY_MAX) poseHistory.shift();

    const all = [...players.values()].map(toSnapshot);
    const hillSnap =
      mode === "king_of_the_hill"
        ? {
            x: hill.x,
            y: hill.y,
            z: hill.z,
            radius: hill.radius,
            controllerId: hillControllerId,
            contested: hillContested,
          }
        : undefined;

    for (const p of players.values()) {
      if (p.isBot || !p.ws) continue;
      send(p.ws, {
        type: "snapshot",
        tick,
        ackSeq: p.lastProcessedSeq,
        players: all,
        props: [],
        hill: hillSnap,
      });
    }
  }

  function spawnPlayer(ws: WebSocket, meta: JoinMeta): NetPlayer {
    const id = allocId();
    const team = pickTeam();
    const displayName = meta.displayName.trim().slice(0, 24) || `Player-${id}`;
    const player = makePlayer(
      id,
      team,
      ws,
      false,
      displayName,
      meta.accountId,
    );
    players.set(id, player);

    console.log(
      `[lobby:${lobbyId}] join ${displayName} (${id}) team=${team} mode=${mode} players=${players.size}`,
    );

    syncBots();

    send(ws, {
      type: "welcome",
      playerId: id,
      team,
      classId: DUMMY_CLASS,
      mode,
      tick,
      players: [...players.values()].map(toSnapshot),
      props: [],
      lobbyId,
      lobbyName,
      mapId,
      loadoutOptions: modeNeedsLoadout(mode)
        ? loadoutOptionsForMode(mode)
        : undefined,
      scoreToWin: scoreToWin(mode) || undefined,
      hill:
        mode === "king_of_the_hill"
          ? { x: hill.x, y: hill.y, z: hill.z, radius: hill.radius }
          : undefined,
    });
    broadcast({ type: "playerJoined", player: toSnapshot(player) }, id);
    return player;
  }

  function handleMessage(player: NetPlayer, msg: ClientMsg): void {
    if (msg.type === "changeClass") return;
    if (msg.type === "selectLoadout") {
      if (typeof msg.weaponId !== "string") return;
      applyLoadout(player, msg.weaponId);
      return;
    }
    if (msg.type !== "input") return;
    if (typeof msg.seq !== "number" || typeof msg.buttons !== "number") return;
    if (typeof msg.yaw !== "number" || typeof msg.pitch !== "number") return;
    if (msg.seq <= player.lastProcessedSeq) return;
    if (typeof msg.lean !== "number" || !Number.isFinite(msg.lean)) {
      msg.lean = 0;
    }
    if (typeof msg.rttMs === "number" && Number.isFinite(msg.rttMs)) {
      const sample = Math.max(20, Math.min(400, msg.rttMs));
      player.smoothedRttMs = player.smoothedRttMs * 0.85 + sample * 0.15;
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
      console.log(`[lobby:${lobbyId}] leave ${id} players=${players.size}`);
      if (humanCount() === 0) {
        matchWinnerId = null;
        matchFreezeUntilTick = 0;
      }
      syncBots();
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
    syncBots,
  };
}
