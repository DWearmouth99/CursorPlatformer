import type http from "node:http";
import {
  GAME_MODE_CATALOG,
  isGameMode,
  MAP_CATALOG,
  type CreateLobbyBody,
} from "@fps/shared";
import {
  authFromHeader,
  loginAccount,
  registerAccount,
} from "./auth.js";
import type { LobbyManager } from "./lobbyManager.js";

function readJson<T>(req: http.IncomingMessage): Promise<T | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!raw.trim()) {
          resolve({} as T);
          return;
        }
        resolve(JSON.parse(raw) as T);
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(body));
}

function cors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export function createApiHandler(lobbies: LobbyManager) {
  return async function handleApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) return false;

    cors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return true;
    }

    const auth = authFromHeader(req.headers.authorization);

    if (url.pathname === "/api/meta" && req.method === "GET") {
      sendJson(res, 200, {
        maps: MAP_CATALOG,
        modes: GAME_MODE_CATALOG,
      });
      return true;
    }

    if (url.pathname === "/api/auth/register" && req.method === "POST") {
      const body = await readJson<{
        username?: string;
        password?: string;
        displayName?: string;
      }>(req);
      if (!body?.username || !body.password) {
        sendJson(res, 400, { error: "Missing username or password." });
        return true;
      }
      const result = registerAccount(
        body.username,
        body.password,
        body.displayName ?? body.username,
      );
      if ("error" in result) {
        sendJson(res, 400, result);
        return true;
      }
      sendJson(res, 200, result);
      return true;
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      const body = await readJson<{ username?: string; password?: string }>(req);
      if (!body?.username || !body.password) {
        sendJson(res, 400, { error: "Missing username or password." });
        return true;
      }
      const result = loginAccount(body.username, body.password);
      if ("error" in result) {
        sendJson(res, 401, result);
        return true;
      }
      sendJson(res, 200, result);
      return true;
    }

    if (url.pathname === "/api/auth/me" && req.method === "GET") {
      if (!auth) {
        sendJson(res, 401, { error: "Not signed in." });
        return true;
      }
      sendJson(res, 200, { profile: auth });
      return true;
    }

    if (url.pathname === "/api/lobbies" && req.method === "GET") {
      sendJson(res, 200, { lobbies: lobbies.listPublic() });
      return true;
    }

    if (url.pathname === "/api/lobbies" && req.method === "POST") {
      const body = await readJson<CreateLobbyBody>(req);
      if (!body?.name || !body.mode || !body.mapId) {
        sendJson(res, 400, { error: "Name, mode, and map are required." });
        return true;
      }
      if (!isGameMode(body.mode)) {
        sendJson(res, 400, { error: "Unknown game mode." });
        return true;
      }
      try {
        const hostName = auth?.displayName ?? "Host";
        const room = lobbies.create(body, auth, hostName);
        sendJson(res, 200, {
          lobby: {
            id: room.id,
            name: room.name,
            mapId: room.mapId,
            mode: room.mode,
            hasPassword: !!room.passwordHash,
          },
        });
      } catch (err) {
        sendJson(res, 400, {
          error: err instanceof Error ? err.message : "Could not create lobby.",
        });
      }
      return true;
    }

    const joinMatch = url.pathname.match(/^\/api\/lobbies\/([^/]+)\/join$/);
    if (joinMatch && req.method === "POST") {
      const lobbyId = decodeURIComponent(joinMatch[1]!);
      const body = await readJson<{ password?: string }>(req);
      const check = lobbies.canJoin(lobbyId, body?.password);
      if (!check.ok) {
        sendJson(res, 403, { error: check.error });
        return true;
      }
      sendJson(res, 200, { lobbyId });
      return true;
    }

    sendJson(res, 404, { error: "Not found." });
    return true;
  };
}
