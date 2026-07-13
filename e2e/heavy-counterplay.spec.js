import { expect, test } from "@playwright/test";

const state = page => page.evaluate(() => window.__abyssDebug);

async function prepare(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    Math.random = () => 0.5;
    window.__abyssTestFast = true;
  });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => Boolean(window.__abyssE2E))).toBe(true);
  await page.evaluate(() => window.__abyssE2E.startContractRun("ks_catalyst"));
  await expect.poll(async () => (await state(page)).scene).toBe("combat");
}

async function patchTarget(page, intent = "heavy") {
  await page.evaluate(nextIntent => {
    window.__abyssE2E.patchPlayer({ hp: 100, atk: 10, def: 100, crit: 0, double: 0, defendedLast: false, heavyRiposte: false });
    window.__abyssE2E.patchEnemy({
      name: "鉄の処刑人", counterplay: "heavy-v1", hp: 1000, maxHp: 1000, atk: 10, trait: null, gimmick: null,
      guardTurns: 0, status: {}, intent: nextIntent, pattern: ["attack"], patternIdx: 0, isBoss: true,
    });
  }, intent);
  await expect.poll(async () => (await state(page)).enemy.intent).toBe(intent);
}

test("鉄の処刑人: 大技防御だけが反撃態勢を付与し、次の直接攻撃1回で消費する", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await prepare(page);
  await patchTarget(page, "attack");
  const baselineMultiplier = 1;
  await expect(page.getByTestId("attack-multiplier")).toHaveCount(0);
  await page.getByRole("button", { name: /防御/ }).click();
  expect((await state(page)).player.heavyRiposte).toBeFalsy();

  await patchTarget(page, "heavy");
  await expect(page.getByTestId("heavy-counterplay-hint")).toHaveCount(0);
  await expect(page.getByTestId("execution-countdown")).toContainText("処刑まで 1行動");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: /防御/ }).click();
  await expect.poll(async () => (await state(page)).player.heavyRiposte).toBe(true);
  expect((await state(page)).enemy.counterplayOutcome).toBe("defend");
  expect((await state(page)).enemy.counterplayCounts?.riposteGained).toBe(1);

  await page.evaluate(() => window.__abyssE2E.patchPlayer({ defendedLast: false, fury: 0 }));
  const multiplier = Number(await page.getByTestId("attack-multiplier").getAttribute("data-multiplier"));
  expect(multiplier / baselineMultiplier).toBeCloseTo(1.3, 4);
  await page.getByTestId("attack-button").click();
  await expect.poll(async () => (await state(page)).player.heavyRiposte).toBe(false);
});

test("鉄の処刑人: 1行動で最大HP20%以上の直接ダメージを与えると大技を中断する", async ({ page }) => {
  await prepare(page);
  await patchTarget(page, "heavy");
  await page.evaluate(() => window.__abyssE2E.patchPlayer({ atk: 250 }));
  const hpBefore = (await state(page)).player.hp;
  await page.getByTestId("attack-button").click();
  await expect.poll(async () => (await state(page)).enemy.counterplayOutcome).toBe("damage");
  expect((await state(page)).enemy.intent).toBe("attack");
  expect((await state(page)).player.hp).toBe(hpBefore);
});

test("鉄の処刑人: 防御可能でも確定CCで処刑を中断できる", async ({ page }) => {
  await page.addInitScript(() => { localStorage.clear(); window.__abyssTestFast = true; });
  await page.goto("/?combatSandbox=1");
  await expect.poll(() => page.evaluate(() => Boolean(window.__abyssE2E?.startSandboxCombat))).toBe(true);
  await page.evaluate(() => window.__abyssE2E.startSandboxCombat({ enemy: "鉄の処刑人", cls: "mage", equipment: "cc", intent: "heavy", rhythmPhase: "default", seed: 7001 }));
  const hpBefore = (await state(page)).player.hp;
  await page.getByTestId("skill-button-frostnova").click();
  await expect.poll(async () => (await state(page)).enemy.counterplayOutcome).toBe("cc");
  expect((await state(page)).enemy.rhythmState.phase).toBe("exposed");
  expect((await state(page)).player.hp).toBe(hpBefore);
});

test("鉄の処刑人: 構えスキルの即時直接ダメージも火力中断へ含める", async ({ page }) => {
  await prepare(page);
  await patchTarget(page, "heavy");
  await page.evaluate(() => window.__abyssE2E.patchPlayer({ atk: 300, skills: ["ironguard"] }));
  const hpBefore = (await state(page)).player.hp;
  await page.getByRole("button", { name: /鉄壁の構え/ }).click();
  await expect.poll(async () => (await state(page)).enemy.counterplayOutcome).toBe("damage");
  expect((await state(page)).player.hp).toBe(hpBefore);
  expect((await state(page)).player.heavyRiposte).toBeFalsy();
});

test("他のボス: 同じ大技・同じ火力でも中断せず従来どおり攻撃する", async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => {
    window.__abyssE2E.patchPlayer({ hp: 100, atk: 250, def: 100, crit: 0, double: 0 });
    window.__abyssE2E.patchEnemy({
      name: "古竜", counterplay: null, hp: 1000, maxHp: 1000, atk: 10, trait: null, gimmick: "stoneskin",
      guardTurns: 0, status: {}, intent: "heavy", pattern: ["attack"], patternIdx: 0, isBoss: true,
    });
  });
  await expect(page.getByTestId("heavy-counterplay-hint")).toHaveCount(0);
  const hpBefore = (await state(page)).player.hp;
  await page.getByTestId("attack-button").click();
  await expect.poll(async () => (await state(page)).player.hp).toBeLessThan(hpBefore);
  expect((await state(page)).enemy.counterplayOutcome).toBeUndefined();
});
