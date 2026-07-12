// 戦闘中の判断価値を計測するオーケストレーター。
// 実行: npm run combat-baseline -- --runs=100 --diff=ノーマル --class=warrior --blessing=none
//
// balance-bot.mjsと同じ構造(esbuildで事前バンドル→CPUコア数ぶんの子プロセスで並列実行)を踏襲しつつ、
// 「attack-only / basic / strategic」の3方針それぞれについて同じシード群(0..RUNS-1 を --seed だけずらした列)で
// RUNS回ずつランし、到達階・生存率・戦闘中の判断に関する指標を比較する。
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import * as esbuild from "esbuild";

const PROJECT_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE_DIR = path.join(PROJECT_ROOT, "node_modules", ".combat-decision-bot-cache");
const BUNDLE_PATH = path.join(CACHE_DIR, "worker-bundle.mjs");

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), "true"];
  })
);
const RUNS = parseInt(args.runs || "100", 10);
const DIFF_NAME = args.diff || "ノーマル";
const WORKERS = Math.max(1, Math.min(RUNS, parseInt(args.workers || String(os.cpus().length), 10)));
const CLASS_FILTER = args.class || null;
const BLESSING_FILTER = args.blessing || null;
const BASE_SEED = parseInt(args.seed || "1", 10);
const POLICIES = (args.policies || "attack-only,greedy,basic,strategic").split(",").map(s => s.trim()).filter(Boolean);
// ペア比較の対象。既定はPOLICIES内で隣り合う組(=一段階だけ判断を高度にした差分)
const PAIRS = args.pairs
  ? args.pairs.split(",").map(s => s.trim().split(":")).filter(([a, b]) => a && b)
  : POLICIES.slice(1).map((p, i) => [POLICIES[i], p]);
const OUT_PREFIX = args.out || path.join(PROJECT_ROOT, "scripts", "out", `combat-decision-${new Date().toISOString().replace(/[:.]/g, "-")}`);

const KEYSTONE_NAMES = {
  ks_thorn: "茨の誓約", ks_blood: "血の渇望", ks_giant: "鈍重な巨人", ks_glass: "硝子の魂",
  ks_silence: "無音の誓い", ks_leaden: "鉛の鎧", ks_bloodbowl: "血染めの杯", ks_chaos: "深淵の賽",
  ks_frenzy: "狂血の契約", ks_collector: "収集家の契約", ks_catalyst: "錬金の契約",
};

await main();

async function main() {
  const t0 = Date.now();
  await buildWorkerBundle();
  const buildSec = ((Date.now() - t0) / 1000).toFixed(1);

  const optTag = `${CLASS_FILTER ? `・クラス固定:${CLASS_FILTER}` : ""}${BLESSING_FILTER ? `・祝福固定:${BLESSING_FILTER}` : ""}`;
  console.log(`起動: 方針${POLICIES.length}種×${RUNS}ラン・難易度:${DIFF_NAME}${optTag}・シード起点:${BASE_SEED}・バンドル${buildSec}秒`);

  const byPolicy = {};
  const t1 = Date.now();
  for (const policy of POLICIES) {
    const t2 = Date.now();
    const results = await runPolicy(policy);
    const sec = ((Date.now() - t2) / 1000).toFixed(1);
    byPolicy[policy] = results;
    console.log(`[${policy}] ${results.length}ラン完了 (${sec}秒)`);
  }
  const totalSec = ((Date.now() - t1) / 1000).toFixed(1);

  const summaries = Object.fromEntries(POLICIES.map(p => [p, summarize(byPolicy[p])]));
  const pairStats = Object.fromEntries(
    PAIRS.filter(([a, b]) => byPolicy[a] && byPolicy[b]).map(([a, b]) => [`${a}_vs_${b}`, pairComparison(byPolicy[a], byPolicy[b])]),
  );
  printComparisonReport(summaries, totalSec, buildSec);
  printPairReport(pairStats);
  writeOutputs(byPolicy, summaries, pairStats);

  const anyError = POLICIES.some(p => byPolicy[p].some(r => r.result === "error"));
  process.exit(anyError ? 1 : 0);
}

async function buildWorkerBundle() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(PROJECT_ROOT, "scripts", "combat-decision-worker-core.mjs")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: BUNDLE_PATH,
    jsx: "automatic",
    external: ["jsdom", "react", "react-dom", "react-dom/*", "@testing-library/react", "@testing-library/dom"],
    define: {
      "import.meta.env.DEV": "true",
      "import.meta.env.PROD": "false",
      "import.meta.env.MODE": '"development"',
      "import.meta.env.BASE_URL": '"/"',
      "import.meta.env.SSR": "false",
    },
    logLevel: "silent",
  });
}

function splitEvenly(total, parts) {
  const base = Math.floor(total / parts);
  let rem = total % parts;
  const out = [];
  for (let i = 0; i < parts; i++) {
    const n = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem--;
    if (n > 0) out.push(n);
  }
  return out;
}

// 方針ごとに同じシード列(BASE_SEED..BASE_SEED+RUNS-1)を使うため、chunk分割も同じ関数・同じ引数で行う
async function runPolicy(policy) {
  const chunks = splitEvenly(RUNS, WORKERS);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let seedCursor = BASE_SEED;
  const jobs = chunks.map((n, i) => {
    const seedOffset = seedCursor;
    seedCursor += n;
    return { n, i, seedOffset };
  });
  const outputs = await Promise.all(jobs.map(async ({ n, i, seedOffset }) => {
    await sleep(i * 60); // 全プロセス同時起動によるjsdom importの競合を避ける
    return spawnWorker(n, policy, seedOffset);
  }));
  return outputs.flat();
}

function spawnWorker(runs, policy, seedOffset) {
  return new Promise((resolve, reject) => {
    const extraArgs = [`--policy=${policy}`, `--seedOffset=${seedOffset}`];
    if (CLASS_FILTER) extraArgs.push(`--class=${CLASS_FILTER}`);
    if (BLESSING_FILTER) extraArgs.push(`--blessing=${BLESSING_FILTER}`);
    const child = spawn(
      process.execPath,
      [BUNDLE_PATH, `--runs=${runs}`, `--diff=${DIFF_NAME}`, ...extraArgs],
      { stdio: ["ignore", "pipe", "inherit"], cwd: PROJECT_ROOT }
    );
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.on("error", reject);
    child.on("close", (code) => {
      const line = out.trim().split("\n").pop();
      if (!line) return reject(new Error(`ワーカー(${policy}, ${runs}ラン)から出力が得られなかった(exit=${code})`));
      try {
        resolve(JSON.parse(line));
      } catch (e) {
        reject(new Error(`ワーカー出力のJSONパースに失敗: ${e.message}\n${line.slice(0, 500)}`));
      }
    });
  });
}

// ===== 集計 =====
function median(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function keystoneLabel(blessingKey) {
  if (!blessingKey) return "(不明)";
  return KEYSTONE_NAMES[blessingKey] || "契約なし";
}

function summarize(results) {
  const n = results.length;
  const floors = results.map(r => r.floor || 0);
  const clears = results.filter(r => r.result === "victory");
  const deaths = results.filter(r => r.result === "dead");
  const timeouts = results.filter(r => r.result === "timeout");
  const errors = results.filter(r => r.result === "error");

  const m = results.map(r => r.metrics || {
    combatTurns: 0, counts: { attack: 0, defend: 0, skill: 0, potion: 0 },
    heavyOrFlurryTelegraphed: 0, defendedVsHeavy: 0, guardTurnsSeen: 0, attackedVsGuard: 0,
    mitigatedDamageEstimate: 0, potionOverhealEstimate: 0, ccInterruptTurns: 0,
  });
  const sum = (fn) => m.reduce((a, x) => a + fn(x), 0);

  const totalCombatTurns = sum(x => x.combatTurns);
  const totalAttack = sum(x => x.counts.attack);
  const totalDefend = sum(x => x.counts.defend);
  const totalSkill = sum(x => x.counts.skill);
  const totalPotion = sum(x => x.counts.potion);
  const totalHeavyTelegraphed = sum(x => x.heavyOrFlurryTelegraphed);
  const totalDefendedVsHeavy = sum(x => x.defendedVsHeavy);
  const totalGuardSeen = sum(x => x.guardTurnsSeen);
  const totalAttackedVsGuard = sum(x => x.attackedVsGuard);

  const deathFloorDist = {};
  for (const r of [...deaths, ...timeouts]) deathFloorDist[r.floor || 0] = (deathFloorDist[r.floor || 0] || 0) + 1;

  const gimmickDeaths = {};
  for (const r of deaths) {
    const g = r.lastEnemy?.gimmick || "(なし)";
    gimmickDeaths[g] = (gimmickDeaths[g] || 0) + 1;
  }

  const byKeystone = {};
  for (const r of results) (byKeystone[keystoneLabel(r.blessing)] ??= []).push(r.floor || 0);

  return {
    n,
    avgFloor: n ? floors.reduce((a, b) => a + b, 0) / n : 0,
    medianFloor: median(floors),
    maxFloor: floors.length ? Math.max(...floors) : 0,
    clearRate: n ? clears.length / n : 0,
    clears: clears.length,
    deaths: deaths.length,
    timeouts: timeouts.length,
    errors: errors.length,
    deathFloorDist,
    gimmickDeaths,
    byKeystone: Object.fromEntries(Object.entries(byKeystone).map(([k, fs2]) => [k, {
      n: fs2.length, avgFloor: fs2.reduce((a, b) => a + b, 0) / fs2.length,
    }])),
    avgCombatTurns: n ? totalCombatTurns / n : 0,
    actionCounts: { attack: totalAttack, defend: totalDefend, skill: totalSkill, potion: totalPotion },
    nonAttackRatio: totalCombatTurns ? (totalDefend + totalSkill + totalPotion) / totalCombatTurns : 0,
    defendVsHeavyRate: totalHeavyTelegraphed ? totalDefendedVsHeavy / totalHeavyTelegraphed : 0,
    heavyOrFlurryTelegraphed: totalHeavyTelegraphed,
    attackVsGuardRate: totalGuardSeen ? totalAttackedVsGuard / totalGuardSeen : 0,
    guardTurnsSeen: totalGuardSeen,
    mitigatedDamageEstimate: sum(x => x.mitigatedDamageEstimate),
    potionUses: totalPotion,
    potionOverhealEstimate: sum(x => x.potionOverhealEstimate),
    ccInterruptTurns: sum(x => x.ccInterruptTurns),
    errorSamples: errors.slice(0, 5).map(e => ({ floor: e.floor, cls: e.cls, message: e.error?.message })),
  };
}

// 同一シードのランどうしを突き合わせ、到達階の差を集計する(全ラン平均だけでは見えない
// 「どのくらいの割合で上回るか」「差のばらつき」を見るため)。CIは対応のある差の平均に対する
// 正規近似(母集団の分布形状に依らずCLTにより妥当、n=100〜300程度を想定)。
function pairComparison(resultsA, resultsB) {
  const bySeedA = new Map(resultsA.map(r => [r.seed, r]));
  const bySeedB = new Map(resultsB.map(r => [r.seed, r]));
  const diffs = [];
  for (const [seed, a] of bySeedA) {
    const b = bySeedB.get(seed);
    if (!b) continue;
    diffs.push((b.floor || 0) - (a.floor || 0));
  }
  const n = diffs.length;
  if (n === 0) return { n: 0, pairedSeeds: 0 };
  const wins = diffs.filter(d => d > 0).length;
  const ties = diffs.filter(d => d === 0).length;
  const losses = diffs.filter(d => d < 0).length;
  const mean = diffs.reduce((a, b) => a + b, 0) / n;
  const med = median(diffs);
  const variance = n > 1 ? diffs.reduce((a, d) => a + (d - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const stderr = sd / Math.sqrt(n);
  return {
    n, wins, ties, losses,
    winRate: wins / n, tieRate: ties / n, lossRate: losses / n,
    meanDiff: mean, medianDiff: med, sd,
    ci95: [mean - 1.96 * stderr, mean + 1.96 * stderr],
  };
}

// ===== レポート出力 =====
function printComparisonReport(summaries, totalSec, buildSec) {
  console.log(`\n===== 深淵の塔 戦闘判断価値ベースライン (${RUNS}ラン×${Object.keys(summaries).length}方針・難易度:${DIFF_NAME}) =====`);
  console.log(`実行時間: ${totalSec}秒 (バンドル${buildSec}秒 別途)`);

  const rows = [
    ["平均到達階", s => s.avgFloor.toFixed(2) + "F"],
    ["中央値到達階", s => s.medianFloor.toFixed(1) + "F"],
    ["最大到達階", s => s.maxFloor + "F"],
    ["クリア率", s => (s.clearRate * 100).toFixed(1) + "%"],
    ["死亡数", s => String(s.deaths)],
    ["タイムアウト数", s => String(s.timeouts)],
    ["エラー数", s => String(s.errors)],
    ["平均戦闘ターン数", s => s.avgCombatTurns.toFixed(1)],
    ["通常攻撃回数", s => String(s.actionCounts.attack)],
    ["防御回数", s => String(s.actionCounts.defend)],
    ["スキル回数", s => String(s.actionCounts.skill)],
    ["回復回数", s => String(s.actionCounts.potion)],
    ["攻撃以外を選択した割合", s => (s.nonAttackRatio * 100).toFixed(1) + "%"],
    ["大技/連攻に防御した割合", s => `${(s.defendVsHeavyRate * 100).toFixed(1)}% (n=${s.heavyOrFlurryTelegraphed})`],
    ["敵防御中に攻撃した割合", s => `${(s.attackVsGuardRate * 100).toFixed(1)}% (n=${s.guardTurnsSeen})`],
    ["防御の推定軽減ダメージ合計", s => String(s.mitigatedDamageEstimate)],
    ["回復薬使用回数", s => String(s.potionUses)],
    ["回復薬の推定過剰回復合計", s => String(s.potionOverhealEstimate)],
    ["気絶/凍結による大技足止め回数", s => String(s.ccInterruptTurns)],
  ];
  const policyNames = Object.keys(summaries);
  const colWidth = Math.max(24, ...policyNames.map(p => p.length + 2));
  console.log(`\n${"指標".padEnd(28)}${policyNames.map(p => p.padEnd(colWidth)).join("")}`);
  for (const [label, fn] of rows) {
    console.log(`${label.padEnd(28)}${policyNames.map(p => String(fn(summaries[p])).padEnd(colWidth)).join("")}`);
  }

  for (const p of policyNames) {
    const s = summaries[p];
    console.log(`\n--- [${p}] 死亡階分布(死亡・タイムアウト) ---`);
    for (const f of Object.keys(s.deathFloorDist).map(Number).sort((a, b) => a - b)) {
      console.log(`  ${f}F: ${s.deathFloorDist[f]}件`);
    }
    console.log(`--- [${p}] 敵ギミック別 死亡数 ---`);
    for (const [g, cnt] of Object.entries(s.gimmickDeaths).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${g}: ${cnt}件`);
    }
    if (s.errors > 0) {
      console.log(`--- [${p}] エラー詳細(先頭5件) ---`);
      for (const e of s.errorSamples) console.log(`  [${e.floor}F, ${e.cls}] ${e.message}`);
    }
  }
  console.log("");
}

function printPairReport(pairStats) {
  const entries = Object.entries(pairStats);
  if (!entries.length) return;
  console.log(`===== ペア比較(同一シードでの到達階差) =====`);
  for (const [label, s] of entries) {
    if (!s.n) { console.log(`[${label}] 突き合わせ可能なシードが無い`); continue; }
    const [a, b] = label.split("_vs_");
    console.log(`[${a} → ${b}] n=${s.n}`);
    console.log(`  上回った割合: ${(s.winRate * 100).toFixed(1)}%  同率: ${(s.tieRate * 100).toFixed(1)}%  下回った割合: ${(s.lossRate * 100).toFixed(1)}%`);
    console.log(`  平均差: ${s.meanDiff.toFixed(2)}F  中央値差: ${s.medianDiff.toFixed(1)}F  95%CI: [${s.ci95[0].toFixed(2)}, ${s.ci95[1].toFixed(2)}]F`);
  }
  console.log("");
}

function writeOutputs(byPolicy, summaries, pairStats) {
  fs.mkdirSync(path.dirname(OUT_PREFIX), { recursive: true });
  const jsonPath = `${OUT_PREFIX}.json`;
  const csvPath = `${OUT_PREFIX}.csv`;
  fs.writeFileSync(jsonPath, JSON.stringify({
    meta: { runs: RUNS, diff: DIFF_NAME, class: CLASS_FILTER, blessing: BLESSING_FILTER, seed: BASE_SEED, policies: Object.keys(summaries) },
    summaries,
    pairStats,
    results: byPolicy,
  }, null, 2));

  const metricKeys = [
    "n", "avgFloor", "medianFloor", "maxFloor", "clearRate", "deaths", "timeouts", "errors",
    "avgCombatTurns", "nonAttackRatio", "defendVsHeavyRate", "attackVsGuardRate",
    "mitigatedDamageEstimate", "potionUses", "potionOverhealEstimate", "ccInterruptTurns",
  ];
  const policyNames = Object.keys(summaries);
  const csvLines = ["metric," + policyNames.join(",")];
  for (const key of metricKeys) {
    csvLines.push([key, ...policyNames.map(p => summaries[p][key])].join(","));
  }
  fs.writeFileSync(csvPath, csvLines.join("\n") + "\n");
  console.log(`出力: ${jsonPath}\n出力: ${csvPath}`);
}
