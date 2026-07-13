import { describe, expect, it } from "vitest";
import {
  consumeRiposte,
  clearRiposte,
  grantRiposte,
  newlyAppliedOrExtendedCc,
  resolveHeavyCounterplay,
} from "./heavyCounterplay.js";

const enemy = (patch = {}) => ({ name: "鉄の処刑人", counterplay: "heavy-v1", intent: "heavy", hp: 100, maxHp: 100, status: {}, ...patch });

describe("heavy counterplay", () => {
  it("20%未満では中断せず、20%ちょうどで中断する", () => {
    expect(resolveHeavyCounterplay({ enemyBefore: enemy(), enemyAfter: enemy(), directDamage: 19.999 }).interrupted).toBe(false);
    expect(resolveHeavyCounterplay({ enemyBefore: enemy(), enemyAfter: enemy(), directDamage: 20 })).toMatchObject({ interrupted: true, method: "damage" });
  });

  it("同じ行動で撃破した場合は中断を重複成立させない", () => {
    expect(resolveHeavyCounterplay({ enemyBefore: enemy(), enemyAfter: enemy({ hp: 0 }), directDamage: 100 })).toMatchObject({ interrupted: false, defeated: true });
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
    expect(resolveHeavyCounterplay({ enemyBefore: enemy({ name: "古竜", counterplay: undefined }), enemyAfter: enemy({ name: "古竜", counterplay: undefined }), directDamage: 100 }).interrupted).toBe(false);
    expect(resolveHeavyCounterplay({ enemyBefore: enemy({ intent: "attack" }), enemyAfter: enemy({ intent: "attack" }), directDamage: 100 }).interrupted).toBe(false);
  });

  it("表示名ではなく設定キーで対象を判定する", () => {
    expect(resolveHeavyCounterplay({ enemyBefore: enemy({ counterplay: undefined }), enemyAfter: enemy({ counterplay: undefined }), directDamage: 100 }).interrupted).toBe(false);
    expect(resolveHeavyCounterplay({ enemyBefore: enemy({ name: "再生成された処刑人" }), enemyAfter: enemy({ name: "再生成された処刑人" }), directDamage: 20 })).toMatchObject({ interrupted: true, method: "damage" });
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

  it("戦闘終了時に反撃態勢を非破壊で消去する", () => {
    const original = { hp: 10, heavyRiposte: true };
    expect(clearRiposte(original)).toEqual({ hp: 10, heavyRiposte: false });
    expect(original.heavyRiposte).toBe(true);
  });
});
