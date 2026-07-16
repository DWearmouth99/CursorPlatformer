const GUEST_NAME_KEY = "cursorfps_guest";
const LEGACY_TOKEN_KEY = "cursorfps_token";
const LEGACY_PROFILE_KEY = "cursorfps_profile";

/** Clear leftover account session keys from older builds. */
export function clearLegacyAuth(): void {
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_PROFILE_KEY);
}

export function loadGuestName(): string {
  return localStorage.getItem(GUEST_NAME_KEY) ?? "";
}

export function saveGuestName(name: string): void {
  localStorage.setItem(GUEST_NAME_KEY, name.trim().slice(0, 24));
}
