import { GUN_GAME_LENGTH, MAX_HP } from "@fps/shared";

export type HudState = {
  hp: number;
  ammo: number;
  magSize: number;
  reloading: boolean;
  alive: boolean;
  className: string;
  weaponName: string;
  statusText: string;
  gunLevel: number;
  scoreboardOpen: boolean;
  players: Array<{
    id: string;
    team: string;
    weaponLabel: string;
    kills: number;
    deaths: number;
    isLocal: boolean;
  }>;
};

function displayName(id: string, isLocal: boolean): string {
  if (id.startsWith("Bot-")) return `${id} · AI`;
  return isLocal ? `${id} · you` : id;
}

export function createHud() {
  const hpEl = document.getElementById("hud-hp")!;
  const hpFillEl = document.getElementById("hud-hp-fill")!;
  const hpPanelEl = document.getElementById("hud-hp-panel")!;
  const ammoEl = document.getElementById("hud-ammo")!;
  const magEl = document.getElementById("hud-mag");
  const ammoPanelEl = document.getElementById("hud-ammo-panel")!;
  const classEl = document.getElementById("hud-class")!;
  const weaponEl = document.getElementById("hud-weapon")!;
  const killFeedEl = document.getElementById("kill-feed")!;
  const hitMarkerEl = document.getElementById("hit-marker")!;
  const damageFlashEl = document.getElementById("damage-flash")!;
  const scoreboardEl = document.getElementById("scoreboard")!;
  const scoreboardBody = document.getElementById("scoreboard-body")!;
  const respawnEl = document.getElementById("respawn-msg")!;
  const statusEl = document.getElementById("hud-status")!;
  const ladderFillEl = document.getElementById("gun-ladder-fill");

  let hitMarkerUntil = 0;
  let flashUntil = 0;
  let flashStrength = 0.7;

  function showHitMarker(headshot: boolean): void {
    hitMarkerUntil = performance.now() + (headshot ? 320 : 240);
    hitMarkerEl.classList.toggle("headshot", headshot);
    hitMarkerEl.classList.remove("visible");
    void hitMarkerEl.offsetWidth;
    hitMarkerEl.classList.add("visible");
  }

  function showDamageFlash(amount = 24): void {
    const now = performance.now();
    const severity = Math.min(1, Math.max(0.35, amount / 55));
    flashStrength = 0.55 + severity * 0.45;
    flashUntil = now + 220 + severity * 280;
    damageFlashEl.style.setProperty("--damage-alpha", String(flashStrength));
    damageFlashEl.classList.remove("pulse");
    void damageFlashEl.offsetWidth;
    damageFlashEl.classList.add("visible", "pulse");
  }

  function pushKillFeed(text: string): void {
    const row = document.createElement("div");
    row.className = "kill-row kill-row-note";
    row.textContent = text;
    killFeedEl.prepend(row);
    while (killFeedEl.children.length > 6) {
      killFeedEl.lastElementChild?.remove();
    }
    window.setTimeout(() => row.remove(), 5200);
  }

  function pushKill(
    killerId: string,
    victimId: string,
    opts: { headshot?: boolean; localId?: string | null } = {},
  ): void {
    const youKiller = opts.localId != null && killerId === opts.localId;
    const youVictim = opts.localId != null && victimId === opts.localId;
    const row = document.createElement("div");
    row.className = "kill-row";
    if (youKiller) row.classList.add("you-killer");
    if (youVictim) row.classList.add("you-victim");

    const killer = document.createElement("span");
    killer.className = "kill-name kill-killer";
    killer.textContent = displayName(killerId, youKiller);

    const verb = document.createElement("span");
    verb.className = "kill-verb";
    verb.textContent = opts.headshot ? "⚔" : "▸";

    const victim = document.createElement("span");
    victim.className = "kill-name kill-victim";
    victim.textContent = displayName(victimId, youVictim);

    row.append(killer, verb, victim);
    if (opts.headshot) {
      const tag = document.createElement("span");
      tag.className = "kill-tag";
      tag.textContent = "HS";
      row.append(tag);
    }

    killFeedEl.prepend(row);
    while (killFeedEl.children.length > 6) {
      killFeedEl.lastElementChild?.remove();
    }
    window.setTimeout(() => row.remove(), 5200);
  }

  function render(state: HudState, now = performance.now()): void {
    const hp = Math.max(0, Math.round(state.hp));
    const hpPct = Math.max(0, Math.min(100, (hp / MAX_HP) * 100));
    hpEl.textContent = String(hp);
    hpFillEl.style.width = `${hpPct}%`;
    hpPanelEl.classList.toggle("low", hpPct <= 35 && state.alive);
    hpPanelEl.classList.toggle("critical", hpPct <= 18 && state.alive);
    hpPanelEl.classList.toggle("dead", !state.alive);

    if (state.reloading) {
      ammoEl.textContent = "—";
      if (magEl) magEl.textContent = "…";
      ammoPanelEl.classList.add("reloading");
      ammoPanelEl.classList.remove("empty");
    } else {
      ammoEl.textContent = String(state.ammo);
      if (magEl) magEl.textContent = String(state.magSize);
      ammoPanelEl.classList.toggle("empty", state.ammo <= 0 && state.alive);
      ammoPanelEl.classList.remove("reloading");
    }

    classEl.textContent = state.className;
    weaponEl.textContent = state.weaponName;
    statusEl.textContent = state.statusText;
    statusEl.classList.toggle("hidden", !state.statusText);

    if (ladderFillEl) {
      const pct = Math.max(
        0,
        Math.min(100, ((state.gunLevel + 1) / GUN_GAME_LENGTH) * 100),
      );
      ladderFillEl.style.width = `${pct}%`;
    }

    hitMarkerEl.classList.toggle("visible", now < hitMarkerUntil);

    const flashing = now < flashUntil;
    damageFlashEl.classList.toggle("visible", flashing);
    damageFlashEl.classList.toggle(
      "hurt",
      state.alive && hpPct <= 35 && !flashing,
    );
    if (flashing) {
      const t = Math.max(0, (flashUntil - now) / 400);
      damageFlashEl.style.setProperty(
        "--damage-alpha",
        String(flashStrength * Math.min(1, t * 1.4)),
      );
    }

    respawnEl.classList.toggle("visible", !state.alive);
    scoreboardEl.classList.toggle("visible", state.scoreboardOpen);

    if (state.scoreboardOpen) {
      const sorted = [...state.players].sort(
        (a, b) => b.kills - a.kills || a.deaths - b.deaths,
      );
      scoreboardBody.innerHTML = sorted
        .map((p, i) => {
          const name = displayName(p.id, p.isLocal);
          const gun = p.weaponLabel.replace(/^\d+\.\s*/, "");
          return (
            `<tr class="${p.isLocal ? "local" : ""}">` +
            `<td class="col-rank">${i + 1}</td>` +
            `<td class="col-player"><span class="sb-name">${name}</span></td>` +
            `<td class="col-gun">${gun}</td>` +
            `<td class="col-stat">${p.kills}</td>` +
            `<td class="col-stat">${p.deaths}</td>` +
            `</tr>`
          );
        })
        .join("");
    }
  }

  return { showHitMarker, showDamageFlash, pushKillFeed, pushKill, render };
}
