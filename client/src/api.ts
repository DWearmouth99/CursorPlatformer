import {
  resolveApiUrl,
  type AuthSession,
  type CreateLobbyBody,
  type GameModeDef,
  type LobbySummary,
  type MapDef,
  type PublicProfile,
} from "@fps/shared";
import { authHeader } from "./session.js";

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${resolveApiUrl()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...authHeader(),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const json = (await res.json()) as T & { error?: string };
    if (!res.ok) {
      return { ok: false, error: json.error ?? `Request failed (${res.status})` };
    }
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: "Could not reach the server." };
  }
}

export async function fetchMeta(): Promise<
  | { ok: true; maps: MapDef[]; modes: GameModeDef[] }
  | { ok: false; error: string }
> {
  const res = await apiFetch<{ maps: MapDef[]; modes: GameModeDef[] }>(
    "/api/meta",
  );
  if (!res.ok) return res;
  return { ok: true, maps: res.data.maps, modes: res.data.modes };
}

export async function register(
  username: string,
  password: string,
  displayName: string,
): Promise<{ ok: true; session: AuthSession } | { ok: false; error: string }> {
  const res = await apiFetch<AuthSession>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password, displayName }),
  });
  if (!res.ok) return res;
  return { ok: true, session: res.data };
}

export async function login(
  username: string,
  password: string,
): Promise<{ ok: true; session: AuthSession } | { ok: false; error: string }> {
  const res = await apiFetch<AuthSession>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) return res;
  return { ok: true, session: res.data };
}

export async function fetchProfile(): Promise<
  { ok: true; profile: PublicProfile } | { ok: false; error: string }
> {
  const res = await apiFetch<{ profile: PublicProfile }>("/api/auth/me");
  if (!res.ok) return res;
  return { ok: true, profile: res.data.profile };
}

export async function listLobbies(): Promise<
  { ok: true; lobbies: LobbySummary[] } | { ok: false; error: string }
> {
  const res = await apiFetch<{ lobbies: LobbySummary[] }>("/api/lobbies");
  if (!res.ok) return res;
  return { ok: true, lobbies: res.data.lobbies };
}

export async function createLobby(
  body: CreateLobbyBody,
): Promise<
  | { ok: true; lobbyId: string; name: string; mapId: string }
  | { ok: false; error: string }
> {
  const res = await apiFetch<{
    lobby: { id: string; name: string; mapId: string };
  }>("/api/lobbies", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) return res;
  return {
    ok: true,
    lobbyId: res.data.lobby.id,
    name: res.data.lobby.name,
    mapId: res.data.lobby.mapId,
  };
}

export async function validateLobbyJoin(
  lobbyId: string,
  password?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await apiFetch<{ lobbyId: string }>(
    `/api/lobbies/${encodeURIComponent(lobbyId)}/join`,
    {
      method: "POST",
      body: JSON.stringify({ password: password || undefined }),
    },
  );
  if (!res.ok) return res;
  return { ok: true };
}
