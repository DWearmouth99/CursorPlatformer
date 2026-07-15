import {
  INTERP_DELAY_MAX_MS,
  INTERP_DELAY_MIN_MS,
  INTERP_DELAY_MS,
  INTERP_RTT_FACTOR,
  type SnapshotPlayer,
  type Vec3,
} from "@fps/shared";

type BufferedSnapshot = {
  time: number;
  tick: number;
  players: Map<string, SnapshotPlayer>;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export type InterpolatedRemote = {
  id: string;
  team: SnapshotPlayer["team"];
  position: Vec3;
  yaw: number;
  pitch: number;
  lean: number;
  crouching: boolean;
  alive: boolean;
  veiled: boolean;
  /** Shrink Ray status — render tiny. */
  shrunk: boolean;
};

/**
 * Buffers world snapshots and samples remote players behind realtime.
 * Delay grows with RTT so jittery long routes still interpolate smoothly.
 */
export function createInterpolator() {
  const buffer: BufferedSnapshot[] = [];
  let delayMs = INTERP_DELAY_MS;

  function setRttMs(rttMs: number): void {
    const adaptive = INTERP_DELAY_MS + rttMs * INTERP_RTT_FACTOR;
    delayMs = Math.max(
      INTERP_DELAY_MIN_MS,
      Math.min(INTERP_DELAY_MAX_MS, adaptive),
    );
  }

  function push(
    serverTimeApprox: number,
    players: SnapshotPlayer[],
    serverTick = 0,
  ): void {
    const map = new Map<string, SnapshotPlayer>();
    for (const p of players) map.set(p.id, p);
    buffer.push({ time: serverTimeApprox, tick: serverTick, players: map });
    while (buffer.length > 90) buffer.shift();
  }

  function sample(
    localId: string | null,
    renderTime: number,
  ): InterpolatedRemote[] {
    const target = renderTime - delayMs;
    if (buffer.length === 0) return [];

    let older: BufferedSnapshot | null = null;
    let newer: BufferedSnapshot | null = null;
    for (let i = 0; i < buffer.length; i++) {
      const snap = buffer[i]!;
      if (snap.time <= target) older = snap;
      if (snap.time >= target) {
        newer = snap;
        break;
      }
    }

    if (!older && newer) older = newer;
    if (!newer && older) newer = older;
    if (!older || !newer) return [];

    const span = newer.time - older.time;
    const t = span > 0 ? (target - older.time) / span : 0;
    const clampedT = Math.max(0, Math.min(1, t));

    const ids = new Set([...older.players.keys(), ...newer.players.keys()]);
    const out: InterpolatedRemote[] = [];

    for (const id of ids) {
      if (id === localId) continue;
      const a = older.players.get(id);
      const b = newer.players.get(id) ?? a;
      const from = a ?? b;
      if (!from || !b) continue;

      out.push({
        id,
        team: b.team,
        position: {
          x: lerp(from.position.x, b.position.x, clampedT),
          y: lerp(from.position.y, b.position.y, clampedT),
          z: lerp(from.position.z, b.position.z, clampedT),
        },
        yaw: lerpAngle(from.yaw, b.yaw, clampedT),
        pitch: lerp(from.pitch, b.pitch, clampedT),
        lean: lerp(from.lean ?? 0, b.lean ?? 0, clampedT),
        crouching: b.crouching,
        alive: b.alive,
        veiled: (b.status?.veiledUntil ?? 0) > newer.tick,
        shrunk: (b.status?.shrinkUntil ?? 0) > newer.tick,
      });
    }

    return out;
  }

  function removePlayer(id: string): void {
    for (const snap of buffer) snap.players.delete(id);
  }

  return { push, sample, removePlayer, setRttMs, getDelayMs: () => delayMs };
}
