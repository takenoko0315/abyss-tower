import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    Math.random = () => 0;
    window.__abyssTestFast = true;
  });
  await page.goto("/?combatSandbox=1");
  await expect.poll(() => page.evaluate(() => Boolean(window.__abyssE2E?.startContractRun))).toBe(true);
});

async function startKill(page, { fullHp = false, boss = false } = {}) {
  await page.evaluate(() => window.__abyssE2E.startContractRun("ks_frenzy"));
  await expect.poll(() => page.evaluate(() => window.__abyssDebug.scene)).toBe("combat");
  await page.evaluate(({ fullHp, boss }) => {
    window.__abyssE2E.patchPlayer({ atk: 10000, crit: 0, double: 0, def: 100 });
    window.__abyssE2E.patchEnemy({
      hp: fullHp ? 100 : 1,
      maxHp: 100,
      atk: 1,
      trait: null,
      gimmick: null,
      guardTurns: 0,
      status: {},
      intent: "attack",
      pattern: ["attack"],
      patternIdx: 0,
      isBoss: boss,
    });
  }, { fullHp, boss });
  await expect.poll(() => page.evaluate(() => ({
    hp: window.__abyssDebug.enemy.hp,
    maxHp: window.__abyssDebug.enemy.maxHp,
    atk: window.__abyssDebug.player.atk,
  }))).toEqual({ hp: fullHp ? 100 : 1, maxHp: 100, atk: 10000 });
}

async function clickAndCaptureDefeat(page, { doubleClick = false } = {}) {
  return page.evaluate(async ({ doubleClick }) => new Promise((resolve, reject) => {
    const inspect = () => {
      const label = document.querySelector('[data-testid="enemy-defeat-label"]');
      if (!label) return;
      observer.disconnect();
      clearTimeout(timeout);
      resolve({
        label: label.textContent,
        popupVisible: Boolean(document.querySelector('[data-testid="enemy-damage-popup"]')),
        attackDisabled: document.querySelector('[data-testid="attack-button"]')?.disabled === true,
      });
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    const timeout = setTimeout(() => {
      observer.disconnect();
      reject(new Error("defeat presentation was not rendered"));
    }, 2000);
    const attack = document.querySelector('[data-testid="attack-button"]');
    attack.click();
    if (doubleClick) attack.click();
    inspect();
  }), { doubleClick });
}

test("通常撃破では最後のダメージポップを残し、演出中の再操作と二重報酬を防ぐ", async ({ page }) => {
  await startKill(page);
  const beforeGold = await page.evaluate(() => window.__abyssDebug.player.gold);

  expect(await clickAndCaptureDefeat(page, { doubleClick: true })).toEqual({
    label: "撃破",
    popupVisible: true,
    attackDisabled: true,
  });
  await expect.poll(() => page.evaluate(() => window.__abyssDebug.scene)).not.toBe("combat");

  const settled = await page.evaluate(() => ({ kills: window.__abyssDebug.kills, gold: window.__abyssDebug.player.gold }));
  expect(settled.kills).toBe(1);
  expect(settled.gold).toBeGreaterThan(beforeGold);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => ({ kills: window.__abyssDebug.kills, gold: window.__abyssDebug.player.gold }))).toEqual(settled);
});

test("最大HPから1回のプレイヤー行動で倒した時だけ一撃撃破になる", async ({ page }) => {
  await startKill(page, { fullHp: true });
  expect(await clickAndCaptureDefeat(page)).toEqual({
    label: "一撃撃破",
    popupVisible: true,
    attackDisabled: true,
  });
});

test("prefers-reduced-motionでも短い待ち時間で正常進行する", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    window.__abyssE2E.startSandboxCombat({ enemy: "スライム", equipment: "none", intent: "attack", seed: 1 });
    window.__abyssE2E.patchPlayer({ atk: 10000, crit: 0, double: 0, def: 100 });
    window.__abyssE2E.patchEnemy({ hp: 1, maxHp: 100, atk: 1, trait: null, gimmick: null, status: {} });
  });
  await expect.poll(() => page.evaluate(() => window.__abyssDebug.enemy.hp)).toBe(1);

  const scheduledDelays = await page.evaluate(() => {
    const nativeSetTimeout = window.setTimeout;
    const delays = [];
    window.setTimeout = (handler, delay, ...args) => {
      delays.push(delay);
      return nativeSetTimeout(handler, delay, ...args);
    };
    window.__abyssTestFast = false;
    document.querySelector('[data-testid="attack-button"]').click();
    window.setTimeout = nativeSetTimeout;
    return delays;
  });
  expect(scheduledDelays).toContain(160);
  await expect.poll(() => page.evaluate(() => window.__abyssDebug.scene)).toBe("sandboxResult");
});

test("ボス撃破後は報酬選択へ正常に遷移する", async ({ page }) => {
  await startKill(page, { boss: true });
  expect((await clickAndCaptureDefeat(page)).label).toBe("撃破");
  await expect.poll(() => page.evaluate(() => window.__abyssDebug.scene)).toBe("relicChoice");
  expect(await page.evaluate(() => window.__abyssDebug.kills)).toBe(1);
});
