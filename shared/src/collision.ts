import type { Vec3 } from "./math.js";

/** Axis-aligned box: center + half-extents. */
export type AABB = {
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
};

export function aabbFromMinMax(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): AABB {
  return {
    cx: (minX + maxX) * 0.5,
    cy: (minY + maxY) * 0.5,
    cz: (minZ + maxZ) * 0.5,
    hx: (maxX - minX) * 0.5,
    hy: (maxY - minY) * 0.5,
    hz: (maxZ - minZ) * 0.5,
  };
}

export function aabbFromCenterSize(
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
): AABB {
  return { cx, cy, cz, hx: sx * 0.5, hy: sy * 0.5, hz: sz * 0.5 };
}

export function playerAABB(
  pos: Vec3,
  height: number,
  radius: number,
): AABB {
  return {
    cx: pos.x,
    cy: pos.y + height * 0.5,
    cz: pos.z,
    hx: radius,
    hy: height * 0.5,
    hz: radius,
  };
}

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    Math.abs(a.cx - b.cx) <= a.hx + b.hx &&
    Math.abs(a.cy - b.cy) <= a.hy + b.hy &&
    Math.abs(a.cz - b.cz) <= a.hz + b.hz
  );
}

/**
 * Resolve player AABB against static solids by sliding on the shallowest axis.
 * Mutates `pos`. Returns whether feet are considered grounded after resolution.
 */
export function resolveCollisions(
  pos: Vec3,
  height: number,
  radius: number,
  solids: readonly AABB[],
  groundEpsilon = 0.05,
): { grounded: boolean } {
  let grounded = false;

  for (let iter = 0; iter < 4; iter++) {
    const box = playerAABB(pos, height, radius);
    let resolved = false;

    for (const solid of solids) {
      if (!aabbOverlap(box, solid)) continue;

      const dx = box.cx - solid.cx;
      const dy = box.cy - solid.cy;
      const dz = box.cz - solid.cz;
      const ox = box.hx + solid.hx - Math.abs(dx);
      const oy = box.hy + solid.hy - Math.abs(dy);
      const oz = box.hz + solid.hz - Math.abs(dz);

      if (ox <= 0 || oy <= 0 || oz <= 0) continue;

      // Push out along smallest penetration axis
      if (oy <= ox && oy <= oz) {
        const sign = dy >= 0 ? 1 : -1;
        pos.y += oy * sign;
        if (sign > 0) grounded = true;
        resolved = true;
        break;
      }
      if (ox <= oz) {
        const sign = dx >= 0 ? 1 : -1;
        pos.x += ox * sign;
        resolved = true;
        break;
      }
      const sign = dz >= 0 ? 1 : -1;
      pos.z += oz * sign;
      resolved = true;
      break;
    }

    if (!resolved) break;
  }

  // Ground probe: slight downward overlap against solids
  const probe = playerAABB(
    { x: pos.x, y: pos.y - groundEpsilon, z: pos.z },
    height,
    radius,
  );
  for (const solid of solids) {
    if (aabbOverlap(probe, solid)) {
      grounded = true;
      break;
    }
  }

  return { grounded };
}
