import { loadSettings, saveSettings, type GameSettings } from "./settings";

export type PauseHandlers = {
  onResume: () => void;
  onMainMenu: () => void;
  onSettingsChange: (s: GameSettings) => void;
};

/**
 * In-match Esc menu: Resume / Settings / Main Menu.
 */
export function bindPauseMenu(handlers: PauseHandlers) {
  const root = document.getElementById("pause-menu")!;
  const panelMain = document.getElementById("pause-panel-main")!;
  const panelSettings = document.getElementById("pause-panel-settings")!;
  const btnResume = document.getElementById("pause-resume") as HTMLButtonElement;
  const btnSettings = document.getElementById(
    "pause-settings",
  ) as HTMLButtonElement;
  const btnMain = document.getElementById("pause-mainmenu") as HTMLButtonElement;
  const btnBack = document.getElementById(
    "pause-settings-back",
  ) as HTMLButtonElement;
  const sensSlider = document.getElementById(
    "setting-sens",
  ) as HTMLInputElement;
  const sensVal = document.getElementById("setting-sens-val")!;
  const volSlider = document.getElementById("setting-vol") as HTMLInputElement;
  const volVal = document.getElementById("setting-vol-val")!;

  let open = false;
  let settings = loadSettings();

  function syncSliders(): void {
    sensSlider.value = String(settings.mouseSens);
    sensVal.textContent = `${settings.mouseSens.toFixed(2)}×`;
    volSlider.value = String(settings.volume);
    volVal.textContent = `${Math.round(settings.volume * 100)}%`;
  }

  function showMain(): void {
    panelMain.classList.remove("hidden");
    panelSettings.classList.add("hidden");
  }

  function showSettings(): void {
    panelMain.classList.add("hidden");
    panelSettings.classList.remove("hidden");
    syncSliders();
  }

  function setOpen(next: boolean): void {
    open = next;
    root.classList.toggle("hidden", !open);
    if (open) {
      document.exitPointerLock();
      showMain();
      syncSliders();
    }
  }

  btnResume.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(false);
    handlers.onResume();
  });

  btnSettings.addEventListener("click", (e) => {
    e.stopPropagation();
    showSettings();
  });

  btnBack.addEventListener("click", (e) => {
    e.stopPropagation();
    showMain();
  });

  btnMain.addEventListener("click", (e) => {
    e.stopPropagation();
    handlers.onMainMenu();
  });

  sensSlider.addEventListener("input", () => {
    settings = {
      ...settings,
      mouseSens: Number(sensSlider.value),
    };
    sensVal.textContent = `${settings.mouseSens.toFixed(2)}×`;
    saveSettings(settings);
    handlers.onSettingsChange(settings);
  });

  volSlider.addEventListener("input", () => {
    settings = {
      ...settings,
      volume: Number(volSlider.value),
    };
    volVal.textContent = `${Math.round(settings.volume * 100)}%`;
    saveSettings(settings);
    handlers.onSettingsChange(settings);
  });

  // Don't click through to the canvas unlock overlay
  root.addEventListener("click", (e) => e.stopPropagation());

  return {
    setOpen,
    isOpen: () => open,
    getSettings: () => settings,
  };
}
