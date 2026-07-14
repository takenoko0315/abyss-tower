import { expect, test } from "@playwright/test";

const debugState = page => page.evaluate(() => window.__abyssDebug);

async function startRealRun(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    Math.random = () => 0.5; // 候補抽選・並び替えを決定的にする
    window.__abyssTestFast = true;
  });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => Boolean(window.__abyssE2E))).toBe(true);
  await page.evaluate(() => window.__abyssE2E.startContractRun("ks_catalyst"));
  await expect.poll(async () => (await debugState(page)).scene).toBe("combat");
}

// 10Fへジャンプしてボスを生成し、ほぼ即死状態にしてから通常攻撃で撃破する。
// ボス撃破は確定でレリック3択(既存画面)を経由するため、そちらは見送って深淵覚醒3択まで進める。
async function killFloor10Boss(page) {
  await page.evaluate(() => window.abyss.jump(10));
  await expect.poll(async () => (await debugState(page)).floor).toBe(10);
  await expect.poll(async () => (await debugState(page)).scene).toBe("combat");
  await page.evaluate(() => window.__abyssE2E.patchEnemy({
    hp: 1, maxHp: 1000, atk: 1, trait: null, gimmick: null, counterplay: null,
    guardTurns: 0, status: {}, intent: "attack", pattern: ["attack"], patternIdx: 0, isBoss: true,
  }));
  await page.getByTestId("attack-button").click();
  await expect.poll(async () => (await debugState(page)).scene).toBe("relicChoice");
  await page.getByText("どれも取らずに進む").click();
}

test("10階ボス撃破後に深淵覚醒3択が出る(候補は重複しない)", async ({ page }) => {
  await startRealRun(page);
  await killFloor10Boss(page);

  await expect(page.getByTestId("awakening-choice-scene")).toBeVisible();
  const choices = (await debugState(page)).awakeningChoices;
  expect(choices).toHaveLength(3);
  expect(new Set(choices).size).toBe(3); // 重複なし
});

test("条件に合う覚醒(無限刃)が候補になる", async ({ page }) => {
  await startRealRun(page);
  await page.evaluate(() => window.__abyssE2E.patchPlayer({ crit: 30 })); // 無限刃の条件: クリ率25%以上
  await killFloor10Boss(page);

  await expect(page.getByTestId("awakening-choice-scene")).toBeVisible();
  const choices = (await debugState(page)).awakeningChoices;
  expect(choices).toContain("infiniteblade");
});

test("1つ選ぶと効果が有効になり、通常の進行へ戻る", async ({ page }) => {
  await startRealRun(page);
  await killFloor10Boss(page);

  await expect(page.getByTestId("awakening-choice-scene")).toBeVisible();
  const choices = (await debugState(page)).awakeningChoices;
  await page.getByTestId(`awakening-choice-${choices[0]}`).click();

  await expect.poll(async () => (await debugState(page)).player.awakening).toBe(choices[0]);
  // レリック3択画面と同じ流れを再利用しているため、選択後は通常の進行シーン(levelup/loot/path等)に戻る
  await expect.poll(async () => (await debugState(page)).scene).not.toBe("awakeningChoice");
});

test("1ランで2回覚醒3択が出ない", async ({ page }) => {
  await startRealRun(page);
  await killFloor10Boss(page);
  await expect(page.getByTestId("awakening-choice-scene")).toBeVisible();
  const choices = (await debugState(page)).awakeningChoices;
  await page.getByTestId(`awakening-choice-${choices[0]}`).click();
  await expect.poll(async () => (await debugState(page)).player.awakening).toBe(choices[0]);

  // 再び10Fへ飛んでボスを倒しても、既に覚醒済みなら3択は出ない
  await killFloor10Boss(page);
  await expect.poll(async () => (await debugState(page)).scene).not.toBe("awakeningChoice");
  expect((await debugState(page)).player.awakening).toBe(choices[0]);
});

test("古いセーブ形式(深淵覚醒フィールドを含まないmeta)でも起動時に落ちない", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("abyss-meta", JSON.stringify({
      souls: 120, buys: {}, best: 5, codex: { enemies: [], relics: [], abilities: [] }, muted: false,
    }));
  });
  const errors = [];
  page.on("pageerror", err => errors.push(err));
  await page.goto("/");
  await expect(page.getByText("挑戦する")).toBeVisible();
  expect(errors).toEqual([]);
});
