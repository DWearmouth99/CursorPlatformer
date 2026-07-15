import { randomBytes } from "node:crypto";
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
import { createHash, timingSafeEqual } from "node:crypto";
import { createLobby, type Lobby, type NetPlayer } from "./lobby.js";
import { loadMapSolids } from "./maps.js";
import { recordMatchResults } from "./store.js";

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

  function onMatchComplete(room: ManagedLobby, winnerId: string): void {
    const results: {
      accountId: string;
      kills: number;
      deaths: number;
      gunLevel: number;
      won: boolean;
    }[] = [];
    for (const p of room.instance.players.values()) {
      if (p.isBot || !p.accountId) continue;
      results.push({
        accountId: p.accountId,
        kills: p.kills,
        deaths: p.deaths,
        gunLevel: p.gunLevel,
        won: p.id === winnerId,
      });
    }
    if (results.length > 0) recordMatchResults(results);
    room.lastActivity = Date.now();
  }

  function spawnDefaultLobby(): ManagedLobby {
    const mapId = MAP_CATALOG[0]!.id;
    const { solids } = loadMapSolids(mapId, arenaDirs);
    const id = "official";
    const instance = createLobby({
      mode: "gun_game",
      solids,
      mapId,
      lobbyId: id,
      lobbyName: "Official Gun Game",
      allocId,
      onMatchComplete: (winnerId) => {
        const room = rooms.get(id);
        if (room) onMatchComplete(room, winnerId);
      },
    });
    const room: ManagedLobby = {
      id,
      name: "Official Gun Game",
      hostUserId: null,
      hostName: "Arena",
      mode: "gun_game",
      mapId,
      maxPlayers: DEFAULT_MAX,
      isPublic: true,
      passwordHash: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      instance,
    };
    rooms.set(id, room);
    return room;
  }

  spawnDefaultLobby();

  return {
    listPublic() {
      const out: LobbySummary[] = [];
      for (const room of rooms.values()) {
        if (!room.isPublic) continue;
        out.push(summarize(room));
      }
      out.sort((a, b) => b.players - a.players || b.createdAt - a.createdAt);
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
      const { solids } = loadMapSolids(body.mapId, arenaDirs);
      const passwordHash = body.password?.trim()
        ? hashPassword(body.password.trim())
        : null;

      const roomRef: { current?: ManagedLobby } = {};
      const instance = createLobby({
        mode: body.mode,
        solids,
        mapId: body.mapId,
        lobbyId: id,
        lobbyName: name,
        allocId,
        onMatchComplete: (winnerId) => {
          if (roomRef.current) onMatchComplete(roomRef.current, winnerId);
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
        if (room.id !== "official" && humanCount(room) === 0) {
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
      for (const room of rooms.values()) {
        room.instance.tickOnce();
        if (
          room.id !== "official" &&
          humanCount(room) === 0 &&
          now - room.lastActivity > LOBBY_IDLE_MS
        ) {
          rooms.delete(room.id);
        }
      }
    },

    removeIfEmpty(room) {
      if (room.id === "official") return;
      if (humanCount(room) === 0) rooms.delete(room.id);
    },
  };
}

function humanCount(room: ManagedLobby): number {
  return [...room.instance.players.values()].filter((p) => !p.isBot).length;
}
