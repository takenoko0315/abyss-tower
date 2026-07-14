import { expect, test } from "@playwright/test";

const debugState = page => page.evaluate(() => window.__abyssDebug);

// 敵ダメージ側の階級しきい値(src/game/damagePresentation.jsのgetDamagePopupTierと同じ基準)。
// ここでは「実際に計算されたダメージとmaxHpの比から、UIが正しいdata-tierを出しているか」だけを検証する。
function expectedTier(damage, maxHp) {
  const ratio = maxHp > 0 ? damage / maxHp : 0;
  if (maxHp > 0 && damage >= maxHp) return "catastrophic";
  if (ratio >= 0.5) return "catastrophic";
  if (ratio >= 0.25) return "critical";
  if (ratio >= 0.1) return "strong";
  return "normal";
}

async function preparePage(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    Math.random = () => 0; // variance・連撃抽選を決定的にする(crit0%ならcritも常に外れる)
    window.__abyssTestFast = true;
  });
  await page.goto("/?combatSandbox=1");
  await expect.poll(() => page.evaluate(() => Boolean(window.__abyssE2E?.startSandboxCombat))).toBe(true);
}

async function setupHit(page, { atk, crit = 0, maxHp = 1000, hp = maxHp }) {
  await page.evaluate(() => window.__abyssE2E.startSandboxCombat({
    enemy: "スライム", equipment: "none", intent: "attack", seed: 1,
  }));
  await page.evaluate(cfg => {
    window.__abyssE2E.patchPlayer({ atk: cfg.atk, crit: cfg.crit, double: 0, def: 100, fury: 0, combo: 0, resonance: 0 });
    window.__abyssE2E.patchEnemy({
      hp: cfg.hp, maxHp: cfg.maxHp, atk: 1, trait: null, gimmick: null, counterplay: null,
      guardTurns: 0, status: {}, intent: "attack", pattern: ["attack"], patternIdx: 0,
    });
  }, { atk, crit, maxHp, hp });
}

test("小ダメージはnormalのポップになる", async ({ page }) => {
  await preparePage(page);
  await setupHit(page, { atk: 5, maxHp: 100000 });
  await page.getByTestId("attack-button").click();
  const popup = page.getByTestId("enemy-damage-popup").first();
  await expect(popup).toBeVisible();
  const dmg = Number(await popup.textContent());
  expect(await popup.getAttribute("data-tier")).toBe(expectedTier(dmg, 100000));
  expect(await popup.getAttribute("data-tier")).toBe("normal");
});

test("maxHp比10%以上でstrong、25%以上でcritical、50%以上でcatastrophicになる", async ({ page }) => {
  await preparePage(page);
  const cases = [
    { atk: 150, expect: "strong" },   // 約15%
    { atk: 300, expect: "critical" }, // 約30%
    { atk: 600, expect: "catastrophic" }, // 約60%
  ];
  for (const c of cases) {
    await setupHit(page, { atk: c.atk, maxHp: 1000 });
    await page.getByTestId("attack-button").click();
    const popup = page.getByTestId("enemy-damage-popup").first();
    await expect(popup).toBeVisible();
    const dmg = Number(await popup.textContent());
    expect(expectedTier(dmg, 1000)).toBe(c.expect);
    expect(await popup.getAttribute("data-tier")).toBe(c.expect);
  }
});

test("会心は小ダメージでも最低critical", async ({ page }) => {
  await preparePage(page);
  await setupHit(page, { atk: 3, crit: 100, maxHp: 100000 }); // 与ダメの比率は1%未満だが確定会心
  await page.getByTestId("attack-button").click();
  const popup = page.getByTestId("enemy-damage-popup").first();
  await expect(popup).toBeVisible();
  const tier = await popup.getAttribute("data-tier");
  expect(["critical", "catastrophic"]).toContain(tier);
});

test("catastrophicでも実際に計算されたダメージ値は変わらない(オーバーキルで切り詰めない)", async ({ page }) => {
  await preparePage(page);
  // hpをmaxHpより大幅に多く設定し、maxHpを超える一撃を受けても敵が生き残る状態を作る
  // (このテストは「maxHp比のオーバーキル判定」と「表示数値が切り詰められないこと」だけを見たいため。
  //  実際に倒すと戦闘画面自体が遷移してポップが消えてしまい、表示内容を検証できなくなる)
  await setupHit(page, { atk: 5000, maxHp: 1000, hp: 100000 });
  const before = (await debugState(page)).enemy.hp;
  await page.getByTestId("attack-button").click();
  const popup = page.getByTestId("enemy-damage-popup").first();
  await expect(popup).toBeVisible();
  const shownDmg = Number(await popup.textContent());
  expect(await popup.getAttribute("data-tier")).toBe("catastrophic");
  // ポップに表示された数字が、実際に敵へ与えた総ダメージ(残りHPで切り詰められていない)と一致する
  const after = (await debugState(page)).enemy.hp;
  expect(shownDmg).toBe(before - after);
  expect(shownDmg).toBeGreaterThan(1000); // maxHpより明らかに大きい
});

test("reducedFx有効時もポップは表示されるが、移動を伴わないフェード演出になる", async ({ page }) => {
  await preparePage(page);
  await setupHit(page, { atk: 600, maxHp: 1000 });
  // 同一ページ内(ナビゲーションなし)で演出をOFFにする。goto()はaddInitScriptのlocalStorage.clear()を再実行し、
  // 直前にtoggleReducedFxで保存した設定を消してしまうため、ページ遷移せずに戦闘画面上のトグルを使う。
  await page.getByTestId("reduced-fx-toggle").click();
  await page.getByTestId("attack-button").click();
  const popup = page.getByTestId("enemy-damage-popup").first();
  await expect(popup).toBeVisible();
  const style = await popup.getAttribute("style");
  expect(style).toContain("abyss-popup-fade");
});

test("10連撃でも画面上のポップ数が安全な上限を超えない", async ({ page }) => {
  await preparePage(page);
  await page.evaluate(() => window.__abyssE2E.startSandboxCombat({ enemy: "スライム", equipment: "none", intent: "attack", seed: 1 }));
  await page.evaluate(() => {
    // 無限刃 + 連撃率を非常に高くして、1行動で10ヒット確定させる(Math.random=0で連撃抽選は常に成功)
    window.__abyssE2E.patchPlayer({ atk: 5, crit: 0, double: 900, def: 100, awakening: "infiniteblade" });
    window.__abyssE2E.patchEnemy({
      hp: 1000000, maxHp: 1000000, atk: 1, trait: null, gimmick: null, counterplay: null,
      guardTurns: 0, status: {}, intent: "attack", pattern: ["attack"], patternIdx: 0,
    });
  });
  await page.getByTestId("attack-button").click();
  const popups = page.getByTestId("enemy-damage-popup");
  await expect.poll(async () => popups.count()).toBeGreaterThan(0);
  expect(await popups.count()).toBeLessThanOrEqual(6);
});
