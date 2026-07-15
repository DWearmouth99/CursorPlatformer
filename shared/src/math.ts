export type Vec3 = { x: number; y: number; z: number };

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function copy(out: Vec3, v: Vec3): Vec3 {
  out.x = v.x;
  out.y = v.y;
  out.z = v.z;
  return out;
}

export function add(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  out.z = a.z + b.z;
  return out;
}

export function scale(out: Vec3, v: Vec3, s: number): Vec3 {
  out.x = v.x * s;
  out.y = v.y * s;
  out.z = v.z * s;
  return out;
}

export function length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function length2d(v: Vec3): number {
  return Math.hypot(v.x, v.z);
}

export function normalize(out: Vec3, v: Vec3): Vec3 {
  const len = length(v);
  if (len < 1e-8) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }
  return scale(out, v, 1 / len);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Yaw/pitch in radians → forward unit vector (Y-up). */
export function forwardFromAngles(yaw: number, pitch: number, out: Vec3): Vec3 {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}

/** Horizontal forward (ignore pitch). */
export function forwardFlat(yaw: number, out: Vec3): Vec3 {
  out.x = -Math.sin(yaw);
  out.y = 0;
  out.z = -Math.cos(yaw);
  return out;
}

export function rightFlat(yaw: number, out: Vec3): Vec3 {
  out.x = Math.cos(yaw);
  out.y = 0;
  out.z = -Math.sin(yaw);
  return out;
}
