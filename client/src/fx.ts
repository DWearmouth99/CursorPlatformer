import * as THREE from "three";
import type { Vec3 } from "@fps/shared";

type Tracer = {
  line: THREE.Line;
  born: number;
  life: number;
};

type Impact = {
  mesh: THREE.Mesh;
  born: number;
  life: number;
};

type Spark = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  born: number;
  life: number;
};

/**
 * Tracers, impacts, muzzle flash sprite, viewmodel + FOV punch.
 */
export function createEffects(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
) {
  const tracers: Tracer[] = [];
  const impacts: Impact[] = [];
  const sparks: Spark[] = [];
  const baseFov = camera.fov;

  const muzzleLight = new THREE.PointLight(0xffcc66, 0, 10, 2);
  camera.add(muzzleLight);
  muzzleLight.position.set(0.18, -0.14, -0.7);

  // Billboard muzzle flash
  const flashCanvas = document.createElement("canvas");
  flashCanvas.width = 64;
  flashCanvas.height = 64;
  {
    const ctx = flashCanvas.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, "rgba(255,255,220,1)");
    g.addColorStop(0.35, "rgba(255,180,40,0.9)");
    g.addColorStop(1, "rgba(255,80,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  const flashTex = new THREE.CanvasTexture(flashCanvas);
  const flashMat = new THREE.SpriteMaterial({
    map: flashTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const muzzleFlash = new THREE.Sprite(flashMat);
  muzzleFlash.scale.set(0.35, 0.35, 0.35);
  muzzleFlash.position.set(0.22, -0.16, -1.05);
  muzzleFlash.visible = false;
  camera.add(muzzleFlash);

  const viewmodel = new THREE.Group();
  const gunMat = new THREE.MeshStandardMaterial({
    color: 0x2c3136,
    roughness: 0.4,
    metalness: 0.45,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x1a1c1e,
    roughness: 0.35,
    metalness: 0.55,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.52), gunMat);
  body.position.set(0.22, -0.22, -0.55);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.42), accentMat);
  barrel.position.set(0.22, -0.175, -0.92);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.2), gunMat);
  stock.position.set(0.22, -0.255, -0.28);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.08), accentMat);
  mag.position.set(0.22, -0.32, -0.55);
  viewmodel.add(body, barrel, stock, mag);
  camera.add(viewmodel);

  let muzzleUntil = 0;
  let kick = 0;
  let fovKick = 0;
  let bobTime = 0;
  let adsBlend = 0;

  const _muzzleLocal = new THREE.Vector3(0.22, -0.16, -1.05);
  const _origin = new THREE.Vector3();
  const _end = new THREE.Vector3();
  const _fwd = new THREE.Vector3();

  const hipMuzzle = new THREE.Vector3(0.22, -0.16, -1.05);
  const adsMuzzle = new THREE.Vector3(0.02, -0.08, -0.7);

  function spawnTracer(
    ox: number,
    oy: number,
    oz: number,
    ex: number,
    ey: number,
    ez: number,
    now: number,
  ): void {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(ox, oy, oz),
      new THREE.Vector3(ex, ey, ez),
    ]);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    tracers.push({ line, born: now, life: 0.07 });
  }

  function spawnImpact(at: Vec3, now: number, hitPlayer: boolean): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(hitPlayer ? 0.06 : 0.035, 6, 6),
      new THREE.MeshBasicMaterial({
        color: hitPlayer ? 0xff3333 : 0xffcc66,
        transparent: true,
        opacity: 0.95,
      }),
    );
    mesh.position.set(at.x, at.y, at.z);
    scene.add(mesh);
    impacts.push({ mesh, born: now, life: hitPlayer ? 0.14 : 0.09 });

    const n = hitPlayer ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const spark = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.03, 0.03),
        new THREE.MeshBasicMaterial({
          color: hitPlayer ? 0xff5555 : 0xffaa44,
          transparent: true,
          opacity: 1,
        }),
      );
      spark.position.set(at.x, at.y, at.z);
      scene.add(spark);
      sparks.push({
        mesh: spark,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 4,
          Math.random() * 3,
          (Math.random() - 0.5) * 4,
        ),
        born: now,
        life: 0.2 + Math.random() * 0.15,
      });
    }
  }

  function localShot(end: Vec3, now: number): void {
    camera.updateMatrixWorld();
    _muzzleLocal.lerpVectors(hipMuzzle, adsMuzzle, adsBlend);
    _origin.copy(_muzzleLocal).applyMatrix4(camera.matrixWorld);
    _fwd.set(0, 0, -1).transformDirection(camera.matrixWorld);
    const dx = end.x - _origin.x;
    const dy = end.y - _origin.y;
    const dz = end.z - _origin.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.5) _end.copy(_origin).addScaledVector(_fwd, 40);
    else _end.set(end.x, end.y, end.z);

    spawnTracer(_origin.x, _origin.y, _origin.z, _end.x, _end.y, _end.z, now);
    spawnImpact({ x: _end.x, y: _end.y, z: _end.z }, now, false);
    muzzleUntil = now + 55;
    kick = 0.055 * (1 - adsBlend * 0.4);
    fovKick = 2.2 * (1 - adsBlend * 0.5);
    muzzleFlash.visible = adsBlend < 0.85;
    muzzleFlash.material.rotation = Math.random() * Math.PI;
  }

  function remoteShot(
    origin: Vec3,
    end: Vec3,
    hitPlayer: boolean,
    now: number,
  ): void {
    spawnTracer(origin.x, origin.y, origin.z, end.x, end.y, end.z, now);
    spawnImpact(end, now, hitPlayer);
  }

  function update(
    now: number,
    dt: number,
    alive: boolean,
    moving: boolean,
    opts: {
      ads: boolean;
      adsFov: number;
      hideViewmodel: boolean;
    },
  ): void {
    adsBlend += ((opts.ads ? 1 : 0) - adsBlend) * Math.min(1, dt * 14);

    const hipBobMul = 1 - adsBlend;
    bobTime += dt * (moving ? 10 : 2);
    const bobX = moving ? Math.sin(bobTime) * 0.008 * hipBobMul : 0;
    const bobY =
      (moving
        ? Math.abs(Math.sin(bobTime * 2)) * 0.006
        : Math.sin(bobTime) * 0.003) * hipBobMul;

    kick = Math.max(0, kick - dt * 0.45);
    fovKick = Math.max(0, fovKick - dt * 8);

    // ADS brings the gun toward center / down the sights
    const adsX = THREE.MathUtils.lerp(0.22, 0.0, adsBlend) - 0.22;
    const adsY = THREE.MathUtils.lerp(0, 0.08, adsBlend);
    const adsZ = THREE.MathUtils.lerp(0, 0.28, adsBlend);
    viewmodel.position.set(bobX + adsX, -kick + bobY + adsY, kick * 0.4 + adsZ);
    viewmodel.rotation.x = -kick * 1.8 - adsBlend * 0.02;
    viewmodel.rotation.y = -adsBlend * 0.04;
    viewmodel.rotation.z = bobX * 2;
    viewmodel.visible = alive && !(opts.hideViewmodel && adsBlend > 0.55);

    const targetFov = THREE.MathUtils.lerp(baseFov, opts.adsFov, adsBlend);
    camera.fov = targetFov + fovKick;
    camera.updateProjectionMatrix();

    muzzleFlash.position.lerpVectors(hipMuzzle, adsMuzzle, adsBlend);

    const flashOn = now < muzzleUntil && adsBlend < 0.9;
    muzzleLight.intensity = flashOn ? 6 : 0;
    muzzleFlash.visible = flashOn;
    if (flashOn) {
      const t = 1 - (muzzleUntil - now) / 55;
      muzzleFlash.scale.setScalar(0.25 + t * 0.25);
    }

    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i]!;
      const age = (now - t.born) / 1000;
      const mat = t.line.material as THREE.LineBasicMaterial;
      mat.opacity = Math.max(0, 1 - age / t.life);
      if (age >= t.life) {
        scene.remove(t.line);
        t.line.geometry.dispose();
        mat.dispose();
        tracers.splice(i, 1);
      }
    }

    for (let i = impacts.length - 1; i >= 0; i--) {
      const imp = impacts[i]!;
      const age = (now - imp.born) / 1000;
      const mat = imp.mesh.material as THREE.MeshBasicMaterial;
      const k = Math.max(0, 1 - age / imp.life);
      mat.opacity = k;
      imp.mesh.scale.setScalar(1 + (1 - k) * 2.5);
      if (age >= imp.life) {
        scene.remove(imp.mesh);
        imp.mesh.geometry.dispose();
        mat.dispose();
        impacts.splice(i, 1);
      }
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]!;
      const age = (now - s.born) / 1000;
      s.vel.y -= 12 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      const mat = s.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 1 - age / s.life);
      if (age >= s.life) {
        scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        mat.dispose();
        sparks.splice(i, 1);
      }
    }
  }

  return { localShot, remoteShot, update };
}
