import {
  RECONCILE_SNAP,
  RECONCILE_THRESHOLD,
  TICK_DT,
  applyMovement,
  bitsToButtons,
  buttonsToBits,
  cloneMoveState,
  copyMoveState,
  type AABB,
  type CombatButtons,
  type InputCmd,
  type PlayerMoveState,
  type SnapshotPlayer,
} from "@fps/shared";

export type PendingCmd = InputCmd & { buttonsParsed: CombatButtons };

/**
 * Local player prediction + soft server reconciliation.
 */
export function createPrediction(
  solids: readonly AABB[],
  getSpeedScale: () => number = () => 1,
) {
  let seq = 0;
  const pending: PendingCmd[] = [];
  const predicted = cloneMoveState({
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    grounded: false,
    crouching: false,
    jumpHeld: false,
  });

  function resetFromSnapshot(snap: SnapshotPlayer): void {
    predicted.position.x = snap.position.x;
    predicted.position.y = snap.position.y;
    predicted.position.z = snap.position.z;
    predicted.velocity.x = snap.velocity.x;
    predicted.velocity.y = snap.velocity.y;
    predicted.velocity.z = snap.velocity.z;
    predicted.yaw = snap.yaw;
    predicted.pitch = snap.pitch;
    predicted.crouching = snap.crouching;
    predicted.grounded = snap.grounded;
    predicted.jumpHeld = snap.jumpHeld;
    pending.length = 0;
  }

  function predictTick(
    buttons: CombatButtons,
    yaw: number,
    pitch: number,
    lean = 0,
  ): InputCmd {
    seq += 1;
    const cmd: PendingCmd = {
      type: "input",
      seq,
      buttons: buttonsToBits(buttons),
      yaw,
      pitch,
      lean,
      buttonsParsed: { ...buttons },
    };
    pending.push(cmd);

    predicted.yaw = yaw;
    predicted.pitch = pitch;
    applyMovement(predicted, buttons, TICK_DT, solids, getSpeedScale());

    while (pending.length > 48) pending.shift();
    return cmd;
  }

  function reconcile(ackSeq: number, server: SnapshotPlayer): void {
    while (pending.length > 0 && pending[0]!.seq <= ackSeq) {
      pending.shift();
    }

    const scratch = cloneMoveState({
      position: { ...server.position },
      velocity: { ...server.velocity },
      yaw: server.yaw,
      pitch: server.pitch,
      crouching: server.crouching,
      grounded: server.grounded,
      jumpHeld: server.jumpHeld,
    });

    const scale = getSpeedScale();
    for (const cmd of pending) {
      scratch.yaw = cmd.yaw;
      scratch.pitch = cmd.pitch;
      applyMovement(scratch, bitsToButtons(cmd.buttons), TICK_DT, solids, scale);
    }

    const err = Math.hypot(
      scratch.position.x - predicted.position.x,
      scratch.position.y - predicted.position.y,
      scratch.position.z - predicted.position.z,
    );

    if (err < RECONCILE_THRESHOLD) {
      predicted.grounded = scratch.grounded;
      return;
    }

    if (err < RECONCILE_SNAP) {
      const t = 0.35;
      predicted.position.x += (scratch.position.x - predicted.position.x) * t;
      predicted.position.y += (scratch.position.y - predicted.position.y) * t;
      predicted.position.z += (scratch.position.z - predicted.position.z) * t;
      predicted.velocity.x = scratch.velocity.x;
      predicted.velocity.y = scratch.velocity.y;
      predicted.velocity.z = scratch.velocity.z;
      predicted.grounded = scratch.grounded;
      predicted.crouching = scratch.crouching;
      predicted.jumpHeld = scratch.jumpHeld;
      return;
    }

    copyMoveState(predicted, scratch);
  }

  function getState(): PlayerMoveState {
    return predicted;
  }

  function setView(yaw: number, pitch: number): void {
    predicted.yaw = yaw;
    predicted.pitch = pitch;
  }

  return {
    resetFromSnapshot,
    predictTick,
    reconcile,
    getState,
    setView,
    copyPredicted(out: PlayerMoveState) {
      copyMoveState(out, predicted);
    },
  };
}
