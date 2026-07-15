export type GameSettings = {
  mouseSens: number;
  /** Master / SFX volume 0–1. */
  volume: number;
  /** Background music volume 0–1 (default 2%). */
  musicVolume: number;
};

const KEY = "cursorfps_settings_v3";

const DEFAULTS: GameSettings = {
  mouseSens: 1,
  volume: 0.6,
  musicVolume: 0.02,
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem("cursorfps_settings_v1");
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      mouseSens: clamp(
        Number(parsed.mouseSens ?? DEFAULTS.mouseSens),
        0.2,
        3,
      ),
      volume: clamp(Number(parsed.volume ?? DEFAULTS.volume), 0, 1),
      musicVolume: clamp(
        Number(parsed.musicVolume ?? DEFAULTS.musicVolume),
        0,
        1,
      ),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(next: GameSettings): void {
  localStorage.setItem(KEY, JSON.stringify(next));
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
