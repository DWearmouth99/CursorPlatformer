import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { PublicProfile } from "@fps/shared";
import {
  createUser,
  findUserById,
  findUserByUsername,
  toPublicProfile,
} from "./store.js";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function secret(): string {
  return (
    process.env.JWT_SECRET ??
    process.env.SESSION_SECRET ??
    "dev-cursor-fps-change-me-in-production"
  );
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signToken(payload: object): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(
    Buffer.from(
      JSON.stringify({
        ...payload,
        exp: Date.now() + TOKEN_TTL_MS,
      }),
    ),
  );
  const sig = createHmac("sha256", secret())
    .update(`${header}.${body}`)
    .digest();
  return `${header}.${body}.${b64url(sig)}`;
}

export function verifyToken(token: string): { userId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = createHmac("sha256", secret())
    .update(`${header}.${body}`)
    .digest();
  const got = Buffer.from(sig!.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
    return null;
  }
  try {
    const json = JSON.parse(
      Buffer.from(body!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8",
      ),
    ) as { sub?: string; exp?: number };
    if (!json.sub || typeof json.exp !== "number" || json.exp < Date.now()) {
      return null;
    }
    return { userId: json.sub };
  } catch {
    return null;
  }
}

export function authFromHeader(
  authHeader: string | undefined,
): PublicProfile | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  const parsed = verifyToken(token);
  if (!parsed) return null;
  const user = findUserById(parsed.userId);
  if (!user) return null;
  return toPublicProfile(user);
}

export function registerAccount(
  username: string,
  password: string,
  displayName: string,
): { token: string; profile: PublicProfile } | { error: string } {
  const name = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(name)) {
    return { error: "Username: 3–20 chars, letters, numbers, underscore." };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }
  const dn = displayName.trim() || name;
  if (dn.length < 2 || dn.length > 24) {
    return { error: "Display name: 2–24 characters." };
  }
  if (findUserByUsername(name)) {
    return { error: "That username is taken." };
  }
  const user = createUser(name, dn, hashPassword(password));
  const profile = toPublicProfile(user);
  const token = signToken({ sub: user.id, username: user.username });
  return { token, profile };
}

export function loginAccount(
  username: string,
  password: string,
): { token: string; profile: PublicProfile } | { error: string } {
  const user = findUserByUsername(username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: "Invalid username or password." };
  }
  const profile = toPublicProfile(user);
  const token = signToken({ sub: user.id, username: user.username });
  return { token, profile };
}

export function issueTokenForUser(userId: string): string | null {
  const user = findUserById(userId);
  if (!user) return null;
  return signToken({ sub: user.id, username: user.username });
}
