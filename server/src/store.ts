import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { EMPTY_STATS, type PlayerStats, type PublicProfile } from "@fps/shared";

export type UserRow = {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  createdAt: number;
};

type DbShape = {
  users: UserRow[];
  stats: Record<string, PlayerStats>;
};

const DEFAULT_DB: DbShape = { users: [], stats: {} };

let db: DbShape = structuredClone(DEFAULT_DB);
let dbPath = "";
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function initStore(dataDir: string): void {
  dbPath = path.join(dataDir, "players.json");
  fs.mkdirSync(dataDir, { recursive: true });
  if (fs.existsSync(dbPath)) {
    try {
      db = JSON.parse(fs.readFileSync(dbPath, "utf8")) as DbShape;
      if (!Array.isArray(db.users)) db.users = [];
      if (!db.stats || typeof db.stats !== "object") db.stats = {};
    } catch (err) {
      console.warn("[store] corrupt db — starting fresh", err);
      db = structuredClone(DEFAULT_DB);
    }
  } else {
    flushStore();
  }
  console.log(`[store] ${db.users.length} accounts @ ${dbPath}`);
}

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushStore();
  }, 250);
}

export function flushStore(): void {
  if (!dbPath) return;
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
}

function statsOf(userId: string): PlayerStats {
  return db.stats[userId] ?? { ...EMPTY_STATS };
}

export function toPublicProfile(user: UserRow): PublicProfile {
  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    stats: statsOf(user.id),
    createdAt: user.createdAt,
  };
}

export function findUserByUsername(username: string): UserRow | null {
  const key = username.trim().toLowerCase();
  return db.users.find((u) => u.username === key) ?? null;
}

export function findUserById(id: string): UserRow | null {
  return db.users.find((u) => u.id === id) ?? null;
}

export function createUser(
  username: string,
  displayName: string,
  passwordHash: string,
): UserRow {
  const row: UserRow = {
    id: randomUUID(),
    username: username.trim().toLowerCase(),
    displayName: displayName.trim().slice(0, 24),
    passwordHash,
    createdAt: Date.now(),
  };
  db.users.push(row);
  db.stats[row.id] = { ...EMPTY_STATS };
  scheduleSave();
  return row;
}

export function recordMatchResults(
  rows: {
    accountId: string;
    kills: number;
    deaths: number;
    gunLevel: number;
    won: boolean;
  }[],
): void {
  for (const row of rows) {
    const s = statsOf(row.accountId);
    s.kills += row.kills;
    s.deaths += row.deaths;
    s.matches += 1;
    s.peakGunLevel = Math.max(s.peakGunLevel, row.gunLevel + 1);
    if (row.won) s.wins += 1;
    const xpGain =
      row.kills * 12 +
      (row.won ? 120 : 20) +
      row.gunLevel * 8;
    s.xp += xpGain;
    db.stats[row.accountId] = s;
  }
  scheduleSave();
}

export function getProfile(userId: string): PublicProfile | null {
  const user = findUserById(userId);
  if (!user) return null;
  return toPublicProfile(user);
}
