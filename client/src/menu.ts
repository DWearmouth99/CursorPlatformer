import {
  GAME_MODE_CATALOG,
  type GameMode,
  type GameModeDef,
  type LobbySummary,
} from "@fps/shared";
import { listLobbies, validateLobbyJoin } from "./api.js";
import { loadSettings, saveSettings, type GameSettings, type GraphicsQuality } from "./settings.js";

function qualityLabel(q: GraphicsQuality): string {
  if (q === "low") return "Low";
  if (q === "high") return "High";
  return "Medium";
}
import {
  clearLegacyAuth,
  loadGuestName,
  saveGuestName,
} from "./session.js";

export type MenuSelection = {
  mode: GameMode;
  lobbyId: string;
  lobbyName: string;
  mapId: string;
  displayName: string;
};

const AUTOPLAY_KEY = "cursorfps_autoplay";

export type AutoplayPayload = {
  lobbyId: string;
  lobbyName: string;
  mapId: string;
  mode: GameMode;
  displayName: string;
};

export function stashAutoplay(payload: AutoplayPayload): void {
  sessionStorage.setItem(AUTOPLAY_KEY, JSON.stringify(payload));
}

function consumeAutoplay(): AutoplayPayload | null {
  const raw = sessionStorage.getItem(AUTOPLAY_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(AUTOPLAY_KEY);
  try {
    return JSON.parse(raw) as AutoplayPayload;
  } catch {
    return null;
  }
}

/**
 * Name gate → global mode lobbies.
 */
export function showMainMenu(
  onSettingsChange?: (s: GameSettings) => void,
): Promise<MenuSelection> {
  clearLegacyAuth();

  const root = document.getElementById("main-menu")!;
  const authPanel = document.getElementById("gate-auth")!;
  const lobbyPanel = document.getElementById("gate-lobbies")!;
  const formGuest = document.getElementById("auth-form-guest") as HTMLFormElement;
  const nameError = document.getElementById("auth-name-error")!;
  const modeGrid = document.getElementById("mode-lobby-grid")!;
  const lobbyEmpty = document.getElementById("lobby-list-empty")!;
  const lobbyListError = document.getElementById("lobby-list-error")!;
  const playerNameEl = document.getElementById("gate-player-name")!;

  const settingsOverlay = document.getElementById("menu-settings-panel")!;
  const creditsOverlay = document.getElementById("menu-credits-panel")!;

  let modes: GameModeDef[] = [...GAME_MODE_CATALOG];
  let displayName = "";
  let settings = loadSettings();
  let refreshTimer: number | null = null;

  const sensSlider = document.getElementById("menu-setting-sens") as HTMLInputElement;
  const sensVal = document.getElementById("menu-setting-sens-val")!;
  const volSlider = document.getElementById("menu-setting-vol") as HTMLInputElement;
  const volVal = document.getElementById("menu-setting-vol-val")!;
  const musicSlider = document.getElementById("menu-setting-music") as HTMLInputElement;
  const musicVal = document.getElementById("menu-setting-music-val")!;
  const fullscreenCheck = document.getElementById(
    "menu-setting-fullscreen",
  ) as HTMLInputElement;
  const fullscreenVal = document.getElementById("menu-setting-fullscreen-val")!;
  const qualitySelect = document.getElementById(
    "menu-setting-quality",
  ) as HTMLSelectElement;
  const qualityVal = document.getElementById("menu-setting-quality-val")!;

  function syncSliders(): void {
    sensSlider.value = String(settings.mouseSens);
    sensVal.textContent = `${settings.mouseSens.toFixed(2)}x`;
    volSlider.value = String(settings.volume);
    volVal.textContent = `${Math.round(settings.volume * 100)}%`;
    musicSlider.value = String(settings.musicVolume);
    musicVal.textContent = `${Math.round(settings.musicVolume * 100)}%`;
    fullscreenCheck.checked = settings.fullscreen;
    fullscreenVal.textContent = settings.fullscreen ? "On" : "Off";
    qualitySelect.value = settings.graphicsQuality;
    qualityVal.textContent = qualityLabel(settings.graphicsQuality);
  }

  function showError(el: HTMLElement, msg: string): void {
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  function hideError(el: HTMLElement): void {
    el.classList.add("hidden");
  }

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function modePreviewClass(modeId: string): string {
    if (modeId === "snipers_only") return "mode-card-preview-snipers";
    if (modeId === "king_of_the_hill") return "mode-card-preview-koth";
    return "mode-card-preview-gun";
  }

  function renderModeCard(
    mode: GameModeDef,
    lobby: LobbySummary | undefined,
  ): string {
    const players = lobby?.players ?? 0;
    const max = lobby?.maxPlayers ?? 12;
    const mapName = lobby?.mapName ?? "—";
    const fill = Math.round((players / max) * 100);
    const disabled = !lobby;
    return `<article class="mode-card ${disabled ? "mode-card-disabled" : ""}" data-mode="${mode.id}">
      <div class="mode-card-preview ${modePreviewClass(mode.id)}" aria-hidden="true"></div>
      <div class="mode-card-body">
        <h3 class="mode-card-title">${escapeHtml(mode.name)}</h3>
        <p class="mode-card-blurb">${escapeHtml(mode.blurb)}</p>
        <div class="mode-card-meta">
          <span class="mode-card-map">Map · ${escapeHtml(mapName)}</span>
          <span class="mode-card-count">${players}/${max}</span>
        </div>
        <div class="mode-card-fill"><div style="width:${fill}%"></div></div>
        <button type="button" class="wood-btn wood-btn-sm mode-join-btn" ${disabled ? "disabled" : ""} data-lobby="${lobby?.id ?? ""}">
          <span>${disabled ? "Offline" : "Join lobby"}</span>
        </button>
      </div>
    </article>`;
  }

  async function refreshLobbies(): Promise<void> {
    hideError(lobbyListError);
    const res = await listLobbies();
    if (!res.ok) {
      modeGrid.innerHTML = modes
        .map((m) => renderModeCard(m, undefined))
        .join("");
      showError(lobbyListError, res.error);
      lobbyEmpty.classList.add("hidden");
      return;
    }

    const byMode = new Map(res.lobbies.map((l) => [l.mode, l]));
    modeGrid.innerHTML = modes
      .map((m) => renderModeCard(m, byMode.get(m.id)))
      .join("");
    lobbyEmpty.classList.toggle("hidden", res.lobbies.length > 0);
  }

  function showNameGate(): void {
    authPanel.classList.remove("hidden");
    lobbyPanel.classList.add("hidden");
    if (refreshTimer != null) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function showLobbies(): void {
    authPanel.classList.add("hidden");
    lobbyPanel.classList.remove("hidden");
    playerNameEl.textContent = displayName;
    void refreshLobbies();
    if (refreshTimer != null) window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(() => void refreshLobbies(), 4000);
  }

  function leaveMenu(): void {
    if (refreshTimer != null) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
    root.classList.remove("menu-ready");
    root.classList.add("menu-leaving");
  }

  let resolveSelection!: (sel: MenuSelection) => void;

  function finish(sel: MenuSelection): void {
    leaveMenu();
    window.setTimeout(() => {
      root.classList.add("hidden");
      root.classList.remove("menu-leaving");
      resolveSelection(sel);
    }, 380);
  }

  async function attemptJoin(lobby: LobbySummary): Promise<void> {
    const check = await validateLobbyJoin(lobby.id);
    if (!check.ok) {
      showError(lobbyListError, check.error);
      return;
    }
    finish({
      mode: lobby.mode,
      lobbyId: lobby.id,
      lobbyName: lobby.name,
      mapId: lobby.mapId,
      displayName,
    });
  }

  root.classList.remove("hidden");
  syncSliders();
  requestAnimationFrame(() => root.classList.add("menu-ready"));

  const guestInput = document.getElementById("auth-guest-name") as HTMLInputElement;
  guestInput.value = loadGuestName();

  const autoplay = consumeAutoplay();
  if (autoplay?.displayName && autoplay.lobbyId) {
    displayName = autoplay.displayName;
    saveGuestName(displayName);
    return new Promise((resolve) => {
      resolveSelection = resolve;
      finish({
        mode: autoplay.mode,
        lobbyId: autoplay.lobbyId,
        lobbyName: autoplay.lobbyName,
        mapId: autoplay.mapId,
        displayName,
      });
    });
  }

  formGuest.onsubmit = (e) => {
    e.preventDefault();
    hideError(nameError);
    const name = guestInput.value.trim();
    if (name.length < 2) {
      showError(nameError, "Name needs at least 2 characters.");
      return;
    }
    displayName = name.slice(0, 24);
    saveGuestName(displayName);
    showLobbies();
  };

  document.getElementById("gate-change-name")!.onclick = () => {
    showNameGate();
  };

  document.getElementById("lobby-refresh")!.onclick = () => {
    void refreshLobbies();
  };

  modeGrid.onclick = (ev) => {
    const btn = (ev.target as HTMLElement).closest(
      ".mode-join-btn",
    ) as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    const card = btn.closest(".mode-card") as HTMLElement;
    const mode = card?.dataset.mode as GameMode | undefined;
    const lobbyId = btn.dataset.lobby;
    if (!mode || !lobbyId) return;
    void listLobbies().then((res) => {
      if (!res.ok) {
        showError(lobbyListError, res.error);
        return;
      }
      const lobby = res.lobbies.find((l) => l.id === lobbyId);
      if (!lobby) {
        showError(lobbyListError, "That lobby went offline — try refresh.");
        void refreshLobbies();
        return;
      }
      void attemptJoin(lobby);
    });
  };

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
  qualitySelect.onchange = () => {
    const q = qualitySelect.value as GraphicsQuality;
    settings = {
      ...settings,
      graphicsQuality: q === "low" || q === "high" || q === "medium" ? q : "medium",
    };
    qualityVal.textContent = qualityLabel(settings.graphicsQuality);
    saveSettings(settings);
    onSettingsChange?.(settings);
  };

  document.getElementById("menu-settings-btn")!.onclick = () => {
    syncSliders();
    settingsOverlay.classList.remove("hidden");
  };
  document.getElementById("menu-settings-back")!.onclick = () => {
    settingsOverlay.classList.add("hidden");
  };
  document.getElementById("menu-credits-btn")!.onclick = () => {
    creditsOverlay.classList.remove("hidden");
  };
  document.getElementById("menu-credits-back")!.onclick = () => {
    creditsOverlay.classList.add("hidden");
  };

  // Returning players with a saved name skip straight to mode select
  const saved = loadGuestName().trim();
  if (saved.length >= 2) {
    displayName = saved;
    showLobbies();
  } else {
    showNameGate();
  }

  return new Promise((resolve) => {
    resolveSelection = resolve;
  });
}
