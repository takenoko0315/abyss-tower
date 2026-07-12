// データ定義の整合性テスト。
// 新しい敵・祝福・ゾーン等を追加した際の「参照切れ」(存在しないギミック名・スキル名を指すミス)を機械的に検出する。
import { describe, it, expect } from "vitest";
import {
  RARITIES, DIFFICULTIES, BLESSINGS, KEYSTONE_EXCLUDE, ORIGINS, MODIFIERS, getMod,
  ASCENSIONS, ASCENSION_MAP, computeAscensionFx,
  ZONES, ABILITIES, ABILITY_MAP, ABILITY_CHANCE, SKILL_MODS, CLASS_VARIANTS,
  META_UPGRADES, AFFIX_POOL, SLOTS, SLOT_KEYS,
  CURSES, ELITE_TRAITS, ELITE_TRAIT_KEYS, GIMMICKS, ENEMIES, BOSS_POOLS, FINAL_BOSSES, ALL_BOSSES,
  PERKS, SKILLS, CLASSES, TREES, RELICS, RELIC_MAP, STAT_LABELS, STATUS,
} from "./data.js";

const keysOf = (arr) => arr.map(x => x.key);
const expectUniqueKeys = (arr, label) => {
  const keys = keysOf(arr);
  expect(new Set(keys).size, `${label} のkeyが重複している`).toBe(keys.length);
};

describe("キーの一意性", () => {
  it("各テーブルのkeyが重複していない", () => {
    expectUniqueKeys(BLESSINGS, "BLESSINGS");
    expectUniqueKeys(ORIGINS, "ORIGINS");
    expectUniqueKeys(MODIFIERS, "MODIFIERS");
    expectUniqueKeys(ASCENSIONS, "ASCENSIONS");
    expectUniqueKeys(RELICS, "RELICS");
    expectUniqueKeys(ABILITIES, "ABILITIES");
    expectUniqueKeys(PERKS, "PERKS");
    expectUniqueKeys(META_UPGRADES, "META_UPGRADES");
    expectUniqueKeys(AFFIX_POOL, "AFFIX_POOL");
  });
  it("ZONESは各エントリのkeyがオブジェクトのキーと一致する", () => {
    for (const [k, z] of Object.entries(ZONES)) expect(z.key, `ZONES.${k}`).toBe(k);
  });
  it("敵の名前が重複していない(図鑑のキーになるため)", () => {
    const names = ENEMIES.map(e => e.name);
    expect(new Set(names).size).toBe(names.length);
    const bossNames = ALL_BOSSES.map(b => b.name);
    expect(new Set(bossNames).size).toBe(bossNames.length);
  });
});

describe("TASK-014 contracts", () => {
  const applyContract = (key, overrides = {}) => {
    const player = { maxHp: 100, hp: 80, relics: [], hooks: {}, ...overrides };
    return BLESSINGS.find(blessing => blessing.key === key).apply(player);
  };

  it("configures frenzy with its flat and missing-HP damage bonuses", () => {
    const contract = BLESSINGS.find(blessing => blessing.key === "ks_frenzy");
    const player = contract.apply({ maxHp: 100, hp: 80, relics: [], hooks: {} });
    expect(player.hooks).toMatchObject({ flatDmg: 10, wrathHp: 1 });
    expect(contract.desc).toContain("常時与ダメ+10%");
    expect(contract.desc).toContain("失ったHP1%につき与ダメ+0.8%");
    expect(contract.desc).toContain("最大+50%");
  });

  it("reduces collector max HP by 12% and requests one starting relic without raising the cap", () => {
    const player = applyContract("ks_collector");
    expect(player).toMatchObject({ maxHp: 88, hp: 68 });
    expect(player.hooks).toEqual({ startRandomRelic: 1 });
    expect(player.hooks.relicCap).toBeUndefined();
  });

  it("configures catalyst with a 20% potion penalty and preserves its attack boost", () => {
    const player = applyContract("ks_catalyst");
    expect(player.hooks).toEqual({ potionCut20: 1, catalystContract: 1 });
  });
});

describe("参照の整合性", () => {
  it("全ての敵のgimmickがGIMMICKSに存在する", () => {
    for (const e of ENEMIES) expect(GIMMICKS[e.gimmick], `${e.name} のギミック ${e.gimmick}`).toBeDefined();
    for (const pool of BOSS_POOLS) for (const b of pool) {
      if (b.gimmick) expect(GIMMICKS[b.gimmick], `ボス ${b.name} のギミック ${b.gimmick}`).toBeDefined();
    }
    for (const b of FINAL_BOSSES) {
      if (b.gimmick) expect(GIMMICKS[b.gimmick], `最終ボス ${b.name} のギミック ${b.gimmick}`).toBeDefined();
      expect(Array.isArray(b.pattern) && b.pattern.length > 0, `最終ボス ${b.name} の行動パターン`).toBe(true);
    }
  });
  it("祝福のlearnSkill・lockedが実在する", () => {
    for (const b of BLESSINGS) {
      if (b.learnSkill) expect(SKILLS[b.learnSkill], `${b.name} のスキル ${b.learnSkill}`).toBeDefined();
      if (b.locked) expect(META_UPGRADES.some(u => u.key === b.locked), `${b.name} の解放条件 ${b.locked}`).toBe(true);
    }
  });
  it("出自の固有装備が正しい(スロット・固有能力・呪いが実在する)", () => {
    for (const o of ORIGINS) {
      const item = o.make();
      expect(SLOT_KEYS.includes(item.slot), `${o.name} のスロット ${item.slot}`).toBe(true);
      expect(SLOT_KEYS.includes(o.slot), `${o.name} の装備先 ${o.slot}`).toBe(true);
      if (item.ability) expect(ABILITY_MAP[item.ability], `${o.name} の固有能力 ${item.ability}`).toBeDefined();
      if (item.curse) expect(CURSES.some(c => c.key === item.curse), `${o.name} の呪い ${item.curse}`).toBe(true);
      for (const biasKey of o.bias) {
        expect(AFFIX_POOL.some(a => a.key === biasKey), `${o.name} のバイアス ${biasKey}`).toBe(true);
      }
    }
  });
  it("ゾーンのaffixBiasがAFFIX_POOLに存在する", () => {
    for (const z of Object.values(ZONES)) {
      for (const biasKey of z.affixBias || []) {
        expect(AFFIX_POOL.some(a => a.key === biasKey), `${z.name} のバイアス ${biasKey}`).toBe(true);
      }
    }
  });
  it("クラスの初期スキル・型・ツリーが揃っている", () => {
    for (const [k, c] of Object.entries(CLASSES)) {
      expect(SKILLS[c.skill], `${c.name} の初期スキル ${c.skill}`).toBeDefined();
      expect(CLASS_VARIANTS[k], `${c.name} の型`).toBeDefined();
      expect(CLASS_VARIANTS[k].length, `${c.name} の型の数`).toBeGreaterThanOrEqual(2);
      expect(TREES[k], `${c.name} のスキルツリー`).toBeDefined();
    }
  });
  it("メタアンロックのスキル解放キーがSKILLSと対応している", () => {
    for (const u of META_UPGRADES) {
      if (u.key.startsWith("skill_")) {
        const sk = u.key.slice("skill_".length);
        expect(SKILLS[sk], `${u.name} のスキル ${sk}`).toBeDefined();
        expect(SKILLS[sk].locked, `${sk} はlocked指定されているべき`).toBe(true);
      }
    }
  });
  it("エリート特性のキー一覧が定義と一致する", () => {
    expect(ELITE_TRAIT_KEYS.sort()).toEqual(Object.keys(ELITE_TRAITS).sort());
  });
  it("契約の除外テーブルが実在するクラス・契約を指している", () => {
    const ksKeys = new Set(BLESSINGS.filter(b => b.keystone).map(b => b.key));
    for (const [cls, banned] of Object.entries(KEYSTONE_EXCLUDE)) {
      expect(CLASSES[cls], `除外テーブルのクラス ${cls}`).toBeDefined();
      for (const k of banned) expect(ksKeys.has(k), `${cls} の除外契約 ${k}`).toBe(true);
      // 除外してもまだ契約候補が残ること(3択の枠が空にならない)
      expect(BLESSINGS.filter(b => b.keystone && !banned.includes(b.key)).length).toBeGreaterThan(0);
    }
    for (const cls of Object.keys(CLASSES)) expect(KEYSTONE_EXCLUDE[cls], `クラス ${cls} の除外定義`).toBeDefined();
  });
  it("AFFIX_POOLの全キーに表示名(STAT_LABELS)がある", () => {
    for (const a of AFFIX_POOL) expect(STAT_LABELS[a.key], `アフィックス ${a.key} の表示名`).toBeDefined();
  });
  it("スキルのapplyStatus.typeがSTATUSに実在する", () => {
    for (const [k, s] of Object.entries(SKILLS)) {
      if (s.spec.applyStatus) expect(STATUS[s.spec.applyStatus.type], `${k} が付与する状態異常 ${s.spec.applyStatus.type}`).toBeDefined();
    }
  });
});

describe("数値の健全性", () => {
  it("レアリティの重みが正でABILITY_CHANCEと数が揃っている", () => {
    for (const r of RARITIES) expect(r.weight).toBeGreaterThan(0);
    expect(ABILITY_CHANCE.length).toBe(RARITIES.length);
  });
  it("難易度の倍率が1以上", () => {
    for (const d of Object.values(DIFFICULTIES)) {
      expect(d.hpMult).toBeGreaterThanOrEqual(1);
      expect(d.atkMult).toBeGreaterThanOrEqual(1);
      expect(d.reward).toBeGreaterThanOrEqual(1);
    }
  });
  it("getModは未知のキーで「平穏」を返す", () => {
    expect(getMod("そんなキーはない").key).toBe("none");
    expect(getMod("blood").key).toBe("blood");
  });
  it("computeAscensionFxが特性を正しく合算する", () => {
    const none = computeAscensionFx([]);
    expect(none.enemyHp).toBe(1);
    expect(none.count).toBe(0);
    const all = computeAscensionFx(ASCENSIONS.map(a => a.key));
    expect(all.count).toBe(ASCENSIONS.length);
    expect(all.enemyHp).toBeCloseTo(1.15);
    expect(all.enemyAtk).toBeCloseTo(1.15);
    expect(all.eliteCh).toBeCloseTo(0.25);
    expect(all.restMult).toBeCloseTo(0.5);
    expect(all.shopMult).toBeCloseTo(1.4);
    expect(all.dropPenalty).toBeCloseTo(0.2);
    // 未知のキーは無視される
    expect(computeAscensionFx(["存在しない"]).enemyHp).toBe(1);
  });
  it("SKILLSのCDが1以上・倍率が正(攻撃系)。防御/回復/障壁系は専用フィールドが正", () => {
    for (const [k, s] of Object.entries(SKILLS)) {
      expect(s.cd, `${k} のCD`).toBeGreaterThanOrEqual(1);
      if (s.spec.kind) {
        if (s.spec.counterMult !== undefined) expect(s.spec.counterMult, `${k} の反撃倍率`).toBeGreaterThan(0);
        if (s.spec.healPct !== undefined) expect(s.spec.healPct, `${k} の回復割合`).toBeGreaterThan(0);
        if (s.spec.shieldPct !== undefined) expect(s.spec.shieldPct, `${k} の障壁割合`).toBeGreaterThan(0);
      } else {
        expect(s.spec.mult, `${k} の倍率`).toBeGreaterThan(0);
        expect(s.spec.hits, `${k} のヒット数`).toBeGreaterThanOrEqual(1);
      }
    }
  });
  it("SLOTSとSLOT_KEYSが一致する", () => {
    expect(Object.keys(SLOTS).sort()).toEqual([...SLOT_KEYS].sort());
  });
  it("ASCENSION_MAPが全特性を引ける", () => {
    for (const a of ASCENSIONS) expect(ASCENSION_MAP[a.key]).toBe(a);
  });
  it("スキル改造モッドに名前とアイコンがある", () => {
    for (const [k, m] of Object.entries(SKILL_MODS)) {
      expect(m.name, `${k} の名前`).toBeTruthy();
      expect(m.icon, `${k} のアイコン`).toBeTruthy();
    }
  });
  it("レリックにstatかflagのどちらかがある", () => {
    for (const r of RELICS) {
      expect(r.stat || r.flag, `${r.name} は効果が未定義`).toBeTruthy();
      expect(RELIC_MAP[r.key]).toBe(r);
    }
  });
});
