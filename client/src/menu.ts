import { type GameMode } from "@fps/shared";
import { loadSettings, saveSettings, type GameSettings } from "./settings";

export type MenuSelection = {
  mode: GameMode;
};

/**
 * Pixel wooden-plank main menu. Resolves when Play is chosen.
 */
export function showMainMenu(
  onSettingsChange?: (s: GameSettings) => void,
): Promise<MenuSelection> {
  const root = document.getElementById("main-menu")!;
  const home = document.getElementById("menu-home")!;
  const settingsPanel = document.getElementById("menu-settings")!;
  const creditsPanel = document.getElementById("menu-credits")!;
  const playBtn = document.getElementById("play-btn") as HTMLButtonElement;
  const settingsBtn = document.getElementById(
    "menu-settings-btn",
  ) as HTMLButtonElement;
  const creditsBtn = document.getElementById(
    "menu-credits-btn",
  ) as HTMLButtonElement;
  const exitBtn = document.getElementById("menu-exit-btn") as HTMLButtonElement;
  const settingsBack = document.getElementById(
    "menu-settings-back",
  ) as HTMLButtonElement;
  const creditsBack = document.getElementById(
    "menu-credits-back",
  ) as HTMLButtonElement;
  const sensSlider = document.getElementById(
    "menu-setting-sens",
  ) as HTMLInputElement;
  const sensVal = document.getElementById("menu-setting-sens-val")!;
  const volSlider = document.getElementById(
    "menu-setting-vol",
  ) as HTMLInputElement;
  const volVal = document.getElementById("menu-setting-vol-val")!;
  const musicSlider = document.getElementById(
    "menu-setting-music",
  ) as HTMLInputElement;
  const musicVal = document.getElementById("menu-setting-music-val")!;
  const fullscreenCheck = document.getElementById(
    "menu-setting-fullscreen",
  ) as HTMLInputElement;
  const fullscreenVal = document.getElementById("menu-setting-fullscreen-val")!;

  let settings = loadSettings();

  function syncSliders(): void {
    sensSlider.value = String(settings.mouseSens);
    sensVal.textContent = `${settings.mouseSens.toFixed(2)}x`;
    volSlider.value = String(settings.volume);
    volVal.textContent = `${Math.round(settings.volume * 100)}%`;
    musicSlider.value = String(settings.musicVolume);
    musicVal.textContent = `${Math.round(settings.musicVolume * 100)}%`;
    fullscreenCheck.checked = settings.fullscreen;
    fullscreenVal.textContent = settings.fullscreen ? "On" : "Off";
  }

  function showPanel(which: "home" | "settings" | "credits"): void {
    home.classList.toggle("hidden", which !== "home");
    settingsPanel.classList.toggle("hidden", which !== "settings");
    creditsPanel.classList.toggle("hidden", which !== "credits");
    if (which === "settings") syncSliders();
  }

  root.classList.remove("hidden");
  showPanel("home");
  syncSliders();
  requestAnimationFrame(() => root.classList.add("menu-ready"));

  sensSlider.oninput = () => {
    settings = { ...settings, mouseSens: Number(sensSlider.value) };
    sensVal.textContent = `${settings.mouseSens.toFixed(2)}x`;
    saveSettings(settings);
    onSettingsChange?.(settings);
  };

  volSlider.oninput = () => {
    settings = { ...settings, volume: Number(volSlider.value) };
    volVal.textContent = `${Math.round(settings.volume * 100)}%`;
    saveSettings(settings);
    onSettingsChange?.(settings);
  };

  musicSlider.oninput = () => {
    settings = { ...settings, musicVolume: Number(musicSlider.value) };
    musicVal.textContent = `${Math.round(settings.musicVolume * 100)}%`;
    saveSettings(settings);
    onSettingsChange?.(settings);
  };

  fullscreenCheck.onchange = () => {
    settings = { ...settings, fullscreen: fullscreenCheck.checked };
    fullscreenVal.textContent = settings.fullscreen ? "On" : "Off";
    saveSettings(settings);
    onSettingsChange?.(settings);
  };

  settingsBtn.onclick = () => showPanel("settings");
  creditsBtn.onclick = () => showPanel("credits");
  settingsBack.onclick = () => showPanel("home");
  creditsBack.onclick = () => showPanel("home");

  exitBtn.onclick = () => {
    window.close();
    // Browsers block window.close() unless opened by script — soft fallback:
    exitBtn.querySelector("span")!.textContent = "Bye!";
    window.setTimeout(() => {
      exitBtn.querySelector("span")!.textContent = "Exit";
    }, 1200);
  };

  return new Promise((resolve) => {
    playBtn.onclick = () => {
      root.classList.remove("menu-ready");
      root.classList.add("menu-leaving");
      window.setTimeout(() => {
        root.classList.add("hidden");
        root.classList.remove("menu-leaving");
        resolve({ mode: "gun_game" });
      }, 380);
    };
  });
}
