import {
  GAME_MODE_CATALOG,
  MAP_CATALOG,
  type GameMode,
  type GameModeDef,
  type LobbySummary,
  type MapDef,
  type PublicProfile,
} from "@fps/shared";
import {
  createLobby,
  fetchMeta,
  fetchProfile,
  listLobbies,
  login,
  register,
  validateLobbyJoin,
} from "./api.js";
import { loadSettings, saveSettings, type GameSettings } from "./settings.js";
import {
  clearSession,
  loadGuestName,
  loadSession,
  saveGuestName,
  saveSession,
  updateStoredProfile,
} from "./session.js";

export type MenuSelection = {
  mode: GameMode;
  lobbyId: string;
  lobbyName: string;
  mapId: string;
  token?: string;
  displayName: string;
};

type GateUser =
  | { kind: "account"; profile: PublicProfile; token: string }
  | { kind: "guest"; displayName: string };

/**
 * Auth gate → lobby browser → match selection.
 */
export function showMainMenu(
  onSettingsChange?: (s: GameSettings) => void,
): Promise<MenuSelection> {
  const root = document.getElementById("main-menu")!;
  const authPanel = document.getElementById("gate-auth")!;
  const lobbyPanel = document.getElementById("gate-lobbies")!;

  const tabLogin = document.getElementById("auth-tab-login")!;
  const tabRegister = document.getElementById("auth-tab-register")!;
  const formLogin = document.getElementById("auth-form-login") as HTMLFormElement;
  const formRegister = document.getElementById("auth-form-register") as HTMLFormElement;
  const formGuest = document.getElementById("auth-form-guest") as HTMLFormElement;
  const loginError = document.getElementById("auth-login-error")!;
  const regError = document.getElementById("auth-reg-error")!;

  const lobbyList = document.getElementById("lobby-list")!;
  const lobbyEmpty = document.getElementById("lobby-list-empty")!;
  const lobbyListError = document.getElementById("lobby-list-error")!;
  const createDialog = document.getElementById(
    "gate-create-dialog",
  ) as HTMLDialogElement;
  const createForm = document.getElementById("gate-create-form") as HTMLFormElement;
  const createModeInput = document.getElementById("create-mode") as HTMLInputElement;
  const createMapInput = document.getElementById("create-map") as HTMLInputElement;
  const createMapPicker = document.getElementById("create-map-picker")!;
  const createModePicker = document.getElementById("create-mode-picker")!;
  const createError = document.getElementById("create-error")!;
  const passwordDialog = document.getElementById(
    "gate-password-dialog",
  ) as HTMLDialogElement;
  const passwordForm = document.getElementById(
    "gate-password-form",
  ) as HTMLFormElement;
  const joinPasswordError = document.getElementById("join-password-error")!;

  const settingsOverlay = document.getElementById("menu-settings-panel")!;
  const creditsOverlay = document.getElementById("menu-credits-panel")!;

  let maps: MapDef[] = [...MAP_CATALOG];
  let modes: GameModeDef[] = [...GAME_MODE_CATALOG];
  let user: GateUser | null = null;
  let pendingJoin: LobbySummary | null = null;
  let settings = loadSettings();

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

  function showError(el: HTMLElement, msg: string): void {
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  function hideError(el: HTMLElement): void {
    el.classList.add("hidden");
  }

  function renderProfile(): void {
    const avatar = document.getElementById("profile-avatar")!;
    const nameEl = document.getElementById("profile-name")!;
    const handleEl = document.getElementById("profile-handle")!;
    const xpEl = document.getElementById("profile-xp")!;
    const xpFill = document.getElementById("profile-xp-fill")!;
    const winsEl = document.getElementById("stat-wins")!;
    const killsEl = document.getElementById("stat-kills")!;
    const matchesEl = document.getElementById("stat-matches")!;

    if (!user) return;
    const displayName =
      user.kind === "account" ? user.profile.displayName : user.displayName;
    const stats =
      user.kind === "account"
        ? user.profile.stats
        : { wins: 0, kills: 0, deaths: 0, matches: 0, xp: 0, peakGunLevel: 0 };

    avatar.textContent = displayName.charAt(0).toUpperCase();
    nameEl.textContent = displayName;
    handleEl.textContent =
      user.kind === "account" ? `@${user.profile.username}` : "Guest · progress not saved";
    xpEl.textContent = String(stats.xp);
    const tier = stats.xp % 500;
    xpFill.style.width = `${Math.min(100, (tier / 500) * 100)}%`;
    winsEl.textContent = String(stats.wins);
    killsEl.textContent = String(stats.kills);
    matchesEl.textContent = String(stats.matches);
  }

  function mapPreviewClass(mapId: string): string {
    if (mapId === "desertwest") return "gate-pick-preview-desert";
    return "gate-pick-preview-grass";
  }

  function modePreviewClass(modeId: string): string {
    if (modeId === "snipers_only") return "gate-pick-preview-snipers";
    if (modeId === "king_of_the_hill") return "gate-pick-preview-koth";
    return "gate-pick-preview-mode";
  }

  function selectPickerCard(
    container: HTMLElement,
    input: HTMLInputElement,
    id: string,
  ): void {
    input.value = id;
    for (const btn of container.querySelectorAll<HTMLButtonElement>(".gate-pick-card")) {
      btn.setAttribute(
        "aria-selected",
        btn.dataset.id === id ? "true" : "false",
      );
    }
  }

  function fillCreateForm(): void {
    createMapPicker.innerHTML = maps
      .map(
        (m) => `<button type="button" class="gate-pick-card" role="option" data-id="${m.id}" aria-selected="false">
        <span class="gate-pick-preview ${mapPreviewClass(m.id)}" aria-hidden="true"></span>
        <span class="gate-pick-body">
          <span class="gate-pick-name">${escapeHtml(m.name)}</span>
          <span class="gate-pick-tag">${escapeHtml(m.tagline)}</span>
        </span>
      </button>`,
      )
      .join("");

    createModePicker.innerHTML = modes
      .map(
        (m) => `<button type="button" class="gate-pick-card" role="option" data-id="${m.id}" aria-selected="false">
        <span class="gate-pick-preview ${modePreviewClass(m.id)}" aria-hidden="true"></span>
        <span class="gate-pick-body">
          <span class="gate-pick-name">${escapeHtml(m.name)}</span>
          <span class="gate-pick-tag">${escapeHtml(m.blurb)} · ${escapeHtml(m.players)}</span>
        </span>
      </button>`,
      )
      .join("");

    const defaultMap = maps[0]?.id ?? "";
    const defaultMode = modes[0]?.id ?? "";
    if (defaultMap) selectPickerCard(createMapPicker, createMapInput, defaultMap);
    if (defaultMode) {
      selectPickerCard(createModePicker, createModeInput, defaultMode);
    }
  }

  createMapPicker.onclick = (ev) => {
    const card = (ev.target as HTMLElement).closest(
      ".gate-pick-card",
    ) as HTMLElement | null;
    if (!card?.dataset.id) return;
    selectPickerCard(createMapPicker, createMapInput, card.dataset.id);
  };

  createModePicker.onclick = (ev) => {
    const card = (ev.target as HTMLElement).closest(
      ".gate-pick-card",
    ) as HTMLElement | null;
    if (!card?.dataset.id) return;
    selectPickerCard(createModePicker, createModeInput, card.dataset.id);
  };

  function renderLobbyCard(lobby: LobbySummary): string {
    const lock = lobby.hasPassword
      ? `<span class="lobby-badge lobby-badge-lock" title="Password">🔒</span>`
      : "";
    const fill = Math.round((lobby.players / lobby.maxPlayers) * 100);
    return `<li class="lobby-row" data-id="${lobby.id}" data-map="${lobby.mapId}" data-lock="${lobby.hasPassword}">
      <div class="lobby-row-main">
        <h4 class="lobby-row-name">${escapeHtml(lobby.name)} ${lock}</h4>
        <p class="lobby-row-meta">${escapeHtml(lobby.mapName)} · ${escapeHtml(lobby.hostName)}</p>
      </div>
      <div class="lobby-row-side">
        <div class="lobby-fill"><div style="width:${fill}%"></div></div>
        <span class="lobby-count">${lobby.players}/${lobby.maxPlayers}</span>
        <button type="button" class="wood-btn wood-btn-xs lobby-join-btn"><span>Join</span></button>
      </div>
    </li>`;
  }

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function refreshLobbies(): Promise<void> {
    hideError(lobbyListError);
    lobbyList.innerHTML = `<li class="lobby-loading">Scanning arenas…</li>`;
    const res = await listLobbies();
    if (!res.ok) {
      lobbyList.innerHTML = "";
      showError(lobbyListError, res.error);
      return;
    }
    if (res.lobbies.length === 0) {
      lobbyList.innerHTML = "";
      lobbyEmpty.classList.remove("hidden");
      return;
    }
    lobbyEmpty.classList.add("hidden");
    lobbyList.innerHTML = res.lobbies.map(renderLobbyCard).join("");
  }

  function showAuth(): void {
    authPanel.classList.remove("hidden");
    lobbyPanel.classList.add("hidden");
  }

  function showLobbies(): void {
    authPanel.classList.add("hidden");
    lobbyPanel.classList.remove("hidden");
    renderProfile();
    void refreshLobbies();
  }

  function enterAsAccount(profile: PublicProfile, token: string): void {
    user = { kind: "account", profile, token };
    saveSession({ token, profile });
    showLobbies();
  }

  function enterAsGuest(displayName: string): void {
    user = { kind: "guest", displayName };
    saveGuestName(displayName);
    showLobbies();
  }

  function leaveMenu(): void {
    root.classList.remove("menu-ready");
    root.classList.add("menu-leaving");
  }

  root.classList.remove("hidden");
  syncSliders();
  fillCreateForm();
  requestAnimationFrame(() => root.classList.add("menu-ready"));

  const guestInput = document.getElementById("auth-guest-name") as HTMLInputElement;
  guestInput.value = loadGuestName();

  void fetchMeta().then((res) => {
    if (!res.ok) return;
    if (res.maps.length > 0) maps = res.maps;
    if (res.modes.length > 0) modes = res.modes;
    fillCreateForm();
  });

  const existing = loadSession();
  if (existing) {
    void fetchProfile().then((res) => {
      if (res.ok) {
        updateStoredProfile(res.profile);
        enterAsAccount(res.profile, existing.token);
      } else {
        showAuth();
      }
    });
  } else {
    showAuth();
  }

  tabLogin.onclick = () => {
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    formLogin.classList.remove("hidden");
    formRegister.classList.add("hidden");
  };
  tabRegister.onclick = () => {
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    formRegister.classList.remove("hidden");
    formLogin.classList.add("hidden");
  };

  formLogin.onsubmit = (e) => {
    e.preventDefault();
    hideError(loginError);
    const username = (document.getElementById("auth-login-user") as HTMLInputElement).value;
    const password = (document.getElementById("auth-login-pass") as HTMLInputElement).value;
    void login(username, password).then((res) => {
      if (!res.ok) {
        showError(loginError, res.error);
        return;
      }
      enterAsAccount(res.session.profile, res.session.token);
    });
  };

  formRegister.onsubmit = (e) => {
    e.preventDefault();
    hideError(regError);
    const username = (document.getElementById("auth-reg-user") as HTMLInputElement).value;
    const displayName = (document.getElementById("auth-reg-display") as HTMLInputElement).value;
    const password = (document.getElementById("auth-reg-pass") as HTMLInputElement).value;
    void register(username, password, displayName).then((res) => {
      if (!res.ok) {
        showError(regError, res.error);
        return;
      }
      enterAsAccount(res.session.profile, res.session.token);
    });
  };

  formGuest.onsubmit = (e) => {
    e.preventDefault();
    const name = guestInput.value.trim();
    if (name.length < 2) return;
    enterAsGuest(name);
  };

  document.getElementById("gate-signout")!.onclick = () => {
    clearSession();
    user = null;
    showAuth();
  };

  document.getElementById("lobby-refresh")!.onclick = () => {
    void refreshLobbies();
  };

  document.getElementById("lobby-create-open")!.onclick = () => {
    hideError(createError);
    if (createMapPicker.childElementCount === 0 || createModePicker.childElementCount === 0) {
      fillCreateForm();
    }
    createDialog.showModal();
  };

  document.getElementById("create-cancel")!.onclick = () => {
    createDialog.close();
  };

  createForm.onsubmit = (e) => {
    e.preventDefault();
    hideError(createError);
    const name = (document.getElementById("create-name") as HTMLInputElement).value;
    const mode = createModeInput.value as GameMode;
    const mapId = createMapInput.value;
    if (!mode || !mapId) {
      showError(createError, "Pick a map and game mode.");
      return;
    }
    const maxPlayers = Number(
      (document.getElementById("create-max") as HTMLInputElement).value,
    );
    const isPublic = (document.getElementById("create-public") as HTMLInputElement).checked;
    const password = (document.getElementById("create-password") as HTMLInputElement).value;

    void createLobby({
      name,
      mode,
      mapId,
      maxPlayers,
      isPublic,
      password: password.trim() || undefined,
    }).then((res) => {
      if (!res.ok) {
        showError(createError, res.error);
        return;
      }
      createDialog.close();
      resolveSelection({
        mode,
        lobbyId: res.lobbyId,
        lobbyName: res.name,
        mapId: res.mapId,
      });
    });
  };

  lobbyList.onclick = (ev) => {
    const btn = (ev.target as HTMLElement).closest(".lobby-join-btn");
    if (!btn) return;
    const row = btn.closest(".lobby-row") as HTMLElement;
    const id = row.dataset.id!;
    const locked = row.dataset.lock === "true";
    const lobby = { id, hasPassword: locked } as LobbySummary;
    if (locked) {
      pendingJoin = lobby;
      hideError(joinPasswordError);
      passwordDialog.showModal();
      return;
    }
    void attemptJoin(id);
  };

  passwordForm.onsubmit = (e) => {
    e.preventDefault();
    if (!pendingJoin) return;
    hideError(joinPasswordError);
    const pw = (document.getElementById("join-password") as HTMLInputElement).value;
    void attemptJoin(pendingJoin.id, pw).then((ok) => {
      if (ok) passwordDialog.close();
    });
  };

  document.getElementById("join-password-cancel")!.onclick = () => {
    passwordDialog.close();
  };

  async function attemptJoin(
    lobbyId: string,
    password?: string,
  ): Promise<boolean> {
    const check = await validateLobbyJoin(lobbyId, password);
    if (!check.ok) {
      if (password !== undefined) showError(joinPasswordError, check.error);
      else showError(lobbyListError, check.error);
      return false;
    }
    const row = [...lobbyList.querySelectorAll(".lobby-row")].find(
      (el) => (el as HTMLElement).dataset.id === lobbyId,
    ) as HTMLElement | undefined;
    const name =
      row?.querySelector(".lobby-row-name")?.textContent?.replace("🔒", "").trim() ??
      "Lobby";
    const mapId = row?.dataset.map ?? maps[0]?.id ?? "grassarena";
    resolveSelection({
      mode: "gun_game",
      lobbyId,
      lobbyName: name,
      mapId,
    });
    return true;
  }

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

  let resolveSelection!: (sel: Omit<MenuSelection, "displayName" | "token">) => void;

  return new Promise((resolve) => {
    resolveSelection = (partial) => {
      if (!user) return;
      leaveMenu();
      const displayName =
        user.kind === "account" ? user.profile.displayName : user.displayName;
      const token = user.kind === "account" ? user.token : undefined;
      window.setTimeout(() => {
        root.classList.add("hidden");
        root.classList.remove("menu-leaving");
        resolve({ ...partial, displayName, token });
      }, 380);
    };
  });
}
