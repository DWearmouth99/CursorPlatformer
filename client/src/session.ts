import type { AuthSession, PublicProfile } from "@fps/shared";

const TOKEN_KEY = "cursorfps_token";
const PROFILE_KEY = "cursorfps_profile";
const GUEST_NAME_KEY = "cursorfps_guest";

export function loadSession(): AuthSession | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!token || !raw) return null;
  try {
    const profile = JSON.parse(raw) as PublicProfile;
    return { token, profile };
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession): void {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(PROFILE_KEY, JSON.stringify(session.profile));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROFILE_KEY);
}

export function authHeader(): Record<string, string> {
  const s = loadSession();
  if (!s) return {};
  return { Authorization: `Bearer ${s.token}` };
}

export function loadGuestName(): string {
  return localStorage.getItem(GUEST_NAME_KEY) ?? "";
}

export function saveGuestName(name: string): void {
  localStorage.setItem(GUEST_NAME_KEY, name.trim().slice(0, 24));
}

export function updateStoredProfile(profile: PublicProfile): void {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
