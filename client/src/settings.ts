export type GraphicsQuality = "low" | "medium" | "high";

export type GameSettings = {
  mouseSens: number;
  /** Master / SFX volume 0–1. */
  volume: number;
  /** Background music volume 0–1. */
  musicVolume: number;
  /** Request browser fullscreen when entering play. */
  fullscreen: boolean;
  /**
   * Visual quality tier. `low` matches legacy performance
   * (no real-time shadows, capped DPR).
   */
  graphicsQuality: GraphicsQuality;
};

/** Bump when defaults / schema change so refresh picks up new fields. */
const KEY = "cursorfps_settings_v7";

/**
 * Latest agreed defaults (music quieter, SFX a bit softer for footsteps mix).
 * Slider changes still persist on top of these.
 */
const DEFAULTS: GameSettings = {
  mouseSens: 1,
  volume: 0.55,
  musicVolume: 0.018,
  fullscreen: false,
  graphicsQuality: "medium",
};

function parseQuality(raw: unknown): GraphicsQuality {
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  return DEFAULTS.graphicsQuality;
}

export function loadSettings(): GameSettings {
  try {
    const raw =
      localStorage.getItem(KEY) ??
      localStorage.getItem("cursorfps_settings_v6") ??
      localStorage.getItem("cursorfps_settings_v5") ??
      localStorage.getItem("cursorfps_settings_v3") ??
      localStorage.getItem("cursorfps_settings_v1");
    if (!raw) return { ...DEFAULTS };

    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    const fromLatest = !!localStorage.getItem(KEY);

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
      fullscreen:
        typeof parsed.fullscreen === "boolean"
          ? parsed.fullscreen
          : DEFAULTS.fullscreen,
      graphicsQuality: parseQuality(parsed.graphicsQuality),
    };

    if (!fromLatest) saveSettings(settings);
    return settings;
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(next: GameSettings): void {
  localStorage.setItem(KEY, JSON.stringify(next));
}

/** Shadow map resolution by tier (0 = shadows off). */
export function shadowMapSizeForQuality(q: GraphicsQuality): number {
  if (q === "high") return 2048;
  if (q === "medium") return 1024;
  return 0;
}

/** Device pixel ratio cap by tier. */
export function pixelRatioForQuality(q: GraphicsQuality): number {
  if (q === "low") return Math.min(window.devicePixelRatio, 1.5);
  return Math.min(window.devicePixelRatio, 2);
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
