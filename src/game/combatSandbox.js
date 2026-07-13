export const SANDBOX_MULTIPLIERS = [0.5, 1, 1.5, 2];

export const SANDBOX_PRESETS = [
  { key: "none", name: "無装備" },
  { key: "standard10", name: "10F標準" },
  { key: "highDamage", name: "高火力型" },
  { key: "defenseRiposte", name: "防御・反撃型" },
  { key: "cc", name: "CC型" },
  { key: "status", name: "状態異常型" },
  { key: "sustain", name: "回復・耐久型" },
];

const EMPTY_EQUIP = { weapon: null, armor: null, helmet: null, boots: null, ring: null, amulet: null };
const item = (slot, name, stats, ability = null, abilityStats = null) => ({
  slot, rarity: 2, name, stats, curse: null,
  ...(ability ? { ability, abilityStats } : {}),
});

const COMMON = {
  standard10: [
    item("weapon", "十階踏破の剣", { atk: 24, crit: 5 }),
    item("armor", "十階踏破の鎧", { def: 14, hp: 45 }),
    item("helmet", "十階踏破の兜", { def: 8, hp: 30 }),
    item("boots", "十階踏破の靴", { double: 12, hp: 18 }),
    item("ring", "十階踏破の指輪", { crit: 8, critDmg: 22 }),
    item("amulet", "十階踏破の護符", { hp: 35, lifesteal: 5 }),
  ],
  highDamage: [
    item("weapon", "猛攻の大剣", { atk: 38, crit: 8 }),
    item("armor", "攻勢の鎧", { def: 9, hp: 32, atk: 6 }),
    item("helmet", "会心の兜", { def: 5, hp: 18, crit: 8 }),
    item("boots", "連撃の靴", { double: 22, hp: 12 }),
    item("ring", "必殺の指輪", { crit: 12, critDmg: 42 }),
    item("amulet", "闘争の護符", { hp: 25, atk: 8, bossSlayer: 18 }),
  ],
  defenseRiposte: [
    item("weapon", "守勢の剣", { atk: 20, afterDefendDmg: 18 }),
    item("armor", "城塞の鎧", { def: 25, hp: 60 }, "immovable", { betterDefend: 1 }),
    item("helmet", "鉄壁の兜", { def: 15, hp: 40 }),
    item("boots", "踏み止まる靴", { def: 8, hp: 28 }),
    item("ring", "反撃の指輪", { crit: 7, afterDefendDmg: 15 }),
    item("amulet", "守護の護符", { hp: 48, lifesteal: 4 }),
  ],
  cc: [
    item("weapon", "氷晶の杖", { atk: 28, crit: 7 }),
    item("armor", "氷守の法衣", { def: 13, hp: 48 }),
    item("helmet", "集中の冠", { def: 7, hp: 28, crit: 6 }),
    item("boots", "時渡りの靴", { double: 13, hp: 22 }),
    item("ring", "術式の指輪", { critDmg: 30, dmgVsStatus: 15 }),
    item("amulet", "星読みの護符", { hp: 38, lifesteal: 4 }, "stargazer", { cdAll: 1 }),
  ],
  status: [
    item("weapon", "蛇牙の長剣", { atk: 25, poisonPower: 30 }, "scythe", { alwaysPoison: 1 }),
    item("armor", "疫病除けの鎧", { def: 13, hp: 45, poisonPower: 15 }),
    item("helmet", "深傷の兜", { def: 7, hp: 28, bleedPower: 25 }),
    item("boots", "追毒の靴", { double: 15, hp: 20 }),
    item("ring", "苦痛の指輪", { crit: 8, dmgVsStatus: 22 }),
    item("amulet", "蝕む護符", { hp: 38, lifesteal: 5, burnPower: 25 }),
  ],
  sustain: [
    item("weapon", "生命の剣", { atk: 22, lifesteal: 6 }),
    item("armor", "不屈の鎧", { def: 20, hp: 70 }),
    item("helmet", "再生の兜", { def: 11, hp: 45 }),
    item("boots", "長命の靴", { double: 10, hp: 35 }),
    item("ring", "癒しの指輪", { hp: 35, perHitHeal: 3 }),
    item("amulet", "渇望の護符", { hp: 55, lifesteal: 10 }),
  ],
};

const CLASS_SKILLS = {
  warrior: { standard10: ["strike", "ironguard"], highDamage: ["strike", "flurry"], defenseRiposte: ["strike", "ironguard", "deflect"] },
  mage: { cc: ["frostnova", "thunder", "barrierchant"] },
  assassin: { status: ["truestrike", "poisonblade", "laceration"] },
  vampire: { status: ["bloodblade", "poisonblade", "flamestrike"], sustain: ["bloodblade", "healchant"] },
};

export function normalizeSandboxMultiplier(value) {
  const numeric = Number(value);
  return SANDBOX_MULTIPLIERS.includes(numeric) ? numeric : 1;
}

export function normalizeSandboxCount(value, fallback = 0, max = 99) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(max, Math.trunc(numeric))) : fallback;
}

export function createSandboxEquipment(presetKey) {
  const entries = COMMON[presetKey];
  if (!entries) return { ...EMPTY_EQUIP };
  return Object.fromEntries(entries.map(entry => [entry.slot, { ...entry, stats: { ...entry.stats }, ...(entry.abilityStats ? { abilityStats: { ...entry.abilityStats } } : {}) }]));
}

export function sandboxSkillsFor(cls, presetKey, classSkill) {
  return [...new Set(CLASS_SKILLS[cls]?.[presetKey] || [classSkill])];
}

export function applySandboxFinalMultipliers(player, stats, multipliers) {
  const next = { ...player };
  const atk = normalizeSandboxMultiplier(multipliers.atk);
  const hp = normalizeSandboxMultiplier(multipliers.hp);
  const def = normalizeSandboxMultiplier(multipliers.def);
  next.atk += Math.round(stats.atk * atk) - stats.atk;
  next.maxHp += Math.round(stats.maxHp * hp) - stats.maxHp;
  next.def += Math.round(stats.def * def) - stats.def;
  return next;
}
