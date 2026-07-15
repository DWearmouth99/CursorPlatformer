import * as THREE from "three";
import {
  GUN_GAME_LENGTH,
  LEAN_LATERAL,
  LEAN_ROLL,
  MAX_CLIENT_CATCHUP_TICKS,
  MAX_HP,
  MOVE,
  PLAYER_EYE_CROUCH,
  PLAYER_EYE_STAND,
  TICK_DT,
  TICK_RATE,
  eyePosition,
  getWeaponById,
  gunGameWeapon,
  gunGameWeaponById,
  length2d,
  recoilOffsetRad,
  serverHitscan,
  spreadAngles,
  type SnapshotPlayer,
  type Team,
  type WeaponDef,
} from "@fps/shared";
import { createInput } from "./input";
import { createWorld } from "./world";
import { createGameSocket } from "./net/socket";
import { createPrediction } from "./net/prediction";
import { createInterpolator } from "./net/interpolation";
import { createRemotePlayers } from "./remotePlayers";
import { createHud } from "./hud";
import { createEffects } from "./fx";
import { createAudio } from "./audio";
import { showMainMenu } from "./menu";
import { bindPauseMenu } from "./pauseMenu";
import { loadSettings } from "./settings";
import {
  enterPlayMode,
  exitPlayMode,
  unlockGameKeys,
  shouldBlockBrowserShortcut,
} from "./browserLock";

export async function startGame(container: HTMLElement) {
  await showMainMenu();

  const overlay = document.getElementById("overlay")!;
  const overlayHint = document.getElementById("overlay-hint")!;
  const debugEl = document.getElementById("debug")!;
  const hudRoot = document.getElementById("hud")!;
  const crosshairEl = document.getElementById("crosshair")!;
  const scopeIron = document.getElementById("scope-iron")!;
  const scopeOptic = document.getElementById("scope-optic")!;
  const scopeSniper = document.getElementById("scope-sniper")!;
  const gunLadder = document.getElementById("gun-ladder")!;
  const gunLadderLevel = document.getElementById("gun-ladder-level")!;
  const gunLadderWeapon = document.getElementById("gun-ladder-weapon")!;
  const gunLadderNext = document.getElementById("gun-ladder-next")!;
  const staminaBar = document.getElementById("stamina-bar")!;
  const staminaFill = document.getElementById("stamina-fill")!;

  gunLadder.classList.remove("hidden");

  overlay.classList.remove("hidden");
  overlayHint.textContent = "Connecting to server…";

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.05,
    1500,
  );
  scene.add(camera);

  overlayHint.textContent = "Loading nature map…";
  const world = await createWorld(scene);
  overlayHint.textContent = "Connecting to server…";
  const remotes = createRemotePlayers(scene);
  let gunLevel = 0;
  let localMoveMult = 1;
  let localStatusText = "";
  let matchOver = false;
  const staminaMax = MOVE.STAMINA_SECONDS;
  let stamina = staminaMax;
  let staminaExhausted = false;
  let localSprinting = false;
  const prediction = createPrediction(world.solids, () => 1.05 * localMoveMult);

  function activeWeapon(): WeaponDef {
    return gunGameWeapon(gunLevel);
  }

  let lastWeaponId = "";
  function syncWeaponVisual(): void {
    const w = activeWeapon();
    if (w.id === lastWeaponId) return;
    lastWeaponId = w.id;
    fx.setWeapon(w);
  }

  function resolveWeapon(id?: string): WeaponDef | null {
    if (!id) return null;
    return gunGameWeaponById(id) ?? getWeaponById(id);
  }

  const interpolator = createInterpolator();
  const hud = createHud();
  const fx = createEffects(scene, camera);
  const audio = createAudio();
  const input = createInput(0);
  input.bind();

  const initialSettings = loadSettings();
  input.setUserSens(initialSettings.mouseSens);
  audio.setVolume(initialSettings.volume);
  audio.setMusicVolume(initialSettings.musicVolume);

  const pauseMenu = bindPauseMenu({
    onResume() {
      if (matchOver) return;
      overlay.classList.add("hidden");
      audio.unlock();
      audio.startMusic();
      void enterPlayMode(document.documentElement, {
        fullscreen: pauseMenu.getSettings().fullscreen,
      });
      renderer.domElement.requestPointerLock();
    },
    onMainMenu() {
      audio.stopMusic();
      audio.setWalking(false);
      exitPlayMode();
      socket.close();
      window.location.reload();
    },
    onSettingsChange(s) {
      input.setUserSens(s.mouseSens);
      audio.setVolume(s.volume);
      audio.setMusicVolume(s.musicVolume);
      // Apply fullscreen preference immediately while paused / in-game.
      void enterPlayMode(document.documentElement, {
        fullscreen: s.fullscreen,
      });
    },
  });
  let localId: string | null = null;
  let localTeam: Team | null = null;
  let connected = false;
  let welcomed = false;
  let lastAck = 0;
  let tickAccum = 0;
  let rttMs = 80;
  const inputSendAt = new Map<number, number>();
  let serverTick = 0;

  let localHp = MAX_HP;
  let localAmmo = activeWeapon().magSize;
  let localMag = activeWeapon().magSize;
  let localReloading = false;
  let wasReloading = false;
  let localAlive = true;
  let latestPlayers: SnapshotPlayer[] = [];

  let localSpray = 0;
  let localFireHeld = false;
  /** Space rising-edge for jump SFX (independent of prediction jumpHeld). */
  let localJumpHeld = false;
  let localLastFireTick = -999;
  let localBurstRemaining = 0;
  let localBurstNextTick = 0;
  let clientTick = 0;
  /** Last known grounded / jumpHeld per remote — jump SFX only on real jumps. */
  const remoteJumpPrev = new Map<string, { grounded: boolean; jumpHeld: boolean }>();

  function endMatch(winnerId: string): void {
    if (matchOver) return;
    matchOver = true;
    audio.setWalking(false);
    pauseMenu.setOpen(false);
    document.exitPointerLock();
    exitPlayMode();
    unlockGameKeys();
    overlay.classList.remove("hidden");
    const you = winnerId === localId;
    overlay.classList.add("overlay-result");
    overlayHint.textContent = you
      ? "You win Gun Game\nReturning to menu…"
      : `${winnerId} wins Gun Game\nReturning to menu…`;
    const title = overlay.querySelector(".overlay-title");
    if (title) title.textContent = you ? "Victory" : "Match Over";
    window.setTimeout(() => {
      socket.close();
      window.location.reload();
    }, 6500);
  }

  const socket = createGameSocket({
    onOpen() {
      connected = true;
      overlayHint.textContent = "Joining match…";
      socket.send({ type: "join", mode: "gun_game" });
    },
    onClose() {
      connected = false;
      if (welcomed) {
        overlayHint.textContent = "Disconnected — reconnecting…";
        overlay.classList.remove("hidden");
        welcomed = false;
      } else {
        overlayHint.textContent =
          `Connecting to ${socket.url}…\n(Free hosts can take up to a minute to wake)`;
        overlay.classList.remove("hidden");
      }
    },
    onMessage(msg) {
      if (msg.type === "welcome") {
        localId = msg.playerId;
        localTeam = msg.team;
        serverTick = msg.tick;
        welcomed = true;
        latestPlayers = msg.players;
        const self = msg.players.find((p) => p.id === localId);
        gunLevel = self?.gunLevel ?? 0;
        const wpn = activeWeapon();
        localMag = wpn.magSize;
        if (self) {
          prediction.resetFromSnapshot(self);
          input.look.yaw = self.yaw;
          input.look.pitch = self.pitch;
          localHp = self.hp;
          localAmmo = self.ammo;
          localMag = self.magSize;
          localReloading = self.reloading;
          localAlive = self.alive;
        }
        interpolator.push(performance.now(), msg.players, msg.tick);
        hudRoot.classList.remove("hidden");
        overlayHint.textContent = "Joined Gun Game — click to play";
        audio.unlock();
        audio.startMusic();
      } else if (msg.type === "snapshot") {
        serverTick = msg.tick;
        lastAck = msg.ackSeq;
        latestPlayers = msg.players;
        const sentAt = inputSendAt.get(msg.ackSeq);
        if (sentAt !== undefined) {
          const sample = performance.now() - sentAt;
          rttMs = rttMs * 0.85 + sample * 0.15;
          prediction.setOneWayLatency(rttMs / 2000);
          interpolator.setRttMs(rttMs);
          for (const [seq] of inputSendAt) {
            if (seq <= msg.ackSeq) inputSendAt.delete(seq);
          }
        }
        interpolator.push(performance.now(), msg.players, msg.tick);
        for (const p of msg.players) {
          if (p.id === localId) continue;
          const prev = remoteJumpPrev.get(p.id);
          // Require jumpHeld so stairs / sprint leave-ground don't fake a jump.
          if (
            prev &&
            prev.grounded &&
            !p.grounded &&
            p.alive &&
            p.jumpHeld &&
            p.velocity.y > MOVE.JUMP_VELOCITY * 0.7
          ) {
            audio.jump(false);
          }
          remoteJumpPrev.set(p.id, {
            grounded: p.grounded,
            jumpHeld: p.jumpHeld,
          });
        }
        const self = msg.players.find((p) => p.id === localId);
        if (self && welcomed) {
          const wasAlive = localAlive;
          gunLevel = self.gunLevel ?? gunLevel;
          prediction.reconcile(msg.ackSeq, self);
          localHp = self.hp;
          localAmmo = self.ammo;
          localMag = self.magSize;
          localReloading = self.reloading;
          localAlive = self.alive;
          {
            let mult = self.status?.moveMult ?? 1;
            if ((self.status?.slowUntil ?? 0) > msg.tick) mult *= 0.48;
            if ((self.status?.shrinkUntil ?? 0) > msg.tick) mult *= 1.2;
            localMoveMult = mult;
            if ((self.status?.frozenUntil ?? 0) > msg.tick) {
              localStatusText = "FROZEN";
            } else if ((self.status?.shrinkUntil ?? 0) > msg.tick) {
              localStatusText = "SHRUNK";
            } else if ((self.status?.slowUntil ?? 0) > msg.tick) {
              localStatusText = "SLIPPING";
            } else {
              localStatusText = "";
            }
          }
          if (!wasAlive && self.alive) {
            prediction.resetFromSnapshot(self);
            input.look.yaw = self.yaw;
            input.look.pitch = self.pitch;
            localSpray = 0;
          }
          if (wasAlive && !self.alive) {
            audio.death();
            audio.stopReload();
          }
          if (!wasReloading && self.reloading) {
            audio.reload(activeWeapon().reloadMs);
          }
          if (wasReloading && !self.reloading) {
            audio.stopReload();
          }
          wasReloading = self.reloading;
          if (!self.alive) localSpray = 0;
        }
      } else if (msg.type === "playerLeft") {
        interpolator.removePlayer(msg.playerId);
        remotes.remove(msg.playerId);
        remoteJumpPrev.delete(msg.playerId);
        latestPlayers = latestPlayers.filter((p) => p.id !== msg.playerId);
      } else if (msg.type === "hitConfirm") {
        hud.showHitMarker(msg.isHeadshot);
        audio.hitConfirm(msg.isHeadshot);
      } else if (msg.type === "damage") {
        localHp = msg.hp;
        hud.showDamageFlash(msg.amount);
        audio.hurt();
      } else if (msg.type === "killFeed") {
        hud.pushKill(msg.killerId, msg.victimId, {
          headshot: !!msg.isHeadshot,
          localId,
        });
      } else if (msg.type === "shot") {
        if (msg.shooterId === localId) return;
        {
          const w = resolveWeapon(msg.weaponId);
          fx.remoteShot(
            msg.origin,
            msg.end,
            msg.hitPlayer,
            performance.now(),
            w,
          );
          audio.shoot(false, w);
        }
      } else if (msg.type === "gunAdvance") {
        if (msg.playerId === localId) {
          gunLevel = msg.gunLevel;
          const w = gunGameWeapon(gunLevel);
          localMag = w.magSize;
          localAmmo = w.magSize;
          localReloading = false;
          hud.pushKillFeed(`Unlocked · ${msg.weaponName}`);
        } else {
          hud.pushKillFeed(`${msg.playerId} unlocked · ${msg.weaponName}`);
        }
      } else if (msg.type === "gunGameWin") {
        const you = msg.playerId === localId;
        hud.pushKillFeed(
          you ? "Victory · Gun Game complete" : `${msg.playerId} wins Gun Game`,
        );
        endMatch(msg.playerId);
      }
    },
  });

  overlayHint.textContent =
    `Connecting to ${socket.url}…\n(Free hosts can take up to a minute to wake)`;
  socket.connect();

  function requestLock() {
    if (!welcomed || matchOver || pauseMenu.isOpen()) return;
    audio.unlock();
    audio.startMusic();
    void enterPlayMode(document.documentElement, {
      fullscreen: pauseMenu.getSettings().fullscreen,
    });
    renderer.domElement.requestPointerLock();
  }

  overlay.addEventListener("click", requestLock);
  renderer.domElement.addEventListener("click", requestLock);

  document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === renderer.domElement;
    if (locked) {
      if (matchOver) {
        document.exitPointerLock();
        return;
      }
      pauseMenu.setOpen(false);
      overlay.classList.add("hidden");
      audio.unlock();
      void enterPlayMode(document.documentElement, {
        fullscreen: pauseMenu.getSettings().fullscreen,
      });
      return;
    }
    unlockGameKeys();
    if (matchOver) {
      overlay.classList.remove("hidden");
      return;
    }
    if (welcomed) {
      pauseMenu.setOpen(true);
      overlay.classList.add("hidden");
    } else {
      overlay.classList.remove("hidden");
    }
  });

  window.addEventListener(
    "keydown",
    (e) => {
      if (shouldBlockBrowserShortcut(e)) {
        e.preventDefault();
        // Do not stopPropagation — input.ts still needs these keydowns.
      }
      if (e.code !== "Escape") return;
      if (!welcomed || matchOver) return;
      if (pauseMenu.isOpen()) {
        e.preventDefault();
        pauseMenu.setOpen(false);
        requestLock();
      }
    },
    true,
  );

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let last = performance.now();

  function simTick(): void {
    if (!welcomed || matchOver) return;
    clientTick += 1;
    const buttons = input.getCombatButtons(false);
    const weapon = activeWeapon();
    const fireCooldownTicks = Math.max(1, Math.round(TICK_RATE / weapon.fireRate));

    if (!localAlive) {
      buttons.forward = false;
      buttons.back = false;
      buttons.left = false;
      buttons.right = false;
      buttons.jump = false;
      buttons.fire = false;
      buttons.reload = false;
      buttons.sprint = false;
      localFireHeld = false;
      localJumpHeld = false;
    }

    const moving =
      buttons.forward || buttons.back || buttons.left || buttons.right;
    let canSprint =
      localAlive &&
      buttons.sprint &&
      moving &&
      !buttons.crouch &&
      !staminaExhausted &&
      stamina > 0;
    if (canSprint) {
      stamina = Math.max(0, stamina - TICK_DT);
      if (stamina <= 0) {
        stamina = 0;
        staminaExhausted = true;
        canSprint = false;
      }
    } else {
      stamina = Math.min(staminaMax, stamina + TICK_DT);
      if (stamina >= staminaMax) staminaExhausted = false;
    }
    buttons.sprint = canSprint;
    localSprinting = canSprint;

    let firedThisTick = false;
    let fireSprayIndex = 0;
    const lean = input.getLean();
    const ads = buttons.ads;
    const fireEdge = buttons.fire && !localFireHeld;
    localFireHeld = buttons.fire;

    const isBurst = weapon.fireStyle === "burst";
    let canFire = false;
    if (localAlive && !localReloading && localAmmo > 0) {
      if (isBurst && localBurstRemaining > 0) {
        canFire = clientTick >= localBurstNextTick;
      } else if (buttons.fire) {
        const canSemi = !weapon.semiAuto || fireEdge;
        canFire =
          canSemi && clientTick - localLastFireTick >= fireCooldownTicks;
        if (canFire && isBurst) {
          localBurstRemaining = Math.min(
            weapon.burstCount ?? 3,
            localAmmo,
          );
        }
      }
    }
    if (canFire) {
      localLastFireTick = clientTick;
      fireSprayIndex = localSpray;
      localAmmo = Math.max(0, localAmmo - 1);
      if (isBurst) {
        localBurstRemaining = Math.max(0, localBurstRemaining - 1);
        localBurstNextTick = clientTick + 2;
      }
      firedThisTick = true;

      // Optimistic auto-reload when mag empties (server also triggers)
      if (localAmmo <= 0 && !localReloading) {
        localReloading = true;
        audio.reload(weapon.reloadMs);
      }

      const player = prediction.getState();
      const origin = eyePosition(
        player.position,
        player.crouching,
        input.look.yaw,
        lean,
      );
      const spread = weapon.spreadDeg * (ads ? weapon.adsSpreadMult : 1);
      // Rockets / snipers aim true; shotguns preview pellet cone.
      const pellets =
        weapon.explosionRadius != null
          ? 1
          : Math.min(weapon.pellets, 8);
      let end = { x: origin.x, y: origin.y, z: origin.z };
      for (let pellet = 0; pellet < pellets; pellet++) {
        const aim = spreadAngles(
          input.look.yaw,
          input.look.pitch,
          spread,
          clientTick * 17 + pellet * 91,
        );
        const hit = serverHitscan(
          origin,
          aim.yaw,
          aim.pitch,
          localId ?? "",
          [],
          world.solids,
          weapon.maxRange ?? 200,
        );
        end = hit.end;
        if (pellet === 0 || weapon.pellets > 1) {
          // Camera matrix used by FX — update once before first spawn.
          if (pellet === 0) {
            const eyeH = player.crouching
              ? PLAYER_EYE_CROUCH
              : PLAYER_EYE_STAND;
            const rightX = Math.cos(input.look.yaw);
            const rightZ = -Math.sin(input.look.yaw);
            camera.position.set(
              player.position.x + rightX * LEAN_LATERAL * lean,
              player.position.y + eyeH,
              player.position.z + rightZ * LEAN_LATERAL * lean,
            );
            camera.rotation.order = "YXZ";
            camera.rotation.y = input.look.yaw;
            camera.rotation.x = input.look.pitch;
            camera.rotation.z = -lean * LEAN_ROLL;
          }
          fx.localShot(end, performance.now(), weapon, pellet > 0);
        }
      }
      audio.shoot(true, weapon);
    }
    if (!buttons.fire) localSpray = 0;

    {
      const beforeJump = prediction.getState();
      const jumpEdge =
        localAlive &&
        beforeJump.grounded &&
        buttons.jump &&
        !localJumpHeld;
      localJumpHeld = buttons.jump;
      if (jumpEdge) audio.jump(true);
    }

    const cmd = prediction.predictTick(
      buttons,
      input.look.yaw,
      input.look.pitch,
      lean,
    );
    cmd.rttMs = Math.round(rttMs);
    inputSendAt.set(cmd.seq, performance.now());
    if (inputSendAt.size > 120) {
      const oldest = inputSendAt.keys().next().value;
      if (oldest !== undefined) inputSendAt.delete(oldest);
    }
    socket.send(cmd);

    if (firedThisTick) {
      const kick = recoilOffsetRad(fireSprayIndex, weapon.recoilPattern);
      const adsRecoil = ads ? 0.55 : 1;
      input.applyRecoil(kick.pitch * adsRecoil, kick.yaw * adsRecoil);
      localSpray = Math.min(
        localSpray + 1,
        Math.max(weapon.recoilPattern.length - 1, 0),
      );
    }
  }

  function frame(now: number) {
    const frameDt = Math.min((now - last) / 1000, 0.05);
    last = now;

    const lean = input.updateLean(frameDt);
    const buttons = input.getCombatButtons(false);
    const weapon = activeWeapon();
    input.setAdsSensMult(buttons.ads ? weapon.adsSensMult : 1);

    if (welcomed && !matchOver && !pauseMenu.isOpen()) {
      tickAccum += frameDt;
      let steps = 0;
      while (tickAccum >= TICK_DT && steps < MAX_CLIENT_CATCHUP_TICKS) {
        simTick();
        tickAccum -= TICK_DT;
        steps += 1;
      }
      // Keep a small remainder so we don't drift; discard only huge stalls.
      if (tickAccum > TICK_DT * MAX_CLIENT_CATCHUP_TICKS) {
        tickAccum = 0;
      }
      prediction.setView(input.look.yaw, input.look.pitch);
    }

    const player = prediction.getState();
    const eyeH = player.crouching ? PLAYER_EYE_CROUCH : PLAYER_EYE_STAND;
    const rightX = Math.cos(player.yaw);
    const rightZ = -Math.sin(player.yaw);
    const spd = length2d(player.velocity);
    const ads = buttons.ads && localAlive;

    world.updateSky(frameDt, now);
    remotes.sync(interpolator.sample(localId, now), frameDt);
    syncWeaponVisual();
    fx.update(now, frameDt, localAlive, localAlive && player.grounded && spd > 1.2, {
      ads,
      adsFov: weapon.adsFov,
      // Meme / optic guns are bulky — hide VM on ADS so the zoom is usable
      hideViewmodel:
        weapon.scopeStyle === "sniper" ||
        weapon.scopeStyle === "optic" ||
        weapon.id.startsWith("gg_"),
      reloading: localReloading,
      reloadMs: weapon.reloadMs,
      sprint: localSprinting,
      moveSpeed: spd,
      grounded: player.grounded,
    });
    const headBob = fx.getHeadBob();

    camera.position.set(
      player.position.x + rightX * LEAN_LATERAL * lean,
      player.position.y + eyeH + headBob.y,
      player.position.z + rightZ * LEAN_LATERAL * lean,
    );
    camera.rotation.order = "YXZ";
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    camera.rotation.z = -lean * LEAN_ROLL + headBob.roll;

    // Scope overlays
    const showIron = ads && weapon.scopeStyle === "iron";
    const showOptic = ads && weapon.scopeStyle === "optic";
    const showSniper = ads && weapon.scopeStyle === "sniper";
    scopeIron.classList.toggle("visible", showIron);
    scopeOptic.classList.toggle("visible", showOptic);
    scopeSniper.classList.toggle("visible", showSniper);
    // Hide hip crosshair while aiming (RMB) or using sniper scope
    crosshairEl.classList.toggle("hidden", ads || showSniper);

    const wasdHeld =
      localAlive &&
      !matchOver &&
      !pauseMenu.isOpen() &&
      (buttons.forward || buttons.back || buttons.left || buttons.right);
    // Cadence tracks speed: walk ~1.0 → sprint ~1.7 smoothly
    const walkRate = wasdHeld
      ? 0.95 + Math.min(spd / MOVE.MAX_SPEED, 1.35) * 0.55 + (localSprinting ? 0.25 : 0)
      : 1;
    audio.setWalking(wasdHeld, walkRate);

    const staminaPct = (stamina / staminaMax) * 100;
    staminaFill.style.width = `${staminaPct}%`;
    const showStamina =
      localAlive && (stamina < staminaMax - 0.01 || buttons.sprint || staminaExhausted);
    staminaBar.classList.toggle("hidden", !showStamina);
    staminaBar.classList.toggle("exhausted", staminaExhausted);

    const wpn = activeWeapon();

      gunLadderLevel.textContent = `${gunLevel + 1} / ${GUN_GAME_LENGTH}`;
      gunLadderWeapon.textContent = wpn.name;
      const next =
        gunLevel + 1 < GUN_GAME_LENGTH
          ? gunGameWeapon(gunLevel + 1).name
          : "WIN on next kill";
      gunLadderNext.textContent = `Next: ${next}`;

    hud.render(
      {
        hp: localHp,
        ammo: localAmmo,
        magSize: localMag,
        reloading: localReloading,
        alive: localAlive,
        className: "Gun Game",
        weaponName: wpn.name,
        statusText: localStatusText,
        gunLevel,
        scoreboardOpen: input.isScoreboardOpen(),
        players: latestPlayers.map((p) => ({
          id: p.id,
          team: p.team,
          weaponLabel: `${(p.gunLevel ?? 0) + 1}. ${p.weaponName ?? "?"}`,
          kills: p.kills,
          deaths: p.deaths,
          isLocal: p.id === localId,
        })),
      },
      now,
    );

    debugEl.textContent =
      `net  ${connected ? "up" : "down"}  ping ${Math.round(rttMs)}ms  id ${localId ?? "-"}\n` +
      `gun ${gunLevel + 1}/${GUN_GAME_LENGTH}  tick ${serverTick}  ack ${lastAck}\n` +

      `pos  ${player.position.x.toFixed(2)}  ${player.position.y.toFixed(2)}  ${player.position.z.toFixed(2)}\n` +
      `spd  ${spd.toFixed(2)} m/s`;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
