import {
  CLASS_LIST,
  DEFAULT_CLASS_ID,
  type ClassId,
} from "@fps/shared";

export type MenuSelection = {
  classId: ClassId;
};

/**
 * Main menu + class selector. Returns when the player hits Play.
 */
export function showMainMenu(): Promise<MenuSelection> {
  const root = document.getElementById("main-menu")!;
  const playBtn = document.getElementById("play-btn") as HTMLButtonElement;
  const grid = document.getElementById("class-grid")!;
  const detailName = document.getElementById("class-detail-name")!;
  const detailTag = document.getElementById("class-detail-tag")!;
  const detailDesc = document.getElementById("class-detail-desc")!;
  const detailStats = document.getElementById("class-detail-stats")!;

  let selected: ClassId = DEFAULT_CLASS_ID;
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
    const cls = CLASS_LIST.find((c) => c.id === id)!;
    for (const el of grid.querySelectorAll(".class-card")) {
      el.classList.toggle("selected", (el as HTMLElement).dataset.id === id);
    }
    detailName.textContent = cls.name;
    detailTag.textContent = cls.tagline;
    detailDesc.textContent = cls.description;
    const w = cls.weapon;
    detailStats.innerHTML =
      `<li><span>Weapon</span><b>${w.name}</b></li>` +
      `<li><span>Damage</span><b>${w.damage}${w.pellets > 1 ? ` × ${w.pellets}` : ""}</b></li>` +
      `<li><span>Fire rate</span><b>${w.fireRate}/s</b></li>` +
      `<li><span>Magazine</span><b>${w.magSize}</b></li>` +
      `<li><span>Speed</span><b>${Math.round(cls.speedMult * 100)}%</b></li>`;
  }

  select(selected);

  return new Promise((resolve) => {
    playBtn.onclick = () => {
      root.classList.add("hidden");
      resolve({ classId: selected });
    };
  });
}
