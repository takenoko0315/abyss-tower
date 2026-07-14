import { expect, test } from "@playwright/test";

const debugState = page => page.evaluate(() => window.__abyssDebug);

async function startRealRun(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    Math.random = () => 0; // 抽選を決定的にする(rollRarity/pick/連撃抽選すべてが最初の要素を選ぶ)
    window.__abyssTestFast = true;
  });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => Boolean(window.__abyssE2E))).toBe(true);
  await page.evaluate(() => window.__abyssE2E.startContractRun("ks_catalyst"));
  await expect.poll(async () => (await debugState(page)).scene).toBe("combat");
}

async function reachObsessionChoice(page, origin) {
  if (origin) await page.evaluate(o => window.__abyssE2E.patchPlayer({ origin: o }), origin);
  await page.evaluate(() => window.abyss.jump(3));
  await expect.poll(async () => (await debugState(page)).scene).toBe("obsessionChoice");
}

// ボスを即死状態にして通常攻撃で撃破する(ボスは確定でレリック3択→装備ドロップの順に進む)
async function killBoss(page, floor) {
  await page.evaluate(f => window.abyss.jump(f), floor);
  await expect.poll(async () => (await debugState(page)).scene).toBe("combat");
  await page.evaluate(() => window.__abyssE2E.patchEnemy({
    hp: 1, maxHp: 1000, atk: 1, trait: null, gimmick: null, counterplay: null,
    guardTurns: 0, status: {}, intent: "attack", pattern: ["attack"], patternIdx: 0, isBoss: true,
  }));
  await page.getByTestId("attack-button").click();
}

test("3階到達で執着3択が一度だけ表示され、候補は重複しない", async ({ page }) => {
  await startRealRun(page);
  await reachObsessionChoice(page);
  await expect(page.getByTestId("obsession-choice-scene")).toBeVisible();
  const choices = (await debugState(page)).obsessionChoices;
  expect(choices).toHaveLength(3);
  expect(new Set(choices).size).toBe(3);
});

test("出自(毒使いの道)に対応する系統(poison)が候補に最低1つ含まれる", async ({ page }) => {
  await startRealRun(page);
  await reachObsessionChoice(page, "venom");
  const choices = (await debugState(page)).obsessionChoices;
  expect(choices).toContain("poison");
});

test("選択すると player.buildObsession に保存され、リロール3回が付与される。以後3階へ戻っても再表示されない", async ({ page }) => {
  await startRealRun(page);
  await reachObsessionChoice(page, "venom");
  await page.getByTestId("obsession-choice-poison").click();
  await expect.poll(async () => (await debugState(page)).player.buildObsession).toBe("poison");
  expect((await debugState(page)).player.rerollsLeft).toBe(3);
  await expect.poll(async () => (await debugState(page)).scene).not.toBe("obsessionChoice");

  // 再び3Fへ飛んでも執着3択は出ない(1ラン1回)
  await page.evaluate(() => window.abyss.jump(3));
  await expect.poll(async () => (await debugState(page)).floor).toBe(3);
  await expect.poll(async () => (await debugState(page)).scene).not.toBe("obsessionChoice");
  expect((await debugState(page)).player.buildObsession).toBe("poison");
});

test("執着系統に対応するアフィックス・レリック候補が優先され、リロールで残り回数が減り報酬を二重取得しない", async ({ page }) => {
  await startRealRun(page);
  await reachObsessionChoice(page, "venom");
  await page.getByTestId("obsession-choice-poison").click();
  await expect.poll(async () => (await debugState(page)).player.buildObsession).toBe("poison");

  await killBoss(page, 5);
  // ボスは確定でレリック3択が先に出る。執着(poison)タグ付きレリックが最低1つ含まれるはず
  await expect.poll(async () => (await debugState(page)).scene).toBe("relicChoice");
  const relicChoices = (await debugState(page)).relicChoices;
  const poisonRelics = ["venom", "snake", "hunter"];
  expect(relicChoices.some(k => poisonRelics.includes(k))).toBe(true);

  // リロール: 残り回数が減り、階数や所持レリック・ゴールドは変化しない(報酬の二重取得なし)
  const before = await debugState(page);
  await page.getByTestId("reroll-button").click();
  await expect.poll(async () => (await debugState(page)).player.rerollsLeft).toBe(2);
  const after = await debugState(page);
  expect(after.player.gold).toBe(before.player.gold);
  expect(after.player.relics.length).toBe(before.player.relics.length);
  expect(after.floor).toBe(before.floor);

  // レリックを見送ると次の進行(レベルアップを挟むことがある)を経て装備ドロップへ進む。
  // Math.random固定(=常に最初の要素/70%判定成立)により、追加アフィックスは確実に執着系統優先(poisonPower)で付与される
  await page.getByText("どれも取らずに進む").click();
  await expect.poll(async () => (await debugState(page)).scene).not.toBe("relicChoice");
  if ((await debugState(page)).scene === "levelup") {
    const perkKey = (await debugState(page)).perkChoices[0].key;
    await page.getByTestId(`perk-choice-${perkKey}`).click();
  }
  await expect.poll(async () => (await debugState(page)).scene).toBe("loot");
  const drop = (await debugState(page)).drop;
  expect(drop.stats.poisonPower).toBeGreaterThan(0);
});

test("深淵覚醒3択にはリロールボタンが出ない", async ({ page }) => {
  await startRealRun(page);
  await reachObsessionChoice(page, "venom");
  await page.getByTestId("obsession-choice-poison").click();
  await expect.poll(async () => (await debugState(page)).player.rerollsLeft).toBe(3);

  await killBoss(page, 10);
  await expect.poll(async () => (await debugState(page)).scene).toBe("relicChoice");
  await page.getByText("どれも取らずに進む").click();
  await expect.poll(async () => (await debugState(page)).scene).toBe("awakeningChoice");
  await expect(page.getByTestId("reroll-button")).toHaveCount(0);
});

test("執着ビルドの情報を含まない古い形式のmetaでも起動時に落ちない", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("abyss-meta", JSON.stringify({
      souls: 50, buys: {}, best: 3, codex: { enemies: [], relics: [], abilities: [] }, muted: false,
    }));
  });
  const errors = [];
  page.on("pageerror", err => errors.push(err));
  await page.goto("/");
  await expect(page.getByText("挑戦する")).toBeVisible();
  expect(errors).toEqual([]);
});
