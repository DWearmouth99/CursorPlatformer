import * as THREE from "three";
import {
  GUN_GAME_LENGTH,
  LEAN_LATERAL,
  LEAN_ROLL,
  MAX_CLIENT_CATCHUP_TICKS,
  MAX_HP,
  PLAYER_EYE_CROUCH,
  PLAYER_EYE_STAND,
  TICK_DT,
  TICK_RATE,
  eyePosition,
  getClass,
  getWeaponById,
  gunGameWeapon,
  gunGameWeaponById,
  length2d,
  recoilOffsetRad,
  serverHitscan,
  spreadAngles,
  type ClassId,
  type GameMode,
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
import { bindClassSwapMenu, showMainMenu } from "./menu";
import { createAbilityView } from "./abilityView";
import { bindPauseMenu } from "./pauseMenu";
import { loadSettings } from "./settings";
import { enterPlayMode, exitPlayMode, unlockGameKeys, shouldBlockBrowserShortcut } from "./browserLock";

export async function startGame(container: HTMLElement) {
  const selection = await showMainMenu();
  let gameMode: GameMode = selection.mode;

  const overlay = document.getElementById("overlay")!;
  const overlayHint = document.getElementById("overlay-hint")!;
  const debugEl = document.getElementById("debug")!;
  const hudRoot = document.getElementById("hud")!;
  const crosshairEl = document.getElementById("crosshair")!;
  const scopeIron = document.getElementById("scope-iron")!;
  const scopeOptic = document.getElementById("scope-optic")!;
  const scopeSniper = document.getElementById("scope-sniper")!;
  const abilityBars = document.getElementById("ability-bars")!;
  const gunLadder = document.getElementById("gun-ladder")!;
  const gunLadderLevel = document.getElementById("gun-ladder-level")!;
  const gunLadderWeapon = document.getElementById("gun-ladder-weapon")!;
  const gunLadderNext = document.getElementById("gun-ladder-next")!;

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
    400,
  );
  scene.add(camera);

  overlayHint.textContent = "Loading nature map…";
  const world = await createWorld(scene);
  overlayHint.textContent = "Connecting to server…";
  const remotes = createRemotePlayers(scene);
  const abilityView = createAbilityView(scene);
  let classId: ClassId = selection.classId;
  let gunLevel = 0;
  let localMoveMult = 1;
  let localAb1Cd = 0;
  let localAb2Cd = 0;
  let localStatusText = "";
  const prediction = createPrediction(world.solids, () =>
    gameMode === "gun_game"
      ? 1.05 * localMoveMult
      : getClass(classId).speedMult * localMoveMult,
  );

  function activeWeapon(): WeaponDef {
    return gameMode === "gun_game"
      ? gunGameWeapon(gunLevel)
      : getClass(classId).weapon;
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

  function syncModeUi(): void {
    const gg = gameMode === "gun_game";
    abilityBars.classList.toggle("hidden", gg);
    gunLadder.classList.toggle("hidden", !gg);
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

  let classMenuWasDown = false;
  let requestClassChange: (id: ClassId) => void = () => {};
  const classSwap = bindClassSwapMenu((id) => requestClassChange(id));

  const pauseMenu = bindPauseMenu({
    onResume() {
      overlay.classList.add("hidden");
      audio.unlock();
      void enterPlayMode();
      renderer.domElement.requestPointerLock();
    },
    onMainMenu() {
      exitPlayMode();
      socket.close();
      window.location.reload();
    },
    onSettingsChange(s) {
      input.setUserSens(s.mouseSens);
      audio.setVolume(s.volume);
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
  let localLastFireTick = -999;
  let clientTick = 0;
  let footstepAcc = 0;

  const socket = createGameSocket({
    onOpen() {
      connected = true;
      overlayHint.textContent = "Joining match…";
      socket.send({
        type: "join",
        mode: selection.mode,
        classId: selection.classId,
      });
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
        classId = msg.classId;
        gameMode = msg.mode ?? selection.mode;
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
        if (msg.props) abilityView.syncProps(msg.props);
        hudRoot.classList.remove("hidden");
        syncModeUi();
        const modeLabel =
          gameMode === "gun_game"
            ? "Gun Game lobby"
            : `Ability Arena · ${getClass(classId).name}`;
        overlayHint.textContent = `Joined ${modeLabel} — click to play`;
      } else if (msg.type === "snapshot") {
        serverTick = msg.tick;
        lastAck = msg.ackSeq;
        latestPlayers = msg.players;
        if (msg.props) abilityView.syncProps(msg.props);
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
        const self = msg.players.find((p) => p.id === localId);
        if (self && welcomed) {
          const wasAlive = localAlive;
          classId = self.classId;
          gunLevel = self.gunLevel ?? gunLevel;
          prediction.reconcile(msg.ackSeq, self);
          localHp = self.hp;
          localAmmo = self.ammo;
          localMag = self.magSize;
          localReloading = self.reloading;
          localAlive = self.alive;
          localAb1Cd = self.ab1CdMs ?? 0;
          localAb2Cd = self.ab2CdMs ?? 0;
          localMoveMult = self.status?.moveMult ?? 1;
          const st = self.status;
          const bits: string[] = [];
          if (st && st.frozenUntil > serverTick) bits.push("FROZEN");
          if (st && st.veiledUntil > serverTick) bits.push("VEILED");
          if (st && st.burningUntil > serverTick) bits.push("BURNING");
          if (st && st.icePathUntil > serverTick) bits.push("ICE PATH");
          localStatusText = bits.join(" · ");
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
        latestPlayers = latestPlayers.filter((p) => p.id !== msg.playerId);
      } else if (msg.type === "hitConfirm") {
        hud.showHitMarker(msg.isHeadshot);
        audio.hitConfirm(msg.isHeadshot);
      } else if (msg.type === "damage") {
        localHp = msg.hp;
        hud.showDamageFlash();
        audio.hurt();
      } else if (msg.type === "killFeed") {
        const hs = msg.isHeadshot ? " HS" : "";
        hud.pushKillFeed(`${msg.killerId} → ${msg.victimId}${hs}`);
      } else if (msg.type === "shot") {
        if (msg.shooterId === localId) return;
        fx.remoteShot(
          msg.origin,
          msg.end,
          msg.hitPlayer,
          performance.now(),
          resolveWeapon(msg.weaponId),
        );
        audio.shoot(false);
      } else if (msg.type === "abilityFx") {
        abilityView.playFx(msg);
      } else if (msg.type === "classChanged") {
        if (msg.playerId === localId) {
          classId = msg.classId;
          const cls = getClass(classId);
          localMag = cls.weapon.magSize;
          localAmmo = cls.weapon.magSize;
          hud.pushKillFeed(`Swapped to ${cls.name}`);
        }
      } else if (msg.type === "gunAdvance") {
        if (msg.playerId === localId) {
          gunLevel = msg.gunLevel;
          const w = gunGameWeapon(gunLevel);
          localMag = w.magSize;
          localAmmo = w.magSize;
          localReloading = false;
          hud.pushKillFeed(`Unlocked: ${msg.weaponName}`);
        } else {
          hud.pushKillFeed(`${msg.playerId} → ${msg.weaponName}`);
        }
      } else if (msg.type === "gunGameWin") {
        const you = msg.playerId === localId;
        hud.pushKillFeed(
          you ? "YOU WIN GUN GAME!" : `${msg.playerId} wins Gun Game!`,
        );
        if (you) {
          overlay.classList.remove("hidden");
          overlayHint.textContent = "You win Gun Game! — click to keep playing";
          document.exitPointerLock();
        }
      }
    },
  });

  requestClassChange = (id) => {
    socket.send({ type: "changeClass", classId: id });
  };
  overlayHint.textContent =
    `Connecting to ${socket.url}…\n(Free hosts can take up to a minute to wake)`;
  socket.connect();

  function requestLock() {
    if (!welcomed || classSwap.isOpen() || pauseMenu.isOpen()) return;
    audio.unlock();
    void enterPlayMode();
    renderer.domElement.requestPointerLock();
  }

  overlay.addEventListener("click", requestLock);
  renderer.domElement.addEventListener("click", requestLock);

  document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === renderer.domElement;
    if (locked) {
      pauseMenu.setOpen(false);
      overlay.classList.add("hidden");
      audio.unlock();
      void enterPlayMode();
      return;
    }
    // Esc / unlock while in match → pause menu (not the click-to-play overlay).
    unlockGameKeys();
    if (welcomed && !classSwap.isOpen()) {
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
      if (!welcomed) return;
      if (classSwap.isOpen()) {
        classSwap.setOpen(false);
        return;
      }
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
    if (!welcomed) return;
    clientTick += 1;
    const buttons = input.getCombatButtons(gameMode === "ability");
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
    }

    let firedThisTick = false;
    let fireSprayIndex = 0;
    const lean = input.getLean();
    const ads = buttons.ads;

    if (
      localAlive &&
      buttons.fire &&
      !localReloading &&
      localAmmo > 0 &&
      clientTick - localLastFireTick >= fireCooldownTicks
    ) {
      localLastFireTick = clientTick;
      fireSprayIndex = localSpray;
      localAmmo = Math.max(0, localAmmo - 1);
      firedThisTick = true;

      const player = prediction.getState();
      const origin = eyePosition(
        player.position,
        player.crouching,
        input.look.yaw,
        lean,
      );
      const spread = weapon.spreadDeg * (ads ? weapon.adsSpreadMult : 1);
      const aim = spreadAngles(
        input.look.yaw,
        input.look.pitch,
        spread,
        clientTick * 17,
      );
      const { end } = serverHitscan(
        origin,
        aim.yaw,
        aim.pitch,
        localId ?? "",
        [],
        world.solids,
        weapon.maxRange ?? 200,
      );
      const now = performance.now();
      const eyeH = player.crouching ? PLAYER_EYE_CROUCH : PLAYER_EYE_STAND;
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
      fx.localShot(end, now, weapon);
      audio.shoot(true);
    }
    if (!buttons.fire) localSpray = 0;

    const cmd = prediction.predictTick(
      buttons,
      input.look.yaw,
      input.look.pitch,
      lean,
    );
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

    const classDown = input.isClassMenuHeld();
    if (
      classDown &&
      !classMenuWasDown &&
      welcomed &&
      gameMode === "ability"
    ) {
      classSwap.setOpen(!classSwap.isOpen());
    }
    classMenuWasDown = classDown;

    const lean = input.updateLean(frameDt);
    const buttons = input.getCombatButtons(gameMode === "ability");
    const weapon = activeWeapon();
    input.setAdsSensMult(buttons.ads ? weapon.adsSensMult : 1);

    if (welcomed && !classSwap.isOpen() && !pauseMenu.isOpen()) {
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
    camera.position.set(
      player.position.x + rightX * LEAN_LATERAL * lean,
      player.position.y + eyeH,
      player.position.z + rightZ * LEAN_LATERAL * lean,
    );
    camera.rotation.order = "YXZ";
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    camera.rotation.z = -lean * LEAN_ROLL;

    remotes.sync(interpolator.sample(localId, now), frameDt);
    abilityView.update(now);
    syncWeaponVisual();
    const spd = length2d(player.velocity);
    const ads = buttons.ads && localAlive;
    fx.update(now, frameDt, localAlive, localAlive && player.grounded && spd > 1.5, {
      ads,
      adsFov: weapon.adsFov,
      hideViewmodel: weapon.scopeStyle === "sniper",
      reloading: localReloading,
      reloadMs: weapon.reloadMs,
    });

    // Scope overlays
    const showIron = ads && weapon.scopeStyle === "iron";
    const showOptic = ads && weapon.scopeStyle === "optic";
    const showSniper = ads && weapon.scopeStyle === "sniper";
    scopeIron.classList.toggle("visible", showIron);
    scopeOptic.classList.toggle("visible", showOptic);
    scopeSniper.classList.toggle("visible", showSniper);
    crosshairEl.classList.toggle("hidden", showSniper);

    if (localAlive && player.grounded && spd > 2.5) {
      footstepAcc += frameDt * spd;
      if (footstepAcc > 2.2) {
        footstepAcc = 0;
        audio.footstep();
      }
    } else {
      footstepAcc = 0;
    }

    const cls = getClass(classId);
    const wpn = activeWeapon();
    if (gameMode === "gun_game") {
      gunLadderLevel.textContent = `${gunLevel + 1} / ${GUN_GAME_LENGTH}`;
      gunLadderWeapon.textContent = wpn.name;
      const next =
        gunLevel + 1 < GUN_GAME_LENGTH
          ? gunGameWeapon(gunLevel + 1).name
          : "WIN on next kill";
      gunLadderNext.textContent = `Next: ${next}`;
    }
    hud.render(
      {
        hp: localHp,
        ammo: localAmmo,
        magSize: localMag,
        reloading: localReloading,
        alive: localAlive,
        className:
          gameMode === "gun_game" ? "Gun Game" : cls.name,
        weaponName: wpn.name,
        ability1Name: cls.ability1.name,
        ability2Name: cls.ability2.name,
        ability1CdMs: localAb1Cd,
        ability2CdMs: localAb2Cd,
        ability1MaxMs: cls.ability1.cooldownMs,
        ability2MaxMs: cls.ability2.cooldownMs,
        statusText: localStatusText,
        scoreboardOpen: input.isScoreboardOpen() && !classSwap.isOpen(),
        players: latestPlayers.map((p) => ({
          id: p.id,
          team: p.team,
          className:
            gameMode === "gun_game"
              ? `${(p.gunLevel ?? 0) + 1}. ${p.weaponName ?? "?"}`
              : getClass(p.classId).name,
          kills: p.kills,
          deaths: p.deaths,
          isLocal: p.id === localId,
        })),
      },
      now,
    );

    debugEl.textContent =
      `net  ${connected ? "up" : "down"}  ping ${Math.round(rttMs)}ms  mode ${gameMode}  id ${localId ?? "-"}\n` +
      `${gameMode === "gun_game" ? `gun ${gunLevel + 1}/${GUN_GAME_LENGTH}` : `class ${cls.id}`}  tick ${serverTick}  ack ${lastAck}\n` +
      `pos  ${player.position.x.toFixed(2)}  ${player.position.y.toFixed(2)}  ${player.position.z.toFixed(2)}\n` +
      `spd  ${spd.toFixed(2)} m/s`;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
