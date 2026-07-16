import {
  resolveApiUrl,
  type GameModeDef,
  type LobbySummary,
  type MapDef,
} from "@fps/shared";

/**
 * REST base for split deploy (Vercel client → Render API).
 * Prefer VITE_API_URL; else derive https:// from VITE_WS_URL; else same-origin.
 */
export function clientApiUrl(): string {
  const api = import.meta.env.VITE_API_URL;
  if (typeof api === "string" && api.trim()) {
    return api.trim().replace(/\/$/, "");
  }
  const ws = import.meta.env.VITE_WS_URL;
  if (typeof ws === "string" && ws.trim()) {
    return ws
      .trim()
      .replace(/^wss:/i, "https:")
      .replace(/^ws:/i, "http:")
      .replace(/\/$/, "");
  }
  return resolveApiUrl();
}

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${clientApiUrl()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
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

export async function listLobbies(): Promise<
  { ok: true; lobbies: LobbySummary[] } | { ok: false; error: string }
> {
  const res = await apiFetch<{ lobbies: LobbySummary[] }>("/api/lobbies");
  if (!res.ok) return res;
  return { ok: true, lobbies: res.data.lobbies };
}

export async function validateLobbyJoin(
  lobbyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await apiFetch<{ lobbyId: string }>(
    `/api/lobbies/${encodeURIComponent(lobbyId)}/join`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  if (!res.ok) return res;
  return { ok: true };
}
