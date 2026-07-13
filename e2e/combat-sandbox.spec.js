import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("sandbox-sentinel", "keep");
    localStorage.setItem("abyss-meta", JSON.stringify({ version: 1, data: { souls: 77 }, marker: "unchanged" }));
    window.__abyssTestFast = true;
  });
  await page.goto("/?combatSandbox=1");
});

test("DEV明示フラグから鉄の処刑人を直接開始し、同条件で再戦できる", async ({ page }) => {
  await page.getByTestId("open-combat-sandbox").click();
  await expect(page.getByTestId("combat-sandbox")).toBeVisible();
  await page.getByTestId("sandbox-enemy").selectOption({ label: "鉄の処刑人" });
  await page.getByTestId("sandbox-intent").selectOption("heavy");
  await page.getByTestId("sandbox-start").click();
  await expect.poll(() => page.evaluate(() => window.__abyssDebug.enemy.name)).toBe("鉄の処刑人");
  const initial = await page.evaluate(() => ({ maxHp: window.__abyssDebug.enemy.maxHp, atk: window.__abyssDebug.enemy.atk, intent: window.__abyssDebug.enemy.intent }));
  await page.evaluate(() => window.__abyssE2E.patchEnemy({ hp: 1, atk: 1 }));
  await page.getByTestId("attack-button").click();
  await expect(page.getByTestId("sandbox-result")).toBeVisible();
  await page.getByTestId("sandbox-retry").click();
  await expect.poll(() => page.evaluate(() => window.__abyssDebug.enemy.name)).toBe("鉄の処刑人");
  expect(await page.evaluate(() => ({ maxHp: window.__abyssDebug.enemy.maxHp, atk: window.__abyssDebug.enemy.atk, intent: window.__abyssDebug.enemy.intent }))).toEqual(initial);
  expect(await page.evaluate(() => localStorage.getItem("sandbox-sentinel"))).toBe("keep");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("abyss-meta")).marker)).toBe("unchanged");
});

test("不正入力を安全な既定値へ正規化する", async ({ page }) => {
  await page.evaluate(() => window.__abyssE2E.startSandboxCombat({ enemy: "存在しない敵", cls: "invalid", floor: -99, hp: 9999, seed: "NaN", patternIdx: -4, intent: "invalid", equipment: "invalid" }));
  const state = await page.evaluate(() => window.__abyssDebug);
  expect(state.player.cls).toBe("warrior");
  expect(state.floor).toBe(1);
  expect(state.player.hp).toBe(state.stats.maxHp);
  expect(state.enemy.name).toBe("鉄の処刑人");
  expect(state.enemy.intent).toBe("attack");
  expect(state.enemy.patternIdx).toBe(0);
});

test("開始例外時にMath.randomを復元する", async ({ page }) => {
  expect(await page.evaluate(() => {
    const original = Math.random;
    try { window.__abyssE2E.startSandboxCombat({ __testThrowAfterRandom: true }); } catch { /* expected */ }
    return Math.random === original;
  })).toBe(true);
});

test("退出時に通常ゲーム状態を復元し、再入場できる", async ({ page }) => {
  const before = await page.evaluate(() => {
    window.__sandboxOriginalRandom = Math.random;
    return { floor: window.__abyssDebug.floor, hp: window.__abyssDebug.player.hp, scene: window.__abyssDebug.scene };
  });
  await page.getByTestId("open-combat-sandbox").click();
  await page.getByTestId("sandbox-start").click();
  await page.evaluate(() => window.__abyssE2E.patchEnemy({ hp: 1, atk: 1 }));
  await page.getByTestId("attack-button").click();
  await page.getByTestId("sandbox-change").click();
  await page.getByTestId("sandbox-exit").click();
  const after = await page.evaluate(() => ({ floor: window.__abyssDebug.floor, hp: window.__abyssDebug.player.hp, scene: window.__abyssDebug.scene, randomRestored: Math.random === window.__sandboxOriginalRandom }));
  expect(after).toEqual({ ...before, randomRestored: true });
  await page.getByTestId("open-combat-sandbox").click();
  await expect(page.getByTestId("combat-sandbox")).toBeVisible();
});

test("同seed・同操作列の戦闘結果を再現する", async ({ page }) => {
  const runSequence = async () => {
    await page.evaluate(() => {
      window.__abyssE2E.patchPlayer({ hp: 999, atk: 30, def: 100, crit: 0, double: 0 });
      window.__abyssE2E.patchEnemy({ hp: 1000, maxHp: 1000, atk: 1, intent: "attack" });
    });
    const hp = [];
    for (let i = 0; i < 3; i++) {
      await page.getByTestId("attack-button").click();
      await expect.poll(() => page.evaluate(() => window.__abyssDebug.turnPending)).toBeFalsy();
      hp.push(await page.evaluate(() => ({ enemy: window.__abyssDebug.enemy.hp, player: window.__abyssDebug.player.hp, intent: window.__abyssDebug.enemy.intent })));
    }
    return hp;
  };
  await page.evaluate(() => window.__abyssE2E.startSandboxCombat({ seed: 12345, enemy: "鉄の処刑人", floor: 10 }));
  const first = await runSequence();
  await page.evaluate(() => window.__abyssE2E.startSandboxCombat());
  const second = await runSequence();
  expect(second).toEqual(first);
});

test("全装備プリセットを6部位の完成装備で開始できる", async ({ page }) => {
  const presets = ["standard10", "highDamage", "defenseRiposte", "cc", "status", "sustain"];
  for (const equipment of presets) {
    await page.evaluate(value => window.__abyssE2E.startSandboxCombat({ equipment: value, cls: value === "cc" ? "mage" : value === "status" ? "assassin" : "warrior" }), equipment);
    const state = await page.evaluate(() => ({ equip: window.__abyssDebug.equip, player: window.__abyssDebug.player, stats: window.__abyssDebug.stats }));
    expect(Object.values(state.equip).filter(Boolean), equipment).toHaveLength(6);
    expect(state.stats.maxHp, equipment).toBeGreaterThan(100);
    expect(state.stats.atk, equipment).toBeGreaterThan(20);
    expect(state.player.skills.length, equipment).toBeGreaterThan(0);
  }
});

test("事前プレビューと手動調整を表示し、不正値を安全に正規化する", async ({ page }) => {
  await page.getByTestId("open-combat-sandbox").click();
  await expect(page.getByTestId("sandbox-preview")).toContainText("最大HP");
  await expect(page.getByTestId("sandbox-preview")).toContainText("直接ダメージ倍率");
  await page.evaluate(() => window.__abyssE2E.startSandboxCombat({ equipment: "standard10", atkMult: Infinity, hpMult: NaN, defMult: -1, potions: -5, skillCd: Infinity }));
  const state = await page.evaluate(() => ({ player: window.__abyssDebug.player, stats: window.__abyssDebug.stats, cds: window.__abyssDebug.cds }));
  expect(state.player.potions).toBe(0);
  expect(state.stats.atk).toBeGreaterThan(0);
  expect(state.stats.maxHp).toBeGreaterThan(0);
  expect(state.stats.def).toBeGreaterThan(0);
  expect(Object.values(state.cds).every(value => value === 0)).toBe(true);
});

test("明示フラグがなければサンドボックスUIとAPIを公開しない", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("open-combat-sandbox")).toHaveCount(0);
  expect(await page.evaluate(() => window.__abyssE2E?.startSandboxCombat)).toBeUndefined();
});
