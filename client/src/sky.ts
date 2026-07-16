import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import type { MapTheme } from "@fps/shared";
import type { GraphicsQuality } from "./settings";
import { shadowMapSizeForQuality } from "./settings";

/** Soft fair-weather cloud atlas. */
function makeCloudTexture(size = 1024, dusty = false): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  const count = dusty ? 48 : 70;
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = size * (0.22 + Math.random() * 0.48);
    const r = size * (0.05 + Math.random() * (dusty ? 0.14 : 0.11));
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = dusty
      ? 0.08 + Math.random() * 0.18
      : 0.12 + Math.random() * 0.28;
    if (dusty) {
      g.addColorStop(0, `rgba(255,236,210,${a})`);
      g.addColorStop(0.4, `rgba(240,210,170,${a * 0.55})`);
      g.addColorStop(1, "rgba(210,170,120,0)");
    } else {
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.4, `rgba(248,252,255,${a * 0.65})`);
      g.addColorStop(1, "rgba(220,235,255,0)");
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      r * (1.35 + Math.random() * 0.5),
      r * (0.5 + Math.random() * 0.35),
      Math.random() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  for (let i = 0; i < (dusty ? 18 : 24); i++) {
    const x = Math.random() * size;
    const y = size * (0.18 + Math.random() * 0.55);
    const r = size * (0.1 + Math.random() * 0.16);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = dusty ? 0.05 + Math.random() * 0.08 : 0.06 + Math.random() * 0.1;
    g.addColorStop(
      0,
      dusty ? `rgba(255,230,190,${a})` : `rgba(255,255,255,${a})`,
    );
    g.addColorStop(1, dusty ? "rgba(220,180,130,0)" : "rgba(230,240,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 2.1, r * 0.45, Math.random() * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeSunSpriteTexture(hot = false): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  if (hot) {
    g.addColorStop(0, "rgba(255,255,240,1)");
    g.addColorStop(0.12, "rgba(255,236,180,0.95)");
    g.addColorStop(0.3, "rgba(255,180,80,0.55)");
    g.addColorStop(0.55, "rgba(255,120,40,0.2)");
    g.addColorStop(1, "rgba(255,90,20,0)");
  } else {
    g.addColorStop(0, "rgba(255,255,250,1)");
    g.addColorStop(0.1, "rgba(255,248,220,0.95)");
    g.addColorStop(0.28, "rgba(255,230,160,0.5)");
    g.addColorStop(0.55, "rgba(255,210,120,0.18)");
    g.addColorStop(1, "rgba(255,200,100,0)");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export type AtmosphereOptions = {
  renderer: THREE.WebGLRenderer;
  quality: GraphicsQuality;
  arenaW: number;
  arenaD: number;
};

export type Atmosphere = {
  update: (dt: number, now: number) => void;
  sunLight: THREE.DirectionalLight;
  /** Apply quality tier (shadows on/off + map size). */
  applyQuality: (quality: GraphicsQuality) => void;
  dispose: () => void;
};

/**
 * Sky + lighting. Grass = clear blue day; desert = dusty amber heat haze.
 * Tuned for ACESFilmicToneMapping + PMREM environment.
 */
export function createAtmosphere(
  scene: THREE.Scene,
  theme: MapTheme = "grass",
  opts: AtmosphereOptions,
): Atmosphere {
  const desert = theme === "desert";
  scene.background = null;
  scene.fog = new THREE.Fog(
    desert ? 0xd4b896 : 0x8eabbf,
    desert ? 48 : 55,
    desert ? 160 : 175,
  );

  // Intensities rebalanced for ACES (higher key, softer hemi to avoid washout).
  // Grass kept a touch darker than desert so turf doesn't wash out.
  const hemi = new THREE.HemisphereLight(
    desert ? 0xffe8c8 : 0xd8e4f0,
    desert ? 0x8a6540 : 0x2f4a2c,
    desert ? 0.55 : 0.36,
  );
  scene.add(hemi);

  const sunLight = new THREE.DirectionalLight(
    desert ? 0xffd89a : 0xffe8c4,
    desert ? 2.35 : 1.55,
  );
  sunLight.castShadow = true;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const fill = new THREE.DirectionalLight(
    desert ? 0xc9956a : 0x6a8aa8,
    desert ? 0.42 : 0.26,
  );
  fill.position.set(-45, 28, -25);
  fill.castShadow = false;
  scene.add(fill);

  const sky = new Sky();
  sky.scale.setScalar(900);
  const uniforms = (sky.material as THREE.ShaderMaterial).uniforms;
  uniforms["turbidity"]!.value = desert ? 6.5 : 3.6;
  uniforms["rayleigh"]!.value = desert ? 0.85 : 1.35;
  uniforms["mieCoefficient"]!.value = desert ? 0.008 : 0.0045;
  uniforms["mieDirectionalG"]!.value = desert ? 0.88 : 0.82;

  const sunDir = new THREE.Vector3();
  const elevation = desert ? 42 : 34;
  const azimuth = desert ? 138 : 155;
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  sunDir.setFromSphericalCoords(1, phi, theta);
  uniforms["sunPosition"]!.value.copy(sunDir);

  sunLight.position.copy(sunDir).multiplyScalar(80);
  sunLight.target.position.set(0, 0, 0);

  // Fit orthographic shadow camera to the playable arena.
  const half =
    Math.max(opts.arenaW, opts.arenaD) * 0.55 + 10;
  const shadowCam = sunLight.shadow.camera;
  shadowCam.near = 10;
  shadowCam.far = 220;
  shadowCam.left = -half;
  shadowCam.right = half;
  shadowCam.top = half;
  shadowCam.bottom = -half;
  sunLight.shadow.bias = -0.00015;
  sunLight.shadow.normalBias = 0.035;
  sunLight.shadow.radius = 2.5;

  // PMREM env from sky only (metals / roughness read under ACES).
  let envRT: THREE.WebGLRenderTarget | null = null;
  const pmrem = new THREE.PMREMGenerator(opts.renderer);
  {
    const envScene = new THREE.Scene();
    envScene.add(sky);
    envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = desert ? 0.85 : 0.68;
    scene.add(sky);
  }
  pmrem.dispose();

  const sunDist = 420;
  const sunSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeSunSpriteTexture(desert),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.92,
    }),
  );
  sunSprite.scale.set(desert ? 42 : 36, desert ? 42 : 36, 1);
  sunSprite.material.opacity = desert ? 0.82 : 0.72;
  sunSprite.position.copy(sunDir).multiplyScalar(sunDist);
  sunSprite.renderOrder = -2;
  scene.add(sunSprite);

  const sunCore = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeSunSpriteTexture(desert),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.7,
      color: desert ? 0xffe0a0 : 0xfff0d0,
    }),
  );
  sunCore.scale.set(desert ? 14 : 11, desert ? 14 : 11, 1);
  sunCore.position.copy(sunDir).multiplyScalar(sunDist * 0.995);
  sunCore.renderOrder = -1;
  scene.add(sunCore);

  const sunHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeSunSpriteTexture(desert),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: desert ? 0.28 : 0.2,
      color: desert ? 0xffa050 : 0xffd090,
    }),
  );
  sunHalo.scale.set(desert ? 90 : 72, desert ? 90 : 72, 1);
  sunHalo.position.copy(sunDir).multiplyScalar(sunDist * 1.01);
  sunHalo.renderOrder = -4;
  scene.add(sunHalo);

  const cloudTex = makeCloudTexture(1024, desert);
  cloudTex.repeat.set(2.0, 1.0);

  const cloudMatA = new THREE.MeshBasicMaterial({
    map: cloudTex,
    transparent: true,
    opacity: desert ? 0.55 : 0.72,
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
    color: desert ? 0xf0dcc0 : 0xe8eef5,
  });
  const cloudsA = new THREE.Mesh(
    new THREE.SphereGeometry(380, 48, 32),
    cloudMatA,
  );
  cloudsA.renderOrder = -3;
  scene.add(cloudsA);

  const cloudTexB = cloudTex.clone();
  cloudTexB.needsUpdate = true;
  cloudTexB.repeat.set(1.45, 0.85);
  cloudTexB.offset.set(0.4, 0.15);
  const cloudMatB = new THREE.MeshBasicMaterial({
    map: cloudTexB,
    transparent: true,
    opacity: desert ? 0.38 : 0.5,
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
    color: desert ? 0xe8c9a0 : 0xd8e2ec,
  });
  const cloudsB = new THREE.Mesh(
    new THREE.SphereGeometry(355, 40, 28),
    cloudMatB,
  );
  cloudsB.rotation.y = 1.1;
  cloudsB.renderOrder = -3;
  scene.add(cloudsB);

  const cloudMatC = new THREE.MeshBasicMaterial({
    map: cloudTex,
    transparent: true,
    opacity: desert ? 0.22 : 0.28,
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
    color: desert ? 0xd4b080 : 0xc9d6e4,
  });
  const cloudsC = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 24),
    cloudMatC,
  );
  cloudsC.rotation.y = 2.2;
  cloudsC.renderOrder = -4;
  scene.add(cloudsC);

  function applyQuality(quality: GraphicsQuality): void {
    const mapSize = shadowMapSizeForQuality(quality);
    const enabled = mapSize > 0;
    sunLight.castShadow = enabled;
    if (enabled) {
      const prev = sunLight.shadow.mapSize.x;
      sunLight.shadow.mapSize.set(mapSize, mapSize);
      if (prev !== mapSize && sunLight.shadow.map) {
        sunLight.shadow.map.dispose();
        sunLight.shadow.map = null;
      }
      shadowCam.updateProjectionMatrix();
    }
  }
  applyQuality(opts.quality);

  function update(dt: number, now: number): void {
    cloudsA.rotation.y += dt * (desert ? 0.006 : 0.008);
    cloudsB.rotation.y -= dt * (desert ? 0.009 : 0.012);
    cloudsC.rotation.y += dt * 0.005;
    cloudTex.offset.x += dt * (desert ? 0.0018 : 0.0025);
    cloudTexB.offset.x -= dt * (desert ? 0.003 : 0.004);

    const pulse = 0.96 + Math.sin(now * 0.0007) * 0.03;
    sunSprite.material.opacity = (desert ? 0.8 : 0.7) * pulse;
    sunCore.material.opacity = (desert ? 0.75 : 0.68) * pulse;
    sunHalo.material.opacity =
      (desert ? 0.24 : 0.18) + Math.sin(now * 0.0005) * 0.03;
  }

  function dispose(): void {
    if (envRT) {
      envRT.dispose();
      envRT = null;
    }
    if (scene.environment) scene.environment = null;
  }

  return { update, sunLight, applyQuality, dispose };
}
