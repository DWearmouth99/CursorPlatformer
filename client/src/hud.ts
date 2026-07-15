export type HudState = {
  hp: number;
  ammo: number;
  magSize: number;
  reloading: boolean;
  alive: boolean;
  className: string;
  weaponName: string;
  ability1Name: string;
  ability2Name: string;
  ability1CdMs: number;
  ability2CdMs: number;
  ability1MaxMs: number;
  ability2MaxMs: number;
  statusText: string;
  scoreboardOpen: boolean;
  players: Array<{
    id: string;
    team: string;
    className: string;
    kills: number;
    deaths: number;
    isLocal: boolean;
  }>;
};

export function createHud() {
  const hpEl = document.getElementById("hud-hp")!;
  const ammoEl = document.getElementById("hud-ammo")!;
  const classEl = document.getElementById("hud-class")!;
  const weaponEl = document.getElementById("hud-weapon")!;
  const killFeedEl = document.getElementById("kill-feed")!;
  const hitMarkerEl = document.getElementById("hit-marker")!;
  const damageFlashEl = document.getElementById("damage-flash")!;
  const scoreboardEl = document.getElementById("scoreboard")!;
  const scoreboardBody = document.getElementById("scoreboard-body")!;
  const respawnEl = document.getElementById("respawn-msg")!;
  const ab1Fill = document.getElementById("ab1-fill")!;
  const ab2Fill = document.getElementById("ab2-fill")!;
  const ab1Label = document.getElementById("ab1-label")!;
  const ab2Label = document.getElementById("ab2-label")!;
  const ab1Cd = document.getElementById("ab1-cd")!;
  const ab2Cd = document.getElementById("ab2-cd")!;
  const statusEl = document.getElementById("hud-status")!;

  let hitMarkerUntil = 0;
  let flashUntil = 0;

  function showHitMarker(headshot: boolean): void {
    hitMarkerUntil = performance.now() + (headshot ? 320 : 240);
    hitMarkerEl.classList.toggle("headshot", headshot);
    // Restart punch animation on every hit
    hitMarkerEl.classList.remove("visible");
    void hitMarkerEl.offsetWidth;
    hitMarkerEl.classList.add("visible");
  }

  function showDamageFlash(): void {
    flashUntil = performance.now() + 180;
  }

  function pushKillFeed(text: string): void {
    const row = document.createElement("div");
    row.className = "kill-row";
    row.textContent = text;
    killFeedEl.prepend(row);
    while (killFeedEl.children.length > 5) {
      killFeedEl.lastElementChild?.remove();
    }
    setTimeout(() => row.remove(), 5000);
  }

  function setAbilityBar(
    fill: HTMLElement,
    cdEl: HTMLElement,
    label: HTMLElement,
    name: string,
    cdMs: number,
    maxMs: number,
  ): void {
    label.textContent = name;
    const ready = cdMs <= 0;
    fill.parentElement?.classList.toggle("ready", ready);
    const pct = ready
      ? 100
      : Math.max(0, 100 - (cdMs / Math.max(maxMs, 1)) * 100);
    fill.style.width = `${pct}%`;
    cdEl.textContent = ready ? "READY" : `${(cdMs / 1000).toFixed(1)}s`;
  }

  function render(state: HudState, now = performance.now()): void {
    hpEl.textContent = String(Math.max(0, Math.round(state.hp)));
    ammoEl.textContent = state.reloading
      ? "REL…"
      : `${state.ammo} / ${state.magSize}`;
    classEl.textContent = state.className;
    weaponEl.textContent = state.weaponName;
    statusEl.textContent = state.statusText;
    statusEl.classList.toggle("hidden", !state.statusText);

    setAbilityBar(
      ab1Fill,
      ab1Cd,
      ab1Label,
      `1  ${state.ability1Name}`,
      state.ability1CdMs,
      state.ability1MaxMs,
    );
    setAbilityBar(
      ab2Fill,
      ab2Cd,
      ab2Label,
      `2  ${state.ability2Name}`,
      state.ability2CdMs,
      state.ability2MaxMs,
    );

    hitMarkerEl.classList.toggle("visible", now < hitMarkerUntil);
    damageFlashEl.classList.toggle("visible", now < flashUntil);

    respawnEl.classList.toggle("visible", !state.alive);
    scoreboardEl.classList.toggle("visible", state.scoreboardOpen);

    if (state.scoreboardOpen) {
      const sorted = [...state.players].sort(
        (a, b) => b.kills - a.kills || a.deaths - b.deaths,
      );
      scoreboardBody.innerHTML = sorted
        .map(
          (p) =>
            `<tr class="${p.isLocal ? "local" : ""}">` +
            `<td>${p.team}</td><td>${p.id}${p.isLocal ? " (you)" : ""}</td>` +
            `<td>${p.className}</td>` +
            `<td>${p.kills}</td><td>${p.deaths}</td></tr>`,
        )
        .join("");
    }
  }

  return { showHitMarker, showDamageFlash, pushKillFeed, render };
}
