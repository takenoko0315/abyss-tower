import { expect, test } from "@playwright/test";

const debugState = page => page.evaluate(() => window.__abyssDebug);

async function preparePage(page, contract) {
  await page.addInitScript(() => {
    localStorage.clear();
    Math.random = () => 0.5;
    window.__abyssTestFast = true;
  });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => Boolean(window.__abyssE2E))).toBe(true);
  await page.evaluate(key => window.__abyssE2E.startContractRun(key), contract);
  await expect.poll(async () => (await debugState(page)).scene).toBe("combat");
}

async function patchCombat(page, playerPatch) {
  await page.evaluate(patch => {
    window.__abyssE2E.patchPlayer(patch);
    window.__abyssE2E.patchEnemy({
      hp: 1000,
      maxHp: 1000,
      atk: 1,
      trait: null,
      gimmick: null,
      guardTurns: 0,
      status: {},
      intent: "roar",
    });
  }, {
    cls: "mage",
    variant: "a",
    crit: 0,
    double: 0,
    def: 100,
    fury: 0,
    combo: 0,
    resonance: 0,
    ...playerPatch,
  });
  await expect.poll(async () => (await debugState(page)).player.hp).toBe(playerPatch.hp);
}

async function attackDamage(page) {
  const before = (await debugState(page)).enemy.hp;
  await page.getByTestId("attack-button").click();
  await expect.poll(async () => (await debugState(page)).enemy.hp).toBeLessThan(before);
  return before - (await debugState(page)).enemy.hp;
}

async function resetEnemy(page) {
  await page.evaluate(() => window.__abyssE2E.patchEnemy({
    hp: 1000,
    maxHp: 1000,
    guardTurns: 0,
    status: {},
    intent: "roar",
  }));
  await expect.poll(async () => {
    const enemy = (await debugState(page)).enemy;
    return [enemy.hp, enemy.guardTurns, enemy.intent];
  }).toEqual([1000, 0, "roar"]);
}

test("通常の開発プレイではE2E状態変更APIを公開しない", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(() => typeof window.__abyssE2E)).toBe("undefined");
});

test("狂血: HPに応じて表示倍率と実ダメージが増減する", async ({ page }) => {
  await preparePage(page, "ks_frenzy");
  const maxHp = (await debugState(page)).stats.maxHp;

  await patchCombat(page, { hp: maxHp, potions: 3 });
  const fullMultiplier = Number(await page.getByTestId("attack-multiplier").getAttribute("data-multiplier"));
  expect(fullMultiplier).toBeCloseTo(1.1, 4);
  const fullDamage = await attackDamage(page);

  await patchCombat(page, { hp: maxHp / 2, potions: 3 });
  const lowMultiplier = Number(await page.getByTestId("attack-multiplier").getAttribute("data-multiplier"));
  expect(lowMultiplier).toBeCloseTo(1.54, 4);
  expect(lowMultiplier).toBeGreaterThan(fullMultiplier);
  const lowDamage = await attackDamage(page);
  expect(lowDamage).toBeGreaterThan(fullDamage);

  await patchCombat(page, { hp: maxHp / 2, potions: 3, quickDrinkUsed: false });
  await page.getByTestId("potion-button").click();
  await expect.poll(async () => (await debugState(page)).player.hp).toBe(maxHp / 2 + 18);
  const healedMultiplier = Number(await page.getByTestId("attack-multiplier").getAttribute("data-multiplier"));
  expect(healedMultiplier).toBeLessThan(lowMultiplier);
  expect(healedMultiplier).toBeGreaterThan(fullMultiplier);
});

test("収集家: 開始レリック1個、最大HP-12%、上限6を維持する", async ({ page }) => {
  await preparePage(page, "ks_collector");
  const started = await debugState(page);
  expect(started.player.maxHp).toBe(79); // 戦士の通常90HPから12%(11)減少
  expect(started.player.relics).toHaveLength(1);
  expect(await page.evaluate(() => window.__abyssE2E.relicCap)).toBe(6);
  const startingRelic = started.player.relics[0];

  await patchCombat(page, { hp: started.player.hp });
  await attackDamage(page);
  expect((await debugState(page)).player.relics).toEqual([startingRelic]);

  await page.getByTestId("status-button").click();
  await expect(page.getByText("(1/6枠", { exact: false })).toBeVisible();
});

test("錬金: 手動回復は80%で、次の攻撃だけ2倍になる", async ({ page }) => {
  await preparePage(page, "ks_catalyst");
  await patchCombat(page, { hp: 10, potions: 3, quickDrinkUsed: false });

  await page.getByTestId("potion-button").click();
  await expect.poll(async () => (await debugState(page)).player.hp).toBe(39); // round(90 * 0.4 * 0.8) = 29
  const boosted = await attackDamage(page);
  await resetEnemy(page);
  const normal = await attackDamage(page);
  expect(boosted).toBe(normal * 2);
});

test("錬金: 自動回復も80%で、次の攻撃だけ2倍になる", async ({ page }) => {
  await preparePage(page, "ks_catalyst");
  await patchCombat(page, {
    hp: 20,
    potions: 3,
    autoPotionLeft: 1,
    quickDrinkUsed: true,
  });

  await page.evaluate(() => window.__abyssE2E.runEnemyTurn());
  await expect.poll(async () => (await debugState(page)).player.hp).toBe(49);
  const afterAuto = await debugState(page);
  expect(afterAuto.player.potions).toBe(2);
  expect(afterAuto.player.autoPotionLeft).toBe(0);
  expect(afterAuto.player.nextAtkDouble).toBe(true);

  const boosted = await attackDamage(page);
  await resetEnemy(page);
  const normal = await attackDamage(page);
  expect(boosted).toBe(normal * 2);
});
