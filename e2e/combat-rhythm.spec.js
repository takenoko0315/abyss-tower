import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.clear(); window.__abyssTestFast = true; });
  await page.goto("/?combatSandbox=1");
  await expect.poll(() => page.evaluate(() => Boolean(window.__abyssE2E?.startSandboxCombat))).toBe(true);
});

test("処刑人は防御準備後の処刑防御でのみ装甲崩壊する", async ({ page }) => {
  await page.evaluate(() => window.__abyssE2E.startSandboxCombat({ enemy: "鉄の処刑人", intent: "heavy", rhythmPhase: "default", hp: 100, seed: 7001 }));
  await expect(page.getByTestId("combat-rhythm")).toHaveCount(0);
  await expect(page.getByTestId("attack-damage-preview")).toContainText("予想");
  await expect(page.getByTestId("execution-countdown")).toContainText("1");
  await expect(page.getByTestId("execution-intent")).toContainText("処刑");
  const maxHp = await page.evaluate(() => window.__abyssDebug.enemy.maxHp);
  const threshold = Math.ceil(maxHp * 0.2);
  await expect(page.getByTestId("execution-threshold")).toHaveText(`1行動で${threshold}以上なら中断`);
  await expect(page.getByTestId("defend-damage-preview")).toContainText("被ダメ");
  await page.getByRole("button", { name: /防御/ }).click();
  await expect.poll(() => page.evaluate(() => window.__abyssDebug.enemy.rhythmState.phase)).toBe("exposed");
  await expect(page.getByTestId("damage-efficiency")).toHaveText("💥 2倍");
  await expect(page.getByTestId("armor-broken-badge")).toHaveText("①");
  await expect(page.getByTestId("enemy-card")).toHaveCSS("border-top-color", "rgb(251, 191, 36)");
});

test("処刑人の受け流し準備はプレイヤー側へ表示される", async ({ page }) => {
  await page.evaluate(() => window.__abyssE2E.startSandboxCombat({ enemy: "鉄の処刑人", intent: "attack", rhythmPhase: "default", seed: 7001 }));
  await page.getByRole("button", { name: /防御/ }).click();
  await expect(page.getByTestId("parry-ready")).toBeVisible();
  await expect(page.getByTestId("player-card")).toHaveCSS("border-top-color", "rgb(96, 165, 250)");
});

test("古竜は飛翔と過熱をサンドボックスから即時確認できる", async ({ page }) => {
  await page.evaluate(() => window.__abyssE2E.startSandboxCombat({ enemy: "古竜", floor: 15, rhythmPhase: "flying", intent: "attack" }));
  await expect(page.getByTestId("combat-rhythm")).toContainText("飛翔");
  await expect(page.getByTestId("combat-rhythm")).toContainText("直接×0.30");
  await page.evaluate(() => window.__abyssE2E.startSandboxCombat({ enemy: "古竜", floor: 15, rhythmPhase: "overheated", intent: "attack" }));
  await expect(page.getByTestId("combat-rhythm")).toContainText("過熱");
  await expect(page.getByTestId("combat-rhythm")).toContainText("直接×1.60");
});

test("共鳴結晶は同一カテゴリを軽減し異なるカテゴリを案内する", async ({ page }) => {
  await page.evaluate(() => window.__abyssE2E.startSandboxCombat({ enemy: "共鳴クリスタル", floor: 9, rhythmPhase: "barrier", intent: "attack" }));
  await page.getByTestId("attack-button").click();
  await expect.poll(() => page.evaluate(() => window.__abyssDebug.enemy.rhythmState.lastCategory)).toBe("attack");
  // 英語のスラッシュ区切り(attack / skill / ...)は画面に出さず、日本語の短いカテゴリチップで示す。
  // 元のカテゴリ情報はtitle(aria-label)に残す。
  const rhythmChip = page.getByTestId("combat-rhythm");
  await expect(rhythmChip).toContainText("技");
  await expect(rhythmChip).toContainText("防御");
  await expect(rhythmChip).not.toContainText("attack");
  await expect(rhythmChip.getByRole("group")).toHaveAttribute("title", /有効:/);
  // 戦術的に不適切な行動でも暗くせず、使用可能ボタンと同じ通常の実線枠のまま区別しない(disabledの塗りつぶし変化とは別の見た目)
  await expect(page.getByTestId("attack-button")).toHaveCSS("opacity", "1");
  await expect(page.getByTestId("attack-button")).toHaveCSS("border-top-style", "solid");
  await expect(page.getByTestId("attack-button")).toHaveAttribute("data-ineffective", "true");
});
