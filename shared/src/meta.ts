import type { GameMode } from "./protocol.js";

export type MapDef = {
  id: string;
  name: string;
  file: string;
  tagline: string;
};

/** Playable maps — add entries here as new arenas ship. */
export const MAP_CATALOG: readonly MapDef[] = [
  {
    id: "grassarena",
    name: "Grass Arena",
    file: "grassareana.json",
    tagline: "Open meadow · tall cover · classic Gun Game ladder",
  },
  {
    id: "desertwest",
    name: "Dustwater Gulch",
    file: "desertwest.json",
    tagline: "Wild West desert · dry wash · cactus country",
  },
];

export type GameModeDef = {
  id: GameMode;
  name: string;
  blurb: string;
  players: string;
};

export const GAME_MODE_CATALOG: readonly GameModeDef[] = [
  {
    id: "gun_game",
    name: "Gun Game",
    blurb: "Every kill advances your weapon. First through the ladder wins.",
    players: "2–12",
  },
  {
    id: "snipers_only",
    name: "Snipers Only",
    blurb: "AWPs only. First to 20 kills wins.",
    players: "2–12",
  },
  {
    id: "king_of_the_hill",
    name: "King of the Hill",
    blurb: "Pick a loadout. Hold the hill alone to score — first to 100 wins.",
    players: "2–12",
  },
];

export function getMapById(id: string): MapDef | undefined {
  return MAP_CATALOG.find((m) => m.id === id);
}

export function arenaUrlForMap(mapId: string): string {
  const map = getMapById(mapId);
  return map ? `/arenas/${map.file}` : `/arenas/${MAP_CATALOG[0]!.file}`;
}

export type PlayerStats = {
  kills: number;
  deaths: number;
  wins: number;
  matches: number;
  xp: number;
  peakGunLevel: number;
};

export const EMPTY_STATS: PlayerStats = {
  kills: 0,
  deaths: 0,
  wins: 0,
  matches: 0,
  xp: 0,
  peakGunLevel: 0,
};

export type PublicProfile = {
  userId: string;
  username: string;
  displayName: string;
  stats: PlayerStats;
  createdAt: number;
};

export type LobbySummary = {
  id: string;
  name: string;
  hostName: string;
  mode: GameMode;
  mapId: string;
  mapName: string;
  players: number;
  maxPlayers: number;
  hasPassword: boolean;
  isPublic: boolean;
  createdAt: number;
};

export type AuthSession = {
  token: string;
  profile: PublicProfile;
};

export type CreateLobbyBody = {
  name: string;
  mode: GameMode;
  mapId: string;
  maxPlayers?: number;
  password?: string;
  isPublic?: boolean;
};

export type JoinLobbyBody = {
  password?: string;
};
