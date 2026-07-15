import * as THREE from "three";
import {
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
  length2d,
  recoilOffsetRad,
  serverHitscan,
  spreadAngles,
  type ClassId,
  type SnapshotPlayer,
  type Team,
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

export async function startGame(container: HTMLElement) {
  const selection = await showMainMenu();

  const overlay = document.getElementById("overlay")!;
  const overlayHint = document.getElementById("overlay-hint")!;
  const debugEl = document.getElementById("debug")!;
  const hudRoot = document.getElementById("hud")!;
  const crosshairEl = document.getElementById("crosshair")!;
  const scopeIron = document.getElementById("scope-iron")!;
  const scopeOptic = document.getElementById("scope-optic")!;
  const scopeSniper = document.getElementById("scope-sniper")!;

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
    200,
  );
  scene.add(camera);

  const world = createWorld(scene);
  const remotes = createRemotePlayers(scene);
  let classId: ClassId = selection.classId;
  const prediction = createPrediction(
    world.solids,
    () => getClass(classId).speedMult,
  );
  const interpolator = createInterpolator();
  const hud = createHud();
  const fx = createEffects(scene, camera);
  const audio = createAudio();
  const input = createInput(0);
  input.bind();

  let localId: string | null = null;
  let localTeam: Team | null = null;
  let connected = false;
  let welcomed = false;
  let lastAck = 0;
  let tickAccum = 0;
  let serverTick = 0;

  let localHp = MAX_HP;
  let localAmmo = getClass(classId).weapon.magSize;
  let localMag = getClass(classId).weapon.magSize;
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
      socket.send({ type: "join", classId: selection.classId });
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
        serverTick = msg.tick;
        welcomed = true;
        latestPlayers = msg.players;
        const self = msg.players.find((p) => p.id === localId);
        const cls = getClass(classId);
        localMag = cls.weapon.magSize;
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
        interpolator.push(performance.now(), msg.players);
        hudRoot.classList.remove("hidden");
        overlayHint.textContent = `Joined as ${localTeam} ${cls.name} — click to play`;
      } else if (msg.type === "snapshot") {
        serverTick = msg.tick;
        lastAck = msg.ackSeq;
        latestPlayers = msg.players;
        interpolator.push(performance.now(), msg.players);
        const self = msg.players.find((p) => p.id === localId);
        if (self && welcomed) {
          const wasAlive = localAlive;
          classId = self.classId;
          prediction.reconcile(msg.ackSeq, self);
          localHp = self.hp;
          localAmmo = self.ammo;
          localMag = self.magSize;
          localReloading = self.reloading;
          localAlive = self.alive;
          if (!wasAlive && self.alive) {
            prediction.resetFromSnapshot(self);
            input.look.yaw = self.yaw;
            input.look.pitch = self.pitch;
            localSpray = 0;
          }
          if (wasAlive && !self.alive) audio.death();
          if (!wasReloading && self.reloading) audio.reload();
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
        fx.remoteShot(msg.origin, msg.end, msg.hitPlayer, performance.now());
        audio.shoot(false);
      }
    },
  });

  overlayHint.textContent =
    `Connecting to ${socket.url}…\n(Free hosts can take up to a minute to wake)`;
  socket.connect();

  function requestLock() {
    if (!welcomed) return;
    audio.unlock();
    renderer.domElement.requestPointerLock();
  }

  overlay.addEventListener("click", requestLock);
  renderer.domElement.addEventListener("click", requestLock);

  document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === renderer.domElement;
    overlay.classList.toggle("hidden", locked);
    if (locked) audio.unlock();
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let last = performance.now();

  function simTick(): void {
    if (!welcomed) return;
    clientTick += 1;
    const buttons = input.getButtons();
    const weapon = getClass(classId).weapon;
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
      fx.localShot(end, now);
      audio.shoot(true);
    }
    if (!buttons.fire) localSpray = 0;

    const cmd = prediction.predictTick(
      buttons,
      input.look.yaw,
      input.look.pitch,
      lean,
    );
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
    const buttons = input.getButtons();
    const weapon = getClass(classId).weapon;
    input.setAdsSensMult(buttons.ads ? weapon.adsSensMult : 1);

    if (welcomed) {
      tickAccum += frameDt;
      let steps = 0;
      while (tickAccum >= TICK_DT && steps < MAX_CLIENT_CATCHUP_TICKS) {
        simTick();
        tickAccum -= TICK_DT;
        steps += 1;
      }
      if (tickAccum > TICK_DT * 2) tickAccum = 0;
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
    const spd = length2d(player.velocity);
    const ads = buttons.ads && localAlive;
    fx.update(now, frameDt, localAlive, localAlive && player.grounded && spd > 1.5, {
      ads,
      adsFov: weapon.adsFov,
      hideViewmodel: weapon.scopeStyle === "sniper",
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
    hud.render(
      {
        hp: localHp,
        ammo: localAmmo,
        magSize: localMag,
        reloading: localReloading,
        alive: localAlive,
        className: cls.name,
        weaponName: cls.weapon.name,
        scoreboardOpen: input.isScoreboardOpen(),
        players: latestPlayers.map((p) => ({
          id: p.id,
          team: p.team,
          className: getClass(p.classId).name,
          kills: p.kills,
          deaths: p.deaths,
          isLocal: p.id === localId,
        })),
      },
      now,
    );

    debugEl.textContent =
      `net  ${connected ? "up" : "down"}  team ${localTeam ?? "-"}  id ${localId ?? "-"}\n` +
      `class ${cls.id}  tick ${serverTick}  ack ${lastAck}\n` +
      `pos  ${player.position.x.toFixed(2)}  ${player.position.y.toFixed(2)}  ${player.position.z.toFixed(2)}\n` +
      `spd  ${spd.toFixed(2)} m/s`;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
