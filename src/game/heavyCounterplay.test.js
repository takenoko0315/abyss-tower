import { describe, expect, it } from "vitest";
import {
  consumeRiposte,
  grantRiposte,
  newlyAppliedOrExtendedCc,
  resolveHeavyCounterplay,
} from "./heavyCounterplay.js";

const enemy = (patch = {}) => ({ name: "鉄の処刑人", intent: "heavy", hp: 100, maxHp: 100, status: {}, ...patch });

describe("heavy counterplay", () => {
  it("20%未満では中断せず、20%ちょうどで中断する", () => {
    expect(resolveHeavyCounterplay({ enemyBefore: enemy(), enemyAfter: enemy(), directDamage: 19.999 }).interrupted).toBe(false);
    expect(resolveHeavyCounterplay({ enemyBefore: enemy(), enemyAfter: enemy(), directDamage: 20 })).toMatchObject({ interrupted: true, method: "damage" });
  });

  it("連撃の合計直接ダメージを判定でき、DoTを渡さなければDoTだけでは中断しない", () => {
    expect(resolveHeavyCounterplay({ enemyBefore: enemy(), enemyAfter: enemy({ hp: 70 }), directDamage: 10 + 10 })).toMatchObject({ interrupted: true, method: "damage" });
    expect(resolveHeavyCounterplay({ enemyBefore: enemy(), enemyAfter: enemy({ hp: 70 }), directDamage: 0 }).interrupted).toBe(false);
  });

  it("Infinity、NaN、負ダメージを中断として扱わない", () => {
    for (const directDamage of [Infinity, NaN, -20]) {
      expect(resolveHeavyCounterplay({ enemyBefore: enemy(), enemyAfter: enemy(), directDamage }).interrupted).toBe(false);
    }
  });

  it("新規または延長された気絶・凍結だけを検出する", () => {
    expect(newlyAppliedOrExtendedCc({}, { stun: { turns: 1 } })).toBe("stun");
    expect(newlyAppliedOrExtendedCc({ freeze: { turns: 1 } }, { freeze: { turns: 2 } })).toBe("freeze");
    expect(newlyAppliedOrExtendedCc({ stun: { turns: 1 } }, { stun: { turns: 1 } })).toBeNull();
    expect(newlyAppliedOrExtendedCc({ freeze: { turns: 2 } }, { freeze: { turns: 1 } })).toBeNull();
  });

  it("他の敵とheavy以外には適用しない", () => {
    expect(resolveHeavyCounterplay({ enemyBefore: enemy({ name: "古竜" }), enemyAfter: enemy({ name: "古竜" }), directDamage: 100 }).interrupted).toBe(false);
    expect(resolveHeavyCounterplay({ enemyBefore: enemy({ intent: "attack" }), enemyAfter: enemy({ intent: "attack" }), directDamage: 100 }).interrupted).toBe(false);
  });

  it("反撃態勢は重複せず、次の直接攻撃で1回だけ消費する", () => {
    const original = { hp: 10, heavyRiposte: false };
    const granted = grantRiposte(grantRiposte(original));
    const first = consumeRiposte(granted);
    const second = consumeRiposte(first.nextPlayer);
    expect(first).toMatchObject({ multiplier: 1.3, consumed: true });
    expect(second).toMatchObject({ multiplier: 1, consumed: false });
    expect(original).toEqual({ hp: 10, heavyRiposte: false });
  });
});
