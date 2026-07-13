import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("sandbox-sentinel", "keep");
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
  expect(await page.evaluate(() => localStorage.getItem("abyss-meta"))).toBeNull();
});

test("明示フラグがなければサンドボックスUIとAPIを公開しない", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("open-combat-sandbox")).toHaveCount(0);
  expect(await page.evaluate(() => window.__abyssE2E?.startSandboxCombat)).toBeUndefined();
});
