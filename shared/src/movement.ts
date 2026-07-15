import {
  MOVE,
  PLAYER_HEIGHT_CROUCH,
  PLAYER_HEIGHT_STAND,
  PLAYER_RADIUS,
} from "./constants.js";
import { resolveCollisions, type AABB } from "./collision.js";
import {
  length2d,
  normalize,
  forwardFlat,
  rightFlat,
  type Vec3,
  vec3,
} from "./math.js";

export type MoveButtons = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  crouch: boolean;
  sprint: boolean;
};

export type PlayerMoveState = {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  grounded: boolean;
  crouching: boolean;
  /** Previous-frame jump button for edge-trigger. */
  jumpHeld: boolean;
  /** Remaining mid-air jumps (refilled on landing). */
  airJumpsLeft: number;
};

const _wish = vec3();
const _fwd = vec3();
const _right = vec3();
const _accelDir = vec3();

function wishDirection(yaw: number, buttons: MoveButtons, out: Vec3): Vec3 {
  forwardFlat(yaw, _fwd);
  rightFlat(yaw, _right);
  out.x = 0;
  out.y = 0;
  out.z = 0;
  if (buttons.forward) {
    out.x += _fwd.x;
    out.z += _fwd.z;
  }
  if (buttons.back) {
    out.x -= _fwd.x;
    out.z -= _fwd.z;
  }
  if (buttons.right) {
    out.x += _right.x;
    out.z += _right.z;
  }
  if (buttons.left) {
    out.x -= _right.x;
    out.z -= _right.z;
  }
  return normalize(out, out);
}

/** Source-style accelerate: add speed toward wishdir without exceeding wishspeed. */
function accelerate(
  velocity: Vec3,
  wishdir: Vec3,
  wishspeed: number,
  accel: number,
  dt: number,
): void {
  const currentspeed = velocity.x * wishdir.x + velocity.z * wishdir.z;
  const addspeed = wishspeed - currentspeed;
  if (addspeed <= 0) return;
  let accelspeed = accel * dt * wishspeed;
  if (accelspeed > addspeed) accelspeed = addspeed;
  velocity.x += accelspeed * wishdir.x;
  velocity.z += accelspeed * wishdir.z;
}

function applyFriction(velocity: Vec3, grounded: boolean, dt: number): void {
  if (!grounded) return;
  const speed = length2d(velocity);
  if (speed < 0.01) {
    velocity.x = 0;
    velocity.z = 0;
    return;
  }
  const control = speed < MOVE.STOP_SPEED ? MOVE.STOP_SPEED : speed;
  const drop = control * MOVE.FRICTION * dt;
  const newspeed = Math.max(speed - drop, 0) / speed;
  velocity.x *= newspeed;
  velocity.z *= newspeed;
}

export function playerHeight(crouching: boolean): number {
  return crouching ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT_STAND;
}

/**
 * One simulation step of Source-like movement + AABB collision.
 * Used by client prediction and authoritative server.
 */
export function applyMovement(
  state: PlayerMoveState,
  buttons: MoveButtons,
  dt: number,
  solids: readonly AABB[],
  speedScale = 1,
): void {
  state.crouching = buttons.crouch;
  const height = playerHeight(state.crouching);
  const sprinting =
    buttons.sprint &&
    !state.crouching &&
    (buttons.forward || buttons.back || buttons.left || buttons.right);
  const maxSpeed =
    (state.crouching
      ? MOVE.MAX_SPEED * MOVE.CROUCH_SPEED_MULT
      : MOVE.MAX_SPEED *
        (sprinting ? MOVE.SPRINT_SPEED_MULT : 1)) * speedScale;

  applyFriction(state.velocity, state.grounded, dt);

  wishDirection(state.yaw, buttons, _wish);
  const wishspeed = maxSpeed;

  if (state.grounded) {
    state.airJumpsLeft = MOVE.AIR_JUMPS;
    const accel =
      MOVE.ACCELERATE * (sprinting ? MOVE.SPRINT_ACCEL_MULT : 1);
    accelerate(state.velocity, _wish, wishspeed, accel, dt);
    const jumpEdge = buttons.jump && !state.jumpHeld;
    if (jumpEdge) {
      state.velocity.y = MOVE.JUMP_VELOCITY;
      state.grounded = false;
    } else if (state.velocity.y < 0) {
      state.velocity.y = 0;
    }
  } else {
    // Air: cap wish speed contribution (Source air accel feel)
    const airWish = Math.min(wishspeed, MOVE.AIR_SPEED_CAP);
    _accelDir.x = _wish.x;
    _accelDir.y = 0;
    _accelDir.z = _wish.z;
    accelerate(state.velocity, _accelDir, airWish, MOVE.AIR_ACCELERATE, dt);
    const jumpEdge = buttons.jump && !state.jumpHeld;
    if (jumpEdge && state.airJumpsLeft > 0) {
      state.airJumpsLeft -= 1;
      state.velocity.y = MOVE.JUMP_VELOCITY;
    }
    state.velocity.y -= MOVE.GRAVITY * dt;
  }

  // Clamp ridiculous speeds
  const spd = Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z);
  if (spd > MOVE.MAX_VELOCITY) {
    const s = MOVE.MAX_VELOCITY / spd;
    state.velocity.x *= s;
    state.velocity.y *= s;
    state.velocity.z *= s;
  }

  state.position.x += state.velocity.x * dt;
  state.position.y += state.velocity.y * dt;
  state.position.z += state.velocity.z * dt;

  const vyBefore = state.velocity.y;
  const yBefore = state.position.y;
  const { grounded } = resolveCollisions(
    state.position,
    height,
    PLAYER_RADIUS,
    solids,
  );

  if (grounded && state.velocity.y < 0) {
    state.velocity.y = 0;
  }
  // Ceiling: collision pushed us down while moving up
  if (vyBefore > 0 && state.position.y < yBefore) {
    state.velocity.y = 0;
  }

  state.grounded = grounded;
  if (grounded) state.airJumpsLeft = MOVE.AIR_JUMPS;
  state.jumpHeld = buttons.jump;
}

export function createMoveState(
  x: number,
  y: number,
  z: number,
  yaw = 0,
): PlayerMoveState {
  return {
    position: vec3(x, y, z),
    velocity: vec3(),
    yaw,
    pitch: 0,
    grounded: false,
    crouching: false,
    jumpHeld: false,
    airJumpsLeft: MOVE.AIR_JUMPS,
  };
}

export function copyMoveState(out: PlayerMoveState, src: PlayerMoveState): void {
  out.position.x = src.position.x;
  out.position.y = src.position.y;
  out.position.z = src.position.z;
  out.velocity.x = src.velocity.x;
  out.velocity.y = src.velocity.y;
  out.velocity.z = src.velocity.z;
  out.yaw = src.yaw;
  out.pitch = src.pitch;
  out.grounded = src.grounded;
  out.crouching = src.crouching;
  out.jumpHeld = src.jumpHeld;
  out.airJumpsLeft = src.airJumpsLeft;
}

export function cloneMoveState(src: PlayerMoveState): PlayerMoveState {
  const out = createMoveState(0, 0, 0);
  copyMoveState(out, src);
  return out;
}
