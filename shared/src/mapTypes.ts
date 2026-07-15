import type { Vec3 } from "./math.js";
import type { Team } from "./constants.js";

export type MapSurface =
  | "floor"
  | "wall"
  | "crate"
  | "concrete"
  | "metal"
  | "trim"
  | "accent";

export type MapBox = {
  id: string;
  cx: number;
  cy: number;
  cz: number;
  sx: number;
  sy: number;
  sz: number;
  color?: number;
  surface?: MapSurface;
};

export type MapDecoration = {
  model: string;
  x: number;
  y: number;
  z: number;
  yaw?: number;
  scale?: number;
};

export type SpawnZone = {
  team: Team;
  position: Vec3;
  yaw: number;
};
