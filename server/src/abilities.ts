import {
  TICK_RATE,
  abilityOf,
  emptyStatus,
  eyePosition,
  forwardFromAngles,
  resolveCollisions,
  PLAYER_HEIGHT_STAND,
  PLAYER_RADIUS,
  type AbilityFxEvent,
  type AbilityKind,
  type ClassId,
  type CombatButtons,
  type PlayerMoveState,
  type PlayerStatus,
  type Team,
  type Vec3,
  type WorldProp,
} from "@fps/shared";

const _fwd: Vec3 = { x: 0, y: 0, z: 0 };

export type AbilityPlayer = {
  id: string;
  team: Team;
  classId: ClassId;
  state: PlayerMoveState;
  hp: number;
  alive: boolean;
  status: PlayerStatus;
  ab1ReadyTick: number;
  ab2ReadyTick: number;
  ability1Held: boolean;
  ability2Held: boolean;
  lastClassChangeTick: number;
};

function ticksFromMs(ms: number): number {
  return Math.max(1, Math.round((ms / 1000) * TICK_RATE));
}

function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function inRadius(a: PlayerMoveState, prop: WorldProp): boolean {
  return (
    dist2(a.position.x, a.position.z, prop.position.x, prop.position.z) <=
    prop.radius * prop.radius
  );
}

let nextPropId = 1;

export function createAbilityRuntime(getSolids: () => readonly import("@fps/shared").AABB[]) {
  const props: WorldProp[] = [];
  const fxQueue: AbilityFxEvent[] = [];

  function flushFx(): AbilityFxEvent[] {
    const out = fxQueue.splice(0, fxQueue.length);
    return out;
  }

  function listProps(): WorldProp[] {
    return props;
  }

  function addProp(prop: Omit<WorldProp, "id">): WorldProp {
    const full: WorldProp = { ...prop, id: String(nextPropId++) };
    props.push(full);
    return full;
  }

  function tryUseAbility(
    tick: number,
    p: AbilityPlayer,
    slot: 1 | 2,
    buttons: CombatButtons,
    others: AbilityPlayer[],
    dealDamage: (
      attacker: AbilityPlayer,
      victim: AbilityPlayer,
      amount: number,
      headshot: boolean,
    ) => void,
  ): void {
    if (!p.alive) return;
    const held = slot === 1 ? p.ability1Held : p.ability2Held;
    const pressed = slot === 1 ? buttons.ability1 : buttons.ability2;
    if (slot === 1) p.ability1Held = pressed;
    else p.ability2Held = pressed;
    if (!pressed || held) return;

    const ready = slot === 1 ? p.ab1ReadyTick : p.ab2ReadyTick;
    if (tick < ready) return;

    const def = abilityOf(p.classId, slot);
    const kind = def.id;
    const cdTicks = ticksFromMs(def.cooldownMs);
    if (slot === 1) p.ab1ReadyTick = tick + cdTicks;
    else p.ab2ReadyTick = tick + cdTicks;

    castAbility(tick, p, kind, def.durationMs, others, dealDamage);
  }

  function castAbility(
    tick: number,
    p: AbilityPlayer,
    kind: AbilityKind,
    durationMs: number,
    others: AbilityPlayer[],
    dealDamage: (
      attacker: AbilityPlayer,
      victim: AbilityPlayer,
      amount: number,
      headshot: boolean,
    ) => void,
  ): void {
    const pos = p.state.position;
    const durTicks = ticksFromMs(durationMs);

    switch (kind) {
      case "ice_path": {
        p.status.icePathUntil = tick + durTicks;
        fxQueue.push({
          kind: "ice_path",
          ownerId: p.id,
          origin: { x: pos.x, y: pos.y, z: pos.z },
        });
        break;
      }
      case "frost_trap": {
        const prop = addProp({
          kind: "frost_trap",
          position: { x: pos.x, y: pos.y, z: pos.z },
          radius: 2.2,
          expiresTick: tick + durTicks,
          ownerId: p.id,
          team: p.team,
        });
        fxQueue.push({
          kind: "frost_trap",
          ownerId: p.id,
          origin: { ...prop.position },
        });
        break;
      }
      case "scorch_dash": {
        forwardFromAngles(p.state.yaw, 0, _fwd);
        const from = { x: pos.x, y: pos.y + 1, z: pos.z };
        // Dash ~9m forward with collision slides
        const steps = 12;
        for (let i = 0; i < steps; i++) {
          pos.x += _fwd.x * (9 / steps);
          pos.z += _fwd.z * (9 / steps);
          resolveCollisions(
            pos,
            PLAYER_HEIGHT_STAND,
            PLAYER_RADIUS,
            getSolids(),
          );
        }
        p.state.velocity.x = _fwd.x * 14;
        p.state.velocity.z = _fwd.z * 14;
        // Burn enemies along path
        for (const o of others) {
          if (!o.alive || o.team === p.team || o.id === p.id) continue;
          const d =
            dist2(from.x, from.z, o.state.position.x, o.state.position.z);
          if (d < 4.5 * 4.5) {
            dealDamage(p, o, 28, false);
            o.status.burningUntil = Math.max(
              o.status.burningUntil,
              tick + ticksFromMs(2000),
            );
          }
        }
        addProp({
          kind: "ember_nest",
          position: { x: from.x, y: 0, z: from.z },
          radius: 2.4,
          expiresTick: tick + ticksFromMs(1800),
          ownerId: p.id,
          team: p.team,
        });
        fxQueue.push({
          kind: "scorch_dash",
          ownerId: p.id,
          origin: from,
          end: { x: pos.x, y: pos.y + 1, z: pos.z },
        });
        break;
      }
      case "ember_nest": {
        const prop = addProp({
          kind: "ember_nest",
          position: { x: pos.x, y: pos.y, z: pos.z },
          radius: 3.2,
          expiresTick: tick + durTicks,
          ownerId: p.id,
          team: p.team,
        });
        fxQueue.push({
          kind: "ember_nest",
          ownerId: p.id,
          origin: { ...prop.position },
        });
        break;
      }
      case "phase_step": {
        forwardFromAngles(p.state.yaw, p.state.pitch, _fwd);
        const from = { x: pos.x, y: pos.y + 1, z: pos.z };
        const dist = 11;
        pos.x += _fwd.x * dist;
        pos.y += _fwd.y * dist * 0.35;
        pos.z += _fwd.z * dist;
        if (pos.y < 0) pos.y = 0;
        resolveCollisions(
          pos,
          PLAYER_HEIGHT_STAND,
          PLAYER_RADIUS,
          getSolids(),
        );
        p.state.velocity.x *= 0.2;
        p.state.velocity.z *= 0.2;
        fxQueue.push({
          kind: "phase_step",
          ownerId: p.id,
          origin: from,
          end: { x: pos.x, y: pos.y + 1, z: pos.z },
        });
        break;
      }
      case "veil": {
        p.status.veiledUntil = tick + durTicks;
        fxQueue.push({
          kind: "veil",
          ownerId: p.id,
          origin: { x: pos.x, y: pos.y + 1, z: pos.z },
        });
        break;
      }
      case "arc_surge": {
        const origin = eyePosition(
          pos,
          p.state.crouching,
          p.state.yaw,
          0,
        );
        forwardFromAngles(p.state.yaw, p.state.pitch, _fwd);
        const hits: string[] = [];
        const candidates = others
          .filter((o) => o.alive && o.team !== p.team)
          .map((o) => {
            const dx = o.state.position.x - origin.x;
            const dy = o.state.position.y + 1 - origin.y;
            const dz = o.state.position.z - origin.z;
            const len = Math.hypot(dx, dy, dz) || 1;
            const dot = (dx * _fwd.x + dy * _fwd.y + dz * _fwd.z) / len;
            return { o, len, dot };
          })
          .filter((c) => c.len < 18 && c.dot > 0.55)
          .sort((a, b) => a.len - b.len)
          .slice(0, 3);

        let end = {
          x: origin.x + _fwd.x * 14,
          y: origin.y + _fwd.y * 14,
          z: origin.z + _fwd.z * 14,
        };
        for (const c of candidates) {
          dealDamage(p, c.o, 34, false);
          hits.push(c.o.id);
          c.o.status.burningUntil = Math.max(
            c.o.status.burningUntil,
            tick + ticksFromMs(900),
          );
          end = {
            x: c.o.state.position.x,
            y: c.o.state.position.y + 1,
            z: c.o.state.position.z,
          };
        }
        fxQueue.push({
          kind: "arc_surge",
          ownerId: p.id,
          origin,
          end,
          targetIds: hits,
        });
        break;
      }
      case "storm_anchor": {
        const prop = addProp({
          kind: "storm_anchor",
          position: { x: pos.x, y: pos.y, z: pos.z },
          radius: 2.8,
          expiresTick: tick + durTicks,
          ownerId: p.id,
          team: p.team,
        });
        fxQueue.push({
          kind: "storm_anchor",
          ownerId: p.id,
          origin: { ...prop.position },
        });
        break;
      }
    }
  }

  function tickWorld(
    tick: number,
    players: AbilityPlayer[],
    dealDamage: (
      attackerId: string,
      victim: AbilityPlayer,
      amount: number,
    ) => void,
  ): void {
    // Expire props
    for (let i = props.length - 1; i >= 0; i--) {
      if (props[i]!.expiresTick <= tick) props.splice(i, 1);
    }

    // Ice path trail while active
    for (const p of players) {
      if (!p.alive) continue;
      if (tick < p.status.icePathUntil && p.state.grounded) {
        // Coalesce nearby ice
        const near = props.find(
          (pr) =>
            pr.kind === "ice_patch" &&
            pr.ownerId === p.id &&
            dist2(
              pr.position.x,
              pr.position.z,
              p.state.position.x,
              p.state.position.z,
            ) <
              1.6 * 1.6,
        );
        if (!near) {
          addProp({
            kind: "ice_patch",
            position: {
              x: p.state.position.x,
              y: p.state.position.y,
              z: p.state.position.z,
            },
            radius: 1.8,
            expiresTick: tick + ticksFromMs(3500),
            ownerId: p.id,
            team: p.team,
          });
        }
      }
    }

    for (const p of players) {
      if (!p.alive) {
        p.status.moveMult = 1;
        continue;
      }

      let moveMult = 1;
      let frozen = tick < p.status.frozenUntil;

      // Floor props
      for (const prop of [...props]) {
        if (!inRadius(p.state, prop)) continue;

        if (prop.kind === "ice_patch") {
          if (prop.team === p.team || prop.ownerId === p.id) {
            moveMult = Math.max(moveMult, 1.35);
          } else {
            moveMult = Math.min(moveMult, 0.55);
          }
        }

        if (prop.kind === "frost_trap" && prop.team !== p.team) {
          const idx = props.indexOf(prop);
          if (idx >= 0) props.splice(idx, 1);
          p.status.frozenUntil = tick + ticksFromMs(2200);
          frozen = true;
          dealDamage(prop.ownerId, p, 22);
          fxQueue.push({
            kind: "frost_trigger",
            ownerId: prop.ownerId,
            origin: { ...prop.position },
            targetIds: [p.id],
          });
        }

        if (prop.kind === "ember_nest" && prop.team !== p.team) {
          if (tick % Math.round(TICK_RATE * 0.35) === 0) {
            dealDamage(prop.ownerId, p, 8);
            p.status.burningUntil = Math.max(
              p.status.burningUntil,
              tick + ticksFromMs(600),
            );
          }
        }

        if (prop.kind === "storm_anchor") {
          if (prop.team === p.team || prop.ownerId === p.id) {
            if (p.state.grounded && p.state.velocity.y <= 0.1) {
              p.state.velocity.y = 11;
              p.state.grounded = false;
              fxQueue.push({
                kind: "storm_launch",
                ownerId: p.id,
                origin: { ...prop.position },
              });
            }
          } else if (tick % Math.round(TICK_RATE * 0.5) === 0) {
            dealDamage(prop.ownerId, p, 10);
          }
        }
      }

      // Burning DoT
      if (tick < p.status.burningUntil && tick % Math.round(TICK_RATE * 0.4) === 0) {
        dealDamage("burn", p, 6);
      }

      if (frozen) {
        moveMult = 0;
        p.state.velocity.x = 0;
        p.state.velocity.z = 0;
      }

      p.status.moveMult = moveMult;
    }
  }

  function breakVeilOnFire(p: AbilityPlayer, tick: number): void {
    if (tick < p.status.veiledUntil) {
      p.status.veiledUntil = 0;
    }
  }

  function resetStatus(p: AbilityPlayer): void {
    p.status = emptyStatus();
    p.ab1ReadyTick = 0;
    p.ab2ReadyTick = 0;
    p.ability1Held = false;
    p.ability2Held = false;
  }

  return {
    tryUseAbility,
    tickWorld,
    flushFx,
    listProps,
    breakVeilOnFire,
    resetStatus,
    ticksFromMs,
  };
}

export function cdRemainingMs(
  readyTick: number,
  tick: number,
): number {
  if (tick >= readyTick) return 0;
  return ((readyTick - tick) / TICK_RATE) * 1000;
}
