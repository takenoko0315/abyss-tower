import { describe, expect, it } from "vitest";
import {
  clampTier,
  damagePopupAnimation,
  damagePopupVisual,
  getDamagePopupTier,
  getPlayerDamagePopupTier,
  scaleHitsForPopup,
} from "./damagePresentation.js";

describe("getDamagePopupTier (敵への与ダメ)", () => {
  it("maxHp比10%未満はnormal", () => {
    expect(getDamagePopupTier({ damage: 5, targetMaxHp: 100 })).toBe("normal");
  });

  it("maxHp比10%以上でstrong", () => {
    expect(getDamagePopupTier({ damage: 10, targetMaxHp: 100 })).toBe("strong");
  });

  it("maxHp比25%以上でcritical", () => {
    expect(getDamagePopupTier({ damage: 25, targetMaxHp: 100 })).toBe("critical");
  });

  it("maxHp比50%以上でcatastrophic", () => {
    expect(getDamagePopupTier({ damage: 50, targetMaxHp: 100 })).toBe("catastrophic");
  });

  it("会心は小ダメージでも最低critical", () => {
    expect(getDamagePopupTier({ damage: 1, targetMaxHp: 100, isCritical: true })).toBe("critical");
  });

  it("大ダメージなら会心でなくてもcatastrophic", () => {
    expect(getDamagePopupTier({ damage: 60, targetMaxHp: 100, isCritical: false })).toBe("catastrophic");
  });

  it("maxHp以上の単発ダメージ(オーバーキル)はcatastrophic確定", () => {
    expect(getDamagePopupTier({ damage: 999, targetMaxHp: 100 })).toBe("catastrophic");
  });

  it("実ダメージ値そのものは判定関数の中で変更されない(呼び出し側の値をそのまま使う想定)", () => {
    const damage = 999;
    getDamagePopupTier({ damage, targetMaxHp: 100 });
    expect(damage).toBe(999);
  });

  it("targetMaxHpが0の時はゼロ除算せずnormalへフォールバック", () => {
    expect(getDamagePopupTier({ damage: 50, targetMaxHp: 0 })).toBe("normal");
  });
});

describe("getPlayerDamagePopupTier (被ダメージ・敵与ダメとは基準%が異なる)", () => {
  it("軽傷はnormal", () => {
    expect(getPlayerDamagePopupTier({ damage: 5, targetMaxHp: 100 })).toBe("normal");
  });

  it("maxHp比20%以上でstrong", () => {
    expect(getPlayerDamagePopupTier({ damage: 20, targetMaxHp: 100 })).toBe("strong");
  });

  it("maxHp比40%以上でcritical", () => {
    expect(getPlayerDamagePopupTier({ damage: 40, targetMaxHp: 100 })).toBe("critical");
  });

  it("致死級は必ずcatastrophic", () => {
    expect(getPlayerDamagePopupTier({ damage: 5, targetMaxHp: 100, isLethal: true })).toBe("catastrophic");
  });
});

describe("clampTier", () => {
  it("回復ポップ等をstrongまでに頭打ちできる", () => {
    expect(clampTier("catastrophic", "strong")).toBe("strong");
    expect(clampTier("normal", "strong")).toBe("normal");
  });
});

describe("scaleHitsForPopup (連撃時の間引き)", () => {
  it("上限以下ならそのまま全件返す", () => {
    const hits = [{ dmg: 5 }, { dmg: 5 }];
    expect(scaleHitsForPopup(hits, { targetMaxHp: 100, maxVisible: 6 })).toHaveLength(2);
  });

  it("10連撃でも安全な上限を超えない", () => {
    const hits = Array.from({ length: 10 }, () => ({ dmg: 10 }));
    const result = scaleHitsForPopup(hits, { targetMaxHp: 1000, maxVisible: 6 });
    expect(result.length).toBeLessThanOrEqual(6);
  });

  it("間引いた場合は最後に合計ダメージのエントリを1件追加する", () => {
    const hits = Array.from({ length: 10 }, () => ({ dmg: 10 }));
    const result = scaleHitsForPopup(hits, { targetMaxHp: 1000, maxVisible: 6 });
    const total = result[result.length - 1];
    expect(total.isTotal).toBe(true);
    expect(total.dmg).toBe(100);
  });
});

describe("damagePopupVisual", () => {
  it("階級が上がるほど文字サイズと太さが強くなる", () => {
    const order = ["normal", "strong", "critical", "catastrophic"];
    const visuals = order.map(damagePopupVisual);
    for (let i = 1; i < visuals.length; i++) {
      expect(visuals[i].fontSize).toBeGreaterThan(visuals[i - 1].fontSize);
      expect(visuals[i].fontWeight).toBeGreaterThanOrEqual(visuals[i - 1].fontWeight);
    }
  });
});

describe("damagePopupAnimation", () => {
  it("reduced指定時は移動を伴わないフェード演出になる", () => {
    expect(damagePopupAnimation("catastrophic", { reduced: true })).toContain("abyss-popup-fade");
  });

  it("reducedでなければ階級に応じた演出になる", () => {
    expect(damagePopupAnimation("catastrophic", { reduced: false })).toContain("abyss-popup-pop-big");
    expect(damagePopupAnimation("critical", { reduced: false })).toContain("abyss-popup-pop");
    expect(damagePopupAnimation("normal", { reduced: false })).toContain("abyss-float-up");
  });
});
