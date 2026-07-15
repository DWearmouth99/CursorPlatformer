import {
  CLASS_LIST,
  DEFAULT_CLASS_ID,
  GUN_GAME_LADDER,
  type ClassId,
  type GameMode,
} from "@fps/shared";

export type MenuSelection = {
  mode: GameMode;
  classId: ClassId;
};

function fillClassDetail(id: ClassId): void {
  const detailName = document.getElementById("class-detail-name")!;
  const detailTag = document.getElementById("class-detail-tag")!;
  const detailDesc = document.getElementById("class-detail-desc")!;
  const detailStats = document.getElementById("class-detail-stats")!;
  const cls = CLASS_LIST.find((c) => c.id === id)!;
  detailName.textContent = cls.name;
  detailTag.textContent = cls.tagline;
  detailDesc.textContent = cls.description;
  const w = cls.weapon;
  detailStats.innerHTML =
    `<li><span>Weapon</span><b>${w.name}</b></li>` +
    `<li><span>Ability 1</span><b>${cls.ability1.name} [1]</b></li>` +
    `<li><span>Ability 2</span><b>${cls.ability2.name} [2]</b></li>` +
    `<li><span>${cls.ability1.name}</span><b>${cls.ability1.description}</b></li>` +
    `<li><span>${cls.ability2.name}</span><b>${cls.ability2.description}</b></li>` +
    `<li><span>Speed</span><b>${Math.round(cls.speedMult * 100)}%</b></li>`;
}

function fillGunGameDetail(): void {
  const detailName = document.getElementById("class-detail-name")!;
  const detailTag = document.getElementById("class-detail-tag")!;
  const detailDesc = document.getElementById("class-detail-desc")!;
  const detailStats = document.getElementById("class-detail-stats")!;
  detailName.textContent = "Gun Game";
  detailTag.textContent = "20 weapons · FFA · one kill upgrades you";
  detailDesc.textContent =
    "Everyone starts with the Pea Shooter. Each kill unlocks the next ridiculous weapon. First player to score a kill with the Golden Banana wins the match.";
  detailStats.innerHTML = GUN_GAME_LADDER.map(
    (w, i) =>
      `<li><span>#${i + 1}</span><b>${w.name}</b></li>`,
  ).join("");
}

/**
 * Main menu: mode + class selector. Returns when the player hits Play.
 */
export function showMainMenu(): Promise<MenuSelection> {
  const root = document.getElementById("main-menu")!;
  const playBtn = document.getElementById("play-btn") as HTMLButtonElement;
  const grid = document.getElementById("class-grid")!;
  const modeAbility = document.getElementById("mode-ability") as HTMLButtonElement;
  const modeGun = document.getElementById("mode-gun") as HTMLButtonElement;
  const classPanel = document.getElementById("class-panel")!;

  let selected: ClassId = DEFAULT_CLASS_ID;
  let mode: GameMode = "ability";
  root.classList.remove("hidden");

  grid.innerHTML = "";
  for (const cls of CLASS_LIST) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "class-card";
    card.dataset.id = cls.id;
    card.innerHTML =
      `<span class="class-card-name">${cls.name}</span>` +
      `<span class="class-card-weapon">${cls.weapon.name}</span>` +
      `<span class="class-card-tag">${cls.tagline}</span>`;
    card.addEventListener("click", () => select(cls.id));
    grid.appendChild(card);
  }

  function select(id: ClassId) {
    selected = id;
    for (const el of grid.querySelectorAll(".class-card")) {
      el.classList.toggle("selected", (el as HTMLElement).dataset.id === id);
    }
    if (mode === "ability") fillClassDetail(id);
  }

  function setMode(next: GameMode) {
    mode = next;
    modeAbility.classList.toggle("active", mode === "ability");
    modeGun.classList.toggle("active", mode === "gun_game");
    classPanel.classList.toggle("hidden", mode === "gun_game");
    if (mode === "gun_game") {
      fillGunGameDetail();
      playBtn.textContent = "Enter Gun Game";
    } else {
      fillClassDetail(selected);
      playBtn.textContent = "Enter Match";
    }
  }

  modeAbility.onclick = () => setMode("ability");
  modeGun.onclick = () => setMode("gun_game");

  select(selected);
  setMode("ability");

  return new Promise((resolve) => {
    playBtn.onclick = () => {
      root.classList.add("hidden");
      resolve({ mode, classId: selected });
    };
  });
}

/**
 * In-match class swap overlay. Calls onPick when a class is chosen.
 */
export function bindClassSwapMenu(onPick: (id: ClassId) => void): {
  setOpen: (open: boolean) => void;
  isOpen: () => boolean;
} {
  const root = document.getElementById("class-swap")!;
  const grid = document.getElementById("class-swap-grid")!;
  let open = false;
  let selected: ClassId = DEFAULT_CLASS_ID;

  grid.innerHTML = "";
  for (const cls of CLASS_LIST) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "class-card swap-card";
    card.dataset.id = cls.id;
    card.innerHTML =
      `<span class="class-card-name">${cls.name}</span>` +
      `<span class="class-card-weapon">${cls.ability1.name} · ${cls.ability2.name}</span>` +
      `<span class="class-card-tag">${cls.tagline}</span>`;
    card.addEventListener("click", (e) => {
      e.stopPropagation();
      selected = cls.id;
      onPick(cls.id);
      setOpen(false);
    });
    grid.appendChild(card);
  }

  function setOpen(next: boolean) {
    open = next;
    root.classList.toggle("hidden", !open);
    if (open) {
      document.exitPointerLock();
      for (const el of grid.querySelectorAll(".class-card")) {
        el.classList.toggle(
          "selected",
          (el as HTMLElement).dataset.id === selected,
        );
      }
    }
  }

  return {
    setOpen,
    isOpen: () => open,
  };
}

export { fillClassDetail };
