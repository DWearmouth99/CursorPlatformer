import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import {
  ACTIVE_ARENA_FILE,
  TICK_MS,
  buildArena,
  setActiveLevel,
  type ClientMsg,
  type LevelFile,
} from "@fps/shared";
import { createLobby, type Lobby, type NetPlayer } from "./lobby.js";

const PORT = Number(process.env.PORT ?? 3001);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, "../../client/dist");
const CLIENT_PUBLIC = path.resolve(__dirname, "../../client/public");

function loadActiveArena(): void {
  const candidates = [
    path.join(CLIENT_PUBLIC, "arenas", ACTIVE_ARENA_FILE),
    path.join(CLIENT_DIST, "arenas", ACTIVE_ARENA_FILE),
  ];
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const level = JSON.parse(fs.readFileSync(filePath, "utf8")) as LevelFile;
      setActiveLevel(level);
      console.log(`[server] arena: ${level.name ?? ACTIVE_ARENA_FILE} ← ${filePath}`);
      return;
    } catch (err) {
      console.warn(`[server] failed to read ${filePath}`, err);
    }
  }
  console.warn(
    `[server] ${ACTIVE_ARENA_FILE} not found — using bundled default arena`,
  );
}

loadActiveArena();
const arena = buildArena();
let nextId = 1;
const allocId = () => String(nextId++);

const lobby = createLobby("gun_game", arena.solids, allocId);

type Session = { lobby: Lobby; player: NetPlayer };

function findSession(ws: WebSocket): Session | null {
  const player = lobby.findByWs(ws);
  if (player) return { lobby, player };
  return null;
}

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
    const player = lobby.spawnPlayer(ws);
    // syncBots runs inside spawnPlayer (fill/replace AI seats)
    console.log(
      `[server] joined gun_game as ${player.id} (players=${lobby.players.size} bots=${
        [...lobby.players.values()].filter((p) => p.isBot).length
      })`,
    );
    return;
  }

  if (!session) return;
  session.lobby.handleMessage(session.player, msg);
}

function onWsConnection(ws: WebSocket): void {
  ws.on("message", (data) => {
    const raw = typeof data === "string" ? data : data.toString();
    let session = findSession(ws);
    onMessage(ws, session, raw);
    if (!session) session = findSession(ws);
  });

  ws.on("close", () => {
    lobby.removeByWs(ws);
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

const httpServer = http.createServer(serveStatic);
const wss = new WebSocketServer({ server: httpServer });
wss.on("connection", onWsConnection);

setInterval(() => {
  lobby.tickOnce();
}, TICK_MS);

httpServer.listen(PORT, () => {
  const hasClient = fs.existsSync(path.join(CLIENT_DIST, "index.html"));
  console.log(
    `[server] listening on :${PORT} (gun game${hasClient ? "" : ", client/dist missing"})`,
  );
});
