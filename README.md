# Cursor FPS

Browser-based multiplayer FPS foundation (Counter-Strike–inspired): Three.js client, Node.js authoritative server, shared simulation constants.

## Requirements

- Node.js 20+
- npm 10+

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

- Client: [http://localhost:5173](http://localhost:5173)
- Server: `ws://localhost:3001` (64-tick authoritative)

Or separately: `npm run dev:server` and `npm run dev:client`.

### Classes

Pick a class on the main menu before joining:

| Class | Weapon | Notes |
|-------|--------|-------|
| Rifleman | Assault Rifle | Balanced |
| Scout | SMG | Faster move, high RoF |
| Sniper | Sniper Rifle | High damage, slow fire |
| Breacher | Shotgun | Pellet spread, CQC |

Players start with **200 HP**.

### Controls

| Input | Action |
|-------|--------|
| Click | Pointer lock (+ unlock audio) |
| WASD | Move |
| Mouse | Look |
| Space | Jump |
| Ctrl | Crouch |
| LMB | Fire |
| RMB | Aim down sights / scope |
| Q / E | Lean peek left / right |
| R | Reload (2.5s) |
| Tab | Scoreboard |
| Esc | Release pointer |

Sounds are procedural (Web Audio): gunfire, hit confirm, damage, reload, footsteps, death.

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
