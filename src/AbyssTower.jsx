import { useState, useCallback, useEffect } from "react";
import {
  RARITIES, DIFFICULTIES, BLESSINGS, KEYSTONE_EXCLUDE, ORIGINS, MODIFIERS, ASCENSIONS, ASCENSION_MAP, computeAscensionFx, getMod, ZONES, DREAM_BUFFS, SKILL_CAP, ABILITIES, ABILITY_MAP, ABILITY_CHANCE, SKILL_MODS, CLASS_VARIANTS, META_UPGRADES, AFFIX_POOL, SLOTS, SLOT_KEYS, PREFIXES, CURSES, CURSE_CHANCE, CURSE_BOOST, ELITE_TRAITS, ELITE_TRAIT_KEYS, GIMMICKS, ENEMIES, BOSS_POOLS, ALL_BOSSES, PERKS, SKILLS, STATUS, CLASSES, TREES, RELIC_CAP, RELICS, RELIC_MAP, FINAL_FLOOR, DIFF_RAMP_FLOORS, BOSS_PATTERNS, FINAL_PATTERN, INTENTS, STAT_LABELS, PCT_KEYS, LOG_COLORS,
} from "./game/data.js";
import { SFX, setSfxMuted } from "./game/sfx.js";
import { metaStorageLoad, metaStorageSave } from "./game/storage.js";
import { rand, pick, effStats, hasNode, hasRelic } from "./game/utils.js";

let ACTIVE_DIFF = DIFFICULTIES.normal;

let ACTIVE_MOD = MODIFIERS[MODIFIERS.length - 1];

let ACTIVE_ASCENSION_FX = {};

const ascFx = (key, def = 1) => ACTIVE_ASCENSION_FX[key] ?? def;

let ACTIVE_ZONE = ZONES.entrance;

let ACTIVE_ORIGIN_BIAS = []; // 出自によるドロップ傾向(スマートルート)

const getSkillCd = (key, mods) => {
  const mod = mods?.[key];
  return Math.max(1, SKILLS[key].cd + (mod === "hasteMod" ? -1 : mod === "ampMod" ? 1 : 0) + (ACTIVE_ZONE.skillCdPenalty || 0)); // 静寂の書庫:CD+1
};

// ラン毎の敵プール:全24種から11種だけが「今回の塔」に出現する(顔ぶれが毎回変わる)
let ACTIVE_BESTIARY = ENEMIES;

let PENDING_DEATHCURSE = false; // 死の呪い:次の敵への引き継ぎ

function applyStatus(e, type, turns, dmg = 0) {
  e.status = e.status || {};
  if (type === "freeze") SFX.freeze();
  if (ACTIVE_MOD.statusTurns) turns += ACTIVE_MOD.statusTurns; // 毒気の霧:持続+1
  if (e.trait === "resist") turns = Math.max(1, Math.ceil(turns / 2)); // 耐性持ちは効果時間半分
  const cur = e.status[type];
  if (type === "poison") {
    e.status.poison = { turns: Math.max(cur?.turns || 0, turns), dmg: (cur?.dmg || 0) + dmg }; // 毒はダメージ蓄積
  } else {
    e.status[type] = { turns: Math.max(cur?.turns || 0, turns), dmg };
  }
}

function rollRarity(minIdx = 0) {
  const pool = RARITIES.slice(minIdx);
  const total = pool.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of pool) { roll -= r.weight; if (roll <= 0) return RARITIES.indexOf(r); }
  return minIdx;
}

function genItem(floor, minRarity = 0, forceSlot = null, forceRarity = null, opts = {}) {
  const slot = forceSlot || pick(SLOT_KEYS);
  let rIdx = forceRarity !== null ? forceRarity : rollRarity(minRarity);
  // 難易度・世界・ゾーンによるレア度アップ抽選
  if (forceRarity === null) {
    for (let b = 0; b < (ACTIVE_DIFF.rarityBonus || 0) + (ACTIVE_MOD.rarityBonus || 0) + (ACTIVE_ZONE.rarityBonus || 0); b++) {
      if (Math.random() < 0.35) rIdx = Math.min(rIdx + 1, RARITIES.length - 1);
    }
  }
  const rarity = RARITIES[rIdx];
  const scale = 1 + floor * 0.45;
  const m = scale * rarity.mult;
  const stats = {};
  // スロットごとの主要ステータス
  if (slot === "weapon") stats.atk = Math.round((4 + rand(0, 3)) * m);
  else if (slot === "armor") { stats.def = Math.round((2 + rand(0, 2)) * m); stats.hp = Math.round(7 * m); }
  else if (slot === "helmet") { stats.def = Math.round((1 + rand(0, 1)) * m); stats.hp = Math.round(5 * m); }
  else if (slot === "boots") { stats.double = Math.round((4 + rand(0, 3)) * rarity.mult); stats.hp = Math.round(3 * m); }
  else if (slot === "ring") { const k = pick(["crit", "critDmg"]); stats[k] = Math.round((k === "critDmg" ? 14 : 5) * rarity.mult); }
  else if (slot === "amulet") { if (Math.random() < 0.5) stats.lifesteal = Math.round((3 + rand(0, 2)) * rarity.mult); else stats.hp = Math.round(9 * m); }
  // 追加アフィックス(スマートルート:ゾーン・出自の系統に45%で寄せる)
  const biasKeys = [...(ACTIVE_ZONE.affixBias || []), ...ACTIVE_ORIGIN_BIAS];
  const shuffled = [...AFFIX_POOL].sort(() => Math.random() - 0.5);
  for (let i = 0; i < rarity.affixes; i++) {
    let a = shuffled[i];
    if (biasKeys.length && Math.random() < 0.45) a = AFFIX_POOL.find(x => x.key === pick(biasKeys)) || a;
    const v = Math.round(a.base * (1 + floor * 0.1) * (0.8 + Math.random() * 0.6));
    stats[a.key] = (stats[a.key] || 0) + v;
  }
  // 呪い判定(レア以上・強制呪いなし指定でなければ)
  let curse = null;
  if (rIdx >= 1 && opts.allowCurse !== false && Math.random() < CURSE_CHANCE) {
    curse = pick(CURSES).key;
    for (const k of Object.keys(stats)) stats[k] = Math.round(stats[k] * CURSE_BOOST);
  }
  // 固有能力の抽選(レアリティが高いほど付きやすい。強化の影響を受けない別枠)
  let ability = null;
  if (opts.allowAbility !== false && Math.random() < (ABILITY_CHANCE[rIdx] || 0)) {
    ability = pick(ABILITIES);
  }
  const baseName = pick(SLOTS[slot].names);
  const prefix = curse ? "呪われた" : rIdx >= 1 ? pick(PREFIXES.slice(2)) : "";
  const item = { slot, rarity: rIdx, name: prefix + baseName, stats, curse };
  if (ability) { item.ability = ability.key; item.abilityStats = { ...ability.stats }; }
  if (opts.unidentified) item.identified = false;
  return item;
}

// 難易度倍率を序盤(1〜5階)は緩やかに立ち上げ、初手の理不尽な即死を防ぐ
// 難易度倍率を序盤は緩やかに立ち上げる。HPと攻撃力を別々に計算できる
function diffMultAt(floor, kind = "hp") {
  const full = kind === "atk" ? (ACTIVE_DIFF.atkMult ?? ACTIVE_DIFF.enemyMult) : (ACTIVE_DIFF.hpMult ?? ACTIVE_DIFF.enemyMult);
  const ramp = ACTIVE_DIFF.rampFloors || DIFF_RAMP_FLOORS;
  if (floor >= ramp) return full;
  const t = Math.max(floor, 1) / ramp;
  return 1.0 + (full - 1.0) * t;
}

// 敵の強さ倍率:序盤は緩やかに、深層に向けて加速する凸カーブ(20階で約18倍)
function enemyScale(floor) {
  const f = Math.min(floor, FINAL_FLOOR);
  let s = 1 + f * 0.35 + f * f * 0.025;
  if (floor > FINAL_FLOOR) s *= Math.pow(1.12, floor - FINAL_FLOOR); // 以降は指数関数的(緩め)
  return s;
}

function genEnemy(floor, elite = false, traitKey = null) {
  const isBoss = floor % 5 === 0;
  const isFinal = floor === FINAL_FLOOR;
  const endless = floor > FINAL_FLOOR;
  let base;
  if (isFinal) base = { name: "深淵の魔王", icon: "😈" };
  else if (endless && isBoss) base = pick([{ name: "虚無の使徒", icon: "🌑" }, { name: "終焉竜", icon: "🐲" }, { name: "深淵の王", icon: "👁️" }]);
  else if (isBoss) base = pick(BOSS_POOLS[Math.min(Math.floor(floor / 5) - 1, BOSS_POOLS.length - 1)]);
  else base = pick(ACTIVE_BESTIARY);
  const scale = enemyScale(floor);
  // 深層ほどボスの脅威度を上げる(伸び率を緩め、10階以降じわじわ上げる方式に)
  const deepBoss = isBoss ? 1 + Math.max(0, floor - 10) * 0.03 : 1;
  // 最初のボス(5F)は攻撃力を大きく緩和する(即死の主因になりやすいため)。HPはほぼ据え置きで殴り合いの手応えは残す
  const firstBossEaseHp = isBoss && floor <= 5 ? 0.8 : isBoss && floor <= 10 ? 0.9 : 1;
  const firstBossEaseAtk = isBoss && floor <= 5 ? 0.62 : isBoss && floor <= 10 ? 0.9 : 1;
  const diffMultHp = diffMultAt(floor, "hp");   // 序盤はランプ、難易度ごとのrampFloors以降は本来の倍率
  const diffMultAtk = diffMultAt(floor, "atk"); // HPと攻撃力を別々に緩和できる(地獄は攻撃力を抑えめに)
  const trait = elite ? (traitKey || pick(ELITE_TRAIT_KEYS)) : null;
  const traitDef = trait ? ELITE_TRAITS[trait] : null;
  const hpMult = (isFinal ? 3.0 : isBoss ? 2.15 : elite ? 1.6 * (traitDef?.hpMult ?? 1) : 1) * deepBoss * firstBossEaseHp * diffMultHp;
  const atkMult = (isFinal ? 1.55 : isBoss ? 1.42 : elite ? 1.3 * (traitDef?.atkMult ?? 1) : 1) * deepBoss * firstBossEaseAtk * diffMultAtk;
  const xpMult = isBoss ? 3 : elite ? 1.8 : 1;
  const rewardScale = endless ? Math.pow(1.2, floor - FINAL_FLOOR) : 1;
  const e = {
    ...base,
    name: elite ? `エリート・${base.name}` : base.name,
    codexId: base.name, // 図鑑用の不変キー(エリート化・分裂・不死化しても元の種族名を保つ)
    isBoss, isElite: elite, isFinal, trait,
    maxHp: Math.round((22 + rand(0, 10)) * scale * hpMult * (isBoss ? 1 : 1.3) * (ACTIVE_MOD.enemyHp || 1) * (ACTIVE_ZONE.enemyHp || 1) * ascFx("enemyHp") * (isBoss ? (ACTIVE_MOD.bossMult || 1) : (ACTIVE_MOD.nonBossMult || 1))), // 雑魚HP+30%(Ver.34:戦闘を長期戦寄りに)。逆巻く塔はボスと雑魚の強さが逆転
    hp: 0, // 後で設定
    atk: Math.round((5 + rand(0, 3)) * scale * atkMult * (ACTIVE_MOD.enemyAtk || 1) * (ACTIVE_ZONE.enemyAtk || 1) * ascFx("enemyAtk") * (isBoss ? (ACTIVE_MOD.bossMult || 1) : (ACTIVE_MOD.nonBossMult || 1))),
    xp: Math.round((14 + floor * 12) * xpMult * rewardScale), // 成長を速める(旧: 12+floor*10)
    goldScale: rewardScale,
    atkBuff: 1, // 咆哮による攻撃力上昇の累積
  };
  // 雑魚は種族ごとの固有ギミックを持つ(戦い方が変わる)。ボスもプール定義のギミックを持つ
  if (base.gimmick) {
    e.gimmick = base.gimmick;
    if (!isBoss && e.gimmick === "mimic") { e.atk = Math.round(e.atk * 1.25); e.maxHp = Math.round(e.maxHp * 1.1); e.goldScale = (e.goldScale || 1) * 2.5; }
    if (e.gimmick === "slow") { e.atk = Math.round(e.atk * 1.6); e.maxHp = Math.round(e.maxHp * 1.1); } // 重鈍:一撃が重い
    if (!isBoss && e.gimmick === "arcane") { e.pattern = ["attack", "attack", "heavy"]; e.patternIdx = 0; } // 魔導士は周期行動
  }
  // 死の呪い(シャーマン):前の敵が残した呪詛で攻撃+20%
  if (PENDING_DEATHCURSE) {
    e.atk = Math.round(e.atk * 1.2);
    e.cursedByShaman = true;
    PENDING_DEATHCURSE = false;
  }
  // ボスは固有の周期パターンで行動する(覚えれば完全に読める)
  if (isFinal) { e.pattern = FINAL_PATTERN; e.patternIdx = 0; }
  else if (isBoss) { e.pattern = base.pattern || BOSS_PATTERNS[(Math.floor(floor / 5) - 1 + BOSS_PATTERNS.length) % BOSS_PATTERNS.length]; e.patternIdx = 0; }
  e.intent = rollIntent(e);
  return e;
}

// 激昂(オーク)込みの実効攻撃倍率。予告ダメージ表示と実処理で共有する
function enemyAtkMult(e) {
  return (e.atkBuff || 1) * (e.gimmick === "rage" && e.hp <= e.maxHp / 2 ? 1.4 : 1);
}

function rollIntent(e) {
  // ボスは固有パターンを周期実行(咆哮が上限なら攻撃に差し替え)
  if (e.pattern) {
    let next = e.pattern[e.patternIdx % e.pattern.length];
    e.patternIdx = (e.patternIdx || 0) + 1;
    if (next === "roar" && (e.atkBuff || 1) >= 2.0) next = "attack";
    return next;
  }
  const r = Math.random();
  const canRoar = (e.atkBuff || 1) < 2.0; // 上限到達後は咆哮しない
  if (ACTIVE_ZONE.venomBias && r < 0.22) return "venom"; // 毒の沼:敵は毒撃を好む
  if (e.isElite) {
    if (r < 0.34) return "attack";
    if (r < 0.58) return "heavy";
    if (r < 0.72) return "flurry";
    if (r < 0.82) return "guard";
    if (r < 0.9) return canRoar ? "roar" : "attack";
    return "venom";
  }
  if (r < 0.45) return "attack";
  if (r < 0.63) return "heavy";
  if (r < 0.77) return "flurry";
  if (r < 0.86) return "guard";
  if (r < 0.93) return canRoar ? "roar" : "attack";
  return "venom";
}

function totalStats(player, equip) {
  const t = { atk: player.atk, def: player.def, maxHp: player.maxHp, crit: player.crit, critDmg: player.critDmg, lifesteal: player.lifesteal, double: player.double, thorns: player.baseThorns || 0 };
  // 祝福・型などプレイヤー由来のフック効果
  for (const [k, v] of Object.entries(player.hooks || {})) t[k] = (t[k] || 0) + v;
  // ゾーンのプレイヤー側ボーナス
  if (ACTIVE_ZONE.playerPoisonPower) t.poisonPower = (t.poisonPower || 0) + ACTIVE_ZONE.playerPoisonPower;
  if (ACTIVE_ZONE.playerLifesteal) t.lifesteal += ACTIVE_ZONE.playerLifesteal;
  if (ACTIVE_ZONE.playerDouble) t.double += ACTIVE_ZONE.playerDouble;
  if (ACTIVE_ZONE.playerThorns) t.thorns += ACTIVE_ZONE.playerThorns;
  if (ACTIVE_ZONE.playerDodge) t.dodge = (t.dodge || 0) + ACTIVE_ZONE.playerDodge; // 風走りの高台:回避

  if (ACTIVE_ZONE.randomBuff) for (const [k, v] of Object.entries(ACTIVE_ZONE.randomBuff)) t[k] = (t[k] || 0) + v; // 夢幻の回廊:気まぐれな祝福
  for (const slot of SLOT_KEYS) {
    const it = equip[slot];
    if (!it) continue;
    for (const [k, v] of Object.entries(effStats(it))) {
      if (k === "hp") t.maxHp += v; else t[k] = (t[k] || 0) + v;
    }
  }
  // レリックのステータス
  for (const rk of player.relics || []) {
    const r = RELIC_MAP[rk];
    if (!r?.stat) continue;
    for (const [k, v] of Object.entries(r.stat)) {
      if (k === "maxHp") t.maxHp += v; else t[k] = (t[k] || 0) + v;
    }
  }
  // 呪い装備のペナルティ(全ボーナス合算後に最終適用)
  for (const slot of SLOT_KEYS) {
    const it = equip[slot];
    if (!it?.curse) continue;
    const c = CURSES.find(c => c.key === it.curse);
    if (c) c.apply(t);
  }
  // 吸血鬼「眷属の絆」: 最大HP100につき吸血+1%(上限+10%)、最終maxHp確定後に計算
  if (player.cls === "vampire" && hasNode(player, "v9")) {
    t.lifesteal += Math.min(10, Math.floor(t.maxHp / 100));
  }
  // 回避は上限40%(装備・祝福・ゾーンを重ねても実質無敵にならないように)
  if (t.dodge) t.dodge = Math.min(40, t.dodge);
  return t;
}

// ===== コンポーネント =====
function Bar({ cur, max, color, height = 14 }) {
  return (
    <div style={{ background: "#1c1917", borderRadius: 4, height, overflow: "hidden", border: "1px solid #292524" }}>
      <div style={{ width: `${Math.max(0, (cur / max) * 100)}%`, height: "100%", background: color, transition: "width 0.3s" }} />
    </div>
  );
}

function ItemCard({ item, label }) {
  if (item.identified === false) {
    return (
      <div style={{ border: "1px dashed #7c3aed", boxShadow: "0 0 14px rgba(124,58,237,0.35)", borderRadius: 10, padding: 12, background: "#161210", flex: 1, minWidth: 0 }}>
        {label && <div style={{ fontSize: 11, color: "#78716c", marginBottom: 4 }}>{label}</div>}
        <div style={{ color: "#c4b5fd", fontWeight: 700, fontSize: 14 }}>？？？ の{SLOTS[item.slot]?.name || item.slot}</div>
        <div style={{ fontSize: 11, color: "#a8a29e", marginBottom: 6 }}>未鑑定・効果は装備するまでわからない</div>
      </div>
    );
  }
  const r = RARITIES[item.rarity];
  const slotName = SLOTS[item.slot]?.name || item.slot;
  const curse = item.curse ? CURSES.find(c => c.key === item.curse) : null;
  const ability = item.ability ? ABILITY_MAP[item.ability] : null;
  const pm = 1 + 0.1 * (item.plus || 0);
  return (
    <div style={{ border: `1px solid ${curse ? "#dc2626" : r.color}`, boxShadow: ability ? "0 0 18px rgba(249,115,22,0.45)" : curse ? "0 0 16px rgba(220,38,38,0.4)" : r.glow, borderRadius: 10, padding: 12, background: "#161210", flex: 1, minWidth: 0 }}>
      {label && <div style={{ fontSize: 11, color: "#78716c", marginBottom: 4 }}>{label}</div>}
      <div style={{ color: curse ? "#f87171" : r.color, fontWeight: 700, fontSize: 14 }}>{ability ? "✦ " : ""}{curse ? "💀 " : ""}{item.name}{item.plus ? ` +${item.plus}` : ""}</div>
      <div style={{ fontSize: 11, color: "#a8a29e", marginBottom: 6 }}>{r.name}・{slotName}</div>
      {ability && (
        <div style={{ fontSize: 12, color: "#f97316", marginBottom: 4, borderBottom: "1px solid #292524", paddingBottom: 4 }}>
          ✦ 固有:{ability.name} — {ability.desc}<span style={{ color: "#78716c" }}>(強化対象外)</span>
        </div>
      )}
      {Object.entries(item.stats).map(([k, v]) => {
        const ev = Math.round(v * pm);
        return (
          <div key={k} style={{ fontSize: 12, color: "#e7e5e4" }}>
            {STAT_LABELS[k]} <span style={{ color: ev >= 0 ? "#4ade80" : "#f87171" }}>{ev >= 0 ? "+" : ""}{ev}{PCT_KEYS.includes(k) ? "%" : ""}</span>
          </div>
        );
      })}
      {curse && (
        <div style={{ fontSize: 12, color: "#f87171", marginTop: 4, borderTop: "1px solid #44403c", paddingTop: 4 }}>
          呪い「{curse.name}」<span style={{ color: "#fca5a5" }}>{curse.desc}</span>
        </div>
      )}
    </div>
  );
}

export default function HackRoguelike() {
  const newPlayer = () => ({ level: 1, xp: 0, hp: 60, maxHp: 60, atk: 8, def: 2, crit: 10, critDmg: 150, lifesteal: 0, double: 0, potions: 3, gold: 0, skills: ["strike"], knownSkills: ["strike"], skillMods: {}, hooks: {}, variant: "a", cls: "warrior", fury: 0, combo: 0, resonance: 0, barrier: 0, killMomentum: 0, tree: [], sp: 0, ap: 1, baseThorns: 0, relics: [] }); // ap:1 — 初期覚醒Pで最初のボス前にクラスアビリティを1つ選べる
  const [scene, setScene] = useState("title");
  const [player, setPlayer] = useState(newPlayer());
  const [equip, setEquip] = useState({ weapon: null, armor: null, helmet: null, boots: null, ring: null, amulet: null });
  const [floor, setFloor] = useState(1);
  const [enemy, setEnemy] = useState(null);
  const [log, setLog] = useState([]);
  const [drop, setDrop] = useState(null);
  const [shopItem, setShopItem] = useState(null);
  const [perkChoices, setPerkChoices] = useState([]);
  const [pathOptions, setPathOptions] = useState([]);
  const [eliteTraitPreview, setEliteTraitPreview] = useState(null);
  const [kills, setKills] = useState(0);
  const [cds, setCds] = useState({});
  const [forgeSlot, setForgeSlot] = useState(null);
  const [relicGot, setRelicGot] = useState(null);
  const [relicChoices, setRelicChoices] = useState([]);
  const [skillChoices, setSkillChoices] = useState([]);
  const [pendingKill, setPendingKill] = useState(null);
  const [pendingClass, setPendingClass] = useState(null);
  const [pendingVariant, setPendingVariant] = useState("a");
  const [pendingDiff, setPendingDiff] = useState(null);
  const [forgeSkill, setForgeSkill] = useState(null);
  const [blessingChoices, setBlessingChoices] = useState([]);
  const [pendingBlessing, setPendingBlessing] = useState(null);
  const [originChoices, setOriginChoices] = useState([]);
  const [zoneKey, setZoneKey] = useState("entrance");
  const [zoneChoices, setZoneChoices] = useState([]);
  const [runModKey, setRunModKey] = useState("none");
  const [currentEvent, setCurrentEvent] = useState(null);
  const [showStatus, setShowStatus] = useState(false);
  const [best, setBest] = useState(0);
  const [pendingAscension, setPendingAscension] = useState([]);
  // メタ進行:魂と恒久アンロック(window.storageに永続保存)
  const [meta, setMeta] = useState({ souls: 0, buys: {}, best: 0, codex: { enemies: [], relics: [], abilities: [] } });
  const [soulsGained, setSoulsGained] = useState(0);
  const [victoryAwarded, setVictoryAwarded] = useState(false);
  const [muted, setMuted] = useState(false);
  useEffect(() => { metaStorageLoad().then(m => { if (m) { setMeta({ best: 0, codex: { enemies: [], relics: [], abilities: [] }, ...m }); setBest(b => Math.max(b, m.best || 0)); if (m.muted) setMuted(true); } }); }, []);
  useEffect(() => { setSfxMuted(muted); }, [muted]);
  // 図鑑(コレクション):敵・レリック・固有能力を発見済みとして永続記録する
  const recordCodex = useCallback((category, keys) => {
    const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
    if (!list.length) return;
    setMeta(m => {
      const known = new Set(m.codex?.[category] || []);
      const fresh = list.filter(k => !known.has(k));
      if (!fresh.length) return m;
      const nm = { ...m, codex: { ...m.codex, [category]: [...known, ...fresh] } };
      metaStorageSave(nm);
      return nm;
    });
  }, []);
  useEffect(() => { if (enemy?.codexId) recordCodex("enemies", enemy.codexId); }, [enemy?.codexId, recordCodex]);
  useEffect(() => { recordCodex("relics", player.relics || []); }, [player.relics, recordCodex]);
  useEffect(() => {
    const items = [...SLOT_KEYS.map(sk => equip[sk]), drop, shopItem].filter(Boolean);
    recordCodex("abilities", items.filter(it => it.ability).map(it => it.ability));
  }, [equip, drop, shopItem, recordCodex]);
  // 開発用チートAPI(devサーバー限定・本番ビルドには入らない)。詳細はCLAUDE.md参照
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.abyss = {
      gold: (n = 500) => setPlayer(p => ({ ...p, gold: p.gold + n })),
      souls: (n = 500) => setMeta(m => { const nm = { ...m, souls: m.souls + n }; metaStorageSave(nm); return nm; }),
      heal: () => setPlayer(p => ({ ...p, hp: totalStats(p, equip).maxHp })),
      weaken: () => setEnemy(e => e ? { ...e, hp: 1 } : e),
      jump: (f) => { setFloor(f); enterFloor(f); },
      best: (n = 20) => setMeta(m => { const nm = { ...m, best: n }; metaStorageSave(nm); return nm; }),
    };
  });
  const toggleMute = () => {
    setMuted(mu => {
      const next = !mu;
      setMeta(m => { const nm = { ...m, muted: next }; metaStorageSave(nm); return nm; });
      return next;
    });
  };

  const awardSouls = (floorReached, killCount, cleared) => {
    // 序盤死でも渋くならない計算式。クリア済みラン(エンドレス)での死亡は超過分のみ加算し二重取りを防ぐ
    let gained;
    if (victoryAwarded) gained = Math.max(0, (floorReached - FINAL_FLOOR) * 4);
    else gained = Math.round(floorReached * 4 + killCount * 2) + (cleared ? 100 : 0);
    const ascCount = (player.ascension || []).length;
    if (ascCount > 0) gained = Math.round(gained * (1 + ascCount * 0.15)); // 深淵の彼方:積んだ特性数だけ魂の報酬UP
    if (cleared) setVictoryAwarded(true);
    setSoulsGained(gained);
    setMeta(m => {
      const nm = { ...m, souls: m.souls + gained, best: Math.max(m.best || 0, floorReached) };
      metaStorageSave(nm);
      return nm;
    });
  };
  const buyMeta = (u) => {
    const owned = meta.buys[u.key] || 0;
    if (meta.souls < u.cost || owned >= u.max) return;
    setMeta(m => {
      const nm = { ...m, souls: m.souls - u.cost, buys: { ...m.buys, [u.key]: (m.buys[u.key] || 0) + 1 } };
      metaStorageSave(nm);
      return nm;
    });
  };
  const metaOwned = (key) => meta.buys[key] || 0;

  const addLog = useCallback((msg, c = "info") => setLog(l => [...l.slice(-7), { t: msg, c }]), []);

  const startRun = (clsKey = "warrior", diffKey = "normal", blessingKey = null, modKey = "none", variantKey = "a", originKey = null, ascensionKeys = []) => {
    ACTIVE_DIFF = DIFFICULTIES[diffKey];
    ACTIVE_MOD = getMod(modKey);
    ACTIVE_ASCENSION_FX = computeAscensionFx(ascensionKeys);
    ACTIVE_ZONE = ZONES.entrance;
    setZoneKey("entrance");
    ACTIVE_BESTIARY = [...ENEMIES].sort(() => Math.random() - 0.5).slice(0, 11); // 今回の塔に出る11種を抽選(全24種)
    PENDING_DEATHCURSE = false;
    const org = ORIGINS.find(o => o.key === originKey) || null;
    ACTIVE_ORIGIN_BIAS = org ? org.bias : [];
    const cls = CLASSES[clsKey];
    let p = cls.base(newPlayer());
    p.cls = clsKey;
    p.variant = variantKey;
    p.diff = diffKey;
    p.mod = modKey;
    p.skills = [cls.skill];
    p.knownSkills = [cls.skill];
    p.skillMods = {};
    p.hooks = {};
    p.ascension = ascensionKeys;
    if (diffKey === "hell") p.hooks.cheatDeath = 1; // 地獄の加護:開始時から致死を1回だけ耐える
    if (clsKey === "vampire" && variantKey === "a") p.lifesteal += 4; // 渇血
    const bless = BLESSINGS.find(b => b.key === blessingKey);
    if (bless) {
      p.blessing = bless.key;
      if (bless.apply) p = bless.apply(p);
      if (bless.learnSkill && !p.knownSkills.includes(bless.learnSkill)) {
        p.knownSkills = [...p.knownSkills, bless.learnSkill];
        p.skills = [...p.skills, bless.learnSkill];
      }
    }
    // 恒久アンロック(魂の祭壇)の効果を適用
    const mhp = metaOwned("mhp") * 12, matk = metaOwned("matk") * 3;
    p.maxHp += mhp; p.hp += mhp; p.atk += matk;
    p.potions += metaOwned("mpotion");
    if (p.hooks?.noPotion) p.potions = 0; // 血の渇望:回復薬は一切持てない
    p.gold += metaOwned("mgold") * 60;
    const startEquip = { weapon: null, armor: null, helmet: null, boots: null, ring: null, amulet: null };
    if (bless?.startWeapon) startEquip.weapon = genItem(1, 1, "weapon", null, { allowCurse: false }); // 星の祝福
    if (org) { startEquip[org.slot] = org.make(); p.origin = org.key; if (org.apply) p = org.apply(p); } // 出自の固有装備(同スロットなら星の祝福より優先)
    if (p.hooks?.noPotion) p.potions = 0; // 血の渇望は出自ボーナスにも優先
    setPlayer(p);
    setEquip(startEquip);
    setSoulsGained(0);
    setVictoryAwarded(false);
    setFloor(1); setKills(0); setCds({}); setLog([]);
    const e = genEnemy(1); e.hp = e.maxHp;
    if (p.forceFirstAttack) e.intent = "attack"; // 先読みの目
    if (p.executeFirstEnemy) e.hp = 1;           // 処刑人の啓示
    setEnemy(e);
    setScene("combat");
    const mod = getMod(modKey);
    const ascTag = ascensionKeys.length ? `🌑深淵の彼方×${ascensionKeys.length} ` : "";
    setLog([{ t: `【${cls.name}・${DIFFICULTIES[diffKey].name}】${ascTag}${mod.key !== "none" ? `世界:${mod.icon}${mod.name} ` : ""}${bless ? `祝福:${bless.icon}${bless.name} ` : ""}— 1F:${e.name}が現れた！`, c: "info" }]);
  };

  const stats = totalStats(player, equip);

  // 現在の与ダメ倍率を可視化するための計算(performAttackの乗算条件と同じ式を使い、実際の数値とズレないようにする)
  // RNG要素(会心判定・回避・気まぐれ系のランダム倍率)は除外し、「今確実にかかっている補正」だけを対象にする
  const currentAttackMultiplier = (forSkill = false) => {
    let mult = 1;
    const notes = [];
    const fury = player.cls === "warrior" ? (player.fury || 0) : 0;
    const furyCap = player.variant === "b" ? 7 : 5;
    const furyRate = player.variant === "b" ? 0.08 : 0.06;
    const furyReady = player.cls === "warrior" && fury >= furyCap;
    if (fury > 0 && !furyReady) { mult *= 1 + fury * furyRate; notes.push(`闘志+${Math.round(fury * furyRate * 100)}%`); }
    if (furyReady) { mult *= (1 + fury * furyRate) * 1.5; notes.push("闘志解放+50%(確定会心)"); }
    if (forSkill && player.cls === "mage" && (player.resonance || 0) > 0) { mult *= 1 + 0.1 * player.resonance; notes.push(`共鳴+${player.resonance * 10}%`); }
    if (forSkill && hasNode(player, "m3")) { mult *= 1.25; notes.push("魔力収束+25%"); }
    if (forSkill && hasRelic(player, "skillDmg")) { mult *= 1.2; notes.push("賢者の石+20%"); }
    if (forSkill && ACTIVE_ZONE.skillDmgBoost) { mult *= 1 + ACTIVE_ZONE.skillDmgBoost / 100; notes.push(`静寂の書庫+${ACTIVE_ZONE.skillDmgBoost}%`); }
    if (forSkill && (player.knowledgeStack || 0) > 0) { mult *= 1 + player.knowledgeStack / 100; notes.push(`知識の蓄積+${player.knowledgeStack}%`); }
    if (stats.dmgVsStatus > 0 && enemy?.status && Object.values(enemy.status).some(v => v.turns > 0)) { mult *= 1 + stats.dmgVsStatus / 100; notes.push(`対状態異常+${stats.dmgVsStatus}%`); }
    if (player.defendedLast) {
      mult *= 1.15; notes.push("防御反撃+15%");
      if (stats.afterDefendDmg > 0) { mult *= 1 + stats.afterDefendDmg / 100; notes.push(`防御後火力+${stats.afterDefendDmg}%`); }
    }
    if (player.cls === "vampire" && player.variant === "b" && stats.maxHp > 0 && player.hp / stats.maxHp <= 0.5) { mult *= 1.25; notes.push("血の対価+25%"); }
    if (stats.berserk > 0) { mult *= 1.25; notes.push("狂戦士+25%"); }
    if (stats.bossSlayer > 0 && enemy && (enemy.isBoss || enemy.isElite)) { mult *= 1 + stats.bossSlayer / 100; notes.push(`王殺し+${stats.bossSlayer}%`); }
    if (stats.executeBonus > 0 && enemy && enemy.hp / enemy.maxHp <= 0.15) { mult *= 1 + stats.executeBonus / 100; notes.push(`終焉+${stats.executeBonus}%`); }
    if (stats.flatDmg > 0) { mult *= 1 + stats.flatDmg / 100; notes.push(`与ダメ強化+${stats.flatDmg}%`); }
    if (!forSkill && stats.basicBonus > 0) { mult *= 1 + stats.basicBonus / 100; notes.push(`無音の誓い+${stats.basicBonus}%`); }
    if (stats.chaosDice > 0) notes.push("深淵の賽:さらに変動(×1.5 or ×0.66)");
    if (stats.gambleDmg > 0) notes.push("気まぐれな打撃:さらに変動(×1.5 or ×0.7)");
    return { mult, notes, furyReady };
  };

  // 棘の実効値(表示にも使う共通計算。鉄壁の棘=防御力加算・逆鱗=攻撃力加算を反映)
  const thornsEffective = (s) => (s.thorns + (s.thornsScale > 0 ? Math.round(s.atk * 0.2) : 0) + (s.thornsDef > 0 ? Math.round(s.def * 0.35) : 0)) * (s.thornsX3 > 0 ? 3 : 1);

  // 棘ダメージの共通処理(反応的発動・能動発動・スキル反撃モッドで共有)
  // スケーリング: 攻撃力加算(逆鱗)・防御力加算(鉄壁の棘)、防御中はdefendThornsMultが加算的に倍加(茨の心+反撃の大盾の重ねがけが効く)
  // さらに血染めの棘で会心、棘の女王で毒付与
  const dealThorns = (e, isDefending = false) => {
    const base = thornsEffective(stats);
    if (base <= 0) return 0;
    let dmg = Math.round(base * (isDefending ? 1 + (stats.defendThornsMult || 0) : 1));
    let wasCrit = false;
    if (stats.thornsCrit > 0 && Math.random() * 100 < stats.thornsCrit) { dmg *= 2; wasCrit = true; }
    e.hp -= dmg;
    if (stats.thornsPoison > 0 && dmg > 0) applyStatus(e, "poison", 2, Math.max(1, Math.round(dmg * 0.4)));
    if (wasCrit) addLog(`🥀 棘が会心の反撃！`, "dmg");
    return dmg;
  };

  const enemyTurn = (p, e, skipThorns = false) => {
    // 血染めの杯(契約):毎ターン最大HPの3%を失う
    if (stats.drainPerTurn > 0 && p.hp > 0) {
      const dr = Math.max(1, Math.round(stats.maxHp * stats.drainPerTurn / 100));
      p = { ...p, hp: p.hp - dr };
      addLog(`🥣 血染めの杯が命を啜る… ${dr}ダメージ`, "hurt");
      if (p.hp <= 0) return p;
    }
    // プレイヤーの毒(毒撃で付与される)を処理
    if (p.pPoison?.turns > 0) {
      const pd = p.pPoison.dmg;
      p = { ...p, hp: p.hp - pd, pPoison: { ...p.pPoison, turns: p.pPoison.turns - 1 } };
      addLog(`🟣 毒が回る… ${pd}ダメージ`, "hurt");
      if (p.hp <= 0) return p;
    }
    // 吸血鬼ツリー:不死再生
    if (hasNode(player, "v2")) {
      const regen = Math.max(1, Math.round(stats.maxHp * 0.04));
      if (p.hp < stats.maxHp) { p = { ...p, hp: Math.min(stats.maxHp, p.hp + regen) }; addLog(`🩸 不死再生でHP+${regen}`, "heal"); }
    }
    // エリート特性:再生
    if (e.trait === "regen" && e.hp > 0 && e.hp < e.maxHp) {
      const heal = Math.max(1, Math.round(e.maxHp * 0.06));
      e.hp = Math.min(e.maxHp, e.hp + heal);
      addLog(`💚 ${e.name}が再生でHP+${heal}`, "info");
    }
    // 状態異常の継続ダメージ(毒・炎上)
    if (e.status) {
      if (e.status.poison?.turns > 0) {
        e.hp -= e.status.poison.dmg;
        addLog(`🟣 ${e.name}は毒で${e.status.poison.dmg}ダメージ`, "dmg");
        e.status.poison.turns--;
      }
      if (e.status.burn?.turns > 0) {
        let rate = hasNode(player, "m1") ? 0.11 : 0.06; // 業火(ツリー)
        if (hasRelic(player, "burn")) rate += 0.04;      // 業火の宝珠(レリック)
        rate += ACTIVE_ZONE.burnBoost || 0;              // 灼けた荒野(ゾーン)
        const d = Math.max(1, Math.round(e.maxHp * rate));
        e.hp -= d;
        addLog(`🔥 ${e.name}は炎上で${d}ダメージ`, "dmg");
        e.status.burn.turns--;
      }
    }
    if (e.hp <= 0) return p; // 継続ダメージで撃破(呼び出し側がe.hpを確認)
    // 凍結・気絶で行動不能か(行動不能でも予告した行動は温存される=大技を遅らせる戦術が有効)
    let incap = false;
    if (e.status?.freeze?.turns > 0) { incap = true; e.status.freeze.turns--; }
    if (e.status?.stun?.turns > 0) { incap = true; e.status.stun.turns--; }
    if (incap) {
      addLog(`${e.name}は動けない！(${INTENTS[e.intent].icon}${INTENTS[e.intent].name}は持ち越し)`, "info");
      return p;
    }
    // 凍てつく霊峰:敵は寒さに凍えて行動できないことがある(予告は持ち越し)
    if (ACTIVE_ZONE.enemyFreezeCh && Math.random() * 100 < ACTIVE_ZONE.enemyFreezeCh) {
      addLog(`🥶 ${e.name}は寒さに凍えて動けない！(${INTENTS[e.intent].icon}${INTENTS[e.intent].name}は持ち越し)`, "info");
      return p;
    }
    // 重鈍(ゴーレム):2ターンに1回しか動けない
    if (e.gimmick === "slow") {
      if (e.resting) {
        e.resting = false;
        addLog(`🤖 ${e.name}は充填中…動けない(${INTENTS[e.intent].icon}${INTENTS[e.intent].name}は次に来る)`, "info");
        return p;
      }
      e.resting = true; // 今回動いたら次は休む
    }
    // 潜伏(深海のワーム):3ターンに1回、地中に潜って無敵になる(潜った次のターンは一撃が重い)
    if (e.gimmick === "burrow") {
      e.burrowCounter = (e.burrowCounter || 0) + 1;
      if (e.burrowCounter % 3 === 0) {
        e.burrowedNext = true;
        addLog(`🪱 ${e.name}が地中に潜った…(この攻撃は無効化された。次の一撃は強化される)`, "info");
        return p;
      }
    }
    // 鏡映し(鏡霊):あなたの直前の一撃の20%を跳ね返す(通常の行動とは別に発生)
    if (e.gimmick === "mirrorimg" && (e.mirrorStore || 0) > 0) {
      const refl = Math.max(1, Math.round(e.mirrorStore * 0.2));
      p = { ...p, hp: p.hp - refl };
      addLog(`🪞 ${e.name}があなたの一撃を鏡映しに返した！ ${refl}ダメージ`, "hurt");
      e.mirrorStore = 0;
      if (p.hp <= 0) return p;
    }
    // ===== 予告していたインテントを実行 =====
    const act = e.intent || "attack";
    if (act === "guard") {
      e.guardTurns = 1; // プレイヤーの次の攻撃ターンの間、被ダメ-50%
      addLog(`🛡️ ${e.name}は構えを取った(次に受けるダメージ-50%)`, "info");
    } else if (act === "roar") {
      e.atkBuff = Math.min(2.0, (e.atkBuff || 1) * 1.15);
      addLog(`📢 ${e.name}が咆哮した！攻撃力が上がっていく…(現在×${e.atkBuff.toFixed(2)})`, "hurt");
    } else {
      // attack / heavy / venom / flurry
      const heavyMult = act === "heavy" ? INTENTS.heavy.mult : act === "venom" ? INTENTS.venom.mult : act === "flurry" ? INTENTS.flurry.mult : 1;
      // 俊敏の2回攻撃は通常攻撃のみ(大技・毒撃は1回。理不尽な即死を防ぐ)。連攻は3連撃
      let attackHits = act === "flurry" ? 3 : e.trait === "swift" && act === "attack" ? 2 : 1;
      // 雷鳴の尖塔:敵の通常攻撃も10%で2連撃になる
      if (act === "attack" && ACTIVE_ZONE.enemyDoubleCh && Math.random() * 100 < ACTIVE_ZONE.enemyDoubleCh) {
        attackHits++;
        addLog(`🌩️ 雷鳴が${e.name}を加速させる！(連撃)`, "hurt");
      }
      for (let i = 0; i < attackHits; i++) {
        // ユニーク: 風走りの靴(完全回避)
        if (stats.dodge > 0 && Math.random() * 100 < stats.dodge) {
          addLog(`💨 ${e.name}の攻撃をかわした！`, "info");
          continue;
        }
        // 見切り: 大技を高確率で完全回避
        if (act === "heavy" && stats.dodgeHeavy > 0 && Math.random() * 100 < stats.dodgeHeavy) {
          addLog(`👁️ 見切った！${e.name}の大技を完全に回避した`, "info");
          continue;
        }
        let raw = e.atk * enemyAtkMult(e) * heavyMult; // 激昂(HP50%以下+40%)込み
        if (e.gimmick === "fragile") raw *= 1.5; // 硝子細工:与ダメ+50%(代わりに被ダメも+50%)
        if (e.gimmick === "burrow" && e.burrowedNext) { raw *= 1.6; e.burrowedNext = false; } // 潜伏明けの強化された一撃
        if (stats.poisonWeaken > 0 && e.status?.poison?.turns > 0) raw *= 0.8; // 疫病医:毒の敵は攻撃-20%
        let effDef = stats.def + (e.status?.freeze?.turns > 0 ? Math.round(stats.def * (stats.freezeDefBonus || 0) / 100) : 0); // 氷の鎧
        let dmg = Math.max(1, Math.round(raw - effDef + rand(-1, 2)));
        if (act === "heavy" && stats.heavyResist > 0) dmg = Math.max(1, Math.round(dmg * 0.5)); // 隕鉄の兜
        if (stats.berserk > 0) dmg = Math.round(dmg * 1.15); // 狂戦士:被ダメ+15%
        if (stats.dmgReduce > 0) dmg = Math.max(1, Math.round(dmg * (1 - stats.dmgReduce / 100))); // 鉛の鎧(契約)
        if (stats.chaosDice > 0) dmg = Math.max(1, Math.round(dmg * (Math.random() < 0.5 ? 1.5 : 0.66))); // 深淵の賽(契約)
        if (hasNode(player, "w4") && p.hp / stats.maxHp <= 0.3) dmg = Math.max(1, Math.round(dmg * 0.7)); // 不動の意志
        if (hasNode(player, "w8") && player.cls === "warrior" && (p.fury || 0) >= (player.variant === "b" ? 7 : 5)) dmg = Math.max(1, Math.round(dmg * 0.85)); // 巨人の心
        if (hasNode(player, "v10") && player.cls === "vampire" && (p.barrier || 0) >= 1) dmg = Math.max(1, Math.round(dmg * 0.9)); // 渇きの守り
        // 魔弾(魔導士):大技は防御を貫通しやすい(-60%→-30%)
        const defendMult = e.gimmick === "arcane" && act === "heavy" ? 0.7 : (stats.betterDefend > 0 ? 0.2 : 0.4);
        if (p.defending) dmg = Math.max(1, Math.round(dmg * defendMult)); // 防御中(不動の鎧なら-80%)
        if (stats.dmgCapPercent > 0) dmg = Math.min(dmg, Math.max(1, Math.round(stats.maxHp * stats.dmgCapPercent / 100))); // 絶対防御:被弾上限
        // 報復の構え(w10): 大技を受けたら次の攻撃が確定クリになるフラグを立てる
        if (act === "heavy" && hasNode(player, "w10") && player.cls === "warrior") p = { ...p, tookHeavyLast: true };
        // 反射: 大技を受けた時、そのダメージの一部を反射
        if (act === "heavy" && stats.reflectHeavy > 0) {
          const refl = Math.max(1, Math.round(dmg * stats.reflectHeavy / 100));
          e.hp -= refl;
          addLog(`🪞 反射！${e.name}に${refl}ダメージ`, "dmg");
        }
        // 吸血鬼「血の障壁」: シールドが先にダメージを受け止める
        let absorbed = 0;
        if ((p.barrier || 0) > 0) {
          absorbed = Math.min(p.barrier, dmg);
          p = { ...p, barrier: p.barrier - absorbed };
          dmg -= absorbed;
        }
        p = { ...p, hp: p.hp - dmg };
        // 戦士「闘志」: 被弾(障壁吸収含む)で+1
        if (player.cls === "warrior") {
          const fCap = player.variant === "b" ? 7 : 5;
          if ((p.fury || 0) < fCap) {
            p = { ...p, fury: Math.min(fCap, (p.fury || 0) + 1) };
            addLog(`🔥 闘志が滾る(${p.fury}/${fCap})${p.fury >= fCap ? " — 次の攻撃で解放！" : ""}`, "info");
          }
        }
        // 暗殺者「コンボ」: HPにダメージを受けると-2
        if (player.cls === "assassin" && dmg > 0 && (p.combo || 0) > 0) {
          p = { ...p, combo: Math.max(0, p.combo - 2) };
          addLog(`💔 コンボが乱れた(×${p.combo})`, "info");
        }
        if (i === 0) SFX[act === "heavy" ? "heavyHit" : "hurt"]();
        const actName = act === "heavy" ? "大技" : act === "venom" ? "毒撃" : act === "flurry" ? "連攻" : "攻撃";
        addLog(`${act === "heavy" ? "💢 " : act === "venom" ? "🟣 " : act === "flurry" ? "🌀 " : ""}${e.name}の${actName}！${attackHits > 1 ? `(${i + 1}撃目)` : ""} ${dmg}ダメージ${absorbed > 0 ? `(障壁が${absorbed}吸収)` : ""}${p.defending ? "(防御で軽減)" : ""}`, "hurt");
        // 盗み(ゴブリン):攻撃命中時にゴールドを盗む(倒せば1.5倍で回収)
        if (e.gimmick === "thief" && (p.gold || 0) > 0) {
          const steal = Math.min(p.gold, 4 + floor * 2);
          p = { ...p, gold: p.gold - steal };
          e.stolen = (e.stolen || 0) + steal;
          addLog(`💰 ${e.name}が${steal}Gを盗んだ！(累計${e.stolen}G・倒して取り返せ)`, "hurt");
        }
        // 吸血(大コウモリ)・血の霊廟:敵が与ダメの一部を吸収
        const eLeech = (e.gimmick === "leech" ? 0.3 : 0) || (ACTIVE_ZONE.enemyLifesteal || 0);
        if (eLeech > 0 && dmg > 0 && e.hp > 0 && e.hp < e.maxHp) {
          const h = Math.max(1, Math.round(dmg * eLeech));
          e.hp = Math.min(e.maxHp, e.hp + h);
          addLog(`🩸 ${e.name}が血を吸ってHP+${h}`, "info");
        }
        // 毒牙(毒蜘蛛):通常攻撃でも25%で毒(防御中は防げる)
        if (e.gimmick === "venomfang" && act === "attack" && !p.defending && p.hp > 0 && Math.random() < 0.25) {
          const pd = Math.max(1, Math.round(e.atk * enemyAtkMult(e) * 0.2));
          p = { ...p, pPoison: { turns: 2, dmg: pd } };
          addLog(`🟣 毒牙が刺さった！(2ターンの間、毎ターン${pd}ダメージ)`, "hurt");
        }
        // 呪詛(呪術師):攻撃命中時20%でランダムなスキルのCD+1
        if (e.gimmick === "hex" && p.hp > 0 && Math.random() < 0.2 && player.skills.length) {
          const sk = pick(player.skills);
          setCds(c => ({ ...c, [sk]: (c[sk] || 0) + 1 }));
          addLog(`🧿 呪詛が絡みつく…${SKILLS[sk].icon}${SKILLS[sk].name}のCD+1`, "hurt");
        }
        // 石化(石化蛇):大技を防御せず受けると次のターンは攻撃しかできない
        if (e.gimmick === "petrify" && act === "heavy" && !p.defending && p.hp > 0 && !p.petrified) {
          p = { ...p, petrified: true };
          addLog(`🐍 体が石のように固まっていく…(次のターンは攻撃しかできない)`, "hurt");
        }
        // 腐敗(腐敗した司祭):命中するたび回復効果が弱まる(戦闘中蓄積、最大40%)
        if (e.gimmick === "corrupt" && dmg > 0 && p.hp > 0) {
          const before = p.healReduce || 0;
          p = { ...p, healReduce: Math.min(40, before + 10) };
          if (p.healReduce > before) addLog(`☠️ 腐敗が回り、回復効果が弱まった(-${p.healReduce}%)`, "hurt");
        }
        const thornsDmg = skipThorns ? 0 : dealThorns(e, p.defending);
        if (thornsDmg > 0) addLog(`棘が${e.name}に${thornsDmg}ダメージを返した${p.defending && stats.defendThornsMult > 0 ? "(防御強化)" : ""}`, "dmg");
        if (p.hp <= 0 || e.hp <= 0) break;
      }
      // 毒撃:防御していなければ毒が付与される
      if (act === "venom" && p.hp > 0 && !p.defending) {
        const pd = Math.max(1, Math.round(e.atk * (e.atkBuff || 1) * 0.3));
        p = { ...p, pPoison: { turns: 2, dmg: pd } };
        addLog(`🟣 毒に侵された！(2ターンの間、毎ターン${pd}ダメージ)`, "hurt");
      } else if (act === "venom" && p.defending) {
        addLog(`🛡️ 防御で毒を防いだ！`, "info");
      }
    }
    // 次のターンの行動を予告
    e.intent = rollIntent(e);
    // 加速(狂戦士):行動するたび攻撃力が上がり続ける
    if (e.gimmick === "ramp" && e.hp > 0) {
      e.atkBuff = Math.min(2.2, (e.atkBuff || 1) * 1.08);
      addLog(`📈 ${e.name}の勢いが増していく…(攻撃×${e.atkBuff.toFixed(2)})`, "info");
    }
    if (p.defending) p = { ...p, defending: false };
    // 輸血の契約: HPが25%以下になったら自動で回復薬を1つ消費(ラン中の残り回数まで)
    if (p.hp > 0 && (p.autoPotionLeft || 0) > 0 && p.potions > 0 && p.hp / stats.maxHp <= 0.25) {
      const saved = stats.potionSaveCh > 0 && Math.random() * 100 < stats.potionSaveCh; // 不朽の水筒
      const heal = Math.max(1, Math.round(stats.maxHp * (ACTIVE_MOD.potionHeal || 0.4) * (1 - (p.healReduce || 0) / 100)));
      p = { ...p, hp: Math.min(stats.maxHp, p.hp + heal), potions: saved ? p.potions : p.potions - 1, autoPotionLeft: p.autoPotionLeft - 1 };
      addLog(`💉 輸血の契約が発動！回復薬が自動で使われた(+${heal} HP、残り${p.autoPotionLeft}回)${saved ? "♻️" : ""}`, "heal");
    }
    return p;
  };

  const randomUnownedRelic = (p) => {
    const owned = new Set(p.relics || []);
    const pool = RELICS.filter(r => !owned.has(r.key));
    return pool.length ? pick(pool) : null;
  };

  // 撃破後の進行(レベルアップ → ドロップ → 次の階)
  const progressAfterKill = (np, e) => {
    const discount = np.discountNextLevel ? 0.5 : 1; // 巻き戻しの一歩:初回のみ半分
    const need = Math.round((15 + np.level * 9) * discount);
    if (np.xp >= need) {
      if (np.discountNextLevel) np = { ...np, discountNextLevel: false };
      np = { ...np, xp: np.xp - need, level: np.level + 1 };
      // スキル習得はレベルアップから分離した(Ver.39〜)。「修練の間」で3択から選ぶ方式
      const perkPool = PERKS.filter(pk => !(np.hooks?.noPotion && pk.key === "potion")); // 血の渇望:回復薬パークは出ない
      const choices = [...perkPool].sort(() => Math.random() - 0.5).slice(0, 3);
      setPerkChoices(choices);
      setPlayer(np);
      SFX.levelup();
      setScene("levelup");
      return;
    }
    setPlayer(np);
    const dropChance = e.isBoss || e.isElite || e.gimmick === "mimic" || e.arenaStage === 2 ? 1 : Math.max(0.1, 0.55 + (ACTIVE_MOD.dropBonus || 0) - ascFx("dropPenalty", 0));
    if (Math.random() < dropChance) {
      const guaranteed = e.isBoss || e.isElite || e.gimmick === "mimic" || e.arenaStage === 2;
      const d = genItem(floor, guaranteed ? 1 : 0, null, null, { unidentified: !guaranteed && Math.random() < 0.18 });
      setDrop(d);
      SFX[d.ability ? "unique" : "drop"]();
      setScene("loot");
    } else {
      nextFloor(np);
    }
  };

  const afterKill = (p, e) => {
    // 自爆(爆弾虫):直接攻撃でトドメを刺すと爆発。毒・炎上・棘によるトドメなら安全
    if (e.gimmick === "explode" && e.directKill && !e.exploded) {
      e.exploded = true;
      const boom = Math.max(1, Math.round(stats.maxHp * 0.15));
      p = { ...p, hp: p.hp - boom };
      addLog(`💥 ${e.name}が爆発！${boom}ダメージ(毒・炎上・棘でトドメを刺せば回避できる)`, "hurt");
      SFX.heavyHit(0);
      if (p.hp <= 0) {
        if ((p.hooks?.cheatDeath || 0) > 0 && !p.cheatDeathUsed) {
          p = { ...p, hp: 1, cheatDeathUsed: true };
          addLog(`✨ 不滅の約束が発動！死の淵から生還した`, "gold");
        } else {
          setPlayer(p); setBest(b => Math.max(b, floor)); awardSouls(floor, kills, false); SFX.death(); setScene("dead"); return;
        }
      }
    }
    // 闘技場:1戦目を倒したら休憩なしで即2戦目へ(ゲージ・状態は持ち越し。報酬は2戦目撃破後にまとめて)
    if (e.arenaStage === 1) {
      SFX.kill();
      setKills(k => k + 1);
      addLog(`${e.name}を倒した！休む間もなく、闘技場の2戦目が始まる…`, "gold");
      const e2 = genArenaEnemy(2);
      if (stats.startStun > 0) applyStatus(e2, "stun", 1);
      setEnemy(e2);
      setPlayer(p); // 1戦目終了時点のHP・ゲージ状態をそのまま持ち越す
      return;
    }
    // 分裂(スライム):撃破すると小さな分身が現れる(戦闘は継続・ゲージ類も維持)
    if (e.gimmick === "split" && !e.isSplit) {
      SFX.kill();
      setKills(k => k + 1);
      const halfXp = Math.round(e.xp * 0.5 * ACTIVE_DIFF.reward);
      const halfGold = Math.round((9 + floor * 7) * 0.5 * (e.goldScale || 1) * ACTIVE_DIFF.reward * (ACTIVE_MOD.gold || 1) * (ACTIVE_ZONE.gold || 1));
      addLog(`${e.name}を倒した！…が、体が分裂した！ (+${halfXp} XP, +${halfGold} G)`, "gold");
      const child = { ...e, name: `小${e.name.replace("エリート・", "")}`, isSplit: true, isElite: false, trait: null, status: undefined, guardTurns: 0, atkBuff: 1, stolen: 0, directKill: false, revived: false, maxHp: Math.max(5, Math.round(e.maxHp * 0.4)), atk: Math.max(1, Math.round(e.atk * 0.65)), xp: Math.round(e.xp * 0.5) };
      child.hp = child.maxHp;
      child.intent = rollIntent(child);
      setEnemy(child);
      setPlayer({ ...p, xp: p.xp + halfXp, gold: p.gold + halfGold });
      return;
    }
    // 不死(スケルトン)・骸の庭園:一度倒してもHP30%で起き上がる(報酬は本当に倒した時)
    if ((e.gimmick === "undying" || ACTIVE_ZONE.allUndying) && !e.revived) {
      const e2 = { ...e, revived: true, hp: Math.max(1, Math.round(e.maxHp * 0.3)), status: undefined, guardTurns: 0, directKill: false };
      e2.intent = rollIntent(e2);
      addLog(`🦴 ${e.name}${e.gimmick === "undying" ? "の骨" : ""}が再び組み上がっていく…！(HP30%で復活)`, "hurt");
      setEnemy(e2);
      setPlayer(p);
      return;
    }
    SFX.kill();
    setKills(k => k + 1);
    if (p.pPoison) p = { ...p, pPoison: null }; // 戦闘終了で毒は消える
    if (p.fury) p = { ...p, fury: 0 };          // 闘志は戦闘毎にリセット
    if (p.doubleStack) p = { ...p, doubleStack: 0 }; // 加速する連撃の蓄積も戦闘毎にリセット
    if (p.healReduce) p = { ...p, healReduce: 0 };    // 腐敗による回復弱化も戦闘毎にリセット
    if (p.quickDrinkUsed) p = { ...p, quickDrinkUsed: false }; // 素早飲みは戦闘毎に1回
    if (p.petrified) p = { ...p, petrified: false };           // 石化も戦闘終了で解除
    // 暗殺者「影の相伝」: コンボを半分維持したまま持ち越す。なければ通常通り0に
    if (p.combo) p = { ...p, combo: hasNode(p, "a8") ? Math.floor(p.combo / 2) : 0 };
    if (p.resonance) p = { ...p, resonance: 0 }; // 共鳴も戦闘毎にリセット(障壁は持続)
    if (p.defendedLast) p = { ...p, defendedLast: false };
    // 吸血鬼「血の共鳴」: 撃破時、障壁が上限の10%分回復
    if (p.cls === "vampire" && hasNode(p, "v8")) {
      const cap = Math.round(stats.maxHp * (p.variant === "c" ? 0.4 : 0.25));
      const before = p.barrier || 0;
      p = { ...p, barrier: Math.min(cap, before + Math.round(cap * 0.1)) };
      if (p.barrier > before) addLog(`🩸 血の共鳴で障壁が回復(${p.barrier}/${cap})`, "heal");
    }
    // 覚醒ポイント(AP): ボス撃破で必ず+1、エリート撃破で40%の確率で+1
    if (e.isBoss) {
      p = { ...p, ap: (p.ap || 0) + 1 };
      addLog(`✨ ボス撃破で覚醒Pを獲得(AP:${p.ap})`, "gold");
    } else if (e.isElite && Math.random() < 0.4) {
      p = { ...p, ap: (p.ap || 0) + 1 };
      addLog(`✨ エリート撃破で覚醒Pを獲得(AP:${p.ap})`, "gold");
    }
    if (stats.onKillHeal > 0) {
      const h = Math.max(1, Math.round(stats.maxHp * stats.onKillHeal / 100));
      p = { ...p, hp: Math.min(stats.maxHp, p.hp + h) };
      addLog(`🔶 吸魂の刃がHPを${h}回復した`, "heal");
    }
    if (stats.killMomentum > 0) {
      const cap = 30;
      const before = p.killMomentum || 0;
      p = { ...p, killMomentum: Math.min(cap, before + 3) };
      if (p.killMomentum > before) addLog(`🎯 獲物の記憶が刻まれる(攻撃力+${p.killMomentum})`, "gold");
    }
    // 死の呪い(シャーマン):倒しても呪いが残り、次の敵が強化される
    if (e.gimmick === "deathcurse") {
      PENDING_DEATHCURSE = true;
      addLog(`🪶 ${e.name}は不気味な笑いとともに呪いを残した…(次の敵の攻撃+20%)`, "hurt");
    }
    let gold = Math.round((9 + floor * 7) * (e.isBoss ? 3 : e.isElite ? 1.8 : 1) * (e.goldScale || 1) * ACTIVE_DIFF.reward * (ACTIVE_MOD.gold || 1) * (ACTIVE_ZONE.gold || 1)); // 成長を速める(旧: 6+floor*5)
    if (hasRelic(p, "gold")) gold = Math.round(gold * 1.5);   // 強欲の護符
    if (e.stolen) { const back = Math.round(e.stolen * 1.5); gold += back; addLog(`💰 盗まれたゴールドを利子付きで取り返した！(+${back} G)`, "gold"); } // 盗み(ゴブリン)
    let xpGain = Math.round(e.xp * ACTIVE_DIFF.reward * (ACTIVE_MOD.xp || 1) * (ACTIVE_ZONE.xp || 1));
    if (hasRelic(p, "xp")) xpGain = Math.round(xpGain * 1.3); // 知恵の書
    if (e.arenaStage === 2) { gold = Math.round(gold * 1.6); xpGain = Math.round(xpGain * 1.6); addLog(`🏟️ 闘技場を制した！連戦ボーナスで報酬1.6倍`, "gold"); } // 連戦ボーナス
    addLog(`${e.name}を倒した！ (+${xpGain} XP, +${gold} G)`, "gold");
    let np = { ...p, xp: p.xp + xpGain, gold: p.gold + gold };
    // 20階の最終ボス撃破 → クリア
    if (e.isFinal) {
      setPlayer(np);
      setBest(b => Math.max(b, FINAL_FLOOR));
      awardSouls(FINAL_FLOOR, kills + 1, true);
      SFX.victory();
      setScene("victory");
      return;
    }
    // ボス撃破でレリック確定、エリート撃破でも低確率でレリック獲得
    // (ボスを一度も抜けられないランでもレリックに触れられるようにする救済)
    const relicChance = e.isBoss ? 1 : e.isElite ? (ACTIVE_MOD.eliteRelic || 0.18) : 0;
    if (relicChance > 0 && Math.random() < relicChance) {
      // Ver.39〜: ランダム1個ではなく、未所持から3択で選ぶ(ビルドを「組む」楽しさを出す)
      const owned = new Set(np.relics || []);
      const pool = RELICS.filter(r => !owned.has(r.key)).sort(() => Math.random() - 0.5).slice(0, 3);
      if (pool.length) {
        setPlayer(np); // ゴールド/XP等はここで確定させる
        setPendingKill(e);
        setRelicChoices(pool.map(r => r.key));
        SFX.relic();
        setScene("relicChoice");
        return;
      }
    }
    progressAfterKill(np, e);
  };

  // レリック3択からの選択。所持上限なら入れ替え画面へ
  const chooseRelic = (key) => {
    const r = RELIC_MAP[key];
    setRelicChoices([]);
    if ((player.relics || []).length >= RELIC_CAP) {
      setRelicGot(r);
      setScene("relicSwap");
      return;
    }
    const updated = { ...player, relics: [...(player.relics || []), key] };
    setPlayer(updated);
    addLog(`✨ ${r.icon}${r.name}を手に入れた — ${r.desc}`, "gold");
    const e = pendingKill;
    setPendingKill(null);
    progressAfterKill(updated, e);
  };
  const declineRelicChoice = () => {
    setRelicChoices([]);
    addLog(`レリックは何も選ばなかった`, "info");
    const e = pendingKill;
    setPendingKill(null);
    progressAfterKill(player, e);
  };

  // レリックが上限に達している場合の入れ替え/見送りハンドラー
  const swapRelic = (oldKey) => {
    const updated = { ...player, relics: [...(player.relics || []).filter(k => k !== oldKey), relicGot.key] };
    setPlayer(updated);
    addLog(`${RELIC_MAP[oldKey].name}を手放し、${relicGot.name}を手に入れた`, "gold");
    const e = pendingKill;
    setRelicGot(null); setPendingKill(null);
    progressAfterKill(updated, e); // 更新後のオブジェクトを直接渡す(state反映待ちを避ける)
  };
  const declineRelic = () => {
    addLog(`${relicGot.name}は見送った`, "info");
    const e = pendingKill;
    setRelicGot(null); setPendingKill(null);
    progressAfterKill(player, e);
  };

  const regenOnCombatStart = () => {
    if (!hasRelic(player, "regenStart")) return;
    if (player.hp >= stats.maxHp) return;
    const heal = Math.min(stats.maxHp - player.hp, Math.round(stats.maxHp * 0.12));
    setPlayer(p => ({ ...p, hp: Math.min(stats.maxHp, p.hp + heal) }));
    addLog(`🪽 不死鳥の羽でHPが${heal}回復`, "heal");
  };

  const ROOMS = [
    { key: "battle", icon: "⚔️", name: "戦闘", desc: "通常の敵と戦う。経験値と装備のチャンス" },
    { key: "elite", icon: "💀", name: "エリート", desc: "強敵。レア以上の装備確定＋レリックのチャンス" },
    { key: "treasure", icon: "💰", name: "宝箱", desc: "戦わずに装備入手。中身は未鑑定" },
    { key: "rest", icon: "⛺", name: "焚き火", desc: "休んでHPを35%回復する" },
    { key: "shop", icon: "🏪", name: "商人", desc: "ゴールドで回復薬や装備を買える" },
    { key: "forge", icon: "🔨", name: "鍛冶屋", desc: "ゴールドで装備を強化・改造できる" },
    { key: "event", icon: "❓", name: "？？？", desc: "何が起こるかわからない" },
    { key: "arena", icon: "🏟️", name: "闘技場", desc: "連戦(2体・休憩なし)。ゲージは持ち越し、まとめて報酬+装備確定" },
    { key: "doppel", icon: "🪞", name: "鏡の間", desc: "今の自分自身を写した鏡像と一度だけ戦う。手強いがレア以上の装備確定＋レリックのチャンス" },
    { key: "dojo", icon: "📖", name: "修練の間", desc: "新たなスキルを3択から1つ習得できる(戦闘なし)" },
  ];

  // 闘技場専用の敵生成:連鎖ギミック(分裂・不死)は連戦と噛み合わないため外す
  const genArenaEnemy = (stage) => {
    const e = genEnemy(floor);
    if (e.gimmick === "split" || e.gimmick === "undying") e.gimmick = null;
    e.hp = e.maxHp;
    e.arenaStage = stage;
    return e;
  };

  const nextFloor = (p = player) => {
    const nf = floor + 1;
    setFloor(nf);
    // ゾーン分岐:6F,11F,16F(とエンドレスの各区画頭)で次の環境を2択から選ぶ
    if (nf > 5 && (nf - 1) % 5 === 0) {
      const pool = Object.values(ZONES).filter(z => z.key !== "entrance" && z.key !== zoneKey);
      setZoneChoices(pool.sort(() => Math.random() - 0.5).slice(0, 2).map(z => z.key));
      setScene("zoneSelect");
      return;
    }
    enterFloor(nf);
  };

  const enterFloor = (nf) => {
    // 癒しの水脈:階を進むたびHPが回復する
    if (ACTIVE_ZONE.floorHeal && player.hp > 0 && player.hp < stats.maxHp) {
      const fh = Math.max(1, Math.round(stats.maxHp * ACTIVE_ZONE.floorHeal));
      setPlayer(p => ({ ...p, hp: Math.min(stats.maxHp, p.hp + fh) }));
      addLog(`💧 水脈の癒し (+${fh} HP)`, "heal");
    }
    if (nf % 5 === 0) {
      const e = genEnemy(nf); e.hp = e.maxHp;
      if (stats.startStun > 0) { applyStatus(e, "stun", 1); addLog(`⏱️ 時が砕け、${e.name}は動けない！`, "info"); } // 時砕きの懐中時計
      setEnemy(e);
      regenOnCombatStart();
      setScene("combat");
      SFX.boss();
      addLog(e.isFinal ? `${nf}F:👑 最終ボス ${e.name}が立ちはだかる！` : `${nf}F:⚠️ ボス ${e.name}が現れた！`, "hurt");
      return;
    }
    // 分岐路:戦闘は必ず含め、残り2枠はランダム
    let roomPool = [...ROOMS.slice(1)];
    if (nf < 3) roomPool = roomPool.filter(r => r.key !== "doppel"); // 鏡の間は序盤(1〜2F)には出さない
    // 修練の間:習得上限か、習得できるスキルが残っていなければ出さない
    const knownForDojo = player.knownSkills || player.skills;
    const learnableLeft = Object.entries(SKILLS).some(([k, s]) => !knownForDojo.includes(k) && (!s.locked || metaOwned("skill_" + k) > 0));
    if (knownForDojo.length >= SKILL_CAP || !learnableLeft) roomPool = roomPool.filter(r => r.key !== "dojo");
    if (ACTIVE_ZONE.shopBias) roomPool.push(ROOMS.find(r => r.key === "shop")); // 黄金の回廊:商人が出やすい
    if (ACTIVE_ZONE.forgeBias) roomPool.push(ROOMS.find(r => r.key === "forge")); // 地下鍛冶場:鍛冶屋が出やすい
    if (ACTIVE_MOD.tradeBias) roomPool.push(ROOMS.find(r => r.key === "shop"), ROOMS.find(r => r.key === "forge")); // 商隊の往来:商人・鍛冶屋が出やすい
    if (ACTIVE_MOD.banShops) roomPool = roomPool.filter(r => r.key !== "shop" && r.key !== "forge"); // 商人なき世界
    const extras = [];
    for (const r of roomPool.sort(() => Math.random() - 0.5)) {
      if (extras.length >= 2) break;
      if (!extras.some(x => x.key === r.key)) extras.push(r); // 同じ部屋の重複を防ぐ
    }
    // ボス直前の階(4F,9F,14F,19F)は必ず焚き火を選択肢に含める(運悪く無回復で突入する事故を防ぐ)
    if ((nf + 1) % 5 === 0 && !extras.some(r => r.key === "rest")) {
      extras[extras.length - 1] = ROOMS.find(r => r.key === "rest");
    }
    // エリートが選択肢にあれば特性を事前に決めて表示に反映(対策できるようにする)
    const finalExtras = extras.map(r => {
      if (r.key !== "elite") return r;
      const traitKey = pick(ELITE_TRAIT_KEYS);
      setEliteTraitPreview(traitKey);
      const t = ELITE_TRAITS[traitKey];
      return { ...r, desc: `【${t.icon}${t.name}】${t.desc}` };
    });
    if (!finalExtras.some(r => r.key === "elite")) setEliteTraitPreview(null);
    setPathOptions([ROOMS[0], ...finalExtras].sort(() => Math.random() - 0.5));
    setScene("path");
  };

  const chooseZone = (zk) => {
    ACTIVE_ZONE = ZONES[zk] || ZONES.entrance;
    if (zk === "dreamcorridor") {
      const buff = pick(DREAM_BUFFS);
      ACTIVE_ZONE = { ...ACTIVE_ZONE, randomBuff: buff.stat, randomBuffLabel: buff.label };
    }
    setZoneKey(zk);
    addLog(`${ACTIVE_ZONE.icon} ${ACTIVE_ZONE.name}に足を踏み入れた — ${ACTIVE_ZONE.randomBuffLabel ? `気まぐれな祝福:${ACTIVE_ZONE.randomBuffLabel}` : ACTIVE_ZONE.desc}`, "info");
    enterFloor(floor);
  };

  const chooseRoom = (room) => {
    if (room.key === "rest") {
      const heal = Math.round(stats.maxHp * 0.35 * ascFx("restMult") * (ACTIVE_MOD.restMult || 1));
      setPlayer(p => ({ ...p, hp: Math.min(stats.maxHp, p.hp + heal) }));
      addLog(`${floor}F:焚き火で休んだ (+${heal} HP)`, "heal");
      nextFloor();
      return;
    }
    if (room.key === "treasure") {
      addLog(`${floor}F:宝箱を見つけた！`, "gold");
      setDrop(genItem(floor, 0, null, null, { unidentified: true }));
      setScene("loot");
      return;
    }
    if (room.key === "shop") {
      setShopItem(genItem(floor, 1));
      setScene("shop");
      return;
    }
    if (room.key === "forge") {
      setForgeSlot(null);
      setScene("forge");
      return;
    }
    if (room.key === "event") {
      // 激レアイベント:妖精(10%)・悪魔の再訪(取引済みの場合22%)
      let evKey;
      if (player.demonDeal && Math.random() < 0.22) evKey = "demon2";
      else if (Math.random() < 0.1) evKey = "fairy";
      else evKey = pick(["demon", "gamble", "spring", "statue", "wagon", "box", "altar", "mirror", "duelist", "peddler", "bloodpool", "hermit", "starpool", "trainer", "cursesmith", "bard"]);
      setCurrentEvent(evKey);
      setScene("eventChoice");
      return;
    }
    if (room.key === "arena") {
      const e = genArenaEnemy(1);
      if (stats.startStun > 0) { applyStatus(e, "stun", 1); addLog(`⏱️ 時が砕け、${e.name}は動けない！`, "info"); }
      setEnemy(e);
      regenOnCombatStart();
      setScene("combat");
      addLog(`${floor}F:🏟️ 闘技場 — 1戦目、${e.name}が現れた！(連戦・休憩なし)`);
      return;
    }
    if (room.key === "doppel") {
      // 鏡の間:今の自分自身のステータスを写した鏡像と一度だけ戦う(エリート相当の報酬:装備確定+レリック抽選)
      const e = {
        name: `鏡像の${CLASSES[player.cls]?.name || "旅人"}`, icon: "🪞",
        isElite: true, gimmick: null,
        maxHp: Math.max(20, Math.round(stats.maxHp * 0.85)),
        atk: Math.max(3, Math.round(stats.atk * 1.1)),
        xp: Math.round((14 + floor * 12) * 1.8),
        goldScale: 2.2,
        atkBuff: 1,
        pattern: ["attack", "attack", "heavy", "guard"],
        patternIdx: 0,
      };
      e.hp = e.maxHp;
      e.codexId = e.name;
      e.intent = rollIntent(e);
      if (stats.startStun > 0) { applyStatus(e, "stun", 1); addLog(`⏱️ 時が砕け、${e.name}は動けない！`, "info"); }
      setEnemy(e);
      regenOnCombatStart();
      setScene("combat");
      addLog(`${floor}F:🪞 鏡の間 — ${e.name}が立ちはだかる！(一度だけの戦い)`, "hurt");
      return;
    }
    if (room.key === "dojo") {
      // 修練の間:未習得スキルから3択で1つ学べる(レベルアップからスキル習得を分離した受け皿)
      const known = player.knownSkills || player.skills;
      const learnable = Object.entries(SKILLS)
        .filter(([k, s]) => !known.includes(k) && (!s.locked || metaOwned("skill_" + k) > 0))
        .map(([k]) => k);
      if (!learnable.length) {
        // 出現ガードをすり抜けた場合の保険(習得直後の同一階など)
        setPlayer(p => ({ ...p, potions: p.hooks?.noPotion ? p.potions : p.potions + 1 }));
        addLog(`${floor}F:📖 師範は「もう教えることはない」と回復薬をくれた`, "heal");
        nextFloor();
        return;
      }
      setSkillChoices([...learnable].sort(() => Math.random() - 0.5).slice(0, 3));
      setScene("dojo");
      return;
    }
    let elite = room.key === "elite";
    let surprise = false;
    // 精鋭の世界:通常戦闘が30%でエリートにすり替わる
    const eliteCh = (ACTIVE_MOD.eliteCh || 0) + ascFx("eliteCh", 0);
    if (!elite && room.key === "battle" && eliteCh && Math.random() < eliteCh) { elite = true; surprise = true; }
    const e = genEnemy(floor, elite, elite && !surprise ? eliteTraitPreview : null); e.hp = e.maxHp;
    if (stats.startStun > 0) { applyStatus(e, "stun", 1); addLog(`⏱️ 時が砕け、${e.name}は動けない！`, "info"); } // 時砕きの懐中時計
    setEnemy(e);
    regenOnCombatStart();
    setScene("combat");
    const traitTag = elite && e.trait ? `【${ELITE_TRAITS[e.trait].icon}${ELITE_TRAITS[e.trait].name}】` : "";
    if (surprise) addLog(`💀 精鋭の世界 — 現れたのはただの敵ではなかった！`, "hurt");
    addLog(`${floor}F:${elite ? `💀 ${traitTag}` : ""}${e.name}が現れた！${e.gimmick ? ` 〈${GIMMICKS[e.gimmick].icon}${GIMMICKS[e.gimmick].name}〉` : ""}`);
  };

  // ？？？部屋:7種のイベントからランダムに1つ発生。選択肢で結果が変わる
  const EVENTS = [
    {
      key: "demon", icon: "😈", title: "悪魔の取引",
      desc: "「力が欲しいか?対価はお前の命の器だ」",
      choices: [
        { label: `取引する(最大HP -15%、攻撃力 +5)`, run: () => {
          setPlayer(p => { const cut = Math.round(p.maxHp * 0.15); return { ...p, maxHp: p.maxHp - cut, hp: Math.max(1, Math.min(p.hp, p.maxHp - cut)), atk: p.atk + 5, demonDeal: true }; });
          addLog(`${floor}F:悪魔と取引した。力を得たが器が縮んだ`, "hurt"); nextFloor();
        } },
        { label: "断る", run: () => { addLog(`${floor}F:悪魔の誘いを断った`, "info"); nextFloor(); } },
      ],
    },
    {
      key: "gamble", icon: "🎲", title: "賭博師",
      desc: `「${40 + floor * 10}Gで勝負しないか?勝てば2.5倍だ」`,
      choices: [
        { label: `賭ける(${40 + floor * 10}G / 50%で${Math.round((40 + floor * 10) * 2.5)}G)`, disabled: () => player.gold < 40 + floor * 10, run: () => {
          const bet = 40 + floor * 10;
          if (Math.random() < 0.5) { setPlayer(p => ({ ...p, gold: p.gold - bet + Math.round(bet * 2.5) })); addLog(`${floor}F:賭けに勝った！ (+${Math.round(bet * 2.5) - bet} G)`, "gold"); }
          else { setPlayer(p => ({ ...p, gold: p.gold - bet })); addLog(`${floor}F:賭けに負けた… (-${bet} G)`, "hurt"); }
          nextFloor();
        } },
        { label: "断る", run: () => { addLog(`${floor}F:賭博師を無視した`, "info"); nextFloor(); } },
      ],
    },
    {
      key: "spring", icon: "⛲", title: "神秘の泉",
      desc: "澄んだ水が湧いている。飲むか、器に汲むか",
      choices: [
        { label: "飲む(HP全回復)", run: () => { setPlayer(p => ({ ...p, hp: stats.maxHp })); addLog(`${floor}F:泉の水でHPが全回復した`, "heal"); nextFloor(); } },
        { label: "汲んで浴びる(最大HP +12、回復なし)", run: () => { setPlayer(p => ({ ...p, maxHp: p.maxHp + 12 })); addLog(`${floor}F:泉の力で最大HPが+12された`, "gold"); nextFloor(); } },
      ],
    },
    {
      key: "statue", icon: "🗿", title: "古の彫像",
      desc: "捧げ物を求めているようだ。祈れば知恵を授かる気がする",
      choices: [
        { label: "血を捧げて祈る(HP -15%、覚醒P +1)", run: () => {
          setPlayer(p => { const dmg = Math.max(1, Math.round(stats.maxHp * 0.15)); return { ...p, hp: Math.max(1, p.hp - dmg), ap: (p.ap || 0) + 1 }; });
          addLog(`${floor}F:彫像に血を捧げ、覚醒の力(AP+1)を得た`, "gold"); nextFloor();
        } },
        { label: "通り過ぎる", run: () => { addLog(`${floor}F:彫像の前を静かに通り過ぎた`, "info"); nextFloor(); } },
      ],
    },
    {
      key: "wagon", icon: "🛒", title: "襲われた荷車",
      desc: "商人の荷車が打ち捨てられている。荷物が残っているようだ",
      choices: [
        { label: "漁る(未鑑定の装備を入手)", run: () => { addLog(`${floor}F:荷車から包みを見つけた`, "gold"); setDrop(genItem(floor, 0, null, null, { unidentified: true })); setScene("loot"); } },
        { label: "手を付けずに進む", run: () => { addLog(`${floor}F:荷車には近づかなかった`, "info"); nextFloor(); } },
      ],
    },
    {
      key: "box", icon: "📦", title: "怪しい宝箱",
      desc: "罠の気配がする…だが中身も気になる",
      choices: [
        { label: "開ける(65%で金貨 / 35%で罠)", run: () => {
          if (Math.random() < 0.65) { const g = 25 + floor * 14; setPlayer(p => ({ ...p, gold: p.gold + g })); addLog(`${floor}F:宝箱から金貨！ (+${g} G)`, "gold"); }
          else { const dmg = Math.max(1, Math.round(stats.maxHp * 0.2)); setPlayer(p => ({ ...p, hp: Math.max(1, p.hp - dmg) })); addLog(`${floor}F:罠だった！ ${dmg}ダメージ`, "hurt"); }
          nextFloor();
        } },
        { label: "開けない", run: () => { addLog(`${floor}F:宝箱には触れなかった`, "info"); nextFloor(); } },
      ],
    },
    {
      key: "altar", icon: "🕯️", title: "呪いの祭壇",
      desc: "禍々しくも神聖な祭壇。呪いを浄化する力があるらしい",
      choices: [
        { label: `呪いを1つ浄化する(${30 + floor * 10}G)`, disabled: () => player.gold < 30 + floor * 10 || !SLOT_KEYS.some(s => equip[s]?.curse), run: () => {
          const slot = SLOT_KEYS.find(s => equip[s]?.curse);
          setPlayer(p => ({ ...p, gold: p.gold - (30 + floor * 10) }));
          setEquip(eq => ({ ...eq, [slot]: { ...eq[slot], curse: null, name: eq[slot].name.replace("呪われた", "浄化された") } }));
          addLog(`${floor}F:${equip[slot].name}の呪いが浄化された`, "gold"); nextFloor();
        } },
        { label: `供物を捧げる(${50 + floor * 12}G、攻撃力 +2)`, disabled: () => player.gold < 50 + floor * 12, run: () => {
          setPlayer(p => ({ ...p, gold: p.gold - (50 + floor * 12), atk: p.atk + 2 }));
          addLog(`${floor}F:祭壇に供物を捧げ、力(攻撃+2)を得た`, "gold"); nextFloor();
        } },
        { label: "立ち去る", run: () => { addLog(`${floor}F:祭壇には近寄らなかった`, "info"); nextFloor(); } },
      ],
    },
    {
      key: "fairy", icon: "🧚", title: "迷子の妖精",
      desc: "「出口まで案内してくれたお礼に、とっておきをあげる！」(激レア遭遇)",
      choices: [
        { label: "お礼を受け取る(ランダムなレリック)", run: () => {
          const r = randomUnownedRelic(player);
          if (r && (player.relics || []).length < RELIC_CAP) {
            setPlayer(p => ({ ...p, relics: [...(p.relics || []), r.key] }));
            addLog(`${floor}F:🧚 妖精から${r.icon}${r.name}をもらった！`, "gold");
          } else {
            const g = 80 + floor * 12;
            setPlayer(p => ({ ...p, gold: p.gold + g }));
            addLog(`${floor}F:🧚 妖精から金貨袋をもらった(+${g} G)`, "gold");
          }
          SFX.relic(); nextFloor();
        } },
      ],
    },
    {
      key: "demon2", icon: "😈", title: "悪魔の再訪",
      desc: "「よう、また会ったな。あの時の器…買い戻すか?それとももっと深い取引をするか?」",
      choices: [
        { label: `器を買い戻す(${75 + floor * 10}G、最大HP +15%)`, disabled: () => player.gold < 75 + floor * 10, run: () => {
          setPlayer(p => { const back = Math.round(p.maxHp * 0.15); return { ...p, gold: p.gold - (75 + floor * 10), maxHp: p.maxHp + back, hp: Math.min(p.maxHp + back, p.hp + back), demonDeal: false }; });
          addLog(`${floor}F:悪魔から命の器を買い戻した`, "heal"); nextFloor();
        } },
        { label: "さらに深い取引(最大HP -10%、攻撃力 +7)", run: () => {
          setPlayer(p => { const cut = Math.round(p.maxHp * 0.1); return { ...p, maxHp: p.maxHp - cut, hp: Math.max(1, Math.min(p.hp, p.maxHp - cut)), atk: p.atk + 7 }; });
          addLog(`${floor}F:悪魔とさらに深い契約を結んだ…`, "hurt"); nextFloor();
        } },
        { label: "無視する", run: () => { addLog(`${floor}F:悪魔に背を向けた`, "info"); nextFloor(); } },
      ],
    },
    {
      key: "mirror", icon: "🪞", title: "魔法の鏡",
      desc: "鏡があなたの姿を映している。「その武具、より強く磨いてやろう」",
      choices: [
        { label: "装備を映す(ランダムな装備1つが+2強化)", disabled: () => !SLOT_KEYS.some(s => equip[s]), run: () => {
          const slots = SLOT_KEYS.filter(s => equip[s]);
          const slot = pick(slots);
          setEquip(eq => ({ ...eq, [slot]: { ...eq[slot], plus: (eq[slot].plus || 0) + 2 } }));
          addLog(`${floor}F:🪞 ${equip[slot].name}が磨き上げられた(+2強化)`, "gold"); nextFloor();
        } },
        { label: "鏡には触れない", run: () => { addLog(`${floor}F:鏡から目を逸らして進んだ`, "info"); nextFloor(); } },
      ],
    },
    {
      key: "duelist", icon: "🤺", title: "流浪の決闘者",
      desc: "「腕試しといこうか。俺に勝てば、報酬は倍出そう」",
      choices: [
        { label: "受けて立つ(エリート戦・ゴールド2倍)", run: () => {
          const e = genEnemy(floor, true); e.hp = e.maxHp; e.goldScale = (e.goldScale || 1) * 2;
          if (stats.startStun > 0) { applyStatus(e, "stun", 1); }
          setEnemy(e);
          regenOnCombatStart();
          setScene("combat");
          addLog(`${floor}F:🤺 決闘者との果し合いが始まった！(報酬2倍)`, "hurt");
        } },
        { label: "断る", run: () => { addLog(`${floor}F:決闘を断って先へ進んだ`, "info"); nextFloor(); } },
      ],
    },
    {
      key: "peddler", icon: "🎪", title: "怪しい行商人",
      desc: `「掘り出し物だよ。中身は開けてからのお楽しみ…1つ${35 + floor * 8}Gだ」`,
      choices: [
        ...["赤い包み", "青い包み", "黒い包み"].map(lbl => ({
          label: `${lbl}を買う(${35 + floor * 8}G・未鑑定レア以上確定)`,
          disabled: () => player.gold < 35 + floor * 8,
          run: () => {
            setPlayer(p => ({ ...p, gold: p.gold - (35 + floor * 8) }));
            setDrop(genItem(floor, 1, null, null, { unidentified: true }));
            addLog(`${floor}F:行商人から${lbl}を買った`, "gold");
            setScene("loot");
          },
        })),
        { label: "買わない", run: () => { addLog(`${floor}F:行商人を後にした`, "info"); nextFloor(); } },
      ],
    },
    {
      key: "bloodpool", icon: "🩸", title: "血の池",
      desc: "禍々しい力に満ちた池。浸かれば癒えるだろうが、武具が穢れそうだ…",
      choices: [
        { label: "浸かる(HP全回復+最大HP+10。ただし装備1つに呪いが付く)", run: () => {
          setPlayer(p => ({ ...p, maxHp: p.maxHp + 10, hp: stats.maxHp + 10 }));
          const slots = SLOT_KEYS.filter(s => equip[s] && !equip[s].curse);
          if (slots.length) {
            const slot = pick(slots);
            const c = pick(CURSES);
            setEquip(eq => ({ ...eq, [slot]: { ...eq[slot], curse: c.key, name: "呪われた" + eq[slot].name.replace("浄化された", "") } }));
            addLog(`${floor}F:🩸 池で癒えたが、${SLOTS[slot].name}に「${c.name}」が宿った…`, "hurt");
          } else {
            addLog(`${floor}F:🩸 血の池で癒えた(呪われる装備がなかった)`, "heal");
          }
          nextFloor();
        } },
        { label: "近寄らない", run: () => { addLog(`${floor}F:血の池を迂回した`, "info"); nextFloor(); } },
      ],
    },
    {
      key: "hermit", icon: "🏺", title: "隠者の試練",
      desc: "3つの壺が並んでいる。「好きなものを1つ選ぶがいい」中身は開けるまでわからない",
      choices: [
        { label: "左の壺を選ぶ", run: () => hermitRoll() },
        { label: "真ん中の壺を選ぶ", run: () => hermitRoll() },
        { label: "右の壺を選ぶ", run: () => hermitRoll() },
      ],
    },
    {
      key: "starpool", icon: "🌠", title: "星降る泉",
      desc: "泉が3つの願いを問いかけてくる。選べるのはそのうち1つだけだ",
      choices: [
        { label: "🔮 力の願い(ランダムなレリック)", run: () => {
          const r = randomUnownedRelic(player);
          if (r && (player.relics || []).length < RELIC_CAP) {
            setPlayer(p => ({ ...p, relics: [...(p.relics || []), r.key] }));
            addLog(`${floor}F:🌠 泉が${r.icon}${r.name}を授けた`, "gold");
          } else {
            const g = 100 + floor * 15;
            setPlayer(p => ({ ...p, gold: p.gold + g }));
            addLog(`${floor}F:🌠 泉が金貨を授けた (+${g} G)`, "gold");
          }
          nextFloor();
        } },
        { label: `💰 富の願い(+${80 + floor * 20} G)`, run: () => {
          const g = 80 + floor * 20;
          setPlayer(p => ({ ...p, gold: p.gold + g }));
          addLog(`${floor}F:🌠 泉が富をもたらした (+${g} G)`, "gold");
          nextFloor();
        } },
        { label: "💧 癒しの願い(HP全回復+呪い全浄化)", run: () => {
          setPlayer(p => ({ ...p, hp: stats.maxHp }));
          setEquip(eq => {
            const neq = { ...eq };
            for (const s of SLOT_KEYS) if (neq[s]?.curse) neq[s] = { ...neq[s], curse: null, name: neq[s].name.replace("呪われた", "浄化された") };
            return neq;
          });
          addLog(`${floor}F:🌠 泉の癒しで全回復し、呪いが浄化された`, "heal");
          nextFloor();
        } },
      ],
    },
    {
      key: "trainer", icon: "🏋️", title: "流浪の武術家",
      desc: "「鍛えてやろうか?本気の稽古は安くないぞ」",
      choices: [
        { label: `稽古をつけてもらう(${50 + floor * 12}G、XP +${30 + floor * 18})`, disabled: () => player.gold < 50 + floor * 12, run: () => {
          setPlayer(p => ({ ...p, gold: p.gold - (50 + floor * 12), xp: p.xp + 30 + floor * 18 }));
          addLog(`${floor}F:🏋️ 稽古で経験を積んだ (+${30 + floor * 18} XP)`, "gold"); nextFloor();
        } },
        { label: `型を見学する(無料、XP +${8 + floor * 4})`, run: () => {
          setPlayer(p => ({ ...p, xp: p.xp + 8 + floor * 4 }));
          addLog(`${floor}F:🏋️ 見取り稽古で少し学んだ (+${8 + floor * 4} XP)`, "gold"); nextFloor();
        } },
      ],
    },
    {
      key: "cursesmith", icon: "🧵", title: "呪具師",
      desc: "「呪いは毒じゃない、スパイスさ。飼いならした者から強くなる」",
      choices: [
        { label: "呪い装備を磨いてもらう(呪い装備1つが+2強化)", disabled: () => !SLOT_KEYS.some(s => equip[s]?.curse), run: () => {
          const slots = SLOT_KEYS.filter(s => equip[s]?.curse);
          const slot = pick(slots);
          setEquip(eq => ({ ...eq, [slot]: { ...eq[slot], plus: (eq[slot].plus || 0) + 2 } }));
          addLog(`${floor}F:🧵 ${equip[slot].name}が呪いごと磨き上げられた(+2強化)`, "gold"); nextFloor();
        } },
        { label: "呪いを刻んでもらう(装備1つに呪いが付くが+3強化)", disabled: () => !SLOT_KEYS.some(s => equip[s] && !equip[s].curse), run: () => {
          const slots = SLOT_KEYS.filter(s => equip[s] && !equip[s].curse);
          const slot = pick(slots);
          const c = pick(CURSES);
          setEquip(eq => ({ ...eq, [slot]: { ...eq[slot], curse: c.key, name: "呪われた" + eq[slot].name.replace("浄化された", ""), plus: (eq[slot].plus || 0) + 3 } }));
          addLog(`${floor}F:🧵 ${SLOTS[slot].name}に「${c.name}」が刻まれ、大きく強化された(+3)`, "hurt"); nextFloor();
        } },
        { label: "立ち去る", run: () => { addLog(`${floor}F:呪具師に背を向けた`, "info"); nextFloor(); } },
      ],
    },
    {
      key: "bard", icon: "🎻", title: "放浪の吟遊詩人",
      desc: "澄んだ歌声が塔に響く。聴いていると体が軽くなっていく",
      choices: [
        { label: "歌に聴き入る(HP20%回復+全スキルのCDリセット)", run: () => {
          const heal = Math.round(stats.maxHp * 0.2);
          setPlayer(p => ({ ...p, hp: Math.min(stats.maxHp, p.hp + heal) }));
          setCds({});
          addLog(`${floor}F:🎻 歌声に癒された (+${heal} HP・スキルCD全回復)`, "heal"); nextFloor();
        } },
        { label: "先を急ぐ", run: () => { addLog(`${floor}F:歌声を背に先を急いだ`, "info"); nextFloor(); } },
      ],
    },
  ];

  // 隠者の試練:3つの壺はどれを選んでも同じ確率(45%回復・35%金貨・20%ダメージ)。中身は選んだ後までわからない
  const hermitRoll = () => {
    const roll = Math.random();
    if (roll < 0.45) {
      const heal = Math.round(stats.maxHp * 0.4);
      setPlayer(p => ({ ...p, hp: Math.min(stats.maxHp, p.hp + heal) }));
      addLog(`${floor}F:🏺 壺の中身は霊薬だった！ (+${heal} HP)`, "heal");
    } else if (roll < 0.8) {
      const g = 20 + floor * 8;
      setPlayer(p => ({ ...p, gold: p.gold + g }));
      addLog(`${floor}F:🏺 壺の中身は金貨だった (+${g} G)`, "gold");
    } else {
      const dmg = Math.max(1, Math.round(stats.maxHp * 0.12));
      setPlayer(p => ({ ...p, hp: Math.max(1, p.hp - dmg) }));
      addLog(`${floor}F:🏺 壺の中身は毒霧だった！ ${dmg}ダメージ`, "hurt");
    }
    nextFloor();
  };

  const skillModPrice = Math.round((70 + floor * 18) * (1 - (stats.shopDiscount || 0) / 100) * (1 - (ACTIVE_ZONE.forgeDiscount || 0)));
  const applySkillMod = (skillKey, modKey) => {
    if (player.gold < skillModPrice) return;
    setPlayer(p => ({ ...p, gold: p.gold - skillModPrice, skillMods: { ...(p.skillMods || {}), [skillKey]: modKey } }));
    addLog(`🔨 ${SKILLS[skillKey].name}に改造[${SKILL_MODS[modKey].name}]を刻んだ (-${skillModPrice} G)`, "gold");
    setForgeSkill(null);
  };

  const potionPrice = Math.round((25 + floor * 10) * (ACTIVE_MOD.shopMult || 1) * ascFx("shopMult") * (1 - (stats.shopDiscount || 0) / 100));
  const itemPrice = Math.round((50 + floor * 20) * (ACTIVE_MOD.shopMult || 1) * ascFx("shopMult") * (1 - (stats.shopDiscount || 0) / 100));
  const buyPotion = () => {
    if (player.gold < potionPrice || player.hooks?.noPotion) return;
    setPlayer(p => ({ ...p, gold: p.gold - potionPrice, potions: p.potions + 1 }));
    addLog(`回復薬を購入した (-${potionPrice} G)`, "gold");
  };
  const buyItem = () => {
    if (player.gold < itemPrice || !shopItem) return;
    setPlayer(p => ({ ...p, gold: p.gold - itemPrice }));
    addLog(`${shopItem.name}を購入した (-${itemPrice} G)`, "gold");
    setDrop(shopItem);
    setShopItem(null);
    setScene("loot");
  };

  // 強化費用は「その装備の強化回数」で指数関数的に増える(階数には依存しない)
  const forgeCut = (1 - (stats.shopDiscount || 0) / 100) * (1 - (ACTIVE_ZONE.forgeDiscount || 0)); // 密偵の眼×地下鍛冶場の割引を合算
  const enhanceCost = Math.round((forgeSlot && equip[forgeSlot] ? Math.round(45 * Math.pow(1.35, equip[forgeSlot].plus || 0)) : 45) * forgeCut);
  const forgeCosts = { enhance: enhanceCost, affix: Math.round((60 + floor * 20) * forgeCut), reroll: Math.round((30 + floor * 12) * forgeCut) };
  const doForge = (op) => {
    const slot = forgeSlot;
    if (!slot || !equip[slot] || player.gold < forgeCosts[op]) return;
    setPlayer(p => ({ ...p, gold: p.gold - forgeCosts[op] }));
    const it = { ...equip[slot], stats: { ...equip[slot].stats } };
    let result = it;
    if (op === "enhance") {
      // 複利しない: 強化数だけ増やし、実効値はeffStatsで「基礎値×(1+10%×強化数)」に
      it.plus = (it.plus || 0) + 1;
      addLog(`${it.name}を強化した (+${it.plus}、全ステータス基礎値の+${it.plus * 10}%)`, "gold");
    } else if (op === "affix") {
      const a = pick(AFFIX_POOL);
      const v = Math.round(a.base * (1 + floor * 0.1) * (0.8 + Math.random() * 0.6));
      it.stats[a.key] = (it.stats[a.key] || 0) + v;
      addLog(`${it.name}に「${a.name} +${v}」を付与した`, "gold");
    } else {
      result = genItem(floor, 0, it.slot, it.rarity);
      addLog(`装備を錬成し直した → ${result.name}`, "gold");
    }
    setEquip(eq => ({ ...eq, [slot]: result }));
  };

  const tickCds = (used = null, extraCut = 0) => {
    const castHaste = hasNode(player, "m8") && (player.resonance || 0) >= 2 ? 1 : 0; // 詠唱の加速
    const cdCut = (hasNode(player, "m4") ? 1 : 0) + (stats.cdAll > 0 ? 1 : 0) + castHaste + (ACTIVE_ZONE.playerCdCut || 0); // 連鎖詠唱+星読みの護符+詠唱の加速+星辰の観測所
    setCds(prev => {
      const n = {};
      for (const k of player.skills) n[k] = Math.max(0, (prev[k] || 0) - 1 - extraCut);
      if (used) n[used] = Math.max(0, getSkillCd(used, player.skillMods) - cdCut - extraCut);
      return n;
    });
  };

  const performAttack = (spec, label, usedSkill = null) => {
    let e = { ...enemy, status: enemy.status ? { ...enemy.status } : undefined };
    let p = { ...player };
    if (p.petrified) p = { ...p, petrified: false }; // 石化は攻撃行動で解ける
    const mod = usedSkill ? (player.skillMods || {})[usedSkill] : null;
    const baseHits = (spec.hits || 1) + (mod === "chainMod" ? 1 : 0);
    // 暗殺者「コンボ」: 1つにつきクリ率+4%・連撃率+2%
    const combo = player.cls === "assassin" ? (p.combo || 0) : 0;
    let bonus = (player.firstFightDoubleGuaranteed && kills === 0) ? 1 : (Math.random() * 100 < stats.double + combo * 2 + (p.doubleStack || 0) ? 1 : 0);
    if (stats.noDouble > 0) bonus = 0; // 鉛の鎧(契約):連撃封印
    // 加速する連撃: 連撃が発生するたび、その戦闘中は連撃率が蓄積(最大+20%)
    if (bonus > 0 && stats.doubleSnowball > 0) {
      const before = p.doubleStack || 0;
      p.doubleStack = Math.min(20, before + stats.doubleSnowball);
    }
    // 連刃(暗殺者・型b): 連撃発動時、さらに20%でもう1撃
    if (bonus > 0 && player.cls === "assassin" && player.variant === "b" && Math.random() < 0.2) bonus++;
    // 戦士「闘志」: MAX時の攻撃は「解放」— 確定クリ・1.5倍で全消費
    const furyCap = player.variant === "b" ? 7 : 5;
    const furyRate = player.variant === "b" ? 0.08 : 0.06;
    const fury = player.cls === "warrior" ? (p.fury || 0) : 0;
    const furyRelease = player.cls === "warrior" && fury >= furyCap;
    // 魔術師「共鳴」: 保持中スキルダメ+10%/個。通常攻撃で全解放
    const reso = player.cls === "mage" ? (p.resonance || 0) : 0;
    let critLanded = false;
    let totalDmg = 0;
    let hitsDone = 0, critCount = 0;
    let reflectSum = 0; // 鏡の回廊:敵の棘の蓄積
    const enemyCCed = () => (e.status?.freeze?.turns > 0) || (e.status?.stun?.turns > 0);
    const enemyHasStatus = () => e.status && Object.values(e.status).some(v => v.turns > 0);
    const usedDefendLast = !!p.defendedLast;
    for (let i = 0; i < baseHits + bonus && e.hp > 0; i++) {
      // 霊体(亡霊):通常攻撃は25%ですり抜ける(スキルは必中)
      if (!usedSkill && e.gimmick === "ghost" && Math.random() < 0.25) {
        addLog(`🌫️ 攻撃が${e.name}をすり抜けた…(スキルなら必中)`, "info");
        continue;
      }
      // 俊足(影狼):HP25%以下になると30%で完全回避する(トドメの一撃を用意しろ)
      if (e.gimmick === "elusive" && e.hp / e.maxHp <= 0.25 && Math.random() < 0.3) {
        addLog(`🐺 ${e.name}が身をひるがえして回避した！`, "info");
        continue;
      }
      const isCrit = stats.noCrit > 0 ? false : (spec.forceCrit || furyRelease || (stats.critVsCC > 0 && enemyCCed()) || (player.cls === "assassin" && player.variant === "c" && combo >= 8) || (stats.skillAlwaysCrit > 0 && usedSkill) || (mod === "critMod" && usedSkill) || (stats.rampageCrit > 0 && i >= baseHits) || (hasNode(player, "w10") && p.tookHeavyLast) || (hasNode(player, "a9") && e.hp === e.maxHp) || Math.random() * 100 < stats.crit + combo * 4);
      if (isCrit) { critLanded = true; critCount++; }
      hitsDone++;
      let mult = spec.execute && e.hp / e.maxHp <= 0.3 ? 3.0 : spec.mult;
      if (spec.punish && (e.intent === "guard" || e.intent === "heavy")) mult = 2.5; // 月光斬:構え/大技の予告を狩る
      if (mod === "ampMod") mult *= 1.3;                                   // モッド増幅
      if (hasNode(player, "m3") && usedSkill) mult *= 1.25;               // 魔力収束:スキルダメ+25%
      if (hasRelic(player, "skillDmg") && usedSkill) mult *= 1.2;          // 賢者の石:スキルダメ+20%
      if (usedSkill && ACTIVE_ZONE.skillDmgBoost) mult *= 1 + ACTIVE_ZONE.skillDmgBoost / 100; // 静寂の書庫:スキルダメ+35%
      if (hasNode(player, "w3") && e.status?.stun?.turns > 0) mult *= 1.2; // 剛拳:気絶中の敵に+20%
      if (hasNode(player, "a4") && !usedSkill && e.hp / e.maxHp <= 0.25) mult *= 3.0; // 暗殺:瀕死に致命の一撃
      if (fury > 0) mult *= 1 + fury * furyRate;                          // 闘志:1つにつき与ダメ+
      if (furyRelease) mult *= 1.5;                                        // 解放の一撃
      if (usedSkill && reso > 0) mult *= 1 + 0.1 * reso;                   // 共鳴:スキルダメ+10%/個
      if (usedSkill && player.knowledgeStack > 0) mult *= 1 + player.knowledgeStack / 100; // 知識の蓄積(永続)
      if (stats.dmgVsStatus > 0 && enemyHasStatus()) mult *= 1 + stats.dmgVsStatus / 100; // 対状態異常
      if (usedDefendLast) mult *= 1.15;                                     // カウンターの構え(標準):防御した次のターンは与ダメ+15%
      if (usedDefendLast && stats.afterDefendDmg > 0) mult *= 1 + stats.afterDefendDmg / 100; // 防御後火力(装備・レリック)
      if (player.cls === "vampire" && player.variant === "b" && p.hp / stats.maxHp <= 0.5) mult *= 1.25; // 血の対価
      if (stats.berserk > 0) mult *= 1.25;                                  // 狂戦士の首飾り
      if (stats.bossSlayer > 0 && (e.isBoss || e.isElite)) mult *= 1 + stats.bossSlayer / 100; // 王殺しの短剣
      if (stats.executeBonus > 0 && e.hp / e.maxHp <= 0.15) mult *= 1 + stats.executeBonus / 100; // 終焉の砂時計
      if (stats.flatDmg > 0) mult *= 1 + stats.flatDmg / 100;                // 契約:与ダメ固定強化
      if (stats.basicBonus > 0 && !usedSkill) mult *= 1 + stats.basicBonus / 100; // 無音の誓い:通常攻撃強化
      if (stats.chaosDice > 0) mult *= Math.random() < 0.5 ? 1.5 : 0.66;    // 深淵の賽(契約)
      if (e.gimmick === "spellward" && usedSkill) mult *= 0.6;               // 魔法耐性(吸魔蛾)
      if (stats.gambleDmg > 0) mult *= Math.random() < 0.5 ? 1.5 : 0.7;   // 賭博師のコイン
      let dmg = Math.round((stats.atk + (p.killMomentum || 0) + rand(-1, 2)) * mult * (isCrit ? stats.critDmg / 100 : 1) * (e.trait === "tough" ? 0.75 : 1) * (e.guardTurns > 0 ? 0.5 : 1));
      if (e.gimmick === "crystalline") dmg = Math.round(dmg * (usedSkill ? 1.5 : 0.8)); // 結晶:スキルに弱く通常攻撃に強い
      if (e.gimmick === "fragile") dmg = Math.round(dmg * 1.5); // 硝子細工:被ダメ+50%(代わりに与ダメも+50%)
      // 石殻(ガーゴイル):一定未満の弱い一撃を完全に弾く
      const stoneThresh = 6 + Math.round(floor * 1.2);
      if (e.gimmick === "stoneskin" && dmg < stoneThresh) {
        addLog(`🪨 石の外殻が一撃を弾いた！(${stoneThresh}以上のダメージが必要)`, "info");
        continue;
      }
      e.hp -= dmg;
      totalDmg += dmg;
      if (e.gimmick === "mirrorimg") e.mirrorStore = dmg; // 鏡霊:直前の一撃を記憶(次の敵ターンで跳ね返す)
      if (ACTIVE_ZONE.enemyThorns && dmg > 0) reflectSum += Math.round(4 + floor * 1.2); // 鏡の回廊:敵も棘をまとう
      if (stats.goldOnHit > 0) p.gold = (p.gold || 0) + stats.goldOnHit; // 貪欲なる刃
      if (hasNode(player, "a10") && e.status?.poison?.turns > 0) e.status.poison.turns += 1; // 毒霧の残滓
      if (isCrit) {
        if (stats.critPoison > 0 && e.hp > 0) { // 会心の刺
          const pd = Math.max(1, Math.round(stats.atk * 0.25));
          applyStatus(e, "poison", 2, pd);
          addLog(`🗡️ 会心の一撃が毒を刻んだ`, "dmg");
        }
        if (stats.critGauge > 0) { // 闘気の共鳴:クリ命中でクラスゲージ+1
          if (player.cls === "warrior") { const cap = player.variant === "b" ? 7 : 5; if ((p.fury || 0) < cap) { p.fury = Math.min(cap, (p.fury || 0) + 1); addLog(`🔥 闘気の共鳴で闘志+1(${p.fury}/${cap})`, "info"); } }
          else if (player.cls === "assassin") { p.combo = Math.min(8, (p.combo || 0) + 1); addLog(`⚔️ 闘気の共鳴でコンボ+1(×${p.combo})`, "info"); }
          else if (player.cls === "vampire") { const cap = Math.round(stats.maxHp * (player.variant === "c" ? 0.4 : 0.25)); const b = p.barrier || 0; p.barrier = Math.min(cap, b + Math.round(cap * 0.05)); if (p.barrier > b) addLog(`🩸 闘気の共鳴で障壁+(${p.barrier}/${cap})`, "info"); }
          else if (player.cls === "mage") { const cap = player.variant === "c" ? 4 : 3; if ((p.resonance || 0) < cap) { p.resonance = Math.min(cap, (p.resonance || 0) + 1); addLog(`✨ 闘気の共鳴で共鳴+1(${p.resonance}/${cap})`, "info"); } }
        }
        if (stats.critRipple > 0 && Math.random() * 100 < stats.critRipple && e.hp > 0) { // 会心の波紋
          bonus++;
          addLog(`💠 会心の波紋！もう1回攻撃できる`, "gold");
        }
      }
      const hitTag = i >= baseHits ? "(連撃)" : baseHits > 1 ? `(${i + 1}撃目)` : "";
      addLog(`${label}${hitTag}！ ${isCrit ? "💥クリティカル " : ""}${dmg}ダメージ${e.guardTurns > 0 ? "(構えで軽減された)" : ""}`, "dmg");
      const lsMult = hasNode(player, "v4") ? 1.5 : 1; // 渇望:吸血回復+50%
      const healMult = 1 - (p.healReduce || 0) / 100; // 腐敗(腐敗した司祭):回復効果が弱まっている分を反映
      // 吸血鬼「血の障壁」: 吸血の余剰回復はシールドに変換(最大HPの25%まで、階をまたいで持続)
      const gainHp = (amount) => {
        const nh = p.hp + Math.max(0, Math.round(amount * healMult));
        if (player.cls === "vampire" && nh > stats.maxHp) {
          const cap = Math.round(stats.maxHp * (player.variant === "c" ? 0.4 : 0.25)); // 血盾:上限40%
          const before = p.barrier || 0;
          p.barrier = Math.min(cap, before + (nh - stats.maxHp) * 2); // 余剰の2倍が凝固する
          if (p.barrier > before) addLog(`🩸 余剰の血が障壁に(${p.barrier}/${cap})`, "heal");
        }
        p.hp = Math.min(stats.maxHp, nh);
      };
      if (stats.lifesteal > 0) gainHp(Math.max(1, Math.round(dmg * stats.lifesteal / 100 * lsMult)));
      if (stats.perHitHeal > 0) gainHp(stats.perHitHeal); // ヒット毎回復
      if (spec.healRatio) {
        const h = Math.max(1, Math.round(dmg * spec.healRatio * lsMult));
        gainHp(h);
        addLog(`HPを${h}吸収した`, "heal");
      }
    }
    if (usedDefendLast) p.defendedLast = false; // 防御後火力は1ターンで消費
    if (p.tookHeavyLast) p.tookHeavyLast = false; // 報復の構えは1回消費
    // 鏡の回廊:敵の棘が反射してきた
    if (reflectSum > 0) {
      p.hp -= reflectSum;
      addLog(`🪞 敵の棘が反射！${reflectSum}ダメージを受けた`, "hurt");
    }
    // 戦士: 解放の一撃の後処理
    if (furyRelease) {
      p.fury = hasNode(player, "w9") ? 1 : 0; // 連続解放:0にならず1残る
      addLog(`🔥 闘志解放！渾身の一撃が炸裂した`, "gold");
      if (player.variant === "a" && e.hp > 0) { applyStatus(e, "stun", 1); addLog(`💫 解放の衝撃で${e.name}は気絶した！`, "dmg"); }
    }
    // 暗殺者: ヒット数+クリティカル数だけコンボ加算
    if (player.cls === "assassin" && hitsDone > 0) {
      const before = p.combo || 0;
      p.combo = Math.min(8, before + hitsDone + critCount);
      if (p.combo > before) addLog(`⚔️ コンボ×${p.combo}${p.combo >= 8 ? "(MAX)" : ""}`, "info");
    }
    // 戦士「怒涛」(型c): 攻撃を当てるたびにも闘志が溜まる
    if (player.cls === "warrior" && player.variant === "c" && hitsDone > 0 && !furyRelease) {
      const before = p.fury || 0;
      if (before < furyCap) {
        p.fury = Math.min(furyCap, before + hitsDone);
        if (p.fury > before) addLog(`🔥 攻めて闘志が滾る(${p.fury}/${furyCap})`, "info");
      }
    }
    // 魔術師: スキルで共鳴+1、通常攻撃で全解放(魔法追撃+全CD短縮)
    let resoRelease = 0;
    if (player.cls === "mage") {
      const resoCap = player.variant === "c" ? 4 : 3; // 深奥:上限4
      if (usedSkill) {
        p.resonance = Math.min(resoCap, reso + 1);
        if (p.resonance > reso) addLog(`✨ 魔力が共鳴する(${p.resonance}/${resoCap})`, "info");
        // 知識の蓄積(m9): スキル使用のたび永続でスキルダメージ+2%(最大+20%)
        if (hasNode(player, "m9")) {
          const before = p.knowledgeStack || 0;
          p.knowledgeStack = Math.min(20, before + 2);
        }
      } else if (reso > 0 && e.hp > 0) {
        const burst = Math.round(stats.atk * 0.4 * reso);
        e.hp -= burst;
        resoRelease = reso;
        // 二重詠唱(m10): 20%の確率で共鳴を消費せず維持
        const kept = hasNode(player, "m10") && Math.random() < 0.2;
        p.resonance = kept ? reso : 0;
        addLog(`✨ 共鳴解放！魔力の奔流が${burst}ダメージ(全CD-${reso})${kept ? "(共鳴は消費されなかった！)" : ""}`, "gold");
      } else if (reso > 0) {
        resoRelease = reso;
        const kept = hasNode(player, "m10") && Math.random() < 0.2;
        p.resonance = kept ? reso : 0;
      }
    }
    // モッド効果(スキル改造)
    if (mod === "drainMod" && totalDmg > 0) {
      const h = Math.max(1, Math.round(totalDmg * 0.15));
      p.hp = Math.min(stats.maxHp, p.hp + h);
      addLog(`🩸 改造[吸血]でHP+${h}`, "heal");
    }
    if (mod === "venomMod" && e.hp > 0) {
      let pd = Math.max(1, Math.round(stats.atk * 0.35 * (1 + (stats.poisonPower || 0) / 100)));
      applyStatus(e, "poison", 2, pd);
      addLog(`🟣 改造[猛毒]が${e.name}を蝕む！`, "dmg");
    }
    if (mod === "frostMod" && e.hp > 0 && Math.random() < 0.25) {
      applyStatus(e, "freeze", 1);
      addLog(`❄️ 改造[氷結]で${e.name}が凍りついた！`, "dmg");
    }
    if (mod === "counterMod" && e.hp > 0) {
      const cDmg = dealThorns(e, false);
      if (cDmg > 0) addLog(`🌵 改造[反撃]で追加${cDmg}ダメージ`, "dmg");
    }
    // ユニーク: 落雷の指輪(クリティカル時、確率で気絶)
    if (critLanded && stats.critStun > 0 && e.hp > 0 && Math.random() * 100 < stats.critStun) {
      applyStatus(e, "stun", 1);
      addLog(`⚡ 落雷が${e.name}を撃ち抜いた！(気絶)`, "dmg");
    }
    // ユニーク: 亡者の大鎌(攻撃するたび毒)
    if (stats.alwaysPoison > 0 && e.hp > 0) {
      let pd = Math.max(1, Math.round(stats.atk * 0.3 * (1 + (stats.poisonPower || 0) / 100)));
      applyStatus(e, "poison", 2, pd);
      addLog(`🟣 大鎌の呪毒が${e.name}を蝕む…`, "dmg");
    }
    // スキル固有の状態異常付与
    if (spec.applyStatus && e.hp > 0) {
      const s = spec.applyStatus;
      let dmg = s.dmgRatio ? Math.max(1, Math.round(stats.atk * s.dmgRatio * (1 + (stats.poisonPower || 0) / 100))) : 0;
      if (s.type === "poison" && hasRelic(player, "poison")) dmg = Math.round(dmg * 1.6); // 猛毒の指輪
      let turns = s.type === "freeze" && hasNode(player, "m2") ? s.turns + 1 : s.turns;   // 絶対零度
      if (s.type === "freeze" && hasRelic(player, "freeze")) turns += 1;                  // 氷河の核
      applyStatus(e, s.type, turns, dmg);
      addLog(`${STATUS[s.type].icon} ${e.name}に${STATUS[s.type].name}を付与！`, "dmg");
    }
    // 雷撃:確率で気絶
    if (spec.stunChance && e.hp > 0 && Math.random() < spec.stunChance) {
      applyStatus(e, "stun", 1);
      addLog(`💫 雷撃で${e.name}は気絶した！`, "dmg");
    }
    // クラス passive
    if (e.hp > 0) {
      if (player.cls === "assassin" && player.variant === "a" && critLanded) {
        let pd = Math.round(stats.atk * 0.3 * (hasNode(player, "a2") ? 1.6 : 1) * (1 + (stats.poisonPower || 0) / 100));
        if (hasRelic(player, "poison")) pd = Math.round(pd * 1.6); // 猛毒の指輪
        applyStatus(e, "poison", 3, Math.max(1, pd));
        addLog(`🟣 暗殺者の猛毒が回った！`, "dmg");
      }
      if (player.cls === "warrior" && player.variant === "a" && !usedSkill && Math.random() < (hasNode(player, "w3") ? 0.5 : 0.25)) {
        applyStatus(e, "stun", 1);
        addLog(`💫 渾身の一撃で${e.name}は気絶した！`, "dmg");
      }
      if (player.cls === "mage" && player.variant === "a" && usedSkill) {
        applyStatus(e, "burn", 3);
        addLog(`🔥 魔力で${e.name}が燃え上がる！`, "dmg");
      }
    }
    SFX[critLanded ? "crit" : usedSkill ? "skill" : "attack"]();
    const critCdCut = critLanded && stats.onCritCd > 0 && Math.random() < 0.4 ? 1 : 0;
    if (critCdCut) addLog("⏳ 勢いに乗った！全スキルCD-1", "info");
    tickCds(usedSkill, critCdCut + resoRelease);
    if (e.hp <= 0) { e.directKill = true; setEnemy(e); afterKill(p, e); return; } // 直接攻撃によるトドメ(自爆の対象)
    if (e.guardTurns > 0) e.guardTurns--; // 構えはプレイヤーの攻撃1ターン分で解除
    // 反撃(リザードマン):攻撃を受けたターン、30%で即座に反撃してくる
    if (e.gimmick === "counter" && hitsDone > 0 && Math.random() < 0.3) {
      const cDmg = Math.max(1, Math.round(e.atk * enemyAtkMult(e) * 0.5 - stats.def));
      p = { ...p, hp: p.hp - cDmg };
      addLog(`⚔️ ${e.name}の即時反撃！ ${cDmg}ダメージ`, "hurt");
    }
    p = p.hp > 0 ? enemyTurn(p, e) : p;
    if (p.hp <= 0) {
      if ((p.hooks?.cheatDeath || 0) > 0 && !p.cheatDeathUsed) {
        p = { ...p, hp: 1, cheatDeathUsed: true };
        addLog(`✨ 不滅の約束が発動！死の淵から生還した`, "gold");
        SFX.levelup();
      } else {
        setEnemy({ ...e }); setPlayer(p); setBest(b => Math.max(b, floor)); awardSouls(floor, kills, false); SFX.death(); setScene("dead"); return;
      }
    }
    if (e.hp <= 0) { setEnemy({ ...e }); afterKill(p, e); return; }
    setEnemy({ ...e });
    setPlayer(p);
  };

  const castSkill = (key) => {
    if ((cds[key] || 0) > 0 || player.petrified || stats.noSkill > 0) return;
    const s = SKILLS[key];
    performAttack(s.spec, `${s.icon}${s.name}`, key);
  };

  // 防御:このターン受けるダメージ-60%。大技の予告に合わせて使うのが基本
  const useDefend = () => {
    if (stats.noDefend > 0 || player.petrified) return; // 茨の誓約/石化:防御は封じられている
    let p = { ...player, defending: true, defendedLast: true };
    if (player.cls === "warrior") {
      const fCap = player.variant === "b" ? 7 : 5;
      p.fury = Math.min(fCap, (p.fury || 0) + 2);
      addLog(`🔥 構えて闘志を練る(${p.fury}/${fCap})${p.fury >= fCap ? " — 次の攻撃で解放！" : ""}`, "info");
    }
    SFX.defend();
    addLog(`🛡️ 防御の構えを取った(このターン被ダメ${stats.betterDefend > 0 ? "-80%" : "-60%"}・次のターン与ダメ+15%)`, "info");
    let e = { ...enemy, status: enemy.status ? { ...enemy.status } : undefined };
    // 防御時凍結(氷の心臓・霜纏い)
    const freezeCh = (stats.onDefendFreezeCh || 0) + (player.cls === "mage" && player.variant === "b" ? 35 : 0);
    if (freezeCh > 0 && Math.random() * 100 < freezeCh) {
      applyStatus(e, "freeze", 1);
      addLog(`❄️ 冷気が吹き荒れ、${e.name}が凍りついた！`, "dmg");
    }
    if (e.guardTurns > 0) e.guardTurns--;
    // 棘ビルド:防御は反撃も兼ねる。敵が何をしてきたかに関わらず必ず棘が発動する
    const counterDmg = dealThorns(e, true);
    if (counterDmg > 0) addLog(`🌵 防御の構えから棘の反撃！${e.name}に${counterDmg}ダメージ`, "dmg");
    if (e.hp <= 0) { setEnemy({ ...e }); afterKill(p, e); return; }
    p = enemyTurn(p, e, true); // 棘は上で発動済みなので反応発動は抑制(二重発動防止)
    tickCds();
    if (p.hp <= 0) {
      if ((p.hooks?.cheatDeath || 0) > 0 && !p.cheatDeathUsed) {
        p = { ...p, hp: 1, cheatDeathUsed: true };
        addLog(`✨ 不滅の約束が発動！死の淵から生還した`, "gold");
        SFX.levelup();
      } else {
        setEnemy({ ...e }); setPlayer(p); setBest(b => Math.max(b, floor)); awardSouls(floor, kills, false); SFX.death(); setScene("dead"); return;
      }
    }
    if (e.hp <= 0) { setEnemy({ ...e }); afterKill(p, e); return; }
    setEnemy({ ...e });
    setPlayer(p);
  };

  const usePotion = () => {
    if (player.potions <= 0 || player.petrified) return;
    const saved = stats.potionSaveCh > 0 && Math.random() * 100 < stats.potionSaveCh; // 不朽の水筒
    let p = { ...player, potions: saved ? player.potions : player.potions - 1 };
    const heal = Math.max(1, Math.round(stats.maxHp * (ACTIVE_MOD.potionHeal || 0.4) * (1 - (p.healReduce || 0) / 100)));
    p.hp = Math.min(stats.maxHp, p.hp + heal);
    const cured = p.pPoison?.turns > 0;
    if (cured) p.pPoison = null; // 回復薬は毒も洗い流す
    SFX.potion();
    let e = { ...enemy, status: enemy.status ? { ...enemy.status } : undefined };
    // ユニーク: 錬金術師の長靴(回復量と同じダメージを敵に)
    if (stats.potionBomb > 0) {
      e.hp -= heal;
      addLog(`🧪 劇薬の飛沫が${e.name}に${heal}ダメージ！`, "dmg");
      if (e.hp <= 0) { setEnemy({ ...e }); afterKill(p, e); return; }
    }
    // 素早飲み:1戦闘に1回だけ、ターンを消費せずに飲める
    if (!p.quickDrinkUsed) {
      p.quickDrinkUsed = true;
      addLog(`⚡ 素早く回復薬を飲んだ！(+${heal} HP${cured ? "・毒も治った" : ""})ターンを消費しない(この戦闘ではもう素早く飲めない)${saved ? "♻️" : ""}`, "heal");
      setEnemy({ ...e });
      setPlayer(p);
      return;
    }
    addLog(`回復薬を飲んだ (+${heal} HP${cured ? "・毒も治った" : ""})${saved ? "♻️ 消費しなかった！" : ""}`, "heal");
    if (e.guardTurns > 0) e.guardTurns--;
    p = enemyTurn(p, e);
    tickCds();
    if (p.hp <= 0) {
      if ((p.hooks?.cheatDeath || 0) > 0 && !p.cheatDeathUsed) {
        p = { ...p, hp: 1, cheatDeathUsed: true };
        addLog(`✨ 不滅の約束が発動！死の淵から生還した`, "gold");
        SFX.levelup();
      } else {
        setEnemy({ ...e }); setPlayer(p); setBest(b => Math.max(b, floor)); awardSouls(floor, kills, false); SFX.death(); setScene("dead"); return;
      }
    }
    if (e.hp <= 0) { setEnemy({ ...e }); afterKill(p, e); return; }
    setEnemy({ ...e });
    setPlayer(p);
  };

  const equipDrop = () => {
    setEquip(eq => ({ ...eq, [drop.slot]: drop }));
    addLog(drop.identified === false ? `未鑑定のまま賭けて装備した…` : `${drop.name}を装備した`, "gold");
    setDrop(null);
    nextFloor();
  };
  const skipDrop = () => { setDrop(null); nextFloor(); };

  const identifyPrice = Math.round((20 + floor * 10) * (1 - (stats.shopDiscount || 0) / 100));
  const identifyDrop = () => {
    if (!drop || drop.identified !== false || player.gold < identifyPrice) return;
    setPlayer(p => ({ ...p, gold: p.gold - identifyPrice }));
    setDrop(d => ({ ...d, identified: true }));
    addLog(`鑑定した (-${identifyPrice} G)`, "gold");
  };

  const unlockNode = (node) => {
    if ((player.ap || 0) < 1 || hasNode(player, node.key)) return;
    if (node.req && !hasNode(player, node.req)) return;
    if (node.exclusiveWith && hasNode(player, node.exclusiveWith)) return; // 反対側を既に取っていたら不可
    let p = { ...player, ap: player.ap - 1, tree: [...(player.tree || []), node.key] };
    if (node.exclusiveWith) p.blockedNodes = [...(p.blockedNodes || []), node.exclusiveWith]; // 反対側を永久ロック
    if (node.stat) p = node.stat(p);
    setPlayer(p);
    addLog(`✨ クラスアビリティ「${node.name}」を覚醒！${node.exclusiveWith ? "(反対の特化は選べなくなった)" : ""}`, "gold");
  };

  const toggleSkillEquip = (key) => {
    setPlayer(p => {
      const isEquipped = p.skills.includes(key);
      if (isEquipped) {
        if (p.skills.length <= 1) return p; // 最低1つは装備が必要
        return { ...p, skills: p.skills.filter(k => k !== key) };
      }
      if (p.skills.length >= 3) return p; // 装備は最大3つ
      return { ...p, skills: [...p.skills, key] };
    });
    setCds(c => ({ ...c, [key]: 0 })); // 入れ替え時にCDをリセット
  };

  const choosePerk = (perk) => {
    let p = perk.apply(player);
    const fullMax = totalStats(p, equip).maxHp; // 装備ボーナス込みの最大HPで判定
    p.hp = Math.min(fullMax, p.hp + 15);
    setPlayer(p);
    addLog(`Lv${p.level}！「${perk.name}」を習得`, "gold");
    setPerkChoices([]);
    const dropChance = enemy.isBoss || enemy.isElite || enemy.gimmick === "mimic" || enemy.arenaStage === 2 ? 1 : 0.55 + (ACTIVE_MOD.dropBonus || 0);
    if (Math.random() < dropChance) {
      const guaranteed = enemy.isBoss || enemy.isElite || enemy.gimmick === "mimic" || enemy.arenaStage === 2;
      const d = genItem(floor, guaranteed ? 1 : 0, null, null, { unidentified: !guaranteed && Math.random() < 0.18 });
      setDrop(d);
      SFX[d.ability ? "unique" : "drop"]();
      setScene("loot");
    } else nextFloor(p);
  };

  const btnStyle = (disabled, accent = "#b45309") => ({
    flex: 1, padding: "12px 6px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 14,
    background: disabled ? "#292524" : accent, color: disabled ? "#57534e" : "#fef3c7",
    cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
  });

  const wrap = {
    minHeight: "100vh", background: "#0c0a09", color: "#e7e5e4", padding: 16,
    fontFamily: "'Hiragino Sans', 'Noto Sans JP', sans-serif", maxWidth: 480, margin: "0 auto",
  };

  const SLOT_NAMES = Object.fromEntries(SLOT_KEYS.map(k => [k, SLOTS[k].name]));
  const statusBtn = (
    <button onClick={() => setShowStatus(true)}
      style={{ background: "#1c1917", border: "1px solid #44403c", color: "#fbbf24", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
      📊 ステータス
    </button>
  );

  // ラン中どの画面でも右上からステータスを開ける固定ボタン
  const statusFab = (
    <button onClick={() => setShowStatus(true)}
      style={{ position: "fixed", top: 12, right: 12, zIndex: 40, background: "#1c1917", border: "1px solid #57534e", color: "#e7e5e4", borderRadius: 8, padding: "7px 12px", fontSize: 14, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>📊</button>
  );
  const statusOverlay = !showStatus ? null : (
    <div style={{ position: "fixed", inset: 0, background: "#0a0807", zIndex: 50, overflowY: "auto", padding: 16 }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", position: "sticky", top: 0, marginBottom: -8 }}>
          <button onClick={() => setShowStatus(false)}
            style={{ background: "#1c1917", border: "1px solid #44403c", color: "#e7e5e4", borderRadius: 6, width: 32, height: 32, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
        </div>
        <h2 style={{ color: "#fbbf24", fontSize: 18, fontWeight: 800, textAlign: "center", marginTop: 0, marginBottom: 2 }}>📊 ステータス Lv{player.level}</h2>
        <div style={{ textAlign: "center", fontSize: 12, marginBottom: 4 }}>
          <span style={{ color: "#c084fc", fontWeight: 700 }}>✨AP:{player.ap || 0}</span>
        </div>
        <div style={{ textAlign: "center", color: CLASSES[player.cls]?.color || "#a8a29e", fontSize: 13, marginTop: -6, marginBottom: 6 }}>
          {CLASSES[player.cls]?.icon} {CLASSES[player.cls]?.name}〈型:{(CLASS_VARIANTS[player.cls] || []).find(v => v.key === (player.variant || "a"))?.name || "-"}〉　<span style={{ color: DIFFICULTIES[player.diff || "normal"].color }}>{DIFFICULTIES[player.diff || "normal"].icon}{DIFFICULTIES[player.diff || "normal"].name}</span>
        </div>
        {(player.mod && player.mod !== "none") || player.blessing || (player.ascension || []).length > 0 ? (
          <div style={{ marginBottom: 12 }}>
            {(player.ascension || []).length > 0 && (
              <div style={{ textAlign: "center", fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: "#c084fc", fontWeight: 700 }}>🌑深淵の彼方×{player.ascension.length}:{player.ascension.map(k => ASCENSION_MAP[k]?.name).filter(Boolean).join("・")}</span>
              </div>
            )}
            {player.mod && player.mod !== "none" && (
              <div style={{ textAlign: "center", fontSize: 12, marginBottom: player.blessing ? 4 : 0 }}>
                <span style={{ color: "#c4b5fd", fontWeight: 700 }}>世界:{getMod(player.mod).icon}{getMod(player.mod).name}</span>
                <span style={{ color: "#78716c" }}> — {getMod(player.mod).desc}</span>
              </div>
            )}
            {player.blessing && (
              <div style={{ textAlign: "center", fontSize: 12 }}>
                <span style={{ color: "#fbbf24", fontWeight: 700 }}>祝福:{BLESSINGS.find(b => b.key === player.blessing)?.icon}{BLESSINGS.find(b => b.key === player.blessing)?.name}</span>
                <span style={{ color: "#78716c" }}> — {BLESSINGS.find(b => b.key === player.blessing)?.desc}</span>
              </div>
            )}
          </div>
        ) : <div style={{ marginBottom: 6 }} />}
        <div style={{ background: "#161210", border: "1px solid #292524", borderRadius: 10, padding: 12, marginBottom: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px 18px", fontSize: 13 }}>
          {[["⚔️ 攻撃力", stats.atk], ["🛡️ 防御力", stats.def], ["❤️ 最大HP", stats.maxHp], ["💥 クリ率", stats.crit + "%"], ["🔥 クリ倍率", stats.critDmg + "%"], ["🩸 吸血", stats.lifesteal + "%"], ["⚡ 連撃率", stats.double + "%"], ["🌵 棘", thornsEffective(stats)]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#a8a29e" }}>{k}</span><span style={{ fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ color: "#fbbf24", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
          レリック <span style={{ color: "#78716c", fontWeight: 400, fontSize: 12 }}>({(player.relics || []).length}/{RELIC_CAP}枠・全{RELICS.length}種)</span>
        </div>
        {(player.relics || []).length === 0 ? (
          <div style={{ color: "#57534e", fontSize: 12, marginBottom: 14 }}>まだ無し。ボスを倒すと手に入る</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {(player.relics || []).map(rk => {
              const r = RELIC_MAP[rk];
              return (
                <div key={rk} style={{ background: "#161210", border: "1px solid #c084fc", borderRadius: 8, padding: "6px 8px", fontSize: 11, color: "#e7e5e4" }}>
                  <span style={{ marginRight: 4 }}>{r.icon}</span>{r.name}<span style={{ color: "#a8a29e" }}>:{r.desc}</span>
                </div>
              );
            })}
          </div>
        )}
        {/* 装備由来の固有能力一覧(Ver.20〜追加。どの装備の何が効いているか一目で確認できるように) */}
        {(() => {
          const equippedAbilities = SLOT_KEYS.map(sk => equip[sk]).filter(it => it && it.ability).map(it => ({ item: it, ability: ABILITY_MAP[it.ability] })).filter(x => x.ability);
          return (
            <>
              <div style={{ color: "#fbbf24", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                ✦ 固有能力 <span style={{ color: "#78716c", fontWeight: 400, fontSize: 12 }}>(装備由来)</span>
              </div>
              {equippedAbilities.length === 0 ? (
                <div style={{ color: "#57534e", fontSize: 12, marginBottom: 14 }}>まだ無し。装備にランダムで付くことがある</div>
              ) : (
                <div style={{ marginBottom: 14 }}>
                  {equippedAbilities.map(({ item, ability }, i) => (
                    <div key={i} style={{ background: "#161210", border: "1px solid #f97316", borderRadius: 8, padding: "6px 8px", fontSize: 11, color: "#e7e5e4", marginBottom: 5 }}>
                      <span style={{ color: "#f97316", fontWeight: 700 }}>{ability.name}</span>
                      <span style={{ color: "#78716c" }}> ({SLOTS[item.slot]?.name}:{item.name})</span>
                      <div style={{ color: "#a8a29e" }}>{ability.desc}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          );
        })()}
        <div style={{ color: "#fbbf24", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
          装備スキル({player.skills.length}/3) <span style={{ color: "#78716c", fontWeight: 400, fontSize: 12 }}>他{(player.knownSkills || player.skills).length - player.skills.length}個習得済み・分岐路でツリーから編成変更可</span>
        </div>
        {stats.noSkill > 0 ? (
          <div style={{ background: "#161210", border: "1px solid #44403c", borderRadius: 8, padding: 10, marginBottom: 6, color: "#a8a29e", fontSize: 12 }}>
            🤐 無音の誓いによりスキルは封印されている(通常攻撃に集中するビルド)
          </div>
        ) : player.skills.map(k => {
          const s = SKILLS[k];
          return (
            <div key={k} style={{ background: "#161210", border: "1px solid #292524", borderRadius: 8, padding: 10, marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{s.icon} {s.name} <span style={{ color: "#78716c", fontWeight: 400 }}>CD{s.cd}</span></div>
              <div style={{ fontSize: 12, color: "#a8a29e" }}>{s.desc}</div>
            </div>
          );
        })}
        <div style={{ color: "#fbbf24", fontWeight: 700, fontSize: 14, margin: "14px 0 6px" }}>装備</div>
        {SLOT_KEYS.map(s => equip[s] ? (
          <div key={s} style={{ display: "flex", marginBottom: 8 }}>
            <ItemCard item={equip[s]} label={SLOT_NAMES[s]} />
          </div>
        ) : (
          <div key={s} style={{ border: "1px dashed #44403c", borderRadius: 10, padding: 10, color: "#57534e", fontSize: 12, marginBottom: 8 }}>
            {SLOT_NAMES[s]}:未装備
          </div>
        ))}
        <button onClick={() => setShowStatus(false)} style={{ ...btnStyle(false), width: "100%", marginTop: 10 }}>閉じる</button>
      </div>
    </div>
  );

  // ===== タイトル =====
  if (scene === "title") return (
    <div style={{ ...wrap, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 8 }}>⚔️</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fbbf24", margin: "0 0 4px", letterSpacing: 2 }}>深淵の塔</h1>
      <p style={{ color: "#a8a29e", fontSize: 13, marginBottom: 6 }}>装備を拾い、ビルドを組み、どこまで潜れるか</p>
      <p style={{ color: "#57534e", fontSize: 12, marginBottom: 6 }}>5階ごとにボス出現・死んでも魂は残る</p>
      <p style={{ color: "#a8a29e", fontSize: 12, marginBottom: 28 }}>🎯 目標:20階の最終ボス撃破でクリア</p>
      <p style={{ color: "#b45309", fontSize: 12, marginBottom: 16, fontWeight: 700 }}>Ver.39 — レリック報酬3択化・修練の間(スキル習得を分離)・契約とクラスの相性調整</p>
      {best > 0 && <p style={{ color: "#fbbf24", fontSize: 13, marginBottom: 8 }}>🏆 最高到達：{best}F{best >= FINAL_FLOOR ? " ⭐CLEAR" : ""}</p>}
      <p style={{ color: "#c4b5fd", fontSize: 13, marginBottom: 16 }}>👻 深淵の魂:{meta.souls}</p>
      <button onClick={() => { setPendingAscension([]); setScene("classSelect"); }} style={{ ...btnStyle(false), flex: "none", padding: "14px 48px", fontSize: 16, marginBottom: 10 }}>挑戦する</button>
      {(meta.best || 0) >= FINAL_FLOOR && (
        <button onClick={() => setScene("ascendSelect")} style={{ ...btnStyle(false, "#1c1917"), border: "1px solid #7c3aed", flex: "none", padding: "12px 48px", fontSize: 14, marginBottom: 10 }}>🌑 深淵の彼方</button>
      )}
      <button onClick={() => setScene("altar")} style={{ ...btnStyle(false, "#5b21b6"), flex: "none", padding: "12px 48px", fontSize: 14, marginBottom: 10 }}>👻 魂の祭壇(恒久強化)</button>
      <button onClick={() => setScene("codex")} style={{ ...btnStyle(false, "#164e63"), flex: "none", padding: "12px 48px", fontSize: 14, marginBottom: 10 }}>📖 図鑑</button>
      <button onClick={toggleMute} style={{ background: "none", border: "1px solid #44403c", color: "#a8a29e", borderRadius: 8, padding: "8px 20px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{muted ? "🔇 サウンドOFF" : "🔊 サウンドON"}</button>
    </div>
  );

  // ===== 魂の祭壇(メタ進行:恒久アンロック) =====
  if (scene === "altar") return (
    <div style={wrap}>
      <h2 style={{ color: "#c4b5fd", textAlign: "center", fontSize: 20, fontWeight: 800 }}>👻 魂の祭壇</h2>
      <p style={{ textAlign: "center", color: "#a8a29e", fontSize: 12, marginBottom: 4 }}>ランで集めた魂を捧げ、恒久的な力を得る。死んでも失われない</p>
      <p style={{ textAlign: "center", color: "#c4b5fd", fontSize: 15, fontWeight: 800, marginBottom: 14 }}>所持:{meta.souls} 魂</p>
      {META_UPGRADES.map(u => {
        const owned = metaOwned(u.key);
        const maxed = owned >= u.max;
        const canBuy = !maxed && meta.souls >= u.cost;
        return (
          <button key={u.key} onClick={() => buyMeta(u)} disabled={!canBuy}
            style={{ display: "block", width: "100%", textAlign: "left", background: maxed ? "#0f1c10" : "#161210", border: `1px solid ${maxed ? "#4ade80" : canBuy ? "#7c3aed" : "#292524"}`, borderRadius: 10, padding: 12, marginBottom: 8, cursor: canBuy ? "pointer" : "default", color: maxed ? "#4ade80" : canBuy ? "#e7e5e4" : "#57534e", fontFamily: "inherit" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{u.icon} {u.name} {u.max > 1 ? `(${owned}/${u.max})` : owned > 0 ? "✓" : ""}</span>
              <span style={{ fontSize: 13, color: maxed ? "#4ade80" : "#c4b5fd", flexShrink: 0 }}>{maxed ? "MAX" : `${u.cost}魂`}</span>
            </div>
            <div style={{ fontSize: 12, color: maxed ? "#86efac" : "#a8a29e" }}>{u.desc}</div>
          </button>
        );
      })}
      <button onClick={() => setScene("title")} style={{ ...btnStyle(false, "#44403c"), width: "100%", marginTop: 6 }}>タイトルへ戻る</button>
    </div>
  );

  // ===== 深淵の彼方(プレステージ:好きな特性を好きな数だけ積んで挑む) =====
  if (scene === "ascendSelect") return (
    <div style={wrap}>
      <h2 style={{ color: "#c084fc", textAlign: "center", fontSize: 20, fontWeight: 800 }}>🌑 深淵の彼方</h2>
      <p style={{ textAlign: "center", color: "#a8a29e", fontSize: 12, marginBottom: 4 }}>特性を好きな数だけ選んで積む。積んだ数だけ塔は厳しくなるが、獲得できる魂も増える</p>
      <p style={{ textAlign: "center", color: "#c084fc", fontSize: 14, fontWeight: 800, marginBottom: 14 }}>選択中:{pendingAscension.length}個{pendingAscension.length > 0 ? `(魂+${pendingAscension.length * 15}%)` : ""}</p>
      {ASCENSIONS.map(a => {
        const active = pendingAscension.includes(a.key);
        return (
          <button key={a.key} onClick={() => setPendingAscension(cur => active ? cur.filter(k => k !== a.key) : [...cur, a.key])}
            style={{ display: "block", width: "100%", textAlign: "left", background: active ? "#1f0d2e" : "#161210", border: `1px solid ${active ? "#c084fc" : "#292524"}`, boxShadow: active ? "0 0 14px rgba(192,132,252,0.35)" : "none", borderRadius: 10, padding: 12, marginBottom: 8, cursor: "pointer", color: "#e7e5e4", fontFamily: "inherit" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: active ? "#c084fc" : "#e7e5e4" }}>{a.icon} {a.name}</span>
              <span style={{ fontSize: 16 }}>{active ? "✅" : "⬜"}</span>
            </div>
            <div style={{ fontSize: 12, color: "#a8a29e" }}>{a.desc}</div>
          </button>
        );
      })}
      <button onClick={() => setScene("classSelect")} style={{ ...btnStyle(false, "#7c3aed"), width: "100%", marginTop: 10 }}>この設定で挑む</button>
      <button onClick={() => { setPendingAscension([]); setScene("title"); }} style={{ ...btnStyle(false, "#44403c"), width: "100%", marginTop: 8 }}>タイトルへ戻る</button>
    </div>
  );

  // ===== 図鑑(コレクション):敵・レリック・固有能力の発見状況を記録する。プレイに影響しない収集要素 =====
  if (scene === "codex") {
    const knownEnemies = new Set(meta.codex?.enemies || []);
    const knownRelics = new Set(meta.codex?.relics || []);
    const knownAbilities = new Set(meta.codex?.abilities || []);
    const Section = ({ title, color, total, known, children }) => (
      <div style={{ marginBottom: 20 }}>
        <div style={{ color, fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{title} <span style={{ color: "#78716c", fontWeight: 400, fontSize: 12 }}>({known}/{total})</span></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{children}</div>
      </div>
    );
    const Chip = ({ found, icon, name, desc, color }) => (
      <div style={{ background: "#161210", border: `1px solid ${found ? color : "#292524"}`, borderRadius: 8, padding: "6px 10px", fontSize: 11, color: found ? "#e7e5e4" : "#44403c", minWidth: 120 }}>
        <div style={{ fontWeight: 700 }}>{found ? icon : "？"} {found ? name : "未発見"}</div>
        {found && desc && <div style={{ color: "#a8a29e", marginTop: 2 }}>{desc}</div>}
      </div>
    );
    return (
      <div style={wrap}>
        <h2 style={{ color: "#5eead4", textAlign: "center", fontSize: 20, fontWeight: 800 }}>📖 図鑑</h2>
        <p style={{ textAlign: "center", color: "#a8a29e", fontSize: 12, marginBottom: 16 }}>これまでのランで出会った敵・手にしたレリック・見つけた固有能力の記録</p>
        <Section title="👹 敵図鑑" color="#f87171" total={ENEMIES.length} known={ENEMIES.filter(e => knownEnemies.has(e.name)).length}>
          {ENEMIES.map(e => <Chip key={e.name} found={knownEnemies.has(e.name)} icon={e.icon} name={e.name} desc={GIMMICKS[e.gimmick]?.name} color="#f87171" />)}
        </Section>
        <Section title="👑 ボス図鑑" color="#fbbf24" total={ALL_BOSSES.length} known={ALL_BOSSES.filter(e => knownEnemies.has(e.name)).length}>
          {ALL_BOSSES.map(e => <Chip key={e.name} found={knownEnemies.has(e.name)} icon={e.icon} name={e.name} color="#fbbf24" />)}
        </Section>
        <Section title="💠 レリック図鑑" color="#c084fc" total={RELICS.length} known={RELICS.filter(r => knownRelics.has(r.key)).length}>
          {RELICS.map(r => <Chip key={r.key} found={knownRelics.has(r.key)} icon={r.icon} name={r.name} desc={r.desc} color="#c084fc" />)}
        </Section>
        <Section title="✦ 固有能力図鑑" color="#f97316" total={ABILITIES.length} known={ABILITIES.filter(a => knownAbilities.has(a.key)).length}>
          {ABILITIES.map(a => <Chip key={a.key} found={knownAbilities.has(a.key)} icon={a.name[0]} name={a.name} desc={a.desc} color="#f97316" />)}
        </Section>
        <button onClick={() => setScene("title")} style={{ ...btnStyle(false, "#44403c"), width: "100%", marginTop: 6 }}>タイトルへ戻る</button>
      </div>
    );
  }

  // ===== クラス選択 =====
  if (scene === "classSelect") return (
    <div style={wrap}>
      <h2 style={{ color: "#fbbf24", textAlign: "center", fontSize: 20, fontWeight: 800 }}>クラスを選べ</h2>
      <p style={{ textAlign: "center", color: "#a8a29e", fontSize: 13, marginBottom: 16 }}>職業ごとに初期能力・専用スキル・状態異常との相性が違う</p>
      {Object.entries(CLASSES).map(([k, c]) => (
        <button key={k} onClick={() => { setPendingClass(k); setScene("variantSelect"); }}
          style={{ display: "block", width: "100%", textAlign: "left", background: "#161210", border: `1px solid ${c.color}`, borderRadius: 10, padding: 14, marginBottom: 10, cursor: "pointer", color: "#e7e5e4", fontFamily: "inherit" }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: c.color }}>{c.icon} {c.name}</div>
          <div style={{ fontSize: 13, color: "#a8a29e", margin: "2px 0 4px" }}>{c.desc}</div>
          <div style={{ fontSize: 12, color: c.color }}>パッシブ:{c.passive}　/　初期スキル:{SKILLS[c.skill].icon}{SKILLS[c.skill].name}</div>
        </button>
      ))}
      <button onClick={() => setScene("title")} style={{ ...btnStyle(false, "#44403c"), width: "100%", marginTop: 4 }}>戻る</button>
    </div>
  );

  // ===== クラスの型選択(パッシブ2択) =====
  if (scene === "variantSelect") {
    const cls = CLASSES[pendingClass || "warrior"];
    const variants = CLASS_VARIANTS[pendingClass || "warrior"];
    return (
      <div style={wrap}>
        <h2 style={{ color: cls.color, textAlign: "center", fontSize: 20, fontWeight: 800 }}>{cls.icon} {cls.name}の型を選べ</h2>
        <p style={{ textAlign: "center", color: "#a8a29e", fontSize: 13, marginBottom: 16 }}>パッシブ能力が変わる。ビルドの起点になる選択</p>
        {variants.map(v => (
          <button key={v.key} onClick={() => { setPendingVariant(v.key); setScene("diffSelect"); }}
            style={{ display: "block", width: "100%", textAlign: "left", background: "#161210", border: `1px solid ${cls.color}`, borderRadius: 10, padding: 14, marginBottom: 10, cursor: "pointer", color: "#e7e5e4", fontFamily: "inherit" }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: cls.color }}>型:{v.name}</div>
            <div style={{ fontSize: 13, color: "#a8a29e" }}>{v.desc}</div>
          </button>
        ))}
        <button onClick={() => setScene("classSelect")} style={{ ...btnStyle(false, "#44403c"), width: "100%", marginTop: 4 }}>クラス選択に戻る</button>
      </div>
    );
  }

  // ===== 難易度選択 =====
  if (scene === "diffSelect") return (
    <div style={wrap}>
      <h2 style={{ color: "#fbbf24", textAlign: "center", fontSize: 20, fontWeight: 800 }}>難易度を選べ</h2>
      <p style={{ textAlign: "center", color: "#a8a29e", fontSize: 13, marginBottom: 16 }}>
        {pendingClass ? `${CLASSES[pendingClass].icon}${CLASSES[pendingClass].name}` : ""} で挑戦。難しいほど報酬とレア装備の確率が上がる
      </p>
      {Object.values(DIFFICULTIES).map(d => (
        <button key={d.key} onClick={() => {
          setPendingDiff(d.key);
          setRunModKey(pick(MODIFIERS).key);
          const normals = BLESSINGS.filter(b => !b.keystone && (!b.locked || metaOwned(b.locked) > 0)).sort(() => Math.random() - 0.5).slice(0, 2);
          const banned = KEYSTONE_EXCLUDE[pendingClass || "warrior"] || []; // クラスの根幹と矛盾する契約は候補に出さない
          const ks = pick(BLESSINGS.filter(b => b.keystone && !banned.includes(b.key)));
          setBlessingChoices([...normals.map(b => b.key), ks.key]);
          setScene("blessing");
        }}
          style={{ display: "block", width: "100%", textAlign: "left", background: "#161210", border: `1px solid ${d.color}`, borderRadius: 10, padding: 14, marginBottom: 10, cursor: "pointer", color: "#e7e5e4", fontFamily: "inherit" }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: d.color }}>{d.icon} {d.name}</div>
          <div style={{ fontSize: 13, color: "#a8a29e" }}>{d.desc}</div>
        </button>
      ))}
      <button onClick={() => setScene("classSelect")} style={{ ...btnStyle(false, "#44403c"), width: "100%", marginTop: 4 }}>クラス選択に戻る</button>
    </div>
  );

  // ===== 祝福選択(ラン開始時の3択) =====
  if (scene === "blessing") {
    const mod = getMod(runModKey);
    return (
      <div style={wrap}>
        <h2 style={{ color: "#fbbf24", textAlign: "center", fontSize: 20, fontWeight: 800 }}>✨ 出発の祝福</h2>
        <div style={{ background: mod.key === "none" ? "#161210" : "#1a1024", border: `1px solid ${mod.key === "none" ? "#292524" : "#7c3aed"}`, borderRadius: 10, padding: 12, marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#78716c", marginBottom: 2 }}>今回の世界</div>
          <div style={{ fontWeight: 800, fontSize: 16, color: mod.key === "none" ? "#a8a29e" : "#c4b5fd" }}>{mod.icon} {mod.name}</div>
          <div style={{ fontSize: 12, color: "#a8a29e" }}>{mod.desc}</div>
        </div>
        <p style={{ textAlign: "center", color: "#a8a29e", fontSize: 13, marginBottom: 12 }}>祝福を1つ選んで塔に挑む。<span style={{ color: "#fb7185" }}>【契約】</span>はルールを書き換える禁断の力</p>
        {blessingChoices.map(bk => {
          const b = BLESSINGS.find(x => x.key === bk);
          const ks = b.keystone;
          return (
            <button key={bk} onClick={() => { setPendingBlessing(bk); setOriginChoices([...ORIGINS].sort(() => Math.random() - 0.5).slice(0, 3).map(o => o.key)); setScene("origin"); }}
              style={{ display: "block", width: "100%", textAlign: "left", background: ks ? "#1f0d12" : "#161210", border: `1px solid ${ks ? "#fb7185" : "#fbbf24"}`, boxShadow: ks ? "0 0 14px rgba(251,113,133,0.3)" : "none", borderRadius: 10, padding: 14, marginBottom: 10, cursor: "pointer", color: "#e7e5e4", fontFamily: "inherit" }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: ks ? "#fb7185" : "#fbbf24" }}>{b.icon} {b.name}</div>
              <div style={{ fontSize: 13, color: "#a8a29e" }}>{b.desc}</div>
            </button>
          );
        })}
      </div>
    );
  }

  // ===== 出自選択(ビルドの起点。固有装備+ドロップ傾向が決まる) =====
  if (scene === "origin") {
    return (
      <div style={wrap}>
        <h2 style={{ color: "#5eead4", textAlign: "center", fontSize: 20, fontWeight: 800 }}>🧭 出自を選べ</h2>
        <p style={{ textAlign: "center", color: "#a8a29e", fontSize: 13, marginBottom: 16 }}>あなたが歩んできた道。固有装備を持ち、以後その系統の装備が出やすくなる</p>
        {originChoices.map(ok => {
          const o = ORIGINS.find(x => x.key === ok);
          return (
            <button key={ok} onClick={() => startRun(pendingClass || "warrior", pendingDiff || "normal", pendingBlessing, runModKey, pendingVariant, ok, pendingAscension)}
              style={{ display: "block", width: "100%", textAlign: "left", background: "#101816", border: "1px solid #5eead4", borderRadius: 10, padding: 14, marginBottom: 10, cursor: "pointer", color: "#e7e5e4", fontFamily: "inherit" }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#5eead4" }}>{o.icon} {o.name}</div>
              <div style={{ fontSize: 13, color: "#a8a29e" }}>{o.desc}</div>
            </button>
          );
        })}
        <button onClick={() => startRun(pendingClass || "warrior", pendingDiff || "normal", pendingBlessing, runModKey, pendingVariant, null, pendingAscension)}
          style={{ ...btnStyle(false, "#44403c"), width: "100%", marginTop: 4 }}>手ぶらで挑む(出自なし)</button>
      </div>
    );
  }

  // ===== ゾーン分岐(5階ごとに次の環境を選ぶ) =====
  if (scene === "zoneSelect") {
    return (
      <div style={wrap}>
        <h2 style={{ color: "#c4b5fd", textAlign: "center", fontSize: 20, fontWeight: 800 }}>🌀 {floor}F — 道が二手に分かれている</h2>
        <p style={{ textAlign: "center", color: "#a8a29e", fontSize: 13, marginBottom: 4 }}>これから5階の間、選んだ環境のルールが世界を支配する</p>
        <p style={{ textAlign: "center", color: "#57534e", fontSize: 11, marginBottom: 16 }}>現在:{ZONES[zoneKey]?.icon}{ZONES[zoneKey]?.name}　HP {Math.max(0, player.hp)}/{stats.maxHp}</p>
        {zoneChoices.map(zk => {
          const z = ZONES[zk];
          return (
            <button key={zk} onClick={() => chooseZone(zk)}
              style={{ display: "block", width: "100%", textAlign: "left", background: "#14101c", border: "1px solid #7c3aed", borderRadius: 10, padding: 16, marginBottom: 10, cursor: "pointer", color: "#e7e5e4", fontFamily: "inherit" }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: "#c4b5fd" }}>{z.icon} {z.name}</div>
              <div style={{ fontSize: 13, color: "#a8a29e", marginTop: 2 }}>{z.desc}</div>
            </button>
          );
        })}
      </div>
    );
  }

  // ===== 勝利(20階クリア) =====
  if (scene === "victory") return (
    <div style={{ ...wrap, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 8 }}>👑</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: "#fbbf24", margin: "0 0 4px" }}>制 覇 ！</h1>
      <p style={{ color: "#a8a29e", fontSize: 14, marginBottom: 20 }}>深淵の魔王を打ち倒し、塔の頂きに到達した</p>
      <div style={{ background: "#161210", border: "1px solid #b45309", borderRadius: 10, padding: 16, marginBottom: 24, width: "100%" }}>
        <div style={{ fontSize: 14, marginBottom: 6 }}>クリアタイム:<span style={{ color: "#fbbf24", fontWeight: 700 }}> 20F 制覇</span>　<span style={{ color: DIFFICULTIES[player.diff || "normal"].color }}>{DIFFICULTIES[player.diff || "normal"].icon}{DIFFICULTIES[player.diff || "normal"].name}</span></div>
        <div style={{ fontSize: 14, marginBottom: 6, color: "#c4b5fd" }}>獲得した魂:<span style={{ fontWeight: 700 }}> +{soulsGained} 👻</span></div>
        <div style={{ fontSize: 14, marginBottom: 6 }}>撃破数:<span style={{ fontWeight: 700 }}> {kills}体</span></div>
        <div style={{ fontSize: 14 }}>最終レベル:<span style={{ fontWeight: 700 }}> Lv{player.level}</span></div>
      </div>
      <p style={{ color: "#78716c", fontSize: 12, marginBottom: 14 }}>ここから先はエンドレスモード。敵が指数関数的に強くなる、どこまで行ける？</p>
      <button onClick={() => nextFloor()} style={{ ...btnStyle(false, "#7c2d12"), flex: "none", padding: "14px 36px", fontSize: 15, marginBottom: 10 }}>さらに深く潜る ▶</button>
      <button onClick={() => setScene("title")} style={{ ...btnStyle(false, "#44403c"), flex: "none", padding: "12px 36px", fontSize: 14 }}>タイトルへ戻る</button>
    </div>
  );

  // ===== レリック選択(ボス/エリート報酬。未所持から3択) =====
  if (scene === "relicChoice" && relicChoices.length > 0) return (
    <div style={wrap}>
      {statusOverlay}{statusFab}
      <p style={{ color: "#c084fc", fontSize: 13, fontWeight: 700, textAlign: "center", marginBottom: 4 }}>✨ レリックを発見！</p>
      <p style={{ color: "#a8a29e", fontSize: 12, textAlign: "center", marginBottom: 14 }}>1つ選んで持ち帰る(永続効果・所持枠 {(player.relics || []).length}/{RELIC_CAP})</p>
      {relicChoices.map(rk => {
        const r = RELIC_MAP[rk];
        return (
          <button key={rk} onClick={() => chooseRelic(rk)}
            style={{ display: "block", width: "100%", textAlign: "left", background: "#161210", border: "1px solid #c084fc", boxShadow: "0 0 14px rgba(192,132,252,0.25)", borderRadius: 10, padding: 14, marginBottom: 10, cursor: "pointer", color: "#e7e5e4", fontFamily: "inherit" }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#c084fc" }}>{r.icon} {r.name}</div>
            <div style={{ fontSize: 13, color: "#a8a29e" }}>{r.desc}</div>
          </button>
        );
      })}
      <button onClick={declineRelicChoice} style={{ ...btnStyle(false, "#44403c"), width: "100%", marginTop: 6 }}>どれも取らずに進む</button>
    </div>
  );

  // ===== 修練の間(スキル習得の3択) =====
  if (scene === "dojo") {
    const known = player.knownSkills || player.skills;
    const learnSkill = (k) => {
      setSkillChoices([]);
      setPlayer(p => {
        const nk = [...(p.knownSkills || p.skills), k];
        const eq = p.skills.length < 3 ? [...p.skills, k] : p.skills;
        return { ...p, knownSkills: nk, skills: eq };
      });
      SFX.levelup();
      addLog(`${floor}F:📖 修練の間で「${SKILLS[k].icon}${SKILLS[k].name}」を習得した${player.skills.length >= 3 ? "(装備枠満杯のため習得のみ。ツリー画面で入れ替え可)" : ""}`, "gold");
      nextFloor();
    };
    return (
      <div style={wrap}>
        {statusOverlay}{statusFab}
        <h2 style={{ color: "#fbbf24", textAlign: "center", fontSize: 20, fontWeight: 800 }}>📖 {floor}F — 修練の間</h2>
        <p style={{ textAlign: "center", color: "#a8a29e", fontSize: 13, marginBottom: 4 }}>老師範が技を見せてくれる。学ぶのは1つだけだ</p>
        <p style={{ textAlign: "center", color: "#78716c", fontSize: 12, marginBottom: 14 }}>習得枠 {known.length}/{SKILL_CAP}・スキル装備枠 {player.skills.length}/3</p>
        {skillChoices.map(k => {
          const s = SKILLS[k];
          return (
            <button key={k} onClick={() => learnSkill(k)}
              style={{ display: "block", width: "100%", textAlign: "left", background: "#161210", border: "1px solid #b45309", borderRadius: 10, padding: 14, marginBottom: 10, cursor: "pointer", color: "#e7e5e4", fontFamily: "inherit" }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#fbbf24" }}>{s.icon} {s.name} <span style={{ color: "#78716c", fontWeight: 400, fontSize: 12 }}>CD{s.cd}</span></div>
              <div style={{ fontSize: 13, color: "#a8a29e" }}>{s.desc}</div>
            </button>
          );
        })}
        <button onClick={() => { setSkillChoices([]); addLog(`${floor}F:修練の間を後にした`, "info"); nextFloor(); }}
          style={{ ...btnStyle(false, "#44403c"), width: "100%", marginTop: 6 }}>何も学ばずに進む</button>
      </div>
    );
  }

  // ===== レリック入れ替え(所持上限に達している場合) =====
  if (scene === "relicSwap" && relicGot) return (
    <div style={wrap}>
      {statusOverlay}{statusFab}
      <p style={{ color: "#c084fc", fontSize: 13, fontWeight: 700, textAlign: "center", marginBottom: 4 }}>✨ 新しいレリックを発見！</p>
      <p style={{ color: "#a8a29e", fontSize: 12, textAlign: "center", marginBottom: 14 }}>所持枠が満杯({RELIC_CAP}/{RELIC_CAP})。誰かと入れ替えるか、見送るか</p>
      <div style={{ background: "#161210", border: "1px solid #c084fc", boxShadow: "0 0 16px rgba(192,132,252,0.35)", borderRadius: 10, padding: 14, marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 4 }}>{relicGot.icon}</div>
        <div style={{ fontWeight: 800, color: "#c084fc", fontSize: 16 }}>{relicGot.name}</div>
        <div style={{ fontSize: 13, color: "#e7e5e4", marginTop: 2 }}>{relicGot.desc}</div>
      </div>
      <p style={{ color: "#78716c", fontSize: 12, marginBottom: 8 }}>手放して入れ替える:</p>
      {(player.relics || []).map(rk => {
        const r = RELIC_MAP[rk];
        return (
          <button key={rk} onClick={() => swapRelic(rk)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left", background: "#161210", border: "1px solid #44403c", borderRadius: 10, padding: 12, marginBottom: 8, cursor: "pointer", color: "#e7e5e4", fontFamily: "inherit" }}>
            <span><span style={{ fontWeight: 700, fontSize: 13 }}>{r.icon} {r.name}</span><span style={{ fontSize: 11, color: "#a8a29e" }}> {r.desc}</span></span>
            <span style={{ fontSize: 11, color: "#f87171", flexShrink: 0, marginLeft: 8 }}>入替</span>
          </button>
        );
      })}
      <button onClick={declineRelic} style={{ ...btnStyle(false, "#44403c"), width: "100%", marginTop: 6 }}>見送る(今のままにする)</button>
    </div>
  );

  // ===== 死亡 =====
  if (scene === "dead") return (
    <div style={{ ...wrap, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 8 }}>💀</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: "#ef4444", margin: "0 0 16px" }}>力尽きた…</h1>
      <div style={{ background: "#161210", border: "1px solid #292524", borderRadius: 10, padding: 16, marginBottom: 24, width: "100%" }}>
        <div style={{ fontSize: 14, marginBottom: 6 }}>到達階：<span style={{ color: "#fbbf24", fontWeight: 700 }}>{floor}F</span>　<span style={{ color: DIFFICULTIES[player.diff || "normal"].color }}>{DIFFICULTIES[player.diff || "normal"].icon}{DIFFICULTIES[player.diff || "normal"].name}</span></div>
        <div style={{ fontSize: 14, marginBottom: 6, color: "#c4b5fd" }}>獲得した魂:<span style={{ fontWeight: 700 }}> +{soulsGained} 👻</span>(祭壇で恒久強化に使える)</div>
        <div style={{ fontSize: 14, marginBottom: 6 }}>撃破数：<span style={{ fontWeight: 700 }}>{kills}体</span></div>
        <div style={{ fontSize: 14 }}>レベル：<span style={{ fontWeight: 700 }}>Lv{player.level}</span></div>
      </div>
      <button onClick={() => setScene("classSelect")} style={{ ...btnStyle(false), flex: "none", padding: "14px 48px", fontSize: 16, marginBottom: 10 }}>再挑戦</button>
      <button onClick={() => setScene("altar")} style={{ ...btnStyle(false, "#5b21b6"), flex: "none", padding: "12px 48px", fontSize: 14 }}>👻 魂の祭壇へ({meta.souls}魂)</button>
    </div>
  );

  // ===== レベルアップ =====
  if (scene === "levelup") return (
    <div style={wrap}>
      {statusOverlay}{statusFab}
      <h2 style={{ color: "#fbbf24", textAlign: "center", fontSize: 20, fontWeight: 800 }}>✨ レベルアップ！ Lv{player.level}</h2>
      <p style={{ textAlign: "center", color: "#a8a29e", fontSize: 13, marginBottom: 16 }}>強化を1つ選んでください</p>
      {perkChoices.map(perk => (
        <button key={perk.key} onClick={() => choosePerk(perk)}
          style={{ display: "block", width: "100%", textAlign: "left", background: "#161210", border: "1px solid #44403c", borderRadius: 10, padding: 14, marginBottom: 10, cursor: "pointer", color: "#e7e5e4", fontFamily: "inherit" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#fbbf24" }}>{perk.name}</div>
          <div style={{ fontSize: 13, color: "#a8a29e" }}>{perk.desc}</div>
        </button>
      ))}
    </div>
  );

  // ===== 戦利品 =====
  if (scene === "loot" && drop) {
    const current = equip[drop.slot];
    const mystery = drop.identified === false;
    return (
      <div style={wrap}>
      {statusOverlay}{statusFab}
        <h2 style={{ color: "#fbbf24", textAlign: "center", fontSize: 20, fontWeight: 800 }}>💰 戦利品ドロップ！</h2>
        <div style={{ display: "flex", gap: 10, margin: "16px 0" }}>
          <ItemCard item={drop} label="NEW" />
          {current ? <ItemCard item={current} label="装備中" /> : (
            <div style={{ flex: 1, border: "1px dashed #44403c", borderRadius: 10, padding: 12, color: "#57534e", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>
              この部位は未装備
            </div>
          )}
        </div>
        {mystery ? (
          <>
            <p style={{ textAlign: "center", color: "#c4b5fd", fontSize: 12, marginTop: -6, marginBottom: 10 }}>
              未鑑定アイテム。鑑定して中身を見るか、賭けてそのまま装備するか
            </p>
            <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
              <button onClick={identifyDrop} disabled={player.gold < identifyPrice} style={btnStyle(player.gold < identifyPrice, "#7c3aed")}>
                🔮 鑑定する ({identifyPrice}G)
              </button>
              <button onClick={equipDrop} style={btnStyle(false, "#b45309")}>🎲 賭けて装備</button>
            </div>
            <button onClick={skipDrop} style={{ ...btnStyle(false, "#44403c"), width: "100%" }}>捨てて進む</button>
          </>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={equipDrop} style={btnStyle(false, "#15803d")}>装備する</button>
            <button onClick={skipDrop} style={btnStyle(false, "#44403c")}>捨てて進む</button>
          </div>
        )}
      </div>
    );
  }

  // ===== 鍛冶屋 =====
  if (scene === "forge") {
    const equipped = SLOT_KEYS.filter(s => equip[s]);
    const FORGE_OPS = [
      { op: "enhance", icon: "🔨", name: "強化", desc: "全ステータス+10%(基礎値基準・費用は強化回数で増加)" },
      { op: "affix", icon: "✨", name: "付与", desc: "ランダムな追加効果を1つ付ける" },
      { op: "reroll", icon: "🎲", name: "錬成", desc: "同レアリティで作り直す(現在の階の強さで再抽選)" },
    ];
    return (
      <div style={wrap}>
      {statusOverlay}{statusFab}
        <h2 style={{ color: "#fbbf24", textAlign: "center", fontSize: 20, fontWeight: 800 }}>🔨 {floor}F — 鍛冶屋</h2>
        <p style={{ textAlign: "center", color: "#a8a29e", fontSize: 13, marginBottom: 16 }}>
          「鍛えたい装備を選びな。所持金 <span style={{ color: "#fbbf24" }}>{player.gold} G</span>」
        </p>
        {equipped.length === 0 ? (
          <p style={{ textAlign: "center", color: "#57534e", fontSize: 13, marginBottom: 16 }}>装備がない…出直そう</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
              {equipped.map(s => {
                const it = equip[s];
                const rc = RARITIES[it.rarity].color;
                return (
                  <button key={s} onClick={() => setForgeSlot(s)}
                    style={{ background: "#161210", border: `1px solid ${forgeSlot === s ? "#fbbf24" : rc}`, outline: forgeSlot === s ? "1px solid #fbbf24" : "none", borderRadius: 8, padding: "8px 4px", cursor: "pointer", fontFamily: "inherit", color: rc, fontSize: 12, fontWeight: 700 }}>
                    {SLOTS[s].name}{it.plus ? `+${it.plus}` : ""}
                  </button>
                );
              })}
            </div>
            {forgeSlot && <div style={{ display: "flex", marginBottom: 12 }}><ItemCard item={equip[forgeSlot]} label="選択中" /></div>}
          </>
        )}
        {forgeSlot && FORGE_OPS.map(({ op, icon, name, desc }) => {
          const cost = forgeCosts[op];
          const ok = player.gold >= cost;
          return (
            <button key={op} onClick={() => doForge(op)} disabled={!ok}
              style={{ display: "block", width: "100%", textAlign: "left", background: "#161210", border: "1px solid #44403c", borderRadius: 10, padding: 12, marginBottom: 8, cursor: ok ? "pointer" : "default", color: ok ? "#e7e5e4" : "#57534e", fontFamily: "inherit" }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{icon} {name} — {cost} G</div>
              <div style={{ fontSize: 12, color: "#a8a29e" }}>{desc}</div>
            </button>
          );
        })}
        {/* スキル改造(無音の誓い中は封印されているため非表示) */}
        {!(stats.noSkill > 0) && (
        <div style={{ borderTop: "1px solid #292524", marginTop: 14, paddingTop: 12 }}>
          <div style={{ color: "#c084fc", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>🔮 スキル改造 — {skillModPrice} G</div>
          <div style={{ fontSize: 12, color: "#a8a29e", marginBottom: 8 }}>装備スキルにモッドを1つ刻める(上書き可)。改造したいスキルを選択:</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            {player.skills.map(k => {
              const cur = (player.skillMods || {})[k];
              const sel = forgeSkill === k;
              return (
                <button key={k} onClick={() => setForgeSkill(sel ? null : k)}
                  style={{ background: sel ? "#2a1a3e" : "#161210", border: `1px solid ${sel ? "#c084fc" : "#44403c"}`, color: "#e7e5e4", borderRadius: 8, padding: "8px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                  {SKILLS[k].icon}{SKILLS[k].name}{cur ? ` [${SKILL_MODS[cur].icon}${SKILL_MODS[cur].name}]` : ""}
                </button>
              );
            })}
          </div>
          {forgeSkill && Object.entries(SKILL_MODS).map(([mk, m]) => {
            const ok = player.gold >= skillModPrice;
            const cur = (player.skillMods || {})[forgeSkill] === mk;
            return (
              <button key={mk} onClick={() => applySkillMod(forgeSkill, mk)} disabled={!ok || cur}
                style={{ display: "block", width: "100%", textAlign: "left", background: cur ? "#0f1c10" : "#161210", border: `1px solid ${cur ? "#4ade80" : "#44403c"}`, borderRadius: 10, padding: 10, marginBottom: 6, cursor: ok && !cur ? "pointer" : "default", color: cur ? "#4ade80" : ok ? "#e7e5e4" : "#57534e", fontFamily: "inherit" }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{m.icon} {m.name}{cur ? "(刻印済み)" : ""}</span>
                <span style={{ fontSize: 12, color: "#a8a29e" }}> {m.desc}</span>
              </button>
            );
          })}
        </div>
        )}
        <button onClick={() => { setForgeSlot(null); setForgeSkill(null); nextFloor(); }} style={{ ...btnStyle(false, "#44403c"), width: "100%", marginTop: 6 }}>店を出て進む</button>
      </div>
    );
  }

  // ===== ショップ =====
  if (scene === "shop") return (
    <div style={wrap}>
      {statusOverlay}{statusFab}
      <h2 style={{ color: "#fbbf24", textAlign: "center", fontSize: 20, fontWeight: 800 }}>🏪 {floor}F — 商人</h2>
      <p style={{ textAlign: "center", color: "#a8a29e", fontSize: 13, marginBottom: 16 }}>
        「いらっしゃい。所持金は <span style={{ color: "#fbbf24" }}>{player.gold} G</span> だね」
      </p>
      <button onClick={buyPotion} disabled={player.gold < potionPrice}
        style={{ display: "block", width: "100%", textAlign: "left", background: "#161210", border: "1px solid #44403c", borderRadius: 10, padding: 14, marginBottom: 10, cursor: player.gold >= potionPrice ? "pointer" : "default", color: player.gold >= potionPrice ? "#e7e5e4" : "#57534e", fontFamily: "inherit" }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>🧪 回復薬 — {potionPrice} G</div>
        <div style={{ fontSize: 13, color: "#a8a29e" }}>何個でも購入できる(現在 ×{player.potions})</div>
      </button>
      {shopItem && (
        <div style={{ marginBottom: 10 }}>
          <ItemCard item={shopItem} label={`装備品 — ${itemPrice} G`} />
          <button onClick={buyItem} disabled={player.gold < itemPrice}
            style={{ ...btnStyle(player.gold < itemPrice, "#15803d"), width: "100%", marginTop: 8 }}>
            購入する
          </button>
        </div>
      )}
      <button onClick={() => { setShopItem(null); nextFloor(); }} style={{ ...btnStyle(false, "#44403c"), width: "100%" }}>店を出て進む</button>
    </div>
  );

  // ===== スキルツリー =====
  if (scene === "tree") {
    const cls = CLASSES[player.cls];
    const nodes = TREES[player.cls] || [];
    return (
      <div style={wrap}>
      {statusOverlay}{statusFab}
        <h2 style={{ color: cls.color, textAlign: "center", fontSize: 20, fontWeight: 800 }}>🌳 {cls.icon} {cls.name}のスキルツリー</h2>
        <p style={{ textAlign: "center", color: "#a8a29e", fontSize: 13, marginBottom: 4 }}>クラスアビリティを覚醒Pで解放(開始時+1、ボス/エリート撃破・彫像でも獲得)</p>
        <p style={{ textAlign: "center", fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
          <span style={{ color: "#c084fc" }}>✨覚醒P:{player.ap || 0}</span>
        </p>
        <p style={{ color: "#60a5fa", fontSize: 13, fontWeight: 700, margin: "4px 0 6px" }}>
          装備スキル({player.skills.length}/3)・習得 {(player.knownSkills || player.skills).length}/{SKILL_CAP} <span style={{ color: "#78716c", fontWeight: 400 }}>タップで入れ替え</span>
        </p>
        {stats.noSkill > 0 && <p style={{ color: "#a8a29e", fontSize: 12, marginBottom: 8 }}>🤐 無音の誓いによりスキルは使用不可(編成のみ可能)</p>}
        <div style={{ marginBottom: 14 }}>
          {(player.knownSkills || player.skills).map(k => {
            const s = SKILLS[k];
            const equipped = player.skills.includes(k);
            const disabledUnequip = equipped && player.skills.length <= 1;
            const disabledEquip = !equipped && player.skills.length >= 3;
            return (
              <button key={k} onClick={() => toggleSkillEquip(k)} disabled={disabledUnequip || disabledEquip}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left", background: equipped ? "#0f1a24" : "#161210", border: `1px solid ${equipped ? "#60a5fa" : "#44403c"}`, borderRadius: 10, padding: 10, marginBottom: 6, cursor: (disabledUnequip || disabledEquip) ? "default" : "pointer", color: "#e7e5e4", fontFamily: "inherit", opacity: disabledEquip ? 0.5 : 1 }}>
                <span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: equipped ? "#60a5fa" : "#e7e5e4" }}>{s.icon} {s.name}</span>
                  <span style={{ fontSize: 11, color: "#78716c" }}> CD{s.cd}・{s.desc}</span>
                </span>
                <span style={{ fontSize: 11, color: equipped ? "#60a5fa" : "#57534e", flexShrink: 0, marginLeft: 8 }}>{equipped ? "装備中" : "未装備"}</span>
              </button>
            );
          })}
        </div>
        <p style={{ color: cls.color, fontSize: 13, fontWeight: 700, margin: "4px 0 6px" }}>✨ クラスアビリティ <span style={{ color: "#78716c", fontWeight: 400 }}>(覚醒Pで解放・ボス/エリート撃破で獲得)</span></p>
        {nodes.map(node => {
          const owned = hasNode(player, node.key);
          const blocked = (player.blockedNodes || []).includes(node.key);
          const locked = (node.req && !hasNode(player, node.req)) || blocked;
          const canBuy = !owned && !locked && (player.ap || 0) >= 1;
          return (
            <button key={node.key} onClick={() => unlockNode(node)} disabled={!canBuy}
              style={{ display: "block", width: "100%", textAlign: "left", background: owned ? "#0f1c10" : "#161210", border: `1px solid ${owned ? "#4ade80" : blocked ? "#7f1d1d" : locked ? "#292524" : canBuy ? cls.color : "#44403c"}`, borderRadius: 10, padding: 12, marginBottom: 8, cursor: canBuy ? "pointer" : "default", color: locked ? "#57534e" : "#e7e5e4", fontFamily: "inherit" }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: owned ? "#4ade80" : blocked ? "#f87171" : cls.color }}>
                {owned ? "✓ " : blocked ? "🔒 " : ""}{node.name}
                {node.req ? `（要:${nodes.find(n => n.key === node.req)?.name}）` : ""}
                {node.exclusiveWith ? `（${nodes.find(n => n.key === node.exclusiveWith)?.name}と排他）` : ""}
              </div>
              <div style={{ fontSize: 12, color: blocked ? "#a35252" : "#a8a29e" }}>{blocked ? "反対の特化を選んだため、もう解放できません" : node.desc}</div>
            </button>
          );
        })}
        <button onClick={() => setScene("path")} style={{ ...btnStyle(false, "#44403c"), width: "100%", marginTop: 12 }}>戻る</button>
      </div>
    );
  }

  // ===== ？？？イベント選択(7種からランダム) =====
  if (scene === "eventChoice") {
    const ev = EVENTS.find(e => e.key === currentEvent) || EVENTS[0];
    return (
      <div style={{ ...wrap, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      {statusOverlay}{statusFab}
        <div style={{ fontSize: 48, marginBottom: 8 }}>{ev.icon}</div>
        <h2 style={{ color: "#c4b5fd", fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{ev.title}</h2>
        <p style={{ color: "#a8a29e", fontSize: 13, marginBottom: 8, maxWidth: 320 }}>{ev.desc}</p>
        <p style={{ color: "#57534e", fontSize: 11, marginBottom: 20 }}>HP {Math.max(0, player.hp)}/{stats.maxHp}　💰{player.gold} G</p>
        {ev.choices.map((c, i) => {
          const dis = c.disabled ? c.disabled() : false;
          return (
            <button key={i} onClick={() => { if (!dis) c.run(); }} disabled={dis}
              style={{ ...btnStyle(dis, i === ev.choices.length - 1 ? "#44403c" : "#7c3aed"), flex: "none", padding: "13px 20px", fontSize: 14, marginBottom: 10, width: "100%" }}>
              {c.label}
            </button>
          );
        })}
      </div>
    );
  }

  // ===== 分岐路 =====
  if (scene === "path") return (
    <div style={wrap}>
      {statusOverlay}{statusFab}
      <h2 style={{ color: "#fbbf24", textAlign: "center", fontSize: 20, fontWeight: 800 }}>🗺️ {floor}F {zoneKey !== "entrance" && <span style={{ color: "#c4b5fd", fontSize: 14 }}>{ZONES[zoneKey]?.icon}{ZONES[zoneKey]?.name}</span>}</h2>
      <p style={{ textAlign: "center", color: "#a8a29e", fontSize: 13, marginBottom: 4 }}>{ACTIVE_MOD.hidePaths ? "🌁 霧が濃い…どの道に何があるかわからない" : "道が分かれている。進む先を選べ"}</p>
      {(floor + 1) % 5 === 0 && (
        <p style={{ textAlign: "center", color: "#f87171", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
          ⚠️ この先 {floor + 1}F は{floor + 1 === FINAL_FLOOR ? "最終ボス" : "ボス"}。ここで準備を整えよう
        </p>
      )}
      <div style={{ textAlign: "center", color: "#57534e", fontSize: 11, marginBottom: 4 }}>
        HP {Math.max(0, player.hp)} / {stats.maxHp}　🧪×{player.potions}　💰{player.gold} G
      </div>
      {(player.mod && player.mod !== "none") || player.blessing || (player.ascension || []).length > 0 ? (
        <div style={{ textAlign: "center", fontSize: 11, marginBottom: 8 }}>
          {(player.ascension || []).length > 0 && (
            <div style={{ color: "#c084fc" }}>
              <span style={{ fontWeight: 700 }}>🌑深淵の彼方×{player.ascension.length}</span>
              <span style={{ color: "#78716c" }}> — {player.ascension.map(k => ASCENSION_MAP[k]?.name).filter(Boolean).join("・")}</span>
            </div>
          )}
          {player.mod && player.mod !== "none" && (
            <div style={{ color: "#c4b5fd" }}>
              <span style={{ fontWeight: 700 }}>{getMod(player.mod).icon} {getMod(player.mod).name}</span>
              <span style={{ color: "#78716c" }}> — {getMod(player.mod).desc}</span>
            </div>
          )}
          {player.blessing && (
            <div style={{ color: "#fbbf24" }}>
              <span style={{ fontWeight: 700 }}>{BLESSINGS.find(b => b.key === player.blessing)?.icon} {BLESSINGS.find(b => b.key === player.blessing)?.name}</span>
              <span style={{ color: "#78716c" }}> — {BLESSINGS.find(b => b.key === player.blessing)?.desc}</span>
            </div>
          )}
        </div>
      ) : <div style={{ marginBottom: 8 }} />}
      <div style={{ textAlign: "center", marginBottom: 14, display: "flex", gap: 8, justifyContent: "center" }}>
        {statusBtn}
        <button onClick={() => setScene("tree")}
          style={{ background: "#1c1917", border: `1px solid ${player.ap > 0 ? "#c084fc" : "#44403c"}`, color: player.ap > 0 ? "#c084fc" : "#a8a29e", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
          🌳 スキルツリー{player.ap > 0 ? ` (AP:${player.ap || 0})` : ""}
        </button>
      </div>
      {pathOptions.map((room, ri) => (
        <button key={room.key} onClick={() => chooseRoom(room)}
          style={{ display: "block", width: "100%", textAlign: "left", background: "#161210", border: "1px solid #44403c", borderRadius: 10, padding: 14, marginBottom: 10, cursor: "pointer", color: "#e7e5e4", fontFamily: "inherit" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#fbbf24" }}>{ACTIVE_MOD.hidePaths ? `🌁 霧の道 ${["Ⅰ", "Ⅱ", "Ⅲ"][ri] || ri + 1}` : `${room.icon} ${room.name}`}</div>
          <div style={{ fontSize: 13, color: "#a8a29e" }}>{ACTIVE_MOD.hidePaths ? "何が待つかは、進んでみるまでわからない" : room.desc}</div>
        </button>
      ))}
      {(floor + 1) % 5 === 0 && (
        <p style={{ textAlign: "center", color: "#b45309", fontSize: 12 }}>
          {floor + 1 === FINAL_FLOOR ? "👑 次は最終ボス！" : "⚠️ 次の階はボス"}
        </p>
      )}
      {floor > FINAL_FLOOR && <p style={{ textAlign: "center", color: "#7c2d12", fontSize: 11, marginTop: 4 }}>🌑 エンドレス {floor - FINAL_FLOOR}層目・敵が急速に強化されている</p>}
    </div>
  );

  // ===== 戦闘 =====
  const xpNeed = Math.round((15 + player.level * 9) * (player.discountNextLevel ? 0.5 : 1));
  return (
    <div style={wrap}>
      {statusOverlay}
      {/* ヘッダー(狭い画面でも単語の途中で折れないよう、項目ごとにチップ化してwrapする) */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "4px 8px", marginBottom: 6 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 6px" }}>
          <span style={{ color: enemy && enemy.isFinal ? "#f87171" : "#fbbf24", fontWeight: 800, fontSize: 18, whiteSpace: "nowrap" }}>{floor}F{floor > FINAL_FLOOR ? " 🌑" : ""}</span>
          <span style={{ color: DIFFICULTIES[player.diff || "normal"].color, fontSize: 11, whiteSpace: "nowrap" }}>{DIFFICULTIES[player.diff || "normal"].icon}{DIFFICULTIES[player.diff || "normal"].name}</span>
          {zoneKey !== "entrance" && <span style={{ color: "#c4b5fd", fontSize: 11, whiteSpace: "nowrap" }}>{ZONES[zoneKey]?.icon}{ZONES[zoneKey]?.name}</span>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px" }}>
          <span style={{ color: "#78716c", fontSize: 12, whiteSpace: "nowrap" }}>Lv{player.level}</span>
          <span style={{ color: "#78716c", fontSize: 12, whiteSpace: "nowrap" }}>XP {player.xp}/{xpNeed}</span>
          <span style={{ color: "#78716c", fontSize: 12, whiteSpace: "nowrap" }}>💰{player.gold}</span>
          {(player.ap || 0) > 0 && <span style={{ color: "#c084fc", fontSize: 12, whiteSpace: "nowrap" }}>✨{player.ap}</span>}
          <button onClick={toggleMute} style={{ background: "#1c1917", border: "1px solid #44403c", color: "#e7e5e4", borderRadius: 6, width: 30, height: 30, fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>{muted ? "🔇" : "🔊"}</button>
          {statusBtn}
        </div>
      </div>
      {(player.mod && player.mod !== "none") || player.blessing || (player.ascension || []).length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
          {(player.ascension || []).length > 0 && (
            <div style={{ fontSize: 11, color: "#e9d5ff", background: "#1f0d2e", border: "1px solid #c084fc", borderRadius: 6, padding: "3px 8px" }}>
              <span style={{ fontWeight: 700 }}>🌑 深淵の彼方×{player.ascension.length}</span>
              <span style={{ color: "#a8a29e" }}> — {player.ascension.map(k => ASCENSION_MAP[k]?.name).filter(Boolean).join("・")}</span>
            </div>
          )}
          {player.mod && player.mod !== "none" && (
            <div style={{ fontSize: 11, color: "#c4b5fd", background: "#1a1024", border: "1px solid #7c3aed", borderRadius: 6, padding: "3px 8px" }}>
              <span style={{ fontWeight: 700 }}>{getMod(player.mod).icon} {getMod(player.mod).name}</span>
              <span style={{ color: "#a8a29e" }}> — {getMod(player.mod).desc}</span>
            </div>
          )}
          {player.blessing && (
            <div style={{ fontSize: 11, color: "#fbbf24", background: "#1c1608", border: "1px solid #b45309", borderRadius: 6, padding: "3px 8px" }}>
              <span style={{ fontWeight: 700 }}>{BLESSINGS.find(b => b.key === player.blessing)?.icon} {BLESSINGS.find(b => b.key === player.blessing)?.name}</span>
              <span style={{ color: "#a8a29e" }}> — {BLESSINGS.find(b => b.key === player.blessing)?.desc}</span>
            </div>
          )}
        </div>
      ) : null}

      {/* 敵 */}
      {enemy && (
        <div style={{ background: enemy.isFinal ? "#2a0a0a" : enemy.isBoss ? "#1c1007" : "#161210", border: `1px solid ${enemy.isFinal ? "#dc2626" : enemy.isBoss ? "#b45309" : "#292524"}`, boxShadow: enemy.isFinal ? "0 0 22px rgba(220,38,38,0.4)" : "none", borderRadius: 10, padding: 14, marginBottom: 12, textAlign: "center" }}>
          {enemy.isFinal && <div style={{ color: "#f87171", fontSize: 12, fontWeight: 700, marginBottom: 2 }}>― 最 終 ボ ス ―</div>}
          {enemy.arenaStage && <div style={{ color: "#fb923c", fontSize: 12, fontWeight: 700, marginBottom: 2 }}>🏟️ 闘技場 — {enemy.arenaStage}/2戦目</div>}
          <div style={{ fontSize: 40 }}>{enemy.icon}</div>
          <div style={{ fontWeight: 700, color: enemy.isBoss ? "#fbbf24" : "#e7e5e4", marginBottom: 6 }}>
            {enemy.isBoss && "👑 "}{enemy.name}
          </div>
          {enemy.trait && (
            <div style={{ fontSize: 11, color: "#c4b5fd", border: "1px solid #7c3aed", borderRadius: 4, padding: "2px 8px", display: "inline-block", marginBottom: 6 }}>
              {ELITE_TRAITS[enemy.trait].icon} {ELITE_TRAITS[enemy.trait].name}:{ELITE_TRAITS[enemy.trait].desc}
            </div>
          )}
          {enemy.gimmick && GIMMICKS[enemy.gimmick] && (
            <div style={{ fontSize: 11, color: "#fdba74", border: "1px solid #ea580c", borderRadius: 4, padding: "2px 8px", display: "inline-block", marginBottom: 6, marginLeft: enemy.trait ? 4 : 0 }}>
              {GIMMICKS[enemy.gimmick].icon} {GIMMICKS[enemy.gimmick].name}:{GIMMICKS[enemy.gimmick].desc}
            </div>
          )}
          {enemy.cursedByShaman && (
            <div style={{ fontSize: 11, color: "#f87171", marginBottom: 4 }}>🪶 呪詛纏い(攻撃+20%)</div>
          )}
          {enemy.gimmick === "slow" && enemy.resting && (
            <div style={{ fontSize: 11, color: "#60a5fa", marginBottom: 4 }}>🤖 次のターンは充填で動けない</div>
          )}
          <Bar cur={enemy.hp} max={enemy.maxHp} color="#dc2626" />
          <div style={{ fontSize: 11, color: "#78716c", marginTop: 4 }}>{Math.max(0, enemy.hp)} / {enemy.maxHp}　攻撃 {Math.round(enemy.atk * enemyAtkMult(enemy))}{enemyAtkMult(enemy) > 1 ? "↑" : ""}</div>
          {/* 行動予告(インテント) */}
          {enemy.intent && (() => {
            const it = INTENTS[enemy.intent];
            const hitsEst = enemy.intent === "flurry" ? 3 : enemy.trait === "swift" && enemy.intent === "attack" ? 2 : 1;
            const gimmickMult = (enemy.gimmick === "fragile" ? 1.5 : 1) * (enemy.gimmick === "burrow" && enemy.burrowedNext ? 1.6 : 1);
            const estDmg = Math.max(1, Math.round(enemy.atk * enemyAtkMult(enemy) * (it.mult || 1) * gimmickMult - stats.def)) * hitsEst;
            const arcaneHeavy = enemy.gimmick === "arcane" && enemy.intent === "heavy";
            const estDef = Math.max(1, Math.round(estDmg * (arcaneHeavy ? 0.7 : 0.4)));
            const isThreat = ["attack", "heavy", "venom", "flurry"].includes(enemy.intent);
            const col = enemy.intent === "heavy" ? "#f87171" : enemy.intent === "flurry" ? "#fb923c" : enemy.intent === "roar" ? "#fb923c" : enemy.intent === "guard" ? "#60a5fa" : enemy.intent === "venom" ? "#c084fc" : "#e7e5e4";
            return (
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: col, background: "#0c0a09", border: `1px solid ${col}`, borderRadius: 6, padding: "4px 10px", display: "inline-block" }}>
                次の行動:{it.icon}{it.name}{enemy.intent === "flurry" ? "×3" : ""}
                {isThreat ? `(約${estDmg} / 🛡️防御なら約${estDef})` : enemy.intent === "guard" ? "(被ダメ-50%)" : "(攻撃力UP)"}
                {enemy.intent === "venom" ? " +毒付与(防御で無効)" : ""}
                {enemy.gimmick === "burrow" && enemy.burrowedNext ? " 🪱潜伏明け強化" : ""}
                {enemy.pattern ? " 🔁" : ""}
              </div>
            );
          })()}
          {enemy.guardTurns > 0 && <div style={{ fontSize: 11, color: "#60a5fa", marginTop: 4 }}>🛡️ 構え中(受けるダメージ-50%)</div>}
          {enemy.status && Object.entries(enemy.status).some(([, v]) => v.turns > 0) && (
            <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6, flexWrap: "wrap" }}>
              {Object.entries(enemy.status).filter(([, v]) => v.turns > 0).map(([k, v]) => (
                <span key={k} style={{ fontSize: 11, color: STATUS[k].color, border: `1px solid ${STATUS[k].color}`, borderRadius: 4, padding: "1px 6px" }}>
                  {STATUS[k].icon}{STATUS[k].name}{v.turns}T{k === "poison" ? `(${v.dmg})` : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* プレイヤー */}
      <div style={{ marginBottom: 4, display: "flex", justifyContent: "space-between", fontSize: 12, color: "#a8a29e" }}>
        <span>あなた
          {player.cls === "warrior" && (player.fury || 0) > 0 ? <span style={{ color: "#f87171" }}>　🔥闘志{player.fury}/{player.variant === "b" ? 7 : 5}</span> : null}
          {player.cls === "assassin" && (player.combo || 0) > 0 ? <span style={{ color: "#a78bfa" }}>　⚔️コンボ×{player.combo}</span> : null}
          {player.cls === "vampire" && (player.barrier || 0) > 0 ? <span style={{ color: "#fb7185" }}>　🛡️障壁{player.barrier}</span> : null}
          {player.cls === "mage" && (player.resonance || 0) > 0 ? <span style={{ color: "#60a5fa" }}>　✨共鳴{player.resonance}/{player.variant === "c" ? 4 : 3}</span> : null}
          {player.pPoison?.turns > 0 ? <span style={{ color: "#c084fc" }}>　🟣毒{player.pPoison.turns}T({player.pPoison.dmg}/T)</span> : null}{(player.healReduce || 0) > 0 ? <span style={{ color: "#78716c" }}>　☠️回復-{player.healReduce}%</span> : null}{player.petrified ? <span style={{ color: "#a8a29e" }}>　🗿石化(攻撃のみ可)</span> : null}{player.defending ? <span style={{ color: "#60a5fa" }}>　🛡️防御中</span> : null}</span><span>{Math.max(0, player.hp)} / {stats.maxHp}</span>
      </div>
      <Bar cur={player.hp} max={stats.maxHp} color="#16a34a" height={16} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 11, color: "#78716c", margin: "8px 0 12px" }}>
        <span>⚔️{stats.atk}</span><span>🛡️{stats.def}</span><span>💥{stats.crit}%</span>
        {stats.lifesteal > 0 && <span>🩸{stats.lifesteal}%</span>}
        {stats.double > 0 && <span>⚡連撃{stats.double}%</span>}
        {thornsEffective(stats) > 0 && <span>🌵{thornsEffective(stats)}</span>}
      </div>

      {/* 操作 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button onClick={() => performAttack({ mult: 1, hits: 1 }, "攻撃")} style={btnStyle(false)}>⚔️ 攻撃</button>
        <button onClick={useDefend} disabled={stats.noDefend > 0 || player.petrified} style={btnStyle(stats.noDefend > 0 || player.petrified, "#1e40af")}>{stats.noDefend > 0 ? "🌹 封印" : player.petrified ? "🗿 石化" : "🛡️ 防御"}</button>
        <button onClick={usePotion} disabled={player.potions <= 0 || player.petrified} style={btnStyle(player.potions <= 0 || player.petrified, "#166534")}>
          🧪 ×{player.potions}
        </button>
      </div>
      {!(stats.noSkill > 0) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {player.skills.map(k => {
            const s = SKILLS[k];
            const cd = cds[k] || 0;
            const dis = cd > 0 || player.petrified;
            return (
              <button key={k} onClick={() => castSkill(k)} disabled={dis} style={{ ...btnStyle(dis, "#7c2d12"), fontSize: 13 }}>
                {s.icon} {s.name}{(player.skillMods || {})[k] ? SKILL_MODS[(player.skillMods || {})[k]].icon : ""}{cd > 0 ? ` (${cd})` : ""}
              </button>
            );
          })}
        </div>
      )}
      {floor <= 2 && (
        <p style={{ fontSize: 11, color: "#78716c", margin: "0 0 10px", lineHeight: 1.6 }}>
          💡 敵は行動を予告してくる。💢大技・🌀連攻は🛡️防御(-60%・次ターン与ダメ+15%)で凌げ。🧪回復薬は1戦闘1回だけターン消費なしで飲める
        </p>
      )}

      {/* 現在の与ダメ倍率(通常攻撃基準・確定要素のみ。何もかかっていない時は非表示。操作ボタンより後ろに置き、表示/非表示でボタン位置が動かないようにする) */}
      {(() => {
        const atkInfo = currentAttackMultiplier(false);
        const skillInfo = stats.noSkill > 0 ? atkInfo : currentAttackMultiplier(true);
        const skillOnlyNotes = stats.noSkill > 0 ? [] : skillInfo.notes.filter(n => !atkInfo.notes.includes(n));
        if (Math.abs(atkInfo.mult - 1) < 0.001 && atkInfo.notes.length === 0 && skillOnlyNotes.length === 0) return null;
        return (
          <div style={{ fontSize: 12, color: "#fbbf24", background: "#1c1917", border: "1px solid #44403c", borderRadius: 6, padding: "6px 10px", marginBottom: 10 }}>
            <span style={{ fontWeight: 700 }}>⚔️ 現在の与ダメ倍率:×{atkInfo.mult.toFixed(2)}</span>
            {!(stats.noSkill > 0) && <span style={{ color: "#78716c" }}>(通常攻撃基準・スキルは別途スキル自身の倍率が乗る)</span>}
            {atkInfo.notes.length > 0 && <div style={{ color: "#a8a29e", marginTop: 2 }}>内訳:{atkInfo.notes.join("・")}</div>}
            {skillOnlyNotes.length > 0 && <div style={{ color: "#60a5fa", marginTop: 2 }}>🔮 スキル使用時はさらに:{skillOnlyNotes.join("・")}</div>}
          </div>
        );
      })()}

      {/* ログ */}
      <div style={{ background: "#0f0d0b", border: "1px solid #292524", borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 1.7, color: "#a8a29e", minHeight: 120 }}>
        {log.map((l, i) => <div key={i} style={{ color: LOG_COLORS[l.c] || "#a8a29e", opacity: 0.55 + (i / log.length) * 0.45 }}>{l.t}</div>)}
      </div>
    </div>
  );
}
