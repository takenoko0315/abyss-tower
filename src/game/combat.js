// Pure combat calculations. Keep React state, logs, audio, and timers out of this module.

export const critOverflowBonus = (critChance) => Math.max(0, critChance - 100);

export function frenzyDamageMultiplier(currentHp, maxHp, enabled = false) {
  if (!enabled || maxHp <= 0) return 1;
  const missingHpPercent = Math.max(0, (1 - currentHp / maxHp) * 100);
  return 1 + Math.min(50, missingHpPercent * 0.8) / 100;
}

export function potionHealingMultiplier({ potionHalf = 0, potionCut20 = 0 } = {}) {
  if (potionHalf > 0) return 0.5;
  if (potionCut20 > 0) return 0.8;
  return 1;
}

export function doubleTierChances(doubleChance) {
  const chance = Math.max(0, doubleChance);
  const guaranteed = Math.floor(chance / 100);
  const remainder = chance % 100;
  return [
    ...Array.from({ length: guaranteed }, () => 100),
    ...(remainder > 0 ? [remainder] : []),
  ];
}

export function rollAdditionalHits(doubleChance, random = Math.random) {
  let hits = 0;
  for (const chance of doubleTierChances(doubleChance)) {
    if (random() * 100 < chance) hits += 1;
    else break;
  }
  return hits;
}

export function calculateAttackDamage({
  attack,
  killMomentum = 0,
  variance = 0,
  multiplier = 1,
  isCritical = false,
  critDamage = 100,
  critChance = 0,
  targetTough = false,
  targetGuarding = false,
  crystallineMultiplier = 1,
  targetFragile = false,
}) {
  const effectiveCritDamage = critDamage + critOverflowBonus(critChance);
  let damage = Math.round(
    (attack + killMomentum + variance)
      * multiplier
      * (isCritical ? effectiveCritDamage / 100 : 1)
      * (targetTough ? 0.75 : 1)
      * (targetGuarding ? 0.5 : 1),
  );
  damage = Math.round(damage * crystallineMultiplier);
  if (targetFragile) damage = Math.round(damage * 1.5);
  return damage;
}

export function calculateBaseIncomingDamage(rawDamage, defense, variance = 0) {
  return Math.max(1, Math.round(rawDamage - defense + variance));
}

export function mergeStatus(status, type, turns, damage = 0) {
  const next = { ...(status || {}) };
  const current = next[type];
  if (type === "poison" || type === "bleed") {
    next[type] = {
      turns: Math.max(current?.turns || 0, turns),
      dmg: (current?.dmg || 0) + damage,
    };
  } else if (type === "weaken") {
    next.weaken = {
      turns: Math.max(current?.turns || 0, turns),
      dmg: Math.max(current?.dmg || 0, damage),
    };
  } else {
    next[type] = {
      turns: Math.max(current?.turns || 0, turns),
      dmg: damage,
    };
  }
  return next;
}

export function decrementStatusTurn(status, type) {
  if (!status?.[type]) return status || {};
  return {
    ...status,
    [type]: {
      ...status[type],
      turns: Math.max(0, status[type].turns - 1),
    },
  };
}

export function resolvePlayerOngoingEffects({
  player,
  maxHp,
  drainPerTurn = 0,
}) {
  let nextPlayer = {
    ...player,
    ...(player.pPoison ? { pPoison: { ...player.pPoison } } : {}),
  };
  const events = [];

  if (drainPerTurn > 0 && nextPlayer.hp > 0) {
    const damage = Math.max(1, Math.round(maxHp * drainPerTurn / 100));
    nextPlayer = { ...nextPlayer, hp: nextPlayer.hp - damage };
    events.push({ type: "damage", target: "player", source: "bloodBowl", value: damage });
    if (nextPlayer.hp <= 0) {
      return { nextPlayer, events, shouldStop: true, stopReason: "playerDead" };
    }
  }

  if (nextPlayer.pPoison?.turns > 0) {
    const damage = nextPlayer.pPoison.dmg;
    nextPlayer = {
      ...nextPlayer,
      hp: nextPlayer.hp - damage,
      pPoison: { ...nextPlayer.pPoison, turns: nextPlayer.pPoison.turns - 1 },
    };
    events.push({ type: "damage", target: "player", source: "poison", value: damage });
    if (nextPlayer.hp <= 0) {
      return { nextPlayer, events, shouldStop: true, stopReason: "playerDead" };
    }
  }

  return { nextPlayer, events, shouldStop: false, stopReason: null };
}

export function resolveEnemyOngoingEffects({ enemy, burnRate = 0 }) {
  let nextEnemy = { ...enemy };
  if (enemy.status) {
    nextEnemy.status = Object.fromEntries(
      Object.entries(enemy.status).map(([key, value]) => [key, { ...value }]),
    );
  }
  const events = [];

  if (nextEnemy.trait === "regen" && nextEnemy.hp > 0 && nextEnemy.hp < nextEnemy.maxHp) {
    const heal = Math.max(1, Math.round(nextEnemy.maxHp * 0.06));
    nextEnemy = { ...nextEnemy, hp: Math.min(nextEnemy.maxHp, nextEnemy.hp + heal) };
    events.push({ type: "heal", target: "enemy", source: "regen", value: heal });
  }

  for (const status of ["poison", "bleed", "burn"]) {
    if (!(nextEnemy.status?.[status]?.turns > 0)) continue;
    const damage = status === "burn"
      ? Math.max(1, Math.round(nextEnemy.maxHp * burnRate))
      : nextEnemy.status[status].dmg;
    nextEnemy = {
      ...nextEnemy,
      hp: nextEnemy.hp - damage,
      status: decrementStatusTurn(nextEnemy.status, status),
    };
    events.push({ type: "damage", target: "enemy", source: status, value: damage });
  }

  if (nextEnemy.hp <= 0) {
    return {
      nextEnemy,
      events,
      shouldStop: true,
      stopReason: "enemyDead",
      incapacitated: false,
    };
  }

  const incapacitatingStatuses = [];
  for (const status of ["freeze", "stun"]) {
    if (!(nextEnemy.status?.[status]?.turns > 0)) continue;
    nextEnemy = { ...nextEnemy, status: decrementStatusTurn(nextEnemy.status, status) };
    incapacitatingStatuses.push(status);
    events.push({
      type: "statusTurn",
      target: "enemy",
      source: status,
      remainingTurns: nextEnemy.status[status].turns,
    });
  }
  if (nextEnemy.status?.weaken?.turns > 0) {
    nextEnemy = { ...nextEnemy, status: decrementStatusTurn(nextEnemy.status, "weaken") };
    events.push({
      type: "statusTurn",
      target: "enemy",
      source: "weaken",
      remainingTurns: nextEnemy.status.weaken.turns,
    });
  }

  const incapacitated = incapacitatingStatuses.length > 0;
  if (incapacitated) {
    events.push({
      type: "incapacitated",
      target: "enemy",
      sources: incapacitatingStatuses,
    });
  }
  return {
    nextEnemy,
    events,
    shouldStop: incapacitated,
    stopReason: incapacitated ? "incapacitated" : null,
    incapacitated,
  };
}
