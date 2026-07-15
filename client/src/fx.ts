import * as THREE from "three";
import {
  defaultWeaponFx,
  type Vec3,
  type WeaponDef,
  type WeaponFx,
  type WeaponShape,
} from "@fps/shared";

type Tracer = {
  obj: THREE.Object3D;
  dispose: () => void;
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

function buildViewmodel(shape: WeaponShape, primary: number, accent: number): THREE.Group {
  const root = new THREE.Group();
  const gunMat = new THREE.MeshStandardMaterial({
    color: primary,
    roughness: 0.42,
    metalness: 0.4,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accent,
    roughness: 0.35,
    metalness: 0.55,
  });

  const add = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    root.add(m);
  };

  switch (shape) {
    case "smg":
      add(new THREE.BoxGeometry(0.09, 0.11, 0.38), gunMat, 0.22, -0.22, -0.52);
      add(new THREE.BoxGeometry(0.04, 0.04, 0.28), accentMat, 0.22, -0.18, -0.82);
      add(new THREE.BoxGeometry(0.05, 0.16, 0.07), accentMat, 0.22, -0.34, -0.5);
      add(new THREE.BoxGeometry(0.07, 0.08, 0.12), gunMat, 0.22, -0.26, -0.3);
      break;
    case "shotgun":
      add(new THREE.BoxGeometry(0.12, 0.14, 0.48), gunMat, 0.22, -0.23, -0.55);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), accentMat, 0.18, -0.18, -0.9);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), accentMat, 0.26, -0.18, -0.9);
      root.children[1]!.rotation.x = Math.PI / 2;
      root.children[2]!.rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(0.08, 0.12, 0.18), gunMat, 0.22, -0.28, -0.28);
      break;
    case "sniper":
      add(new THREE.BoxGeometry(0.1, 0.1, 0.62), gunMat, 0.22, -0.22, -0.6);
      add(new THREE.CylinderGeometry(0.022, 0.022, 0.7, 8), accentMat, 0.22, -0.17, -1.05);
      root.children[1]!.rotation.x = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.045, 0.045, 0.14, 10), accentMat, 0.22, -0.08, -0.55);
      root.children[2]!.rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(0.08, 0.14, 0.22), gunMat, 0.22, -0.3, -0.25);
      break;
    case "pistol":
      add(new THREE.BoxGeometry(0.08, 0.12, 0.24), gunMat, 0.22, -0.2, -0.48);
      add(new THREE.BoxGeometry(0.04, 0.04, 0.2), accentMat, 0.22, -0.16, -0.68);
      add(new THREE.BoxGeometry(0.06, 0.14, 0.08), accentMat, 0.22, -0.3, -0.42);
      break;
    case "melee":
      add(new THREE.BoxGeometry(0.07, 0.07, 0.55), gunMat, 0.2, -0.18, -0.65);
      add(new THREE.BoxGeometry(0.22, 0.14, 0.14), accentMat, 0.2, -0.14, -1.0);
      add(new THREE.BoxGeometry(0.06, 0.12, 0.1), gunMat, 0.2, -0.28, -0.35);
      break;
    case "cannon":
      add(new THREE.CylinderGeometry(0.08, 0.1, 0.55, 10), gunMat, 0.22, -0.2, -0.7);
      root.children[0]!.rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(0.14, 0.16, 0.22), accentMat, 0.22, -0.28, -0.35);
      add(new THREE.BoxGeometry(0.1, 0.08, 0.12), gunMat, 0.22, -0.18, -0.42);
      break;
    case "weird":
      add(new THREE.SphereGeometry(0.09, 10, 10), gunMat, 0.22, -0.2, -0.55);
      add(new THREE.ConeGeometry(0.06, 0.35, 8), accentMat, 0.22, -0.18, -0.85);
      root.children[1]!.rotation.x = Math.PI / 2;
      add(new THREE.TorusGeometry(0.08, 0.02, 6, 12), accentMat, 0.22, -0.14, -0.55);
      break;
    default:
      add(new THREE.BoxGeometry(0.11, 0.13, 0.52), gunMat, 0.22, -0.22, -0.55);
      add(new THREE.BoxGeometry(0.045, 0.045, 0.42), accentMat, 0.22, -0.175, -0.92);
      add(new THREE.BoxGeometry(0.09, 0.11, 0.2), gunMat, 0.22, -0.255, -0.28);
      add(new THREE.BoxGeometry(0.06, 0.14, 0.08), accentMat, 0.22, -0.32, -0.55);
      break;
  }
  return root;
}

/**
 * Tracers, impacts, muzzle flash, per-weapon viewmodels + FOV punch.
 */
export function createEffects(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
) {
  const tracers: Tracer[] = [];
  const impacts: Impact[] = [];
  const sparks: Spark[] = [];
  const baseFov = camera.fov;

  let style: WeaponFx = defaultWeaponFx({
    id: "default",
    name: "Default",
    damage: 1,
    headshotMultiplier: 1,
    magSize: 1,
    reloadMs: 1,
    fireRate: 1,
    pellets: 1,
    spreadDeg: 0,
    adsSpreadMult: 1,
    adsFov: 75,
    adsSensMult: 1,
    scopeStyle: "iron",
    recoilPattern: [[0, 0]],
  });

  const muzzleLight = new THREE.PointLight(0xffcc66, 0, 12, 2);
  camera.add(muzzleLight);
  muzzleLight.position.set(0.18, -0.14, -0.7);

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
    color: 0xffffff,
  });
  const muzzleFlash = new THREE.Sprite(flashMat);
  muzzleFlash.scale.set(0.35, 0.35, 0.35);
  muzzleFlash.position.set(0.22, -0.16, -1.05);
  muzzleFlash.visible = false;
  camera.add(muzzleFlash);

  let viewmodel = buildViewmodel("rifle", 0x2c3136, 0x1a1c1e);
  camera.add(viewmodel);

  let muzzleUntil = 0;
  let kick = 0;
  let fovKick = 0;
  let bobTime = 0;
  let adsBlend = 0;
  let spinT = 0;

  const _muzzleLocal = new THREE.Vector3(0.22, -0.16, -1.05);
  const _origin = new THREE.Vector3();
  const _end = new THREE.Vector3();
  const _fwd = new THREE.Vector3();

  const hipMuzzle = new THREE.Vector3(0.22, -0.16, -1.05);
  const adsMuzzle = new THREE.Vector3(0.02, -0.08, -0.7);

  function setWeapon(weapon: WeaponDef): void {
    style = defaultWeaponFx(weapon);
    camera.remove(viewmodel);
    viewmodel.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    viewmodel = buildViewmodel(style.shape, style.primary, style.accent);
    camera.add(viewmodel);
    flashMat.color.setHex(style.muzzle);
    muzzleLight.color.setHex(style.muzzle);
  }

  function spawnTracer(
    ox: number,
    oy: number,
    oz: number,
    ex: number,
    ey: number,
    ez: number,
    now: number,
    fxStyle: WeaponFx,
  ): void {
    const a = new THREE.Vector3(ox, oy, oz);
    const b = new THREE.Vector3(ex, ey, ez);
    const life = fxStyle.tracerLife;
    let obj: THREE.Object3D;
    let dispose: () => void;

    if (fxStyle.tracerStyle === "thick" || fxStyle.tracerStyle === "beam") {
      const dir = b.clone().sub(a);
      const len = dir.length() || 0.01;
      const radius = fxStyle.tracerStyle === "beam" ? 0.035 : 0.055;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 0.7, len, 6),
        new THREE.MeshBasicMaterial({
          color: fxStyle.tracer,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
        }),
      );
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.clone().normalize(),
      );
      scene.add(mesh);
      obj = mesh;
      dispose = () => {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      };
    } else if (fxStyle.tracerStyle === "dots") {
      const group = new THREE.Group();
      const n = 8;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const p = a.clone().lerp(b, t);
        const soft = new THREE.Mesh(
          new THREE.SphereGeometry(0.04, 6, 6),
          new THREE.MeshBasicMaterial({
            color: fxStyle.tracer,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
          }),
        );
        soft.position.copy(p);
        group.add(soft);
      }
      scene.add(group);
      obj = group;
      dispose = () => {
        scene.remove(group);
        group.traverse((c) => {
          if (c instanceof THREE.Mesh) {
            c.geometry.dispose();
            (c.material as THREE.Material).dispose();
          }
        });
      };
    } else if (fxStyle.tracerStyle === "arc") {
      const mid = a.clone().lerp(b, 0.5);
      mid.y += 0.45;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const pts = curve.getPoints(12);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: fxStyle.tracer,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      obj = line;
      dispose = () => {
        scene.remove(line);
        geo.dispose();
        mat.dispose();
      };
    } else {
      const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
      const mat = new THREE.LineBasicMaterial({
        color: fxStyle.tracer,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      obj = line;
      dispose = () => {
        scene.remove(line);
        geo.dispose();
        mat.dispose();
      };
    }

    tracers.push({ obj, dispose, born: now, life });
  }

  function spawnImpact(
    at: Vec3,
    now: number,
    hitPlayer: boolean,
    fxStyle: WeaponFx,
  ): void {
    const scale = fxStyle.impactScale;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry((hitPlayer ? 0.07 : 0.04) * scale, 8, 8),
      new THREE.MeshBasicMaterial({
        color: hitPlayer ? 0xff3333 : fxStyle.muzzle,
        transparent: true,
        opacity: 0.95,
      }),
    );
    mesh.position.set(at.x, at.y, at.z);
    scene.add(mesh);
    impacts.push({ mesh, born: now, life: hitPlayer ? 0.16 : 0.1 });

    const n = Math.round((hitPlayer ? 7 : 4) * scale);
    for (let i = 0; i < n; i++) {
      const spark = new THREE.Mesh(
        new THREE.BoxGeometry(0.03 * scale, 0.03 * scale, 0.03 * scale),
        new THREE.MeshBasicMaterial({
          color: hitPlayer ? 0xff5555 : fxStyle.tracer,
          transparent: true,
          opacity: 1,
        }),
      );
      spark.position.set(at.x, at.y, at.z);
      scene.add(spark);
      sparks.push({
        mesh: spark,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 5 * scale,
          Math.random() * 3.5 * scale,
          (Math.random() - 0.5) * 5 * scale,
        ),
        born: now,
        life: 0.2 + Math.random() * 0.18,
      });
    }
  }

  function localShot(end: Vec3, now: number, weapon?: WeaponDef): void {
    const fxStyle = weapon ? defaultWeaponFx(weapon) : style;
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

    spawnTracer(
      _origin.x,
      _origin.y,
      _origin.z,
      _end.x,
      _end.y,
      _end.z,
      now,
      fxStyle,
    );
    spawnImpact(
      { x: _end.x, y: _end.y, z: _end.z },
      now,
      false,
      fxStyle,
    );
    muzzleUntil = now + 55 + fxStyle.flashScale * 20;
    kick = 0.055 * fxStyle.kickScale * (1 - adsBlend * 0.4);
    fovKick = 2.2 * fxStyle.fovKickScale * (1 - adsBlend * 0.5);
    muzzleFlash.visible = adsBlend < 0.85;
    muzzleFlash.material.rotation = Math.random() * Math.PI;
    flashMat.color.setHex(fxStyle.muzzle);
    muzzleLight.color.setHex(fxStyle.muzzle);
    spinT += 0.8 * fxStyle.kickScale;
  }

  function remoteShot(
    origin: Vec3,
    end: Vec3,
    hitPlayer: boolean,
    now: number,
    weapon?: WeaponDef | null,
  ): void {
    const fxStyle = weapon ? defaultWeaponFx(weapon) : style;
    spawnTracer(
      origin.x,
      origin.y,
      origin.z,
      end.x,
      end.y,
      end.z,
      now,
      fxStyle,
    );
    spawnImpact(end, now, hitPlayer, fxStyle);
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
    spinT *= Math.max(0, 1 - dt * 4);

    const adsX = THREE.MathUtils.lerp(0.22, 0.0, adsBlend) - 0.22;
    const adsY = THREE.MathUtils.lerp(0, 0.08, adsBlend);
    const adsZ = THREE.MathUtils.lerp(0, 0.28, adsBlend);
    viewmodel.position.set(bobX + adsX, -kick + bobY + adsY, kick * 0.4 + adsZ);
    viewmodel.rotation.x = -kick * 1.8 - adsBlend * 0.02;
    viewmodel.rotation.y = -adsBlend * 0.04 + spinT * 0.05;
    viewmodel.rotation.z = bobX * 2 + kick * 0.3 * style.kickScale;
    viewmodel.visible = alive && !(opts.hideViewmodel && adsBlend > 0.55);

    const targetFov = THREE.MathUtils.lerp(baseFov, opts.adsFov, adsBlend);
    camera.fov = targetFov + fovKick;
    camera.updateProjectionMatrix();

    muzzleFlash.position.lerpVectors(hipMuzzle, adsMuzzle, adsBlend);

    const flashOn = now < muzzleUntil && adsBlend < 0.9;
    muzzleLight.intensity = flashOn ? 5 * style.flashScale : 0;
    muzzleFlash.visible = flashOn;
    if (flashOn) {
      const t = 1 - (muzzleUntil - now) / 70;
      muzzleFlash.scale.setScalar((0.22 + t * 0.3) * style.flashScale);
    }

    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i]!;
      const age = (now - t.born) / 1000;
      t.obj.traverse((c) => {
        if (c instanceof THREE.Mesh || c instanceof THREE.Line) {
          const mat = c.material as THREE.Material & { opacity?: number };
          if (mat.opacity != null) {
            mat.opacity = Math.max(0, 1 - age / t.life);
          }
        }
      });
      if (age >= t.life) {
        t.dispose();
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

  return { localShot, remoteShot, update, setWeapon };
}
