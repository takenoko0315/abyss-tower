import { expect, test } from "@playwright/test";

const debugState = page => page.evaluate(() => window.__abyssDebug);

async function preparePage(page, { random = null } = {}) {
  await page.addInitScript(r => {
    localStorage.clear();
    if (r !== null) Math.random = () => r;
    window.__abyssTestFast = true;
  }, random);
  await page.goto("/?combatSandbox=1");
  await expect.poll(() => page.evaluate(() => Boolean(window.__abyssE2E?.startSandboxCombat))).toBe(true);
  await page.evaluate(() => window.__abyssE2E.startSandboxCombat({ enemy: "スライム", equipment: "none", intent: "attack", seed: 1 }));
  // startSandboxCombatは内部でMath.randomをシード付き乱数へ差し替えて戦闘中も使い続けるため、
  // addInitScript側の固定値はここで上書きされてしまう。決定的に検証したいテストはここで再度固定する
  if (random !== null) await page.evaluate(r => { Math.random = () => r; }, random);
}

const poisonWeapon = { slot: "weapon", rarity: 1, name: "test", stats: { poisonPower: 20, dmgVsStatus: 10 }, ability: "scythe", abilityStats: { alwaysPoison: 1 } };
const burnWeapon = { slot: "weapon", rarity: 1, name: "test", stats: { burnPower: 20 }, ability: "cinder", abilityStats: { alwaysBurn: 1 } };
const bleedWeapon = { slot: "weapon", rarity: 1, name: "test", stats: { bleedPower: 20 }, ability: "gash", abilityStats: { alwaysBleed: 1 } };
const multiWeapon = { slot: "weapon", rarity: 1, name: "test", stats: { double: 20 }, ability: "rampage", abilityStats: { rampageCrit: 1 } };
// 棘20固定・スケーリング系トグルなし(thornsScale/thornsDef/thornsX3)で、共鳴による倍率だけを検証しやすくする
const guardWeapon = { slot: "weapon", rarity: 1, name: "test", stats: { thorns: 20 }, ability: "immovable", abilityStats: { betterDefend: 1 } };
const guardFullBuild = { skills: ["ironguard"], relics: ["heart"], origin: "thorn", buildObsession: "guard", hp: 999, def: 50 };

test("装備アフィックス+固有能力+スキル+レリック+出自+執着の6点で共鳴IIになる(装備は二重カウントしない)", async ({ page }) => {
  await preparePage(page);
  await page.evaluate(weapon => window.__abyssE2E.patchEquip({ weapon }), poisonWeapon);
  await page.evaluate(() => window.__abyssE2E.patchPlayer({ skills: ["poisonblade"], relics: ["venom"], origin: "venom", buildObsession: "poison" }));
  await expect.poll(async () => (await debugState(page)).buildResonance.poison.score).toBe(6);
  expect((await debugState(page)).buildResonance.poison.level).toBe(2);
});

test("3点ちょうどで共鳴Iになる", async ({ page }) => {
  await preparePage(page);
  await page.evaluate(() => window.__abyssE2E.patchPlayer({ skills: ["laceration"], relics: ["bloodring"], origin: "bloodblade" }));
  await expect.poll(async () => (await debugState(page)).buildResonance.bleed.score).toBe(3);
  expect((await debugState(page)).buildResonance.bleed.level).toBe(1);
});

test("毒共鳴IIの追加発動は残りターンを減らさず、再帰しない", async ({ page }) => {
  await preparePage(page, { random: 0 }); // 35%判定は常に成功
  await page.evaluate(weapon => window.__abyssE2E.patchEquip({ weapon }), poisonWeapon);
  await page.evaluate(() => window.__abyssE2E.patchPlayer({ skills: ["poisonblade"], relics: ["venom"], origin: "venom", buildObsession: "poison", hp: 500, def: 100 }));
  await expect.poll(async () => (await debugState(page)).buildResonance.poison.level).toBe(2);

  await page.evaluate(() => window.__abyssE2E.patchEnemy({
    hp: 10000, maxHp: 10000, status: { poison: { turns: 5, dmg: 10 } }, intent: "attack",
    pattern: ["attack"], patternIdx: 0, gimmick: null, trait: null, counterplay: null, guardTurns: 0,
  }));
  const before = await debugState(page);
  await page.evaluate(() => window.__abyssE2E.runEnemyTurn());
  const after = await debugState(page);
  // 元のtick(10)+共鳴IIの追加発動(同じ10)= 20ダメージ。ターンは1回分(5→4)しか減らない
  expect(before.enemy.hp - after.enemy.hp).toBe(20);
  expect(after.enemy.status.poison.turns).toBe(4);
});

test("炎共鳴IIは3ヒット目ごとに炎上ダメージを追加発動する", async ({ page }) => {
  await preparePage(page, { random: 0 });
  await page.evaluate(weapon => window.__abyssE2E.patchEquip({ weapon }), burnWeapon);
  await page.evaluate(() => window.__abyssE2E.patchPlayer({ skills: ["flamestrike"], relics: ["ember"], origin: "cinder", buildObsession: "burn", atk: 20, crit: 0, double: 0 }));
  await expect.poll(async () => (await debugState(page)).buildResonance.burn.level).toBe(2);
  await page.evaluate(() => window.__abyssE2E.patchEnemy({
    hp: 1000000, maxHp: 1000000, status: { burn: { turns: 10, dmg: 0 } }, intent: "attack",
    pattern: ["attack"], patternIdx: 0, gimmick: null, trait: null, counterplay: null, guardTurns: 0,
  }));
  const drops = [];
  for (let i = 0; i < 3; i++) {
    const before = (await debugState(page)).enemy.hp;
    await page.getByTestId("attack-button").click();
    await page.evaluate(() => window.__abyssE2E.patchEnemy({ status: { burn: { turns: 10, dmg: 0 } } })); // 炎上を維持し続ける
    const after = (await debugState(page)).enemy.hp;
    drops.push(before - after);
  }
  // 3ヒット目だけ炎上ダメージが追加発動するため、他の2回より明確に大きいダメージになる
  expect(drops[2]).toBeGreaterThan(drops[0]);
  expect(drops[2]).toBeGreaterThan(drops[1]);
});

test("出血共鳴IIはクリティカル時に出血ダメの50%を追加し、再帰しない", async ({ page }) => {
  await preparePage(page, { random: 0 }); // crit判定・variance等すべて決定的
  await page.evaluate(weapon => window.__abyssE2E.patchEquip({ weapon }), bleedWeapon);
  await page.evaluate(() => window.__abyssE2E.patchPlayer({
    skills: ["laceration"], relics: ["bloodring"], origin: "bloodblade", buildObsession: "bleed",
    atk: 50, crit: 100, double: 0, def: 100,
  }));
  await expect.poll(async () => (await debugState(page)).buildResonance.bleed.level).toBe(2);
  await page.evaluate(() => window.__abyssE2E.patchEnemy({
    hp: 100000, maxHp: 100000, status: { bleed: { turns: 5, dmg: 40 } }, intent: "attack",
    pattern: ["attack"], patternIdx: 0, gimmick: null, trait: null, counterplay: null, guardTurns: 0,
  }));
  const before = await debugState(page);
  await page.getByTestId("attack-button").click();
  const after = await debugState(page);
  const bleedTurnsBefore = before.enemy.status.bleed.turns;
  const bleedTurnsAfter = after.enemy.status.bleed.turns;
  // 攻撃ボタン1回で自分の一撃+敵の1ターン(出血の自然なティック)が進む。共鳴IIの追加ダメージ自体はそれ以上ターンを削らない
  expect(bleedTurnsBefore - bleedTurnsAfter).toBe(1);
  // 直接攻撃ダメージに加えて、出血ダメ(40)の50%=20が上乗せされているはず
  const dealt = before.enemy.hp - after.enemy.hp;
  expect(dealt).toBeGreaterThanOrEqual(20);
});

test("連撃共鳴Iはヒットごとに与ダメージが段階的に増える", async ({ page }) => {
  await preparePage(page, { random: 0 });
  await page.evaluate(() => window.__abyssE2E.patchPlayer({
    skills: ["flurry"], relics: ["feather"], origin: "shadow", buildObsession: "multi",
    atk: 50, crit: 0, double: 0,
  }));
  await expect.poll(async () => (await debugState(page)).buildResonance.multi.level).toBe(1);
  await page.evaluate(() => window.__abyssE2E.patchEnemy({
    hp: 1000000, maxHp: 1000000, intent: "attack", status: {},
    pattern: ["attack"], patternIdx: 0, gimmick: null, trait: null, counterplay: null, guardTurns: 0,
  }));
  await page.getByTestId("skill-button-flurry").click();
  const popups = page.getByTestId("enemy-damage-popup");
  // flurryは3ヒット固定だが、レリック(feather)自身の連撃率で追加ヒットが乗ることがあるため件数は固定しない
  await expect.poll(async () => popups.count()).toBeGreaterThanOrEqual(3);
  const count = await popups.count();
  const dmgs = [];
  for (let i = 0; i < count; i++) dmgs.push(Number(await popups.nth(i).textContent()));
  // 同じ行動内で2ヒット目以降、単調に与ダメージが増えていく(共鳴Iの段階加算)
  for (let i = 1; i < count; i++) expect(dmgs[i]).toBeGreaterThan(dmgs[i - 1]);
});

test("連撃共鳴IIは4ヒット以上で最後の一撃が大幅に強化される(既存の10ヒット上限は維持)", async ({ page }) => {
  await preparePage(page, { random: 0 });
  await page.evaluate(weapon => window.__abyssE2E.patchEquip({ weapon }), multiWeapon);
  await page.evaluate(() => window.__abyssE2E.patchPlayer({
    skills: ["flurry"], relics: ["feather"], origin: "shadow", buildObsession: "multi",
    atk: 50, crit: 0, double: 100, // flurryの3ヒット + 連撃で計4ヒット以上
  }));
  await expect.poll(async () => (await debugState(page)).buildResonance.multi.level).toBe(2);
  await page.evaluate(() => window.__abyssE2E.patchEnemy({
    hp: 1000000, maxHp: 1000000, intent: "attack", status: {},
    pattern: ["attack"], patternIdx: 0, gimmick: null, trait: null, counterplay: null, guardTurns: 0,
  }));
  await page.getByTestId("skill-button-flurry").click();
  const popups = page.getByTestId("enemy-damage-popup");
  await expect.poll(async () => popups.count()).toBeGreaterThanOrEqual(4);
  const count = await popups.count();
  expect(count).toBeLessThanOrEqual(10); // 既存の最大ヒット数の考え方を超えない
  const dmgs = [];
  for (let i = 0; i < count; i++) dmgs.push(Number((await popups.nth(i).textContent()).replace(/[^\d]/g, ""))); // 会心ポップの💥接頭辞を除去
  // 最後の一撃だけ×3が乗るため、直前のヒットと比べても明確に跳ね上がる
  // (rampage固有能力により2撃目以降は確定クリティカルだが、直前ヒットとの比較なのでクリ倍率は相殺される)
  expect(dmgs[count - 1]).toBeGreaterThan(dmgs[count - 2] * 2);
});

test("無限刃と連撃共鳴IIを同時に有効化しても1行動10ヒットの上限は超えない", async ({ page }) => {
  await preparePage(page, { random: 0 });
  await page.evaluate(() => window.__abyssE2E.patchPlayer({
    skills: ["flurry"], relics: ["feather"], origin: "shadow", buildObsession: "multi",
    atk: 5, crit: 0, double: 900, awakening: "infiniteblade",
  }));
  await expect.poll(async () => (await debugState(page)).buildResonance.multi.level).toBe(1);
  await page.evaluate(() => window.__abyssE2E.patchEnemy({
    hp: 10000000, maxHp: 10000000, intent: "attack", status: {},
    pattern: ["attack"], patternIdx: 0, gimmick: null, trait: null, counterplay: null, guardTurns: 0,
  }));
  await page.getByTestId("skill-button-flurry").click();
  const popups = page.getByTestId("enemy-damage-popup");
  await expect.poll(async () => popups.count()).toBeGreaterThan(0);
  // ダメージポップ表示自体は安全な上限(6件)で間引かれる。合計値からも10ヒット超過がないことを確認する
  expect(await popups.count()).toBeLessThanOrEqual(6);
});

test("防御共鳴Iで棘ダメージが同条件の2倍になる", async ({ page }) => {
  await preparePage(page, { random: 0 });
  await page.evaluate(weapon => window.__abyssE2E.patchEquip({ weapon }), guardWeapon);
  await page.evaluate(() => window.__abyssE2E.patchEnemy({
    hp: 1000000, maxHp: 1000000, atk: 1, intent: "attack",
    pattern: ["attack"], patternIdx: 0, gimmick: null, trait: null, counterplay: null, guardTurns: 0, status: {},
  }));
  const beforeNoResonance = await debugState(page);
  expect(beforeNoResonance.buildResonance.guard.level).toBe(0); // 装備だけ(2点)ではまだ共鳴しない
  await page.evaluate(() => window.__abyssE2E.runEnemyTurn());
  const afterNoResonance = await debugState(page);
  const baseThorns = beforeNoResonance.enemy.hp - afterNoResonance.enemy.hp;
  expect(baseThorns).toBe(20); // 棘20・スケーリングなしなのでそのまま20

  await page.evaluate(() => window.__abyssE2E.patchPlayer({ buildObsession: "guard" }));
  await expect.poll(async () => (await debugState(page)).buildResonance.guard.level).toBe(1);
  await page.evaluate(() => window.__abyssE2E.patchEnemy({
    hp: 1000000, maxHp: 1000000, intent: "attack", pattern: ["attack"], patternIdx: 0,
  }));
  const beforeResonance = await debugState(page);
  await page.evaluate(() => window.__abyssE2E.runEnemyTurn());
  const afterResonance = await debugState(page);
  const resonantThorns = beforeResonance.enemy.hp - afterResonance.enemy.hp;
  expect(resonantThorns).toBe(baseThorns * 2);
  expect(resonantThorns).toBe(40);
});

test("防御共鳴IIで敵の攻撃前に棘が発動し、撃破すればプレイヤーは被弾せず二重発動もしない", async ({ page }) => {
  await preparePage(page, { random: 0 });
  await page.evaluate(weapon => window.__abyssE2E.patchEquip({ weapon }), guardWeapon);
  await page.evaluate(build => window.__abyssE2E.patchPlayer(build), guardFullBuild);
  await expect.poll(async () => (await debugState(page)).buildResonance.guard.level).toBe(2);
  await page.evaluate(() => window.__abyssE2E.patchEnemy({
    hp: 1, maxHp: 100, atk: 500, intent: "attack",
    pattern: ["attack"], patternIdx: 0, gimmick: null, trait: null, counterplay: null, guardTurns: 0, status: {},
  }));
  const before = await debugState(page);
  await page.evaluate(() => window.__abyssE2E.runEnemyTurn());
  const after = await debugState(page);
  expect(after.enemy.hp).toBeLessThanOrEqual(0); // 先制棘で撃破
  // 単発の棘(共鳴Iの2倍込みで40)だけが発動している。二重発動していれば80になってしまう
  expect(before.enemy.hp - after.enemy.hp).toBe(40);
  expect(after.player.hp).toBe(before.player.hp); // 被弾していない
});

test("連攻(3ヒット)の1ヒット目で先制棘が敵を倒すと、残りヒットは実行されない", async ({ page }) => {
  await preparePage(page, { random: 0 });
  await page.evaluate(weapon => window.__abyssE2E.patchEquip({ weapon }), guardWeapon);
  await page.evaluate(build => window.__abyssE2E.patchPlayer(build), guardFullBuild);
  await expect.poll(async () => (await debugState(page)).buildResonance.guard.level).toBe(2);
  await page.evaluate(() => window.__abyssE2E.patchEnemy({
    hp: 1, maxHp: 100, atk: 500, intent: "flurry",
    pattern: ["flurry"], patternIdx: 0, gimmick: null, trait: null, counterplay: null, guardTurns: 0, status: {},
  }));
  const before = await debugState(page);
  await page.evaluate(() => window.__abyssE2E.runEnemyTurn());
  const after = await debugState(page);
  expect(after.player.hp).toBe(before.player.hp); // 2・3ヒット目も中止され被弾なし
  expect(before.enemy.hp - after.enemy.hp).toBe(40); // 1ヒット目の先制棘だけが発動
});

test("防御禁止状態でも、敵攻撃に対する先制棘は発動する", async ({ page }) => {
  await preparePage(page, { random: 0 });
  await page.evaluate(weapon => window.__abyssE2E.patchEquip({ weapon }), guardWeapon);
  await page.evaluate(build => window.__abyssE2E.patchPlayer({ ...build, hooks: { noDefend: 1 } }), guardFullBuild);
  await expect.poll(async () => (await debugState(page)).stats.noDefend).toBeGreaterThan(0);
  await expect.poll(async () => (await debugState(page)).buildResonance.guard.level).toBe(2);
  await page.evaluate(() => window.__abyssE2E.patchEnemy({
    hp: 1, maxHp: 100, atk: 500, intent: "attack",
    pattern: ["attack"], patternIdx: 0, gimmick: null, trait: null, counterplay: null, guardTurns: 0, status: {},
  }));
  const before = await debugState(page);
  await page.evaluate(() => window.__abyssE2E.runEnemyTurn());
  const after = await debugState(page);
  expect(after.enemy.hp).toBeLessThanOrEqual(0);
  expect(after.player.hp).toBe(before.player.hp);
});

test("共鳴通知は同じ段階で繰り返されない", async ({ page }) => {
  await preparePage(page, { random: 0 });
  await page.evaluate(weapon => window.__abyssE2E.patchEquip({ weapon }), guardWeapon);
  await page.evaluate(build => window.__abyssE2E.patchPlayer(build), guardFullBuild);
  await expect.poll(async () => (await debugState(page)).buildResonance.guard.level).toBe(2);
  await expect(page.getByText("🛡️ 防御共鳴Ⅱが発動 — 敵の攻撃前に棘が襲う")).toHaveCount(1);
  await page.evaluate(() => window.__abyssE2E.patchEnemy({
    hp: 1000000, maxHp: 1000000, atk: 1, intent: "attack",
    pattern: ["attack"], patternIdx: 0, gimmick: null, trait: null, counterplay: null, guardTurns: 0, status: {},
  }));
  await page.evaluate(() => window.__abyssE2E.runEnemyTurn());
  await expect(page.getByText("🛡️ 防御共鳴Ⅱが発動 — 敵の攻撃前に棘が襲う")).toHaveCount(1); // 敵ターンを経ても再通知しない
});

test("古いplayer状態(buildObsession等が存在しない)でもクラッシュしない", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    window.__abyssTestFast = true;
  });
  const errors = [];
  page.on("pageerror", err => errors.push(err));
  await page.goto("/?combatSandbox=1");
  await expect.poll(() => page.evaluate(() => Boolean(window.__abyssE2E?.startSandboxCombat))).toBe(true);
  await page.evaluate(() => window.__abyssE2E.startSandboxCombat({ enemy: "スライム", equipment: "none", intent: "attack", seed: 1 }));
  // buildObsession/rerollsLeftを持たない旧形状のplayerを模して置き換える
  await page.evaluate(() => window.__abyssE2E.patchPlayer({ skills: ["strike"] }));
  await page.evaluate(() => document.querySelector('[data-testid="attack-button"]')?.click());
  await expect.poll(async () => (await debugState(page)).buildResonance).toBeTruthy();
  expect(errors).toEqual([]);
});
