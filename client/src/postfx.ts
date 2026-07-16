import * as THREE from "three";
import {
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  type Pass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ShockWaveEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from "postprocessing";
import type { GraphicsQuality } from "./settings";

/** Matches game.ts ACES exposure baseline. */
const BASE_EXPOSURE = 1.08;

const DAMAGE_CHROMA = 0.0042;
const DAMAGE_VIGNETTE = 0.72;
const DAMAGE_HUE = 0.12;
const DAMAGE_DECAY = 4.2;

const FLASH_EXPOSURE_DIP = 0.22;
const FLASH_DECAY = 7.5;

const EXPLOSION_RANGE = 12;
const BLOOM_THRESHOLD = 0.9;
const BLOOM_SMOOTH = 0.12;

export type PostFx = {
  render: (dt: number) => void;
  setQuality: (quality: GraphicsQuality) => void;
  setSize: (width: number, height: number) => void;
  pulseDamage: (amount?: number) => void;
  pulseExplosion: (at: { x: number; y: number; z: number }) => void;
  pulseFlash: () => void;
  dispose: () => void;
};

/** Direct render path — same as pre–CHANGE 2 / graphics low. */
export function createPassthroughPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): PostFx {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = BASE_EXPOSURE;
  return {
    render() {
      renderer.render(scene, camera);
    },
    setQuality() {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = BASE_EXPOSURE;
    },
    setSize(width, height) {
      renderer.setSize(width, height);
    },
    pulseDamage() {},
    pulseExplosion() {},
    pulseFlash() {},
    dispose() {},
  };
}

/**
 * Medium/high post stack. Low tier (and any init failure) uses direct render.
 * N8AO is loaded lazily so the join handshake is never blocked by it.
 */
export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  initialQuality: GraphicsQuality,
): PostFx {
  if (initialQuality === "low") {
    return createPassthroughPostFx(renderer, scene, camera);
  }
  try {
    return createComposerPostFx(renderer, scene, camera, initialQuality);
  } catch (err) {
    console.error("[postfx] composer init failed — using direct render", err);
    return createPassthroughPostFx(renderer, scene, camera);
  }
}

function createComposerPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  initialQuality: GraphicsQuality,
): PostFx {
  let quality = initialQuality;

  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
    multisampling: 0,
  });

  composer.addPass(new RenderPass(scene, camera));

  const bloom = new BloomEffect({
    luminanceThreshold: BLOOM_THRESHOLD,
    luminanceSmoothing: BLOOM_SMOOTH,
    mipmapBlur: true,
    intensity: 0.55,
    radius: 0.62,
  });

  const vignette = new VignetteEffect({
    offset: 0.38,
    darkness: 0.32,
  });
  const baseVignetteDarkness = 0.32;

  const chroma = new ChromaticAberrationEffect({
    offset: new THREE.Vector2(0, 0),
    radialModulation: true,
    modulationOffset: 0.22,
  });

  const hueSat = new HueSaturationEffect({
    hue: 0,
    saturation: 0,
  });

  const shock = new ShockWaveEffect(camera, new THREE.Vector3(), {
    speed: 1.35,
    maxRadius: 0.55,
    waveSize: 0.18,
    amplitude: 0.045,
  });

  const tone = new ToneMappingEffect({
    mode: ToneMappingMode.ACES_FILMIC,
  });

  const smaa = new SMAAEffect({
    preset: SMAAPreset.MEDIUM,
  });

  composer.addPass(
    new EffectPass(camera, bloom, chroma, hueSat, shock, vignette, tone),
  );
  composer.addPass(new EffectPass(camera, smaa));

  let damageT = 0;
  let flashT = 0;
  const _camPos = new THREE.Vector3();
  const _scratch = new THREE.Vector3();
  let n8ao: { enabled: boolean; setQualityMode: (m: string) => void } | null =
    null;
  let n8aoLoading = false;

  function applyTonePath(useComposer: boolean): void {
    if (useComposer) {
      renderer.toneMapping = THREE.NoToneMapping;
    } else {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
    renderer.toneMappingExposure = BASE_EXPOSURE;
  }

  function applyQuality(next: GraphicsQuality): void {
    quality = next;
    const useComposer = next !== "low";
    applyTonePath(useComposer);

    if (n8ao) {
      n8ao.enabled = next === "high";
      if (next === "high") {
        try {
          n8ao.setQualityMode("Low");
        } catch {
          /* keep prior */
        }
      }
    }
    if (next === "high") {
      bloom.intensity = 0.68;
      smaa.applyPreset(SMAAPreset.HIGH);
    } else if (next === "medium") {
      bloom.intensity = 0.52;
      smaa.applyPreset(SMAAPreset.MEDIUM);
    }
  }
  applyQuality(initialQuality);

  function ensureN8ao(): void {
    if (n8ao || n8aoLoading || quality !== "high") return;
    n8aoLoading = true;
    void import("n8ao")
      .then(({ N8AOPostPass }) => {
        n8aoLoading = false;
        if (n8ao || quality !== "high") return;
        try {
          const pass = new N8AOPostPass(
            scene,
            camera,
            window.innerWidth,
            window.innerHeight,
          );
          pass.configuration.aoRadius = 1.6;
          pass.configuration.distanceFalloff = 1.0;
          pass.configuration.intensity = 1.35;
          pass.configuration.halfRes = true;
          pass.configuration.gammaCorrection = false;
          pass.setQualityMode("Low");
          pass.enabled = true;
          composer.addPass(pass as unknown as Pass, 1);
          n8ao = pass;
        } catch (err) {
          console.warn("[postfx] N8AO unavailable", err);
        }
      })
      .catch((err) => {
        n8aoLoading = false;
        console.warn("[postfx] N8AO import failed", err);
      });
  }
  if (initialQuality === "high") ensureN8ao();

  function pulseDamage(amount = 20): void {
    if (quality === "low") return;
    const strength = Math.min(1.4, 0.55 + amount / 55);
    damageT = Math.max(damageT, strength);
  }

  function pulseExplosion(at: { x: number; y: number; z: number }): void {
    if (quality === "low") return;
    camera.getWorldPosition(_camPos);
    _scratch.set(at.x, at.y, at.z);
    if (_camPos.distanceTo(_scratch) > EXPLOSION_RANGE) return;
    shock.position.copy(_scratch);
    shock.explode();
    pulseFlash();
  }

  function pulseFlash(): void {
    if (quality === "low") return;
    flashT = Math.max(flashT, 1);
  }

  function tick(dt: number): void {
    if (damageT > 0) {
      damageT = Math.max(0, damageT - dt * DAMAGE_DECAY);
    }
    if (flashT > 0) {
      flashT = Math.max(0, flashT - dt * FLASH_DECAY);
    }

    const d = damageT;
    chroma.offset.set(DAMAGE_CHROMA * d, -DAMAGE_CHROMA * d * 0.65);
    vignette.darkness =
      baseVignetteDarkness +
      (DAMAGE_VIGNETTE - baseVignetteDarkness) * Math.min(1, d);
    hueSat.hue = DAMAGE_HUE * Math.min(1, d);
    hueSat.saturation = 0.18 * Math.min(1, d);

    renderer.toneMappingExposure =
      BASE_EXPOSURE - FLASH_EXPOSURE_DIP * Math.min(1, flashT);
  }

  function render(dt: number): void {
    tick(dt);
    if (quality === "low") {
      renderer.render(scene, camera);
      return;
    }
    composer.render(dt);
  }

  function setSize(width: number, height: number): void {
    renderer.setSize(width, height);
    composer.setSize(width, height);
  }

  function dispose(): void {
    composer.dispose();
    applyTonePath(false);
  }

  return {
    render,
    setQuality(next) {
      applyQuality(next);
      if (next === "high") ensureN8ao();
    },
    setSize,
    pulseDamage,
    pulseExplosion,
    pulseFlash,
    dispose,
  };
}
