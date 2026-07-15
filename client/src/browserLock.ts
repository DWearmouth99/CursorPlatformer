/**
 * Fullscreen + Keyboard Lock so browser chrome shortcuts (Ctrl+W / Ctrl+R)
 * don't steal game keys. Keyboard Lock needs a secure context and is Chromium-first.
 */

type KeyboardLockNav = Navigator & {
  keyboard?: { lock: (keys?: string[]) => Promise<void>; unlock: () => void };
};

const LOCK_KEYS = [
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyR",
  "KeyQ",
  "KeyE",
  "KeyC",
  "KeyV",
  "KeyT",
  "KeyN",
  "Tab",
  "Space",
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "F5",
  "F11",
  "Escape",
  "Digit1",
  "Digit2",
];

export async function enterPlayMode(
  root: HTMLElement = document.documentElement,
  opts: { fullscreen?: boolean } = {},
): Promise<void> {
  const wantFs = opts.fullscreen === true;
  try {
    if (wantFs && !document.fullscreenElement) {
      await root.requestFullscreen?.();
    } else if (!wantFs && document.fullscreenElement) {
      await document.exitFullscreen?.();
    }
  } catch {
    /* user gesture / unsupported */
  }

  const nav = navigator as KeyboardLockNav;
  try {
    if (nav.keyboard?.lock) {
      await nav.keyboard.lock(LOCK_KEYS);
    }
  } catch {
    /* not supported outside Chromium / needs fullscreen */
  }
}

/** Drop keyboard capture but keep fullscreen (pause menu). */
export function unlockGameKeys(): void {
  const nav = navigator as KeyboardLockNav;
  try {
    nav.keyboard?.unlock?.();
  } catch {
    /* ignore */
  }
}

/** Leave fullscreen + keyboard lock (main menu / leave match). */
export function exitPlayMode(): void {
  unlockGameKeys();
  if (document.fullscreenElement) {
    void document.exitFullscreen?.();
  }
}

/** Block common page-close / refresh combos while the mouse is captured. */
export function shouldBlockBrowserShortcut(e: KeyboardEvent): boolean {
  if (document.pointerLockElement == null) return false;
  const key = e.code;
  if (key === "F5" || key === "F11") return true;
  if (e.ctrlKey || e.metaKey) {
    if (
      key === "KeyW" ||
      key === "KeyR" ||
      key === "KeyT" ||
      key === "KeyN" ||
      key === "KeyL" ||
      key === "KeyP" ||
      key === "KeyS" ||
      key === "KeyD" ||
      key === "KeyF" ||
      key === "KeyG" ||
      key === "KeyH" ||
      key === "KeyJ" ||
      key === "KeyU" ||
      key === "Tab"
    ) {
      return true;
    }
  }
  // Game keys that browsers may scroll / activate with
  if (
    key === "Space" ||
    key === "Tab" ||
    key === "KeyR" ||
    key === "ControlLeft" ||
    key === "ControlRight" ||
    key === "KeyW" ||
    key === "KeyA" ||
    key === "KeyS" ||
    key === "KeyD" ||
    key === "KeyQ" ||
    key === "KeyE"
  ) {
    return true;
  }
  return false;
}
