import {
  PREDICT_PENDING_MAX,
  RECONCILE_BLEND,
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
 * Higher RTT → gentler corrections so distant players don't rubber-band.
 */
export function createPrediction(
  solids: readonly AABB[],
  getSpeedScale: () => number = () => 1,
) {
  let seq = 0;
  const pending: PendingCmd[] = [];
  /** Smoothed one-way latency seconds (RTT/2), for blend softening. */
  let oneWaySec = 0.05;
  const predicted = cloneMoveState({
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    grounded: false,
    crouching: false,
    jumpHeld: false,
    airJumpsLeft: 1,
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
    predicted.airJumpsLeft = snap.airJumpsLeft ?? (snap.grounded ? 1 : 0);
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

    while (pending.length > PREDICT_PENDING_MAX) pending.shift();
    return cmd;
  }

  function setOneWayLatency(sec: number): void {
    oneWaySec = Math.max(0.02, Math.min(0.4, sec));
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
      airJumpsLeft: server.airJumpsLeft ?? (server.grounded ? 1 : 0),
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

    // Soften blend as latency grows — hard snatching feels like rubber-banding.
    const latencySoft = 1 / (1 + oneWaySec * 6);
    const blend = RECONCILE_BLEND * latencySoft;

    if (err < RECONCILE_SNAP) {
      predicted.position.x += (scratch.position.x - predicted.position.x) * blend;
      predicted.position.y += (scratch.position.y - predicted.position.y) * blend;
      predicted.position.z += (scratch.position.z - predicted.position.z) * blend;
      predicted.velocity.x += (scratch.velocity.x - predicted.velocity.x) * blend;
      predicted.velocity.y += (scratch.velocity.y - predicted.velocity.y) * blend;
      predicted.velocity.z += (scratch.velocity.z - predicted.velocity.z) * blend;
      predicted.grounded = scratch.grounded;
      predicted.crouching = scratch.crouching;
      predicted.jumpHeld = scratch.jumpHeld;
      predicted.airJumpsLeft = scratch.airJumpsLeft;
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
    setOneWayLatency,
    getState,
    setView,
    copyPredicted(out: PlayerMoveState) {
      copyMoveState(out, predicted);
    },
  };
}
