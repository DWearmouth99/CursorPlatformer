/**
 * Placeable GLB catalog for the level editor + arena compiler.
 * Heights/footprints are post-load Y-up sizes at scale 1.
 */
export type ModelInfo = {
  id: string;
  label: string;
  /** Default placement scale. */
  defaultScale: number;
  /** Default "solid" toggle in the editor. */
  solidDefault: boolean;
  /** Height (Y) at scale 1. */
  height: number;
  /** Footprint [x, z] at scale 1. */
  footprint: [number, number];
  category: "terrain" | "cover" | "prop" | "nature" | "water";
};

export const MODEL_CATALOG: ModelInfo[] = [
  {
    id: "cube.01",
    label: "Grass 1×1",
    defaultScale: 4,
    solidDefault: true,
    height: 0.6,
    footprint: [1, 1],
    category: "terrain",
  },
  {
    id: "cube.02",
    label: "Grass 2×1",
    defaultScale: 4,
    solidDefault: true,
    height: 0.6,
    footprint: [2, 1],
    category: "terrain",
  },
  {
    id: "cube.05",
    label: "Pillar M",
    defaultScale: 3.5,
    solidDefault: true,
    height: 1.197,
    footprint: [1, 1],
    category: "terrain",
  },
  {
    id: "cube.06",
    label: "Wide pillar",
    defaultScale: 3.5,
    solidDefault: true,
    height: 1.197,
    footprint: [2, 1],
    category: "terrain",
  },
  {
    id: "cube.07",
    label: "Pillar tall",
    defaultScale: 3.2,
    solidDefault: true,
    height: 1.796,
    footprint: [1, 1],
    category: "terrain",
  },
  {
    id: "cube_with_river.01",
    label: "Water tile",
    defaultScale: 4,
    solidDefault: false,
    height: 0.397,
    footprint: [1, 1],
    category: "water",
  },
  {
    id: "cube_with_swamp.01",
    label: "Swamp tile",
    defaultScale: 4,
    solidDefault: false,
    height: 0.6,
    footprint: [1, 1],
    category: "water",
  },
  {
    id: "bridge.02",
    label: "Bridge",
    defaultScale: 4.2,
    solidDefault: true,
    height: 0.67,
    footprint: [2.33, 0.84],
    category: "prop",
  },
  {
    id: "ladder.01",
    label: "Ladder",
    defaultScale: 4,
    solidDefault: true,
    height: 0.81,
    footprint: [0.55, 0.35],
    category: "prop",
  },
  {
    id: "stone.02",
    label: "Rock M",
    defaultScale: 2.4,
    solidDefault: false,
    height: 0.21,
    footprint: [0.35, 0.35],
    category: "cover",
  },
  {
    id: "stone.03",
    label: "Rock L",
    defaultScale: 2.8,
    solidDefault: false,
    height: 0.36,
    footprint: [0.55, 0.5],
    category: "cover",
  },
  {
    id: "tree.01",
    label: "Tree",
    defaultScale: 4,
    solidDefault: true,
    height: 1.61,
    footprint: [0.5, 0.5],
    category: "nature",
  },
  {
    id: "tree.02",
    label: "Tree round",
    defaultScale: 4,
    solidDefault: true,
    height: 1.36,
    footprint: [0.4, 0.4],
    category: "nature",
  },
  {
    id: "spruce.01",
    label: "Spruce",
    defaultScale: 4,
    solidDefault: true,
    height: 1.27,
    footprint: [0.45, 0.45],
    category: "nature",
  },
  {
    id: "mushroom.01",
    label: "Mushroom",
    defaultScale: 1.8,
    solidDefault: false,
    height: 0.21,
    footprint: [0.23, 0.23],
    category: "nature",
  },
];

const byId = new Map(MODEL_CATALOG.map((m) => [m.id, m]));

export function getModelInfo(id: string): ModelInfo | undefined {
  return byId.get(id);
}

/** Mushrooms / rocks are visual-only — never collide. */
export function isNonSolidModel(model: string): boolean {
  return (
    model.startsWith("mushroom") ||
    model.startsWith("stone") ||
    model.startsWith("rock")
  );
}

/** Auto AABB size from catalog (y = bottom of model). */
export function autoCollider(
  model: string,
  scale: number,
): { sx: number; sy: number; sz: number } {
  const info = getModelInfo(model);
  if (!info) {
    return { sx: scale, sy: scale * 0.6, sz: scale };
  }
  // Cover rocks need thicker playable hitboxes than raw mesh height
  if (info.category === "cover") {
    const s = Math.max(info.footprint[0], info.footprint[1]) * scale * 1.8;
    return { sx: s, sy: Math.max(0.9, info.height * scale * 3.5), sz: s };
  }
  if (info.category === "nature" && info.id.startsWith("tree")) {
    const trunk = 0.7 * (scale / 4);
    return { sx: trunk, sy: info.height * scale * 0.85, sz: trunk };
  }
  if (info.id.startsWith("spruce")) {
    const trunk = 0.65 * (scale / 4);
    return { sx: trunk, sy: info.height * scale * 0.9, sz: trunk };
  }
  // Bridges: thin walkable deck only (not the full railing AABB).
  if (info.id.startsWith("bridge")) {
    return {
      sx: info.footprint[0] * scale,
      sy: Math.max(0.32, info.height * scale * 0.16),
      // Slightly narrower than mesh so railings aren't solid walls
      sz: info.footprint[1] * scale * 0.52,
    };
  }
  return {
    sx: info.footprint[0] * scale,
    sy: info.height * scale,
    sz: info.footprint[1] * scale,
  };
}

/**
 * Vertical offset from prop.y (model bottom) to the top of a bridge deck collider.
 * Keeps the walkable surface near the plank height instead of railing top.
 */
export function bridgeDeckTopOffset(model: string, scale: number): number | null {
  if (!model.startsWith("bridge")) return null;
  const info = getModelInfo(model);
  const fullH = (info?.height ?? 0.67) * scale;
  return fullH * 0.3;
}
