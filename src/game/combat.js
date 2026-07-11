// Pure combat calculations. Keep React state, logs, audio, and timers out of this module.

export const critOverflowBonus = (critChance) => Math.max(0, critChance - 100);

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
