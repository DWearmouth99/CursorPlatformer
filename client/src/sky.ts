import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";

/** Soft fair-weather cloud atlas. */
function makeCloudTexture(size = 1024): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  // Fluffy white day clouds
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * size;
    const y = size * (0.22 + Math.random() * 0.48);
    const r = size * (0.05 + Math.random() * 0.11);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.12 + Math.random() * 0.28;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.4, `rgba(248,252,255,${a * 0.65})`);
    g.addColorStop(1, "rgba(220,235,255,0)");
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

  // Softer high wisps
  for (let i = 0; i < 24; i++) {
    const x = Math.random() * size;
    const y = size * (0.18 + Math.random() * 0.55);
    const r = size * (0.1 + Math.random() * 0.16);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.06 + Math.random() * 0.1;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, "rgba(230,240,255,0)");
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

function makeSunSpriteTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, "rgba(255,255,250,1)");
  g.addColorStop(0.1, "rgba(255,248,220,0.95)");
  g.addColorStop(0.28, "rgba(255,230,160,0.5)");
  g.addColorStop(0.55, "rgba(255,210,120,0.18)");
  g.addColorStop(1, "rgba(255,200,100,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Bright daytime sky: clear blue atmosphere, soft clouds, warm sun — no storms.
 */
export function createAtmosphere(scene: THREE.Scene) {
  scene.background = null;
  // Softer atmospheric haze
  scene.fog = new THREE.Fog(0x9eb8cc, 55, 175);

  const hemi = new THREE.HemisphereLight(0xe8f0f8, 0x3d5c38, 0.78);
  scene.add(hemi);

  const sunLight = new THREE.DirectionalLight(0xffefd4, 1.05);
  scene.add(sunLight);
  scene.add(sunLight.target);

  const fill = new THREE.DirectionalLight(0x7a9ab8, 0.22);
  fill.position.set(-45, 28, -25);
  scene.add(fill);

  const sky = new Sky();
  sky.scale.setScalar(900);
  scene.add(sky);
  const uniforms = (sky.material as THREE.ShaderMaterial).uniforms;
  // Soft daytime — a bit of haze, not washed-out bright
  uniforms["turbidity"]!.value = 3.6;
  uniforms["rayleigh"]!.value = 1.35;
  uniforms["mieCoefficient"]!.value = 0.0045;
  uniforms["mieDirectionalG"]!.value = 0.82;

  const sunDir = new THREE.Vector3();
  const elevation = 34;
  const azimuth = 155;
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  sunDir.setFromSphericalCoords(1, phi, theta);
  uniforms["sunPosition"]!.value.copy(sunDir);

  sunLight.position.copy(sunDir).multiplyScalar(80);
  sunLight.target.position.set(0, 0, 0);

  const sunDist = 420;
  const sunSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeSunSpriteTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.92,
    }),
  );
  sunSprite.scale.set(36, 36, 1);
  sunSprite.material.opacity = 0.72;
  sunSprite.position.copy(sunDir).multiplyScalar(sunDist);
  sunSprite.renderOrder = -2;
  scene.add(sunSprite);

  const sunCore = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeSunSpriteTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.7,
      color: 0xfff0d0,
    }),
  );
  sunCore.scale.set(11, 11, 1);
  sunCore.position.copy(sunDir).multiplyScalar(sunDist * 0.995);
  sunCore.renderOrder = -1;
  scene.add(sunCore);

  // Soft bloom halo behind sun
  const sunHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeSunSpriteTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.2,
      color: 0xffd090,
    }),
  );
  sunHalo.scale.set(72, 72, 1);
  sunHalo.position.copy(sunDir).multiplyScalar(sunDist * 1.01);
  sunHalo.renderOrder = -4;
  scene.add(sunHalo);

  const cloudTex = makeCloudTexture();
  cloudTex.repeat.set(2.0, 1.0);

  const cloudMatA = new THREE.MeshBasicMaterial({
    map: cloudTex,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
    color: 0xe8eef5,
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
    opacity: 0.5,
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
    color: 0xd8e2ec,
  });
  const cloudsB = new THREE.Mesh(
    new THREE.SphereGeometry(355, 40, 28),
    cloudMatB,
  );
  cloudsB.rotation.y = 1.1;
  cloudsB.renderOrder = -3;
  scene.add(cloudsB);

  // High thin cirrus wash
  const cloudMatC = new THREE.MeshBasicMaterial({
    map: cloudTex,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
    color: 0xc9d6e4,
  });
  const cloudsC = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 24),
    cloudMatC,
  );
  cloudsC.rotation.y = 2.2;
  cloudsC.renderOrder = -4;
  scene.add(cloudsC);

  function update(dt: number, now: number): void {
    cloudsA.rotation.y += dt * 0.008;
    cloudsB.rotation.y -= dt * 0.012;
    cloudsC.rotation.y += dt * 0.005;
    cloudTex.offset.x += dt * 0.0025;
    cloudTexB.offset.x -= dt * 0.004;

    const pulse = 0.96 + Math.sin(now * 0.0007) * 0.03;
    sunSprite.material.opacity = 0.7 * pulse;
    sunCore.material.opacity = 0.68 * pulse;
    sunHalo.material.opacity = 0.18 + Math.sin(now * 0.0005) * 0.03;
  }

  return { update, sunLight };
}
