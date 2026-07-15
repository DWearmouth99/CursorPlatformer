import * as THREE from "three";
import type { AbilityFxEvent, WorldProp } from "@fps/shared";

const PROP_COLORS: Record<WorldProp["kind"], number> = {
  ice_patch: 0x9fd9f5,
  frost_trap: 0x6ec4ef,
  ember_nest: 0xff6a2a,
  storm_anchor: 0x5ad0ff,
};

/**
 * Renders ability world props + transient ability VFX.
 */
export function createAbilityView(scene: THREE.Scene) {
  const propMeshes = new Map<string, THREE.Mesh>();
  const temp: THREE.Object3D[] = [];

  function syncProps(props: WorldProp[]): void {
    const seen = new Set<string>();
    for (const p of props) {
      seen.add(p.id);
      let mesh = propMeshes.get(p.id);
      if (!mesh) {
        const geo =
          p.kind === "frost_trap" || p.kind === "storm_anchor"
            ? new THREE.CylinderGeometry(p.radius * 0.85, p.radius, 0.12, 16)
            : new THREE.CylinderGeometry(p.radius, p.radius, 0.08, 20);
        mesh = new THREE.Mesh(
          geo,
          new THREE.MeshStandardMaterial({
            color: PROP_COLORS[p.kind],
            transparent: true,
            opacity: p.kind === "ice_patch" ? 0.45 : 0.55,
            emissive: PROP_COLORS[p.kind],
            emissiveIntensity: 0.35,
            roughness: 0.4,
            metalness: 0.2,
          }),
        );
        scene.add(mesh);
        propMeshes.set(p.id, mesh);
      }
      mesh.position.set(p.position.x, 0.06, p.position.z);
    }
    for (const [id, mesh] of propMeshes) {
      if (!seen.has(id)) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        propMeshes.delete(id);
      }
    }
  }

  function spawnBurst(
    at: { x: number; y: number; z: number },
    color: number,
    scale = 1,
  ): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.35 * scale, 10, 10),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
      }),
    );
    mesh.position.set(at.x, at.y, at.z);
    scene.add(mesh);
    temp.push(mesh);
    const born = performance.now();
    const life = 420;
    (mesh as THREE.Mesh & { _born?: number; _life?: number })._born = born;
    (mesh as THREE.Mesh & { _born?: number; _life?: number })._life = life;
  }

  function spawnBeam(
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
    color: number,
  ): void {
    const dir = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
    const len = dir.length() || 0.01;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, len, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
    );
    mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    );
    scene.add(mesh);
    temp.push(mesh);
    (mesh as THREE.Mesh & { _born?: number; _life?: number })._born =
      performance.now();
    (mesh as THREE.Mesh & { _born?: number; _life?: number })._life = 280;
  }

  function playFx(ev: AbilityFxEvent): void {
    const o = ev.origin;
    switch (ev.kind) {
      case "ice_path":
      case "frost_trap":
      case "frost_trigger":
        spawnBurst(o, 0xa8e7ff, 1.4);
        break;
      case "scorch_dash":
        if (ev.end) spawnBeam(o, ev.end, 0xff7a2a);
        spawnBurst(o, 0xff5522, 1.2);
        if (ev.end) spawnBurst(ev.end, 0xffaa44, 1);
        break;
      case "ember_nest":
        spawnBurst(o, 0xff6622, 1.6);
        break;
      case "phase_step":
        spawnBurst(o, 0xb48cff, 1.1);
        if (ev.end) spawnBurst(ev.end, 0xd2b8ff, 1.1);
        break;
      case "veil":
        spawnBurst(o, 0x7a5cff, 1.5);
        break;
      case "arc_surge":
        if (ev.end) spawnBeam(o, ev.end, 0x6de0ff);
        spawnBurst(o, 0x9ef0ff, 1.2);
        break;
      case "storm_anchor":
      case "storm_launch":
        spawnBurst(o, 0x5ad0ff, 1.5);
        break;
    }
  }

  function update(now: number): void {
    for (let i = temp.length - 1; i >= 0; i--) {
      const obj = temp[i] as THREE.Mesh & { _born?: number; _life?: number };
      const born = obj._born ?? now;
      const life = obj._life ?? 300;
      const t = (now - born) / life;
      if (t >= 1) {
        scene.remove(obj);
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
        temp.splice(i, 1);
        continue;
      }
      obj.scale.setScalar(1 + t * 1.8);
      const mat = obj.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.85 * (1 - t);
    }
  }

  return { syncProps, playFx, update };
}
