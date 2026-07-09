// ゲームの静的データ定義(レアリティ・祝福・出自・世界・ゾーン・敵・スキル・レリック等)
// 純粋な定数テーブルのみを置く。ラン中の可変状態(ACTIVE_*)は AbyssTower.jsx 側にある

// ===== データ定義 =====
export const RARITIES = [
  { name: "コモン", color: "#9ca3af", glow: "none", affixes: 0, mult: 1.0, weight: 48 },
  { name: "レア", color: "#60a5fa", glow: "0 0 14px rgba(96,165,250,0.45)", affixes: 1, mult: 1.35, weight: 28 },
  { name: "エピック", color: "#c084fc", glow: "0 0 16px rgba(192,132,252,0.5)", affixes: 2, mult: 1.75, weight: 15 },
  { name: "レジェンダリー", color: "#fbbf24", glow: "0 0 20px rgba(251,191,36,0.55)", affixes: 3, mult: 2.3, weight: 6.5 },
  { name: "ミシック", color: "#fb7185", glow: "0 0 22px rgba(251,113,133,0.6)", affixes: 4, mult: 3.1, weight: 2 },
  { name: "神器", color: "#5eead4", glow: "0 0 26px rgba(94,234,212,0.7)", affixes: 5, mult: 4.2, weight: 0.5 },
];

// ===== 難易度(モジュール変数で全体に反映) =====
export const DIFFICULTIES = {
  normal: { key: "normal", name: "ノーマル", icon: "🟢", color: "#4ade80", desc: "標準のバランス。まずはここから", enemyMult: 1.0, hpMult: 1.0, atkMult: 1.0, rampFloors: 5, reward: 1.0, rarityBonus: 0 },
  hard: { key: "hard", name: "ハード", icon: "🟠", color: "#fb923c", desc: "敵HP・攻撃 最大×1.4(5階かけて上昇)。報酬とレア率UP", enemyMult: 1.4, hpMult: 1.4, atkMult: 1.4, rampFloors: 5, reward: 1.45, rarityBonus: 1 },
  hell: { key: "hell", name: "地獄", icon: "🔴", color: "#ef4444", desc: "敵HP最大×1.8・攻撃最大×1.55(7階かけて緩やかに上昇)。開始時、致死の一撃を1回だけ耐える加護つき。報酬・レア率 大幅UP", enemyMult: 1.8, hpMult: 1.8, atkMult: 1.55, rampFloors: 7, reward: 1.9, rarityBonus: 2 },
};

// ===== ラン開始時の祝福(3択からビルドの種を選ぶ) =====
export const BLESSINGS = [
  { key: "sword", icon: "💀", name: "不滅の約束", desc: "ラン中1回だけ、致死ダメージをHP1で耐える", apply: p => ({ ...p, hooks: { ...(p.hooks || {}), cheatDeath: 1 } }) },
  { key: "life", icon: "⏩", name: "巻き戻しの一歩", desc: "次のレベルアップに必要なXPが半分になる(初回のみ)", apply: p => ({ ...p, discountNextLevel: true }) },
  { key: "eye", icon: "👁️", name: "先読みの目", desc: "最初に出会う敵の初手が必ず「攻撃」になる", apply: p => ({ ...p, forceFirstAttack: true }) },
  { key: "bloodb", icon: "💉", name: "輸血の契約", desc: "HPが25%以下になるたび、自動で回復薬を1つ消費して回復する(ラン中3回まで)", apply: p => ({ ...p, autoPotionLeft: 3 }) },
  { key: "wind", icon: "👥", name: "刹那の連撃", desc: "最初の戦闘中、攻撃が常に連撃になる", apply: p => ({ ...p, firstFightDoubleGuaranteed: true }) },
  { key: "wealth", icon: "🕵️", name: "密偵の眼", desc: "商人・鍛冶屋の価格が永続で20%割引になる", apply: p => ({ ...p, hooks: { ...(p.hooks || {}), shopDiscount: 20 } }) },
  { key: "sageb", icon: "🌳", name: "賢者の祝福", desc: "覚醒P+1を持って開始(クラスアビリティを1つ多く解放できる)", apply: p => ({ ...p, ap: (p.ap || 0) + 1 }) },
  { key: "alchemyb", icon: "♻️", name: "不朽の水筒", desc: "回復薬を使用しても40%の確率で消費しない", apply: p => ({ ...p, hooks: { ...(p.hooks || {}), potionSaveCh: 40 } }) },
  { key: "venomb", icon: "🟣", name: "毒の祝福", desc: "「毒刃」を最初から習得・装備", learnSkill: "poisonblade" },
  { key: "flameb", icon: "🔥", name: "炎の祝福", desc: "「火炎斬」を最初から習得・装備", learnSkill: "flamestrike" },
  { key: "huntb", icon: "⚔️", name: "処刑人の啓示", desc: "最初に出会う敵を問答無用で即座に打ち倒す", apply: p => ({ ...p, executeFirstEnemy: true }) },
  { key: "steelb", icon: "🛡️", name: "絶対防御", desc: "1回の被弾ダメージが最大HPの20%を超えない", locked: "bless_steel", apply: p => ({ ...p, hooks: { ...(p.hooks || {}), dmgCapPercent: 20 } }) },
  { key: "starb", icon: "🌟", name: "星の祝福", desc: "レア以上の武器を持って開始", locked: "bless_star", startWeapon: true },
  // ===== 契約(キーストーン祝福):ルールそのものを書き換える。選んだ瞬間ランの遊び方が決まる =====
  { key: "ks_thorn", icon: "🌹", keystone: true, name: "茨の誓約", desc: "【契約】防御が使えなくなる。代わりに棘ダメージが常に3倍", apply: p => ({ ...p, hooks: { ...(p.hooks || {}), noDefend: 1, thornsX3: 1 } }) },
  { key: "ks_blood", icon: "🍷", keystone: true, name: "血の渇望", desc: "【契約】回復薬を一切持てない。代わりに吸血+10%・敵撃破時に最大HPの30%回復", apply: p => ({ ...p, potions: 0, hooks: { ...(p.hooks || {}), noPotion: 1, lifesteal: 10, onKillHeal: 30 } }) },
  { key: "ks_giant", icon: "🗿", keystone: true, name: "鈍重な巨人", desc: "【契約】クリティカルが一切出なくなる。代わりに全ての与ダメージ+50%", apply: p => ({ ...p, hooks: { ...(p.hooks || {}), noCrit: 1, flatDmg: 50 } }) },
  { key: "ks_glass", icon: "🪞", keystone: true, name: "硝子の魂", desc: "【契約】最大HP-40%。代わりに与ダメ+35%・連撃+15%・回避+10%", apply: p => { const cut = Math.round(p.maxHp * 0.4); return { ...p, maxHp: p.maxHp - cut, hp: Math.max(1, p.hp - cut), hooks: { ...(p.hooks || {}), flatDmg: 35, double: 15, dodge: 10 } }; } },
  { key: "ks_silence", icon: "🤐", keystone: true, name: "無音の誓い", desc: "【契約】スキルが使えなくなる。代わりに通常攻撃の与ダメ+60%・連撃+20%", apply: p => ({ ...p, hooks: { ...(p.hooks || {}), noSkill: 1, basicBonus: 60, double: 20 } }) },
  { key: "ks_leaden", icon: "🛡️", keystone: true, name: "鉛の鎧", desc: "【契約】連撃が一切出なくなる。代わりに受けるダメージ-25%", apply: p => ({ ...p, hooks: { ...(p.hooks || {}), noDouble: 1, dmgReduce: 25 } }) },
  { key: "ks_bloodbowl", icon: "🥣", keystone: true, name: "血染めの杯", desc: "【契約】吸血+15%。だが毎ターン最大HPの3%を失い続ける", apply: p => ({ ...p, hooks: { ...(p.hooks || {}), lifesteal: 15, drainPerTurn: 3 } }) },
  { key: "ks_chaos", icon: "🎲", keystone: true, name: "深淵の賽", desc: "【契約】与ダメも被ダメも、常に50%で1.5倍・50%で0.66倍になる", apply: p => ({ ...p, hooks: { ...(p.hooks || {}), chaosDice: 1 } }) },
];
// クラスの根幹と矛盾する契約は候補から除外する(選ぶ意味のない3択を防ぐ)
export const KEYSTONE_EXCLUDE = {
  warrior: ["ks_giant"],              // 闘志解放=確定クリなのでクリ禁止と矛盾
  assassin: ["ks_giant", "ks_leaden"], // クリ・連撃がクラスの核
  mage: ["ks_silence"],               // スキル禁止はクラスの核と矛盾
  vampire: [],
};

// ===== 出自(ラン開始時にビルドの起点を選ぶ。固有装備+以後のドロップ傾向) =====
export const ORIGINS = [
  { key: "venom", icon: "🟣", name: "毒使いの道", desc: "攻撃のたび毒を刻む「蛇牙の短剣」を携えて出発。以後、毒系の装備が出やすくなる",
    slot: "weapon", bias: ["poisonPower", "dmgVsStatus"],
    make: () => ({ slot: "weapon", rarity: 1, name: "蛇牙の短剣", stats: { atk: 5, poisonPower: 15 }, ability: "scythe", abilityStats: { alwaysPoison: 1 } }) },
  { key: "thorn", icon: "🌵", name: "茨の道", desc: "棘をまとう「茨の胸甲」を着て出発。以後、棘・防御系の装備が出やすくなる",
    slot: "armor", bias: ["thorns", "def"],
    make: () => ({ slot: "armor", rarity: 1, name: "茨の胸甲", stats: { def: 3, hp: 10, thorns: 10 }, ability: "briar", abilityStats: { defendThornsMult: 1 } }) },
  { key: "swift", icon: "⚡", name: "疾風の道", desc: "「韋駄天の足袋」を履いて出発。以後、連撃・会心系の装備が出やすくなる",
    slot: "boots", bias: ["double", "crit"],
    make: () => ({ slot: "boots", rarity: 1, name: "韋駄天の足袋", stats: { double: 14, crit: 5, hp: 5 } }) },
  { key: "blood", icon: "🩸", name: "血の道", desc: "「渇望の首飾り」を提げて出発。以後、吸血・回復系の装備が出やすくなる",
    slot: "amulet", bias: ["lifesteal", "perHitHeal"],
    make: () => ({ slot: "amulet", rarity: 1, name: "渇望の首飾り", stats: { lifesteal: 6, hp: 12 } }) },
  { key: "arcanist", icon: "🔮", name: "魔導の道", desc: "「星見の杖」を携えて出発(全スキルCD-1)。以後、攻撃・クリ倍率系の装備が出やすくなる",
    slot: "weapon", bias: ["atk", "critDmg"],
    make: () => ({ slot: "weapon", rarity: 1, name: "星見の杖", stats: { atk: 4, critDmg: 12 }, ability: "stargazer", abilityStats: { cdAll: 1 } }) },
  { key: "alchemy", icon: "🧪", name: "錬金の道", desc: "「劇薬の帯」と回復薬+2を持って出発(薬が武器になる)。以後、HP系の装備が出やすくなる",
    slot: "ring", bias: ["hp", "def"], apply: p => ({ ...p, potions: p.potions + 2 }),
    make: () => ({ slot: "ring", rarity: 1, name: "劇薬の帯", stats: { hp: 12 }, ability: "alchemist", abilityStats: { potionBomb: 1 } }) },
  { key: "royal", icon: "👑", name: "王の道", desc: "「王家の指輪」とゴールド+80を持って出発(ボス・エリート特効)。以後、会心系の装備が出やすくなる",
    slot: "ring", bias: ["crit", "critDmg"], apply: p => ({ ...p, gold: p.gold + 80 }),
    make: () => ({ slot: "ring", rarity: 1, name: "王家の指輪", stats: { crit: 5 }, ability: "kingslayer", abilityStats: { bossSlayer: 30 } }) },
  { key: "shadow", icon: "🥷", name: "影の道", desc: "「忍びの短刀」を携えて出発(回避+8%)。以後、クリ・連撃系の装備が出やすくなる",
    slot: "weapon", bias: ["crit", "double"],
    make: () => ({ slot: "weapon", rarity: 1, name: "忍びの短刀", stats: { atk: 4, crit: 4 }, ability: "windrun", abilityStats: { dodge: 8 } }) },
  { key: "guardian", icon: "🛡️", name: "守護の道", desc: "「守護の大盾」を構えて出発。以後、防御・HP系の装備が出やすくなる",
    slot: "armor", bias: ["def", "hp"],
    make: () => ({ slot: "armor", rarity: 1, name: "守護の大盾", stats: { def: 5, hp: 15 } }) },
  { key: "chaos", icon: "🎲", name: "混沌の道", desc: "呪われた「始まりの刃」を携えて出発(強力だが呪い持ち)。以後、クリ・クリ倍率系の装備が出やすくなる",
    slot: "weapon", bias: ["crit", "critDmg"],
    make: () => ({ slot: "weapon", rarity: 1, name: "呪われた始まりの刃", stats: { atk: Math.round(6 * 1.45), crit: Math.round(6 * 1.45) }, curse: "weak" }) },
  { key: "cinder", icon: "🔥", name: "灼熱の道", desc: "攻撃のたび炎を灯す「残り火の小刀」を携えて出発。以後、炎系の装備が出やすくなる",
    slot: "weapon", bias: ["burnPower", "dmgVsStatus"],
    make: () => ({ slot: "weapon", rarity: 1, name: "残り火の小刀", stats: { atk: 4, burnPower: 20 }, ability: "cinder", abilityStats: { alwaysBurn: 1 } }) },
  { key: "bloodblade", icon: "🩸", name: "血刃の道", desc: "攻撃のたび傷を刻む「刻み目の短剣」を携えて出発。以後、出血系の装備が出やすくなる",
    slot: "weapon", bias: ["bleedPower", "crit"],
    make: () => ({ slot: "weapon", rarity: 1, name: "刻み目の短剣", stats: { atk: 4, bleedPower: 20 }, ability: "gash", abilityStats: { alwaysBleed: 1 } }) },
];

// ===== ランダム試練モディファイア(ラン全体にかかる世界のルール) =====
export const MODIFIERS = [
  { key: "blood", name: "血の月", icon: "🌕", desc: "敵の攻撃+20%、ゴールド獲得+40%", enemyAtk: 1.2, gold: 1.4 },
  { key: "harvest", name: "豊穣の風", icon: "🌾", desc: "装備ドロップ率+20%", dropBonus: 0.2 },
  { key: "starfall", name: "星降りの夜", icon: "🌠", desc: "レア装備が出やすい。敵HP+15%", rarityBonus: 1, enemyHp: 1.15 },
  { key: "drought", name: "干ばつ", icon: "🏜️", desc: "回復薬の回復量-25%。商人の価格-30%", potionHeal: 0.3, shopMult: 0.7 },
  { key: "silence", name: "毒気の霧", icon: "🌫️", desc: "状態異常の持続+1ターン。敵HP+10%", statusTurns: 1, enemyHp: 1.1 },
  // ルール級モディファイア(数値ではなく世界の遊び方が変わる)
  { key: "noshop", name: "商人なき世界", icon: "🚫", desc: "商人と鍛冶屋が一切現れない。代わりに全装備のレア度が上がりやすい", banShops: true, rarityBonus: 1 },
  { key: "eliteworld", name: "精鋭の世界", icon: "💀", desc: "通常戦闘が30%でエリートにすり替わる。エリートのレリック所持率が大幅UP", eliteCh: 0.3, eliteRelic: 0.4 },
  { key: "mist", name: "迷いの霧", icon: "🌁", desc: "分岐路の行き先が見えない。代わりにゴールド・XP+30%", hidePaths: true, gold: 1.3, xp: 1.3 },
  { key: "goldrush", name: "黄金熱", icon: "🤑", desc: "ゴールド獲得+60%。ただし商人の価格+25%", gold: 1.6, shopMult: 1.25 },
  { key: "scholar", name: "学びの風", icon: "📜", desc: "獲得XP+40%。敵HP+10%", xp: 1.4, enemyHp: 1.1 },
  { key: "bonfire", name: "篝火の加護", icon: "🕯️", desc: "焚き火の回復量+50%。敵の攻撃+10%", restMult: 1.5, enemyAtk: 1.1 },
  { key: "caravan", name: "商隊の往来", icon: "🐫", desc: "商人・鍛冶屋が現れやすい。装備ドロップ率-10%", tradeBias: true, dropBonus: -0.1 },
  // ルール級:塔の強さの序列が逆転する
  { key: "inverted", name: "逆巻く塔", icon: "🌪️", desc: "雑魚のHP・攻撃+20%。代わりにボスが弱まる(-20%)", nonBossMult: 1.2, bossMult: 0.8 },
  { key: "none", name: "平穏", icon: "🕊️", desc: "特別な影響はない" },
];

// ===== 深淵の彼方(プレステージモード):初回クリア後に解禁。好きな数だけ組み合わせて自ら難易度を積む =====
// 有効にした特性の数だけ、魂の報酬とレア度に補正がかかる(積んだ分だけ報われる)
export const ASCENSIONS = [
  { key: "asc_hp", icon: "💢", name: "猛る敵意", desc: "敵の最大HP+15%", enemyHp: 1.15 },
  { key: "asc_atk", icon: "🗡️", name: "研ぎ澄まされた牙", desc: "敵の攻撃力+15%", enemyAtk: 1.15 },
  { key: "asc_elite", icon: "💀", name: "精鋭の跳梁", desc: "通常戦闘が25%でエリートにすり替わる", eliteCh: 0.25 },
  { key: "asc_rest", icon: "🩹", name: "涸れた泉", desc: "焚き火の回復量が半分になる", restMult: 0.5 },
  { key: "asc_price", icon: "💰", name: "吊り上がった値段", desc: "商人の価格+40%", shopMult: 1.4 },
  { key: "asc_drop", icon: "🌑", name: "薄い恵み", desc: "装備ドロップ率-20%", dropPenalty: 0.2 },
];

export const ASCENSION_MAP = Object.fromEntries(ASCENSIONS.map(a => [a.key, a]));

export function computeAscensionFx(keys) {
  const fx = { count: keys.length, enemyHp: 1, enemyAtk: 1, eliteCh: 0, restMult: 1, shopMult: 1, dropPenalty: 0 };
  for (const k of keys) {
    const a = ASCENSION_MAP[k];
    if (!a) continue;
    if (a.enemyHp) fx.enemyHp *= a.enemyHp;
    if (a.enemyAtk) fx.enemyAtk *= a.enemyAtk;
    if (a.eliteCh) fx.eliteCh += a.eliteCh;
    if (a.restMult) fx.restMult *= a.restMult;
    if (a.shopMult) fx.shopMult *= a.shopMult;
    if (a.dropPenalty) fx.dropPenalty += a.dropPenalty;
  }
  return fx;
}

export const getMod = (key) => MODIFIERS.find(m => m.key === key) || MODIFIERS[MODIFIERS.length - 1];

// ===== ゾーン(5階ごとの区画。ボス撃破後に次の環境を2択から選ぶ) =====
export const ZONES = {
  entrance: { key: "entrance", name: "深淵の入口", icon: "🚪", desc: "まだ塔は静かだ" },
  swamp: { key: "swamp", name: "毒の沼", icon: "🐍", desc: "あなたと敵、互いの毒威力+25%。敵は毒撃を好む。毒系の装備が出やすい", playerPoisonPower: 25, venomBias: true, affixBias: ["poisonPower", "dmgVsStatus"] },
  tundra: { key: "tundra", name: "凍てつく霊峰", icon: "🏔️", desc: "敵HP+20%。だが敵は15%で寒さに凍えて行動できない", enemyHp: 1.2, enemyFreezeCh: 15 },
  furnace: { key: "furnace", name: "灼熱の坩堝", icon: "🌋", desc: "敵の攻撃+15%。代わりに装備のレア度が上がりやすい", enemyAtk: 1.15, rarityBonus: 1 },
  crypt: { key: "crypt", name: "血の霊廟", icon: "🦇", desc: "敵は与えたダメージの25%を吸血する。あなたの吸血+6%。吸血系の装備が出やすい", enemyLifesteal: 0.25, playerLifesteal: 6, affixBias: ["lifesteal", "perHitHeal"] },
  storm: { key: "storm", name: "雷鳴の尖塔", icon: "🌩️", desc: "あなたの連撃率+10%。だが敵の攻撃も10%で2連撃になる。連撃・会心系の装備が出やすい", playerDouble: 10, enemyDoubleCh: 10, affixBias: ["double", "crit"] },
  golden: { key: "golden", name: "黄金の回廊", icon: "🏛️", desc: "ゴールド+50%・商人が現れやすい。敵HP+15%", gold: 1.5, enemyHp: 1.15, shopBias: true },
  boneyard: { key: "boneyard", name: "骸の庭園", icon: "🪦", desc: "全ての敵が「不死」を帯びる(一度倒してもHP30%で復活)。獲得XP+30%", allUndying: true, xp: 1.3 },
  observatory: { key: "observatory", name: "星辰の観測所", icon: "🔭", desc: "星の導きで全スキルのクールダウン-1。敵の攻撃+10%", playerCdCut: 1, enemyAtk: 1.1 },
  mirrorhall: { key: "mirrorhall", name: "鏡の回廊", icon: "🪞", desc: "敵も棘をまとう(攻撃するたび反射ダメージ)。あなたの棘+15", enemyThorns: true, playerThorns: 15 },
  dreamcorridor: { key: "dreamcorridor", name: "夢幻の回廊", icon: "🌌", desc: "足を踏み入れた瞬間、気まぐれな祝福がランダムに宿る(内容は入るまでわからない)" },
  wasteland: { key: "wasteland", name: "灼けた荒野", icon: "🏜️", desc: "あなたの炎上ダメージ+5%pt。敵HP+10%", burnBoost: 0.05, enemyHp: 1.1 },
  archive: { key: "archive", name: "静寂の書庫", icon: "📚", desc: "スキルのクールダウン+1ターン。代わりにスキルダメージ+35%", skillCdPenalty: 1, skillDmgBoost: 35 },
  hungry: { key: "hungry", name: "餓えの回廊", icon: "🍖", desc: "敵の攻撃+10%。だが倒した敵からのゴールド+40%", enemyAtk: 1.1, gold: 1.4 },
  windridge: { key: "windridge", name: "風走りの高台", icon: "🌬️", desc: "あなたの回避+8%。だが敵の攻撃+10%。連撃・会心系の装備が出やすい", playerDodge: 8, enemyAtk: 1.1, affixBias: ["double", "crit"] },
  springs: { key: "springs", name: "癒しの水脈", icon: "💧", desc: "階を進むたびHPが5%回復する。敵HP+15%", floorHeal: 0.05, enemyHp: 1.15 },
  forgehall: { key: "forgehall", name: "地下鍛冶場", icon: "⚒️", desc: "鍛冶屋が現れやすく、強化・改造費用が20%安い。敵HP+10%", forgeBias: true, forgeDiscount: 0.2, enemyHp: 1.1 },
  crimson: { key: "crimson", name: "紅の回廊", icon: "🩸", desc: "あなたの出血威力+25%。敵HP+10%。出血・会心系の装備が出やすい", playerBleedPower: 25, enemyHp: 1.1, affixBias: ["bleedPower", "crit"] },
  shackles: { key: "shackles", name: "枷の谷", icon: "⛓️", desc: "あなたの衰弱威力+10%pt。敵の攻撃+10%", playerWeakenPower: 10, enemyAtk: 1.1 },
};

export const DREAM_BUFFS = [
  { key: "atk", label: "攻撃力+8", stat: { atk: 8 } },
  { key: "crit", label: "クリ率+12%", stat: { crit: 12 } },
  { key: "def", label: "防御力+6", stat: { def: 6 } },
  { key: "double", label: "連撃率+12%", stat: { double: 12 } },
  { key: "critDmg", label: "クリ倍率+30%", stat: { critDmg: 30 } },
  { key: "lifesteal", label: "吸血+6%", stat: { lifesteal: 6 } },
];

export const SKILL_CAP = 5; // 1ランで習得できるスキル数の上限(全8種は覚えられない)

// ===== 固有能力(全装備にレアリティ連動で抽選付与。強化の影響を受けない別枠) =====
export const ABILITIES = [
  { key: "scythe", name: "呪毒", desc: "攻撃するたび毒(攻撃力30%×2T)を付与", stats: { alwaysPoison: 1 } },
  { key: "cinder", name: "残り火", desc: "攻撃するたび炎上(2T)を付与", stats: { alwaysBurn: 1 } },
  { key: "gash", name: "深手", desc: "攻撃するたび出血(攻撃力25%×3T)を付与", stats: { alwaysBleed: 1 } },
  { key: "scarcrit", name: "会心の傷跡", desc: "クリティカル時、追加で出血(攻撃力25%×3T)を付与する", stats: { critBleed: 1 } },
  { key: "hexblade", name: "呪縛の刃", desc: "攻撃するたび衰弱(敵の攻撃力-15%×2T)を付与", stats: { alwaysWeaken: 1 } },
  { key: "shackle", name: "枷", desc: "防御時、敵に衰弱(攻撃力-15%×2T)を付与する", stats: { onDefendWeaken: 1 } },
  { key: "iceheart", name: "氷結の守り", desc: "防御時40%で敵を凍結(1T)", stats: { onDefendFreezeCh: 40 } },
  { key: "executioner", name: "処刑人", desc: "凍結・気絶中の敵への攻撃は必ずクリティカル", stats: { critVsCC: 1 } },
  { key: "briar", name: "茨の心", desc: "防御中、棘ダメージが2倍", stats: { defendThornsMult: 1 } },
  { key: "souleater", name: "吸魂", desc: "敵撃破時、最大HPの20%回復", stats: { onKillHeal: 20 } },
  { key: "gambler", name: "賭博", desc: "与ダメが50%で1.5倍、50%で0.7倍", stats: { gambleDmg: 1 } },
  { key: "immovable", name: "不動", desc: "防御の軽減量が-60%→-80%に", stats: { betterDefend: 1 } },
  { key: "plague", name: "疫病", desc: "毒に侵された敵の攻撃力-20%", stats: { poisonWeaken: 1 } },
  { key: "berserker", name: "狂戦士", desc: "与ダメ+25%、ただし被ダメ+15%", stats: { berserk: 1 } },
  { key: "timeshatter", name: "時砕き", desc: "戦闘開始時、敵を1ターン気絶", stats: { startStun: 1 } },
  { key: "lightning", name: "落雷", desc: "クリティカル時30%で敵を気絶(1T)", stats: { critStun: 30 } },
  { key: "meteorite", name: "隕鉄", desc: "敵の大技のダメージを半減", stats: { heavyResist: 1 } },
  { key: "windrun", name: "風走り", desc: "敵の攻撃を15%で完全回避", stats: { dodge: 15 } },
  { key: "kingslayer", name: "王殺し", desc: "ボス・エリートへの与ダメ+30%", stats: { bossSlayer: 30 } },
  { key: "alchemist", name: "劇薬", desc: "回復薬を飲むと回復量と同じダメージを敵に", stats: { potionBomb: 1 } },
  { key: "stargazer", name: "星読み", desc: "全スキルのクールダウン-1(最低1)", stats: { cdAll: 1 } },
  { key: "dragonscale", name: "逆鱗", desc: "棘ダメージに攻撃力の20%を加算", stats: { thornsScale: 1 } },
  { key: "ironthorn", name: "鉄壁の棘", desc: "棘ダメージに防御力の35%を加算", stats: { thornsDef: 1 } },
  { key: "thornqueen", name: "棘の女王", desc: "棘が命中した敵に毒(棘ダメの40%×2T)を追加で付与", stats: { thornsPoison: 1 } },
  { key: "reflector", name: "反射", desc: "敵の大技を受けた時、そのダメージの30%を反射する", stats: { reflectHeavy: 30 } },
  { key: "momentumHunt", name: "獲物の記憶", desc: "敵を撃破するたびに攻撃力+3(ラン中ずっと持続・累積、最大+30)", stats: { killMomentum: 1 } },
  { key: "keeneye", name: "見切り", desc: "敵の大技を40%で完全に回避する", stats: { dodgeHeavy: 40 } },
  { key: "greedyblade", name: "貪欲なる刃", desc: "攻撃を1回当てるごとにゴールド+1", stats: { goldOnHit: 1 } },
  { key: "icearmor", name: "氷の鎧", desc: "敵が凍結している間、防御力+50%", stats: { freezeDefBonus: 50 } },
  { key: "magicbullet", name: "魔弾", desc: "スキルの命中は必ずクリティカルになる", stats: { skillAlwaysCrit: 1 } },
  { key: "rampage", name: "猛連撃", desc: "連撃(2撃目以降)は必ずクリティカルになる", stats: { rampageCrit: 1 } },
  { key: "critvenom", name: "会心の刺", desc: "クリティカル時、追加で毒(攻撃力25%×2T)を付与する", stats: { critPoison: 1 } },
  { key: "battleresonance", name: "闘気の共鳴", desc: "クリティカルが命中すると、クラス固有ゲージが1溜まる", stats: { critGauge: 1 } },
];

export const ABILITY_MAP = Object.fromEntries(ABILITIES.map(a => [a.key, a]));

// レアリティ別の固有能力付与率(コモン→神器)
export const ABILITY_CHANCE = [0.06, 0.14, 0.24, 0.38, 0.55, 0.75];

// ===== スキル改造モッド(鍛冶屋で装備スキルに1つ付けられる) =====
export const SKILL_MODS = {
  venomMod: { name: "猛毒", icon: "🟣", desc: "毒付与(攻撃力35%×2T)を追加" },
  frostMod: { name: "氷結", icon: "❄️", desc: "25%で敵を1ターン凍結" },
  hasteMod: { name: "急速", icon: "💨", desc: "クールダウン-1(最低1)" },
  ampMod: { name: "増幅", icon: "🔺", desc: "倍率+30%、クールダウン+1" },
  drainMod: { name: "吸血", icon: "🩸", desc: "与ダメージの15%を回復" },
  chainMod: { name: "連鎖", icon: "🔗", desc: "ヒット数+1" },
  counterMod: { name: "反撃", icon: "🌵", desc: "使用時、棘ダメージを追加で1回発生させる" },
  critMod: { name: "会心", icon: "💥", desc: "使用時、必ずクリティカルになる" },
};

// ===== クラスの型(開始時にパッシブを2択から選ぶ) =====
export const CLASS_VARIANTS = {
  warrior: [
    { key: "a", name: "剛打", desc: "通常攻撃の25%で気絶+「解放」の一撃が必ず敵を気絶させる" },
    { key: "b", name: "憤怒", desc: "闘志の上限+2(7まで)、闘志1つの与ダメが+6%→+8%に" },
    { key: "c", name: "怒涛", desc: "攻撃を当てるたびにも闘志が溜まる(受けて溜める＋攻めて溜める)" },
  ],
  assassin: [
    { key: "a", name: "猛毒の刃", desc: "クリティカル時に毒を付与する" },
    { key: "b", name: "連刃", desc: "連撃発動時、20%でさらにもう1撃" },
    { key: "c", name: "看破", desc: "コンボがMAX(8)の間、攻撃が必ずクリティカルになる" },
  ],
  vampire: [
    { key: "a", name: "渇血", desc: "吸血+4%(基礎と合わせて14%)" },
    { key: "b", name: "血の対価", desc: "HP50%以下のとき与ダメージ+25%" },
    { key: "c", name: "血盾", desc: "血の障壁の上限が最大HPの25%→40%に増加" },
  ],
  mage: [
    { key: "a", name: "燃焼術", desc: "スキル使用時に敵を炎上させる" },
    { key: "b", name: "霜纏い", desc: "防御時35%で敵を凍結(1T)" },
    { key: "c", name: "深奥", desc: "共鳴の上限が3→4に増加(スキルダメ最大+40%)" },
  ],
};

// ===== メタ進行(深淵の魂:死んでも残る恒久アンロック) =====
// 魂はラン終了時に「到達階×3+撃破数」で獲得。クリアで+100ボーナス
export const META_UPGRADES = [
  { key: "mhp", icon: "❤️", name: "魂の器", desc: "開始時 最大HP +12", cost: 100, max: 3 },
  { key: "matk", icon: "⚔️", name: "魂の刃", desc: "開始時 攻撃力 +3", cost: 100, max: 3 },
  { key: "mpotion", icon: "🧪", name: "魂の水筒", desc: "開始時 回復薬 +1", cost: 80, max: 2 },
  { key: "mgold", icon: "💰", name: "魂の財布", desc: "開始時 ゴールド +60", cost: 60, max: 3 },
  { key: "skill_thunder", icon: "🌩️", name: "スキル解放:雷撃", desc: "「雷撃」が習得候補に加わる(1.6倍+30%気絶)", cost: 150, max: 1 },
  { key: "skill_moonlight", icon: "🌙", name: "スキル解放:月光斬", desc: "「月光斬」が習得候補に加わる(1.5倍、構え/大技予告中の敵に2.5倍)", cost: 150, max: 1 },
  { key: "bless_steel", icon: "🛡️", name: "祝福解放:鋼の祝福", desc: "「鋼の祝福」(防御+5)が祝福候補に加わる", cost: 120, max: 1 },
  { key: "bless_star", icon: "🌟", name: "祝福解放:星の祝福", desc: "「星の祝福」(レア以上の武器で開始)が祝福候補に加わる", cost: 120, max: 1 },
];

export const AFFIX_POOL = [
  { key: "atk", name: "攻撃力", base: 3, unit: "" },
  { key: "def", name: "防御力", base: 2, unit: "" },
  { key: "hp", name: "最大HP", base: 8, unit: "" },
  { key: "crit", name: "クリティカル率", base: 4, unit: "%" },
  { key: "critDmg", name: "クリティカル倍率", base: 12, unit: "%" },
  { key: "lifesteal", name: "吸血", base: 3, unit: "%" },
  { key: "double", name: "連撃率", base: 5, unit: "%" },
  { key: "thorns", name: "棘ダメージ", base: 3, unit: "" },
  // シナジーフック系(条件付き効果。系統ビルドの部品になる)
  { key: "poisonPower", name: "毒威力", base: 12, unit: "%" },
  { key: "burnPower", name: "炎威力", base: 15, unit: "%" },
  { key: "bleedPower", name: "出血威力", base: 14, unit: "%" },
  { key: "weakenPower", name: "衰弱威力", base: 6, unit: "%" },
  { key: "dmgVsStatus", name: "対状態異常ダメージ", base: 8, unit: "%" },
  { key: "perHitHeal", name: "ヒット毎回復", base: 2, unit: "" },
  { key: "afterDefendDmg", name: "防御後火力", base: 10, unit: "%" },
];

export const SLOTS = {
  weapon: { name: "武器", names: ["錆びた剣", "戦斧", "曲刀", "大剣", "双刃", "竜牙刀"] },
  armor: { name: "鎧", names: ["革鎧", "鎖帷子", "板金鎧", "竜鱗の鎧", "影の外套"] },
  helmet: { name: "兜", names: ["革帽子", "鉄兜", "騎士兜", "竜頭兜", "魔女帽"] },
  boots: { name: "靴", names: ["革靴", "鉄靴", "疾風のブーツ", "韋駄天の靴", "影歩み"] },
  ring: { name: "指輪", names: ["銅の指輪", "紅玉の指輪", "狼の指輪", "王者の指輪", "深淵の輪"] },
  amulet: { name: "護符", names: ["木の護符", "守りの護符", "血の首飾り", "聖印", "古の護符"] },
};

export const SLOT_KEYS = ["weapon", "armor", "helmet", "boots", "ring", "amulet"];

export const PREFIXES = ["", "", "鋭利な", "重厚な", "輝く", "嵐の", "深淵の", "王の"];

// ===== 呪い装備(強力だがデメリット付き) =====
export const CURSES = [
  { key: "frail", name: "脆弱の呪い", desc: "最大HP -18%", apply: t => { t.maxHp = Math.round(t.maxHp * 0.82); } },
  { key: "blind", name: "盲目の呪い", desc: "クリ率 -12%", apply: t => { t.crit = Math.max(0, t.crit - 12); } },
  { key: "weak", name: "衰弱の呪い", desc: "防御力 -45%", apply: t => { t.def = Math.round(t.def * 0.55); } },
  { key: "numb", name: "麻痺の呪い", desc: "連撃率 -18%", apply: t => { t.double = Math.max(0, t.double - 18); } },
  { key: "drain", name: "渇きの呪い", desc: "吸血効果 -55%", apply: t => { t.lifesteal = Math.round(t.lifesteal * 0.45); } },
  { key: "briar", name: "茨の呪い", desc: "防御力 -40%、代わりに棘ダメージ+35固定", apply: t => { t.def = Math.round(t.def * 0.6); t.thorns = (t.thorns || 0) + 35; } },
];

export const CURSE_CHANCE = 0.16; // レア以上のアイテムがこの確率で呪いを帯びる

export const CURSE_BOOST = 1.45;  // 呪い装備は素の数値がこの倍率で強化される

// ===== エリートの特性(部屋選択前に開示され、対策できる) =====
export const ELITE_TRAITS = {
  tough: { name: "鉄壁", icon: "🛡️", desc: "受けるダメージが25%軽減される", hpMult: 1, atkMult: 1 },
  berserk: { name: "狂暴", icon: "💢", desc: "HPは低いが攻撃力が高い", hpMult: 0.75, atkMult: 1.45 },
  regen: { name: "再生", icon: "💚", desc: "毎ターンHPが自動回復する", hpMult: 1, atkMult: 1 },
  resist: { name: "耐性", icon: "🧪", desc: "毒・炎上・凍結・気絶の効果時間が半分になる", hpMult: 1, atkMult: 1 },
  swift: { name: "俊敏", icon: "💨", desc: "反撃時に2回攻撃してくる", hpMult: 0.9, atkMult: 1 },
};

export const ELITE_TRAIT_KEYS = Object.keys(ELITE_TRAITS);

// ===== 敵の固有ギミック(敵ごとに「戦い方」が変わる。全雑魚が1つ持つ) =====
export const GIMMICKS = {
  split: { name: "分裂", icon: "➗", desc: "撃破すると小さな分身が1体現れる" },
  thief: { name: "盗み", icon: "💰", desc: "攻撃命中時にゴールドを盗む。倒せば1.5倍で取り返せる" },
  undying: { name: "不死", icon: "🦴", desc: "一度倒してもHP30%で再び起き上がる" },
  leech: { name: "吸血", icon: "🩸", desc: "与えたダメージの30%を吸収して回復する" },
  rage: { name: "激昂", icon: "💢", desc: "HP50%以下になると攻撃力+40%(削りかけが一番危ない)" },
  venomfang: { name: "毒牙", icon: "🟣", desc: "通常攻撃でも25%で毒を注ぐ(防御で防げる)" },
  stoneskin: { name: "石殻", icon: "🪨", desc: "弱い一撃を完全に弾く(手数より一撃の重さが問われる)" },
  counter: { name: "反撃", icon: "⚔️", desc: "攻撃を受けたターン、30%で即座に反撃してくる" },
  ghost: { name: "霊体", icon: "🌫️", desc: "通常攻撃が25%ですり抜ける(スキルは必中)" },
  mimic: { name: "財宝", icon: "💎", desc: "強敵だが、倒せば装備確定ドロップ+ゴールド大量" },
  ramp: { name: "加速", icon: "📈", desc: "ターンが経つほど攻撃力が上がり続ける(長期戦は不利)" },
  arcane: { name: "魔弾", icon: "🔮", desc: "行動が周期的🔁。大技は防御でも軽減しにくい(-60%→-30%)" },
  explode: { name: "自爆", icon: "💣", desc: "直接攻撃でトドメを刺すと爆発(最大HP15%)。毒・炎上・棘で倒せば爆発しない" },
  hex: { name: "呪詛", icon: "🧿", desc: "攻撃命中時、20%でランダムなスキルのCDが+1される" },
  slow: { name: "重鈍", icon: "🤖", desc: "2ターンに1回しか動けない。だが一撃が非常に重い" },
  spellward: { name: "魔法耐性", icon: "🦋", desc: "スキルのダメージが-40%される(通常攻撃で崩せ)" },
  petrify: { name: "石化", icon: "🐍", desc: "大技を防御せず受けると石化し、次のターンは攻撃しかできない" },
  deathcurse: { name: "死の呪い", icon: "🪶", desc: "倒すと呪いを残し、次に出会う敵の攻撃力+20%" },
  mirrorimg: { name: "鏡映し", icon: "🪞", desc: "あなたの直前の一撃の20%を、次の攻撃時に跳ね返す" },
  burrow: { name: "潜伏", icon: "🪱", desc: "3ターンに1回、地中に潜り無敵になる。潜った次のターンは一撃が重くなる" },
  crystalline: { name: "結晶", icon: "💎", desc: "スキルの被ダメ+50%、通常攻撃の被ダメ-20%(スキルで崩せ)" },
  elusive: { name: "俊足", icon: "🐺", desc: "HPが25%以下になると30%で攻撃を完全回避する(トドメの一撃を用意しろ)" },
  corrupt: { name: "腐敗", icon: "☠️", desc: "攻撃が命中するたび、あなたの回復効果が10%ずつ弱まる(戦闘中蓄積・最大40%)" },
  fragile: { name: "硝子細工", icon: "🎎", desc: "与えるダメージ+50%・受けるダメージ+50%(速攻決着向き)" },
};

export const ENEMIES = [
  { name: "スライム", icon: "🟢", gimmick: "split" }, { name: "ゴブリン", icon: "👺", gimmick: "thief" },
  { name: "スケルトン", icon: "💀", gimmick: "undying" }, { name: "大コウモリ", icon: "🦇", gimmick: "leech" },
  { name: "オーク", icon: "👹", gimmick: "rage" }, { name: "毒蜘蛛", icon: "🕷️", gimmick: "venomfang" },
  { name: "ガーゴイル", icon: "🗿", gimmick: "stoneskin" }, { name: "リザードマン", icon: "🦎", gimmick: "counter" },
  { name: "亡霊", icon: "👻", gimmick: "ghost" }, { name: "ミミック", icon: "🎁", gimmick: "mimic" },
  { name: "狂戦士", icon: "🪓", gimmick: "ramp" }, { name: "魔導士", icon: "🧙", gimmick: "arcane" },
  { name: "爆弾虫", icon: "💣", gimmick: "explode" }, { name: "呪術師", icon: "🧿", gimmick: "hex" },
  { name: "鉄のゴーレム", icon: "🤖", gimmick: "slow" }, { name: "吸魔蛾", icon: "🦋", gimmick: "spellward" },
  { name: "石化蛇", icon: "🐍", gimmick: "petrify" }, { name: "呪いシャーマン", icon: "🪶", gimmick: "deathcurse" },
  { name: "鏡霊", icon: "🪞", gimmick: "mirrorimg" }, { name: "深海のワーム", icon: "🪱", gimmick: "burrow" },
  { name: "共鳴クリスタル", icon: "💎", gimmick: "crystalline" }, { name: "影狼", icon: "🐺", gimmick: "elusive" },
  { name: "腐敗した司祭", icon: "☠️", gimmick: "corrupt" }, { name: "硝子人形", icon: "🎎", gimmick: "fragile" },
];

// ボスは各ティア2候補からランダム。行動パターンと固有ギミックが違う
export const BOSS_POOLS = [
  [ // 5F
    { name: "ゴブリンキング", icon: "👑", pattern: ["attack", "attack", "heavy"], gimmick: "thief" },
    { name: "蜘蛛の女王", icon: "🕸️", pattern: ["attack", "venom", "heavy"], gimmick: "venomfang" },
    { name: "深淵の巫女", icon: "🕯️", pattern: ["attack", "attack", "heavy"], gimmick: "hex" },
  ],
  [ // 10F
    { name: "死霊騎士", icon: "⚔️", pattern: ["guard", "attack", "heavy"], gimmick: "undying" },
    { name: "ミノタウロス", icon: "🐂", pattern: ["roar", "attack", "heavy"], gimmick: "rage" },
    { name: "鉄の処刑人", icon: "🪓", pattern: ["attack", "attack", "heavy"], gimmick: null },
  ],
  [ // 15F
    { name: "古竜", icon: "🐉", pattern: ["roar", "heavy", "attack", "heavy"], gimmick: "stoneskin" },
    { name: "双頭の獣", icon: "🐺", pattern: ["attack", "attack", "heavy"], gimmick: "split" },
    { name: "千眼の怪", icon: "👁️", pattern: ["attack", "heavy", "venom", "attack", "heavy"], gimmick: "arcane" },
  ],
];

// 20階の最終ボスは3体からランダム(固有パターン・固有ギミック持ち)
export const FINAL_BOSSES = [
  { name: "深淵の魔王", icon: "😈", pattern: ["roar", "flurry", "heavy", "guard", "heavy"], gimmick: null },
  { name: "灼熱の始祖", icon: "🔥", pattern: ["attack", "heavy", "roar", "heavy", "flurry"], gimmick: "ramp" },
  { name: "氷結の番人", icon: "🧊", pattern: ["guard", "heavy", "attack", "heavy", "roar"], gimmick: "petrify" },
];

// 図鑑用:ボスプール全種+最終ボス+エンドレスボスをまとめた一覧(重複なし)
export const ALL_BOSSES = [
  ...BOSS_POOLS.flat(),
  ...FINAL_BOSSES,
  { name: "虚無の使徒", icon: "🌑" },
  { name: "終焉竜", icon: "🐲" },
  { name: "深淵の王", icon: "👁️" },
];

export const PERKS = [
  { key: "atk", name: "腕力強化", desc: "攻撃力 +9", apply: p => ({ ...p, atk: p.atk + 9 }) },
  { key: "hp", name: "生命力", desc: "最大HP +45、HP +45", apply: p => ({ ...p, maxHp: p.maxHp + 45, hp: p.hp + 45 }) },
  { key: "def", name: "鉄の皮膚", desc: "防御力 +6", apply: p => ({ ...p, def: p.def + 6 }) },
  { key: "crit", name: "急所狙い", desc: "クリティカル率 +8%", apply: p => ({ ...p, crit: p.crit + 8 }) },
  { key: "critDmg", name: "残忍さ", desc: "クリティカル倍率 +30%", apply: p => ({ ...p, critDmg: p.critDmg + 30 }) },
  { key: "lifesteal", name: "血の渇き", desc: "吸血 +5%", apply: p => ({ ...p, lifesteal: p.lifesteal + 5 }) },
  { key: "double", name: "疾風", desc: "連撃率 +10%", apply: p => ({ ...p, double: p.double + 10 }) },
  { key: "thorns", name: "茨の体得", desc: "棘ダメージ +8", apply: p => ({ ...p, baseThorns: (p.baseThorns || 0) + 8 }) },
  { key: "potion", name: "錬金術", desc: "回復薬 +2個", apply: p => ({ ...p, potions: p.potions + 2 }) },
];

export const SKILLS = {
  strike: { name: "強撃", icon: "⚡", cd: 3, desc: "2.2倍ダメージ", spec: { mult: 2.2, hits: 1 } },
  flurry: { name: "乱れ斬り", icon: "🌪️", cd: 4, desc: "0.8倍×3連撃。1撃ごとにクリ判定", spec: { mult: 0.8, hits: 3 } },
  bloodblade: { name: "血の刃", icon: "🩸", cd: 3, desc: "1.4倍ダメージ+与ダメの60%を回復", spec: { mult: 1.4, hits: 1, healRatio: 0.6 } },
  execute: { name: "処刑", icon: "🪓", cd: 4, desc: "1.3倍。敵HP30%以下なら3倍", spec: { mult: 1.3, hits: 1, execute: true } },
  truestrike: { name: "見切り", icon: "🎯", cd: 3, desc: "1.2倍の確定クリティカル", spec: { mult: 1.2, hits: 1, forceCrit: true } },
  poisonblade: { name: "毒刃", icon: "🟣", cd: 3, desc: "1.3倍+猛毒を3ターン付与", spec: { mult: 1.3, hits: 1, applyStatus: { type: "poison", turns: 3, dmgRatio: 0.35 } } },
  flamestrike: { name: "火炎斬", icon: "🔥", cd: 3, desc: "1.5倍+炎上を3ターン付与", spec: { mult: 1.5, hits: 1, applyStatus: { type: "burn", turns: 3 } } },
  frostnova: { name: "フロストノヴァ", icon: "❄️", cd: 4, desc: "1.2倍+敵を2ターン凍結させる", spec: { mult: 1.2, hits: 1, applyStatus: { type: "freeze", turns: 2 } } },
  laceration: { name: "裂傷", icon: "🔪", cd: 3, desc: "1.3倍+出血を3ターン付与", spec: { mult: 1.3, hits: 1, applyStatus: { type: "bleed", turns: 3, dmgRatio: 0.35 } } },
  thunder: { name: "雷撃", icon: "🌩️", cd: 3, desc: "1.6倍+30%で気絶させる", locked: true, spec: { mult: 1.6, hits: 1, stunChance: 0.3 } },
  moonlight: { name: "月光斬", icon: "🌙", cd: 3, desc: "1.5倍。構え/大技予告中の敵には2.5倍", locked: true, spec: { mult: 1.5, hits: 1, punish: true } },
  // ===== 防御・カウンター系(ダメージを与えない、または攻撃と異なる形でダメージを返すスキル) =====
  ironguard: { name: "鉄壁の構え", icon: "🛡️", cd: 4, desc: "防御の構えを取り、攻撃力80%の反撃を即座に叩き込む", spec: { kind: "guard", counterMult: 0.8 } },
  deflect: { name: "捌きの構え", icon: "🥋", cd: 4, desc: "次に受ける攻撃を完全に見切り、攻撃力130%の反撃を叩き込む(1ターン限定)", spec: { kind: "parry", counterMult: 1.3 } },
  healchant: { name: "治癒の詠唱", icon: "💚", cd: 5, desc: "HPを最大HPの30%回復する", spec: { kind: "heal", healPct: 0.3 } },
  barrierchant: { name: "障壁の詠唱", icon: "🔷", cd: 5, desc: "最大HPの25%分の障壁を張り、以後のダメージを肩代わりする", spec: { kind: "shield", shieldPct: 0.25 } },
};

// ===== 状態異常 =====
export const STATUS = {
  poison: { name: "毒", icon: "🟣", color: "#a78bfa" },
  burn: { name: "炎上", icon: "🔥", color: "#fb923c" },
  freeze: { name: "凍結", icon: "❄️", color: "#60a5fa" },
  stun: { name: "気絶", icon: "💫", color: "#fbbf24" },
  bleed: { name: "出血", icon: "🩸", color: "#f87171" },
  weaken: { name: "衰弱", icon: "🔻", color: "#94a3b8" },
};

// ===== クラス/職業 =====
export const CLASSES = {
  warrior: {
    name: "戦士", icon: "⚔️", color: "#f87171",
    desc: "【闘志】被弾・防御で闘志が溜まる(与ダメ+6%/個)。MAXで次の攻撃が「解放」— 確定クリ×1.5倍",
    passive: "受けて溜めて、一撃で返す",
    base: p => ({ ...p, maxHp: p.maxHp + 30, hp: p.hp + 30, def: p.def + 3, atk: p.atk + 2 }),
    skill: "strike",
  },
  assassin: {
    name: "暗殺者", icon: "🗡️", color: "#a78bfa",
    desc: "【コンボ】ヒット+1・クリティカル+2で蓄積(クリ率+4%・連撃+2%/個、最大8)。被弾で-2",
    passive: "攻撃を途切れさせない者が最強",
    base: p => ({ ...p, crit: p.crit + 20, critDmg: p.critDmg + 40 }),
    skill: "truestrike",
  },
  vampire: {
    name: "吸血鬼", icon: "🧛", color: "#fb7185",
    desc: "【血の障壁】吸血の余剰回復の2倍がシールドに変換(最大HP25%まで・階をまたぎ持続)",
    passive: "吸血+10%。吸い過ぎた血が身を守る",
    base: p => ({ ...p, lifesteal: p.lifesteal + 10, maxHp: p.maxHp + 10, hp: p.hp + 10 }),
    skill: "bloodblade",
  },
  mage: {
    name: "魔術師", icon: "🔮", color: "#60a5fa",
    desc: "【共鳴】スキルで共鳴+1(スキルダメ+10%/個)。通常攻撃で解放:魔法追撃+全CD-共鳴数",
    passive: "スキル→スキル→解放のローテーション",
    base: p => ({ ...p, atk: p.atk + 3, maxHp: p.maxHp - 8, hp: p.hp - 8 }),
    skill: "frostnova",
  },
};

// ===== クラス固有スキルツリー(レベルアップで得たSPで解放) =====
// stat: 解放時に永続ステ上昇 / flag: 戦闘中に参照される効果
export const TREES = {
  warrior: [
    { key: "w3", name: "剛拳", desc: "気絶発生率 25%→50%、気絶中の敵への与ダメ+20%", flag: true, exclusiveWith: "w4" },
    { key: "w4", name: "不動の意志", desc: "HP30%以下の時、受けるダメージ-30%", flag: true, exclusiveWith: "w3" },
    { key: "w8", name: "巨人の心", desc: "闘志が最大の時、受けるダメージ-15%", flag: true },
    { key: "w9", name: "連続解放", desc: "解放発動後も闘志が0にならず1残る(次の解放が早まる)", flag: true },
    { key: "w10", name: "報復の構え", desc: "大技を受けた直後の次の攻撃は必ずクリティカル", flag: true },
  ],
  assassin: [
    { key: "a2", name: "猛毒", desc: "毒の継続ダメージ +60%", flag: true },
    { key: "a3", name: "影脚", desc: "連撃率 +15%(手数特化)", stat: p => ({ ...p, double: p.double + 15 }), exclusiveWith: "a4" },
    { key: "a4", name: "暗殺", desc: "敵HP25%以下に通常攻撃が致命の一撃(3倍・フィニッシャー特化)", flag: true, exclusiveWith: "a3" },
    { key: "a8", name: "影の相伝", desc: "敵撃破時、コンボを半分維持したまま次の戦闘へ持ち越す", flag: true },
    { key: "a9", name: "開幕の一撃", desc: "各戦闘の最初の攻撃は必ずクリティカル", flag: true },
    { key: "a10", name: "毒霧の残滓", desc: "毒状態の敵への攻撃命中時、毒の残りターン+1", flag: true },
  ],
  vampire: [
    { key: "v2", name: "不死再生", desc: "毎ターン最大HPの4%回復(持久特化)", flag: true, exclusiveWith: "v4" },
    { key: "v4", name: "渇望", desc: "吸血の回復量がさらに+50%(瞬間回復特化)", flag: true, exclusiveWith: "v2" },
    { key: "v8", name: "血の共鳴", desc: "敵を撃破すると、障壁が上限の10%分回復する", flag: true },
    { key: "v9", name: "眷属の絆", desc: "最大HP100につき吸血+1%(上限+10%)", flag: true },
    { key: "v10", name: "渇きの守り", desc: "障壁が1以上残っている間、受けるダメージ-10%", flag: true },
  ],
  mage: [
    { key: "m1", name: "業火", desc: "炎上ダメージ 6%→11%(継続ダメージ特化)", flag: true, exclusiveWith: "m4" },
    { key: "m2", name: "絶対零度", desc: "凍結時間 +1ターン", flag: true },
    { key: "m3", name: "魔力収束", desc: "スキルダメージ +25%", flag: true },
    { key: "m4", name: "連鎖詠唱", desc: "全スキルのCD -1(連発特化)", flag: true, exclusiveWith: "m1" },
    { key: "m8", name: "詠唱の加速", desc: "共鳴が2以上の時、使用スキルのCDがさらに-1", flag: true },
    { key: "m9", name: "知識の蓄積", desc: "スキルを使うたび永続でスキルダメージ+2%(累積、最大+20%)", flag: true },
    { key: "m10", name: "二重詠唱", desc: "共鳴解放時、20%の確率で共鳴を消費せず維持する", flag: true },
  ],
};

export const RELIC_CAP = 6; // レリックの同時所持上限(超える場合は入れ替えが必要)

// ===== レリック(永続パッシブ・拾って集める) =====
export const RELICS = [
  { key: "heart", name: "鋼の心臓", icon: "🫀", desc: "最大HP +60", stat: { maxHp: 60 } },
  { key: "gauntlet", name: "巨人の篭手", icon: "🥊", desc: "攻撃力 +7", stat: { atk: 7 } },
  { key: "blade", name: "暗殺者の刃", icon: "🔪", desc: "クリ率 +12%", stat: { crit: 12 } },
  { key: "execaxe", name: "処刑人の斧", icon: "🪓", desc: "クリ倍率 +60%", stat: { critDmg: 60 } },
  { key: "chalice", name: "吸血の杯", icon: "🍷", desc: "吸血 +8%", stat: { lifesteal: 8 } },
  { key: "feather", name: "疾風の羽", icon: "🪶", desc: "連撃率 +12%", stat: { double: 12 } },
  { key: "shell", name: "棘の外殻", icon: "🦔", desc: "棘ダメージ +14", stat: { thorns: 14 } },
  { key: "sage", name: "賢者の石", icon: "💠", desc: "スキルダメージ +20%", flag: "skillDmg" },
  { key: "phoenix", name: "不死鳥の羽", icon: "🪽", desc: "各戦闘開始時にHP12%回復", flag: "regenStart" },
  { key: "greed", name: "強欲の護符", icon: "🤑", desc: "ゴールド獲得 +50%", flag: "gold" },
  { key: "wisdom", name: "知恵の書", icon: "📖", desc: "獲得XP +30%", flag: "xp" },
  { key: "venom", name: "猛毒の指輪", icon: "🟢", desc: "毒の継続ダメージ +60%", flag: "poison" },
  { key: "ember", name: "業火の宝珠", icon: "🔆", desc: "炎上ダメージ +60%", flag: "burn" },
  { key: "glacier", name: "氷河の核", icon: "🧊", desc: "凍結時間 +1ターン", flag: "freeze" },
  { key: "bloodring", name: "血の指輪", icon: "🔴", desc: "出血の継続ダメージ +60%", flag: "bleed" },
  // シナジーフック系レリック(系統ビルドの核)
  { key: "snake", name: "蛇神の牙", icon: "🐍", desc: "毒威力 +40%", stat: { poisonPower: 40 } },
  { key: "salamander", name: "火蜥蜴の心臓", icon: "🦎", desc: "炎威力 +50%", stat: { burnPower: 50 } },
  { key: "crimsonblade", name: "深紅の刃", icon: "🗡️", desc: "出血威力 +40%", stat: { bleedPower: 40 } },
  { key: "chains", name: "枷の鎖", icon: "⛓️", desc: "衰弱威力 +15%", stat: { weakenPower: 15 } },
  { key: "hunter", name: "狩人の瞳", icon: "🦅", desc: "状態異常中の敵への与ダメ +25%", stat: { dmgVsStatus: 25 } },
  { key: "bulwark", name: "反撃の大盾", icon: "🛡️", desc: "防御中、棘ダメージ2倍", stat: { defendThornsMult: 1 } },
  { key: "momentum", name: "勢いの砂時計", icon: "⏳", desc: "クリティカル時40%で全スキルCD-1", stat: { onCritCd: 1 } },
  { key: "leech", name: "無数の蛭", icon: "🪱", desc: "攻撃1ヒットごとにHP+3", stat: { perHitHeal: 3 } },
  { key: "avenger", name: "復讐者の紋章", icon: "⚜️", desc: "防御した次のターン、与ダメ +35%", stat: { afterDefendDmg: 35 } },
  { key: "bloodthorn", name: "血染めの棘", icon: "🥀", desc: "棘ダメージが20%で2倍になる(棘クリティカル)", stat: { thornsCrit: 20 } },
  { key: "abyssring", name: "深淵の指輪", icon: "💍", desc: "攻撃力 +6、防御力 +6", stat: { atk: 6, def: 6 } },
  { key: "bloodtear", name: "血涙の宝珠", icon: "💧", desc: "敵撃破時、最大HPの15%回復", stat: { onKillHeal: 15 } },
  { key: "fairydust", name: "妖精の粉", icon: "✨", desc: "敵の攻撃を10%で完全に回避する", stat: { dodge: 10 } },
  { key: "wardrum", name: "戦いの太鼓", icon: "🥁", desc: "全ての与ダメージ +10%", stat: { flatDmg: 10 } },
  { key: "executioner_hourglass", name: "終焉の砂時計", icon: "⏳", desc: "敵HP15%以下への与ダメ +50%", stat: { executeBonus: 50 } },
  { key: "snowballblade", name: "加速する連撃", icon: "🌀", desc: "連撃が発生するたび、その戦闘中は連撃率+4%ずつ蓄積(最大+20%)", stat: { doubleSnowball: 4 } },
  { key: "critripple", name: "会心の波紋", icon: "💠", desc: "クリティカル時、15%の確率でもう1回攻撃が発生する", stat: { critRipple: 15 } },
];

export const RELIC_MAP = Object.fromEntries(RELICS.map(r => [r.key, r]));

export const FINAL_FLOOR = 20;

export const DIFF_RAMP_FLOORS = 5; // 難易度倍率がこの階数までかけて本来の値まで上がる(各難易度のrampFloorsが優先。フォールバック用)

// ボスの固有行動パターン(周期ローテーション。覚えれば読み切れる)
export const BOSS_PATTERNS = [
  ["attack", "attack", "heavy"],           // 猛攻型
  ["guard", "attack", "heavy"],            // 守勢型
  ["roar", "attack", "heavy"],             // 強化型
  ["attack", "venom", "heavy"],            // 毒使い
];


// ===== 敵の行動予告(インテント) =====
// 敵は次のターンに何をするか事前に開示する。プレイヤーはそれを見て行動を選ぶ
export const INTENTS = {
  attack: { key: "attack", icon: "🗡️", name: "攻撃" },
  heavy: { key: "heavy", icon: "💢", name: "大技", mult: 2.2 },
  flurry: { key: "flurry", icon: "🌀", name: "連攻", mult: 0.55 }, // 0.55倍×3連撃(防御が最も有効)
  guard: { key: "guard", icon: "🛡️", name: "構え" },   // 次に受けるダメージ-50%
  roar: { key: "roar", icon: "📢", name: "咆哮" },     // 自身の攻撃+15%(累積、最大×2.0)
  venom: { key: "venom", icon: "🟣", name: "毒撃", mult: 0.8 }, // 弱攻撃+毒を2ターン付与
};

export const STAT_LABELS = { atk: "攻撃", def: "防御", hp: "HP", crit: "クリ率", critDmg: "クリ倍率", lifesteal: "吸血", double: "連撃", thorns: "棘", poisonPower: "毒威力", burnPower: "炎威力", bleedPower: "出血威力", weakenPower: "衰弱威力", dmgVsStatus: "対状態異常", perHitHeal: "ヒット毎回復", afterDefendDmg: "防御後火力", onKillHeal: "撃破時回復", critVsCC: "対行動不能クリ確定", defendThornsMult: "防御中棘倍加", onDefendFreezeCh: "防御時凍結", onDefendWeaken: "防御時衰弱付与", onCritCd: "クリ時CD短縮", betterDefend: "防御強化(-80%)", gambleDmg: "気まぐれな打撃", alwaysPoison: "攻撃毎に毒", alwaysBurn: "攻撃毎に炎上", alwaysBleed: "攻撃毎に出血", alwaysWeaken: "攻撃毎に衰弱", critBleed: "クリ時に出血付与", poisonWeaken: "毒の敵の攻撃力減少", thornsScale: "棘に攻撃力加算", thornsDef: "棘に防御力加算", thornsPoison: "棘が毒を付与", thornsCrit: "棘クリティカル率" };

export const PCT_KEYS = ["crit", "critDmg", "lifesteal", "double", "poisonPower", "burnPower", "bleedPower", "weakenPower", "dmgVsStatus", "afterDefendDmg", "onKillHeal", "onDefendFreezeCh"];

export const LOG_COLORS = { info: "#a8a29e", dmg: "#f87171", hurt: "#fb923c", heal: "#4ade80", gold: "#fbbf24" };
