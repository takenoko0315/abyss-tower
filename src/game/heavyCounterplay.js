export const HEAVY_COUNTERPLAY = Object.freeze({
  enemyName: "鉄の処刑人",
  damageThreshold: 0.2,
  riposteBonus: 0.3,
});

export function isHeavyCounterplay(enemy) {
  return enemy?.name === HEAVY_COUNTERPLAY.enemyName && enemy?.intent === "heavy";
}

const safeDamage = (value) => Number.isFinite(value) ? Math.max(0, value) : 0;
const ccTurns = (status, type) => {
  const turns = status?.[type]?.turns;
  return Number.isFinite(turns) ? Math.max(0, turns) : 0;
};

export function newlyAppliedOrExtendedCc(beforeStatus, afterStatus) {
  for (const type of ["stun", "freeze"]) {
    if (ccTurns(afterStatus, type) > ccTurns(beforeStatus, type)) return type;
  }
  return null;
}

export function resolveHeavyCounterplay({ enemyBefore, enemyAfter, directDamage = 0 }) {
  if (!isHeavyCounterplay(enemyBefore)) return { interrupted: false, method: null };
  const ccType = newlyAppliedOrExtendedCc(enemyBefore?.status, enemyAfter?.status);
  if (ccType) return { interrupted: true, method: "cc", ccType };
  const maxHp = Number.isFinite(enemyBefore?.maxHp) ? enemyBefore.maxHp : 0;
  const thresholdDamage = maxHp > 0 ? maxHp * HEAVY_COUNTERPLAY.damageThreshold : Infinity;
  if (safeDamage(directDamage) >= thresholdDamage) {
    return { interrupted: true, method: "damage", thresholdDamage };
  }
  return { interrupted: false, method: null, thresholdDamage };
}

export function consumeRiposte(player) {
  if (!player?.heavyRiposte) return { nextPlayer: { ...player }, multiplier: 1, consumed: false };
  return {
    nextPlayer: { ...player, heavyRiposte: false },
    multiplier: 1 + HEAVY_COUNTERPLAY.riposteBonus,
    consumed: true,
  };
}

export function grantRiposte(player) {
  return { ...player, heavyRiposte: true };
}
