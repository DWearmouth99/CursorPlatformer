import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { WebSocket } from "ws";
import {
  GAME_MODE_CATALOG,
  MAP_CATALOG,
  getMapById,
  type CreateLobbyBody,
  type GameMode,
  type LobbySummary,
  type PublicProfile,
} from "@fps/shared";
import { createLobby, type Lobby, type NetPlayer } from "./lobby.js";
import { loadMapSolids } from "./maps.js";

const DEFAULT_MAX = 12;
const LOBBY_IDLE_MS = 1000 * 60 * 20;

export type JoinMeta = {
  accountId: string | null;
  displayName: string;
};

export type ManagedLobby = {
  id: string;
  name: string;
  hostUserId: string | null;
  hostName: string;
  mode: GameMode;
  mapId: string;
  maxPlayers: number;
  isPublic: boolean;
  passwordHash: string | null;
  createdAt: number;
  lastActivity: number;
  instance: Lobby;
  official: boolean;
};

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function checkPassword(password: string, hash: string | null): boolean {
  if (!hash) return true;
  if (!password) return false;
  const got = Buffer.from(hashPassword(password));
  const exp = Buffer.from(hash);
  if (got.length !== exp.length) return false;
  return timingSafeEqual(got, exp);
}

function officialId(mode: GameMode): string {
  return `official-${mode}`;
}

function isOfficialId(id: string): boolean {
  return id === "official" || id.startsWith("official-");
}

export type LobbyManager = {
  listPublic(): LobbySummary[];
  create(
    body: CreateLobbyBody,
    host: PublicProfile | null,
    hostDisplayName: string,
  ): ManagedLobby;
  get(id: string): ManagedLobby | null;
  canJoin(id: string, password?: string): { ok: true } | { ok: false; error: string };
  joinPlayer(
    id: string,
    ws: WebSocket,
    meta: JoinMeta,
  ): NetPlayer | { error: string };
  leaveByWs(ws: WebSocket): void;
  findSession(ws: WebSocket): { room: ManagedLobby; player: NetPlayer } | null;
  tickAll(): void;
  removeIfEmpty(room: ManagedLobby): void;
};

export function createLobbyManager(
  arenaDirs: string[],
  allocId: () => string,
): LobbyManager {
  const rooms = new Map<string, ManagedLobby>();

  function summarize(room: ManagedLobby): LobbySummary {
    const humans = [...room.instance.players.values()].filter((p) => !p.isBot);
    const map = getMapById(room.mapId);
    return {
      id: room.id,
      name: room.name,
      hostName: room.hostName,
      mode: room.mode,
      mapId: room.mapId,
      mapName: map?.name ?? room.mapId,
      players: humans.length,
      maxPlayers: room.maxPlayers,
      hasPassword: !!room.passwordHash,
      isPublic: room.isPublic,
      createdAt: room.createdAt,
    };
  }

  function advanceMap(room: ManagedLobby): {
    mapId: string;
    solids: readonly import("@fps/shared").AABB[];
    spawns: readonly import("@fps/shared").SpawnZone[];
  } {
    const idx = MAP_CATALOG.findIndex((m) => m.id === room.mapId);
    const next = MAP_CATALOG[(idx + 1 + MAP_CATALOG.length) % MAP_CATALOG.length]!;
    const loaded = loadMapSolids(next.id, arenaDirs);
    room.mapId = next.id;
    room.lastActivity = Date.now();
    return {
      mapId: next.id,
      solids: loaded.solids,
      spawns: loaded.spawns,
    };
  }

  function spawnOfficialLobby(mode: GameMode, startMapIndex: number): ManagedLobby {
    const modeDef = GAME_MODE_CATALOG.find((m) => m.id === mode)!;
    const mapId = MAP_CATALOG[startMapIndex % MAP_CATALOG.length]!.id;
    const loaded = loadMapSolids(mapId, arenaDirs);
    const id = officialId(mode);
    const name = modeDef.name;

    const roomRef: { current?: ManagedLobby } = {};
    const instance = createLobby({
      mode,
      solids: loaded.solids,
      spawns: loaded.spawns,
      mapId,
      lobbyId: id,
      lobbyName: name,
      allocId,
      onMatchComplete: () => {
        if (roomRef.current) roomRef.current.lastActivity = Date.now();
      },
      nextMap: () => {
        const room = roomRef.current;
        if (!room) return null;
        return advanceMap(room);
      },
    });

    const room: ManagedLobby = {
      id,
      name,
      hostUserId: null,
      hostName: "Arena",
      mode,
      mapId,
      maxPlayers: DEFAULT_MAX,
      isPublic: true,
      passwordHash: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      instance,
      official: true,
    };
    roomRef.current = room;
    rooms.set(id, room);
    // Legacy alias so old clients joining "official" land in Gun Game
    if (mode === "gun_game") {
      rooms.set("official", room);
    }
    console.log(`[lobbies] global ${name} ready on ${mapId}`);
    return room;
  }

  GAME_MODE_CATALOG.forEach((mode, i) => {
    spawnOfficialLobby(mode.id, i);
  });

  return {
    listPublic() {
      const out: LobbySummary[] = [];
      const seen = new Set<string>();
      for (const room of rooms.values()) {
        if (!room.isPublic || seen.has(room.id)) continue;
        seen.add(room.id);
        out.push(summarize(room));
      }
      // Mode catalog order for the play screen
      out.sort((a, b) => {
        const ai = GAME_MODE_CATALOG.findIndex((m) => m.id === a.mode);
        const bi = GAME_MODE_CATALOG.findIndex((m) => m.id === b.mode);
        return ai - bi;
      });
      return out;
    },

    create(body, host, hostDisplayName) {
      const modeDef = GAME_MODE_CATALOG.find((m) => m.id === body.mode);
      if (!modeDef) throw new Error("Invalid mode");
      const map = getMapById(body.mapId);
      if (!map) throw new Error("Invalid map");

      const maxPlayers = Math.min(
        12,
        Math.max(2, body.maxPlayers ?? DEFAULT_MAX),
      );
      const name = (body.name.trim() || `${hostDisplayName}'s Lobby`).slice(
        0,
        40,
      );
      const id = randomBytes(5).toString("hex");
      const loaded = loadMapSolids(body.mapId, arenaDirs);
      const passwordHash = body.password?.trim()
        ? hashPassword(body.password.trim())
        : null;

      const roomRef: { current?: ManagedLobby } = {};
      const instance = createLobby({
        mode: body.mode,
        solids: loaded.solids,
        spawns: loaded.spawns,
        mapId: body.mapId,
        lobbyId: id,
        lobbyName: name,
        allocId,
        onMatchComplete: () => {
          if (roomRef.current) roomRef.current.lastActivity = Date.now();
        },
        nextMap: () => {
          const room = roomRef.current;
          if (!room) return null;
          return advanceMap(room);
        },
      });

      const room: ManagedLobby = {
        id,
        name,
        hostUserId: host?.userId ?? null,
        hostName: host?.displayName ?? hostDisplayName,
        mode: body.mode,
        mapId: body.mapId,
        maxPlayers,
        isPublic: body.isPublic !== false,
        passwordHash,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        instance,
        official: false,
      };
      roomRef.current = room;
      rooms.set(id, room);
      return room;
    },

    get(id) {
      return rooms.get(id) ?? null;
    },

    canJoin(id, password) {
      const room = rooms.get(id);
      if (!room) return { ok: false, error: "Lobby not found." };
      const humans = [...room.instance.players.values()].filter((p) => !p.isBot);
      if (humans.length >= room.maxPlayers) {
        return { ok: false, error: "Lobby is full." };
      }
      if (!checkPassword(password ?? "", room.passwordHash)) {
        return { ok: false, error: "Wrong password." };
      }
      return { ok: true };
    },

    joinPlayer(id, ws, meta) {
      const room = rooms.get(id);
      if (!room) return { error: "Lobby not found." };
      const humans = [...room.instance.players.values()].filter((p) => !p.isBot);
      if (humans.length >= room.maxPlayers) {
        return { error: "Lobby is full." };
      }
      room.lastActivity = Date.now();
      return room.instance.spawnPlayer(ws, meta);
    },

    leaveByWs(ws) {
      for (const room of rooms.values()) {
        room.instance.removeByWs(ws);
        if (!room.official && !isOfficialId(room.id) && humanCount(room) === 0) {
          rooms.delete(room.id);
        }
      }
    },

    findSession(ws) {
      for (const room of rooms.values()) {
        const player = room.instance.findByWs(ws);
        if (player) return { room, player };
      }
      return null;
    },

    tickAll() {
      const now = Date.now();
      const seen = new Set<Lobby>();
      for (const room of rooms.values()) {
        if (seen.has(room.instance)) continue;
        seen.add(room.instance);
        room.instance.tickOnce();
        if (
          !room.official &&
          humanCount(room) === 0 &&
          now - room.lastActivity > LOBBY_IDLE_MS
        ) {
          rooms.delete(room.id);
        }
      }
    },

    removeIfEmpty(room) {
      if (room.official || isOfficialId(room.id)) return;
      if (humanCount(room) === 0) rooms.delete(room.id);
    },
  };
}

function humanCount(room: ManagedLobby): number {
  return [...room.instance.players.values()].filter((p) => !p.isBot).length;
}
