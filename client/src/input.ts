import type { CombatButtons } from "@fps/shared";

const keys = new Set<string>();
let mouseLeft = false;
let mouseRight = false;

export type LookState = {
  yaw: number;
  pitch: number;
};

const MOUSE_SENS = 0.0022;
const PITCH_LIMIT = Math.PI / 2 - 0.05;

export function createInput(initialYaw = 0) {
  const look: LookState = { yaw: initialYaw, pitch: 0 };
  let sensMult = 1;
  /** Smoothed lean -1..1 for rendering / network. */
  let lean = 0;

  function onKeyDown(e: KeyboardEvent) {
    keys.add(e.code);
    if (
      e.code === "ControlLeft" ||
      e.code === "ControlRight" ||
      e.code === "Space" ||
      e.code === "Tab" ||
      e.code === "KeyQ" ||
      e.code === "KeyE"
    ) {
      e.preventDefault();
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    keys.delete(e.code);
  }

  function onMouseMove(e: MouseEvent) {
    if (document.pointerLockElement == null) return;
    const s = MOUSE_SENS * sensMult;
    look.yaw -= e.movementX * s;
    look.pitch -= e.movementY * s;
    look.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, look.pitch));
  }

  function onMouseDown(e: MouseEvent) {
    if (e.button === 0) mouseLeft = true;
    if (e.button === 2) {
      mouseRight = true;
      e.preventDefault();
    }
  }

  function onMouseUp(e: MouseEvent) {
    if (e.button === 0) mouseLeft = false;
    if (e.button === 2) mouseRight = false;
  }

  function onContextMenu(e: Event) {
    e.preventDefault();
  }

  function bind() {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("contextmenu", onContextMenu);
  }

  function unbind() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("contextmenu", onContextMenu);
  }

  function getButtons(): CombatButtons {
    const locked = document.pointerLockElement != null;
    return {
      forward: keys.has("KeyW"),
      back: keys.has("KeyS"),
      left: keys.has("KeyA"),
      right: keys.has("KeyD"),
      jump: keys.has("Space"),
      crouch: keys.has("ControlLeft") || keys.has("ControlRight"),
      fire: mouseLeft && locked,
      reload: keys.has("KeyR"),
      ads: mouseRight && locked,
      ability1: false,
      ability2: false,
    };
  }

  /** Ability keys — caller enables only in Ability Arena. */
  function getCombatButtons(allowAbilities: boolean): CombatButtons {
    const b = getButtons();
    if (allowAbilities) {
      b.ability1 = keys.has("Digit1") || keys.has("Numpad1");
      b.ability2 = keys.has("Digit2") || keys.has("Numpad2");
    }
    return b;
  }

  /** Update smoothed lean from Q/E. Returns current lean. */
  function updateLean(dt: number): number {
    let target = 0;
    if (keys.has("KeyQ")) target -= 1;
    if (keys.has("KeyE")) target += 1;
    const rate = 10;
    lean += (target - lean) * Math.min(1, dt * rate);
    if (Math.abs(lean) < 0.001) lean = 0;
    return lean;
  }

  function getLean(): number {
    return lean;
  }

  function setAdsSensMult(m: number): void {
    sensMult = m;
  }

  function isScoreboardOpen(): boolean {
    return keys.has("Tab");
  }

  function isClassMenuHeld(): boolean {
    return keys.has("KeyC");
  }

  function keyDown(code: string): boolean {
    return keys.has(code);
  }

  function applyRecoil(pitchRad: number, yawRad: number): void {
    look.pitch += pitchRad;
    look.yaw += yawRad;
    look.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, look.pitch));
  }

  return {
    look,
    getButtons,
    getCombatButtons,
    updateLean,
    getLean,
    setAdsSensMult,
    isScoreboardOpen,
    isClassMenuHeld,
    keyDown,
    applyRecoil,
    bind,
    unbind,
  };
}
