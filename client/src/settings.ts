export type GameSettings = {
  mouseSens: number;
  /** Master / SFX volume 0–1. */
  volume: number;
  /** Background music volume 0–1. */
  musicVolume: number;
};

/** Bump when audio defaults change so refresh picks up latest loudness. */
const KEY = "cursorfps_settings_v5";

/**
 * Latest agreed defaults (music quieter, SFX a bit softer for footsteps mix).
 * Slider changes still persist on top of these.
 */
const DEFAULTS: GameSettings = {
  mouseSens: 1,
  volume: 0.55,
  musicVolume: 0.018,
};

export function loadSettings(): GameSettings {
  try {
    const raw =
      localStorage.getItem(KEY) ??
      localStorage.getItem("cursorfps_settings_v3") ??
      localStorage.getItem("cursorfps_settings_v1");
    if (!raw) return { ...DEFAULTS };

    const parsed = JSON.parse(raw) as Partial<GameSettings> & {
      _key?: string;
    };
    const fromLatest = !!localStorage.getItem(KEY);

    // Fresh key: use saved slider values. Older keys: adopt new audio defaults
    // but keep mouse sens from the previous save.
    const settings: GameSettings = {
      mouseSens: clamp(
        Number(parsed.mouseSens ?? DEFAULTS.mouseSens),
        0.2,
        3,
      ),
      volume: fromLatest
        ? clamp(Number(parsed.volume ?? DEFAULTS.volume), 0, 1)
        : DEFAULTS.volume,
      musicVolume: fromLatest
        ? clamp(Number(parsed.musicVolume ?? DEFAULTS.musicVolume), 0, 1)
        : DEFAULTS.musicVolume,
    };

    // Migrate older saves onto the new key immediately.
    if (!fromLatest) saveSettings(settings);
    return settings;
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
