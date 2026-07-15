# Cursor FPS

Browser-based multiplayer FPS foundation (Counter-Strike–inspired): Three.js client, Node.js authoritative server, shared simulation constants.

## Requirements

- Node.js 20+
- npm 10+

## Deploy (Render)

One Web Service can host both the static client and the WebSocket server.

- **Root directory:** leave blank (repo root), not `server/` or `client/`
- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- **Play at:** `https://cursorplatformer.onrender.com` (same origin — WebSocket works automatically)

### Client on Vercel + server on Render

Vercel can only host the static client. Point it at Render with:

```bash
# client/.env.production (or Vercel env var)
VITE_WS_URL=wss://cursorplatformer.onrender.com
```

Redeploy the Vercel app after setting that. The game server must still run on Render (`npm start`).

Locally the Vite app still uses `ws://localhost:3001`.

## Install

```bash
npm install
```

## Run locally

```bash
npm run dev
```

- Client: [http://localhost:5173](http://localhost:5173)
- Server: `ws://localhost:3001` (64-tick authoritative)
- **Level editor:** [http://localhost:5173/editor.html](http://localhost:5173/editor.html)

Or separately: `npm run dev:server` and `npm run dev:client`.

### Level editor

Design the arena yourself with drag-and-drop props:

1. Run `npm run dev` and open `/editor.html`.
2. Pick a model in the left palette, click the ground to place it.
3. Select objects and use the gizmo to move (keys **1/2/3** = translate/rotate/scale, **Q/E** rotate).
4. Toggle **Solid** so players collide / can stand on it (shown as orange wire boxes).
5. **Download** and save as `client/public/arenas/grassareana.json`.
6. Restart the server (and refresh the client) so both use the new layout.

The live map is loaded from **`client/public/arenas/grassareana.json`** (client fetch + server file read).

### Gun Game

FFA ladder mode. Everyone starts with the Pea Shooter; one kill advances you through **20** weapons — first kill with the **Golden Banana** wins the match and returns everyone to the menu. Short-range toys (Tactical Slap, Gravity Hammer, Ban Hammer) use a max range clamp. Players start with **200 HP**.

### Controls

| Input | Action |
|-------|--------|
| Click | Pointer lock (+ unlock audio) |
| WASD | Move |
| Mouse | Look |
| Space | Jump |
| C | Crouch |
| LMB | Fire |
| RMB | Aim down sights / scope |
| Q / E | Lean peek left / right |
| R | Reload |
| Tab | Scoreboard |
| Esc | Pause / release pointer |

Click-to-play also requests **fullscreen** + keyboard lock (Chromium) so Ctrl+W / Ctrl+R don't close or refresh the tab mid-fight.

Sounds: procedural Web Audio plus `hitmarker.mp3` / `reload.mp3` clips.

### Test multiplayer locally

1. Run `npm run dev`.
2. Open **two** browser windows to `http://localhost:5173`.
3. Confirm opposite teams (T/CT) and different player ids.
4. Move in one window — the other sees a smooth remote player box (~100ms interp).
5. Shoot the other player: hit marker on confirmed hits; victim gets a red damage flash.
6. Headshots deal 2× damage (60). Body 30. Death → 3s respawn at team pad.
7. Empty the mag (30) → **R** to reload. Spray climbs vertically with slight yaw sway.
8. Hold **Tab** for K/D scoreboard; kill feed appears top-right.

### Architecture

- Clients send **input commands** only (never positions or hit claims).
- Server simulates movement with shared `applyMovement`, validates hitscan, broadcasts snapshots.
- Local player: client-side prediction + soft reconciliation.
- Remotes: entity interpolation.
- Lag compensation rewinds target poses by the client interpolation delay via `getPlayerPoseAtTime`.
- Shot aim uses the client's viewangles once (no double-applied recoil).

Movement feel is tuned in `shared/src/constants.ts` (`MOVE.*`).
