import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { TICK_MS, type ClientMsg, type JoinMsg } from "@fps/shared";
import { createApiHandler } from "./api.js";
import { verifyToken } from "./auth.js";
import { createLobbyManager } from "./lobbyManager.js";
import { resolveMapPaths } from "./maps.js";
import { flushStore, getProfile, initStore } from "./store.js";
import type { NetPlayer } from "./lobby.js";

const PORT = Number(process.env.PORT ?? 3001);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, "../../client/dist");
const CLIENT_PUBLIC = path.resolve(__dirname, "../../client/public");
const DATA_DIR = process.env.DATA_DIR ?? path.resolve(__dirname, "../../data");

initStore(DATA_DIR);

let nextId = 1;
const allocId = () => String(nextId++);

const arenaDirs = resolveMapPaths(CLIENT_PUBLIC, CLIENT_DIST);
const lobbies = createLobbyManager(arenaDirs, allocId);
const handleApi = createApiHandler(lobbies);

type Session = { lobbyId: string; player: NetPlayer };

function onMessage(ws: WebSocket, session: Session | null, raw: string): void {
  let msg: ClientMsg;
  try {
    msg = JSON.parse(raw) as ClientMsg;
  } catch {
    return;
  }
  if (!msg || typeof msg !== "object" || !("type" in msg)) return;

  if (msg.type === "join") {
    if (session) return;
    handleJoin(ws, msg);
    return;
  }

  if (!session) return;
  const room = lobbies.get(session.lobbyId);
  if (!room) return;
  room.instance.handleMessage(session.player, msg);
}

function handleJoin(ws: WebSocket, msg: JoinMsg): void {
  const lobbyId = msg.lobbyId?.trim() || "official";
  const room = lobbies.get(lobbyId);
  if (!room) {
    ws.close(4004, "Lobby not found");
    return;
  }

  const check = lobbies.canJoin(lobbyId, msg.password);
  if (!check.ok) {
    ws.close(4003, check.error);
    return;
  }

  let accountId: string | null = null;
  let displayName = msg.displayName?.trim().slice(0, 24) ?? "";

  if (msg.token) {
    const auth = verifyToken(msg.token);
    if (auth) {
      accountId = auth.userId;
      if (!displayName) {
        const profile = getProfile(auth.userId);
        displayName = profile?.displayName ?? "Player";
      }
    }
  }

  if (!displayName) {
    displayName = `Guest-${Math.floor(Math.random() * 9000 + 1000)}`;
  }

  const result = lobbies.joinPlayer(lobbyId, ws, {
    accountId,
    displayName,
  });
  if ("error" in result) {
    ws.close(4003, result.error);
    return;
  }

  console.log(
    `[server] ${displayName} joined ${lobbyId} (${room.name})`,
  );
}

function onWsConnection(ws: WebSocket): void {
  ws.on("message", (data) => {
    const raw = typeof data === "string" ? data : data.toString();
    const found = lobbies.findSession(ws);
    const session = found
      ? { lobbyId: found.room.id, player: found.player }
      : null;
    onMessage(ws, session, raw);
  });

  ws.on("close", () => {
    lobbies.leaveByWs(ws);
  });
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function serveStatic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }

  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0] || "/");
  let filePath = path.join(CLIENT_DIST, urlPath === "/" ? "index.html" : urlPath);

  if (!filePath.startsWith(CLIENT_DIST)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(CLIENT_DIST, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(
      "Client build missing. Run npm run build before starting the server.",
    );
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

const httpServer = http.createServer((req, res) => {
  void handleApi(req, res).then((handled) => {
    if (handled) return;
    serveStatic(req, res);
  });
});

const wss = new WebSocketServer({ server: httpServer });
wss.on("connection", onWsConnection);

setInterval(() => {
  lobbies.tickAll();
}, TICK_MS);

process.on("SIGINT", () => {
  flushStore();
  process.exit(0);
});
process.on("SIGTERM", () => {
  flushStore();
  process.exit(0);
});

httpServer.listen(PORT, () => {
  const hasClient = fs.existsSync(path.join(CLIENT_DIST, "index.html"));
  console.log(
    `[server] listening on :${PORT} (lobbies + accounts${hasClient ? "" : ", client/dist missing"})`,
  );
});
