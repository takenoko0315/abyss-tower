// 自動プレイテスト(バランス計測)。
// 実行: npm run balance -- --runs=160 --diff=ノーマル [--workers=12]
//
// balance-worker-core.mjs(AbyssTower.jsxをimportする実プレイロジック)をesbuildで
// 事前に1回だけNode向けにバンドルし、そのバンドル済みファイルをCPUコア数ぶんの子プロセスで
// 並列実行する(逐次実行だと160ランに2分以上かかるため)。jsdomのimport自体が1プロセスあたり
// 1.7秒前後かかり、これが並列数を増やしても縮まらない下限になっている(既知の制約)。
// 目安: 160ランが2分以内に終われば十分(バランス変更のたびに気軽に回せることが目的で、秒数自体は目標ではない)。
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import * as esbuild from "esbuild";

const PROJECT_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE_DIR = path.join(PROJECT_ROOT, "node_modules", ".balance-bot-cache");
const BUNDLE_PATH = path.join(CACHE_DIR, "worker-bundle.mjs");

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), "true"];
  })
);
const RUNS = parseInt(args.runs || "30", 10);
const DIFF_NAME = args.diff || "ノーマル";
const WORKERS = Math.max(1, Math.min(RUNS, parseInt(args.workers || String(os.cpus().length), 10)));
const CLASS_FILTER = args.class || null; // 指定時はそのクラス固定でランする(assassin/warrior/vampire/mage)
const POLICY = args.policy || "standard"; // standard(既定) / aggressive(防御しない)
const BLESSING_FILTER = args.blessing || null; // 指定時はその祝福固定でランする(ks_xxxのキー、または契約を避ける"none")
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

  const t1 = Date.now();
  const chunks = splitEvenly(RUNS, WORKERS);
  const optTag = `${CLASS_FILTER ? `・クラス固定:${CLASS_FILTER}` : ""}${args.policy ? `・方針:${POLICY}` : ""}${BLESSING_FILTER ? `・祝福固定:${BLESSING_FILTER}` : ""}`;
  console.log(`起動: ${RUNS}ラン・難易度:${DIFF_NAME}${optTag}・${chunks.length}並列(1プロセスあたり${chunks[0]}ラン前後)・バンドル${buildSec}秒`);
  // 全プロセスを同時起動するとjsdomの重いimport(ディスクI/O)が競合して遅くなるため、起動を少しずつずらす
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const outputs = await Promise.all(chunks.map(async (n, i) => { await sleep(i * 60); return spawnWorker(n); }));
  const results = outputs.flat();
  const elapsedSec = ((Date.now() - t1) / 1000).toFixed(1);
  printReport(results, elapsedSec, buildSec);
  process.exit(results.some(r => r.result === "error") ? 1 : 0);
}

// ===== ワーカー本体を事前バンドル(JSX変換・依存解決を1回で済ませる) =====
async function buildWorkerBundle() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(PROJECT_ROOT, "scripts", "balance-worker-core.mjs")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: BUNDLE_PATH,
    jsx: "automatic", // React 19 自動JSXランタイム(AbyssTower.jsx用)
    // jsdomはCJS内で動的requireを行っておりESMバンドルに含められない。node_modulesから実行時解決させる
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

function spawnWorker(runs) {
  return new Promise((resolve, reject) => {
    const extraArgs = [];
    if (CLASS_FILTER) extraArgs.push(`--class=${CLASS_FILTER}`);
    if (args.policy) extraArgs.push(`--policy=${POLICY}`);
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
      const line = out.trim().split("\n").pop(); // 最後の1行がJSON結果
      if (!line) return reject(new Error(`ワーカー(${runs}ラン)から出力が得られなかった(exit=${code})`));
      try {
        resolve(JSON.parse(line));
      } catch (e) {
        reject(new Error(`ワーカー出力のJSONパースに失敗: ${e.message}\n${line.slice(0, 500)}`));
      }
    });
  });
}

// ===== レポート出力 =====
function printReport(results, elapsedSec, buildSec) {
  const floors = results.map(r => r.floor || 0);
  const avgFloor = (floors.reduce((a, b) => a + b, 0) / results.length).toFixed(2);
  const clears = results.filter(r => r.result === "victory").length;
  const clearRate = ((clears / results.length) * 100).toFixed(1);
  const errors = results.filter(r => r.result === "error");
  const timeouts = results.filter(r => r.result === "timeout");

  console.log(`\n===== 深淵の塔 バランス計測 (${results.length}ラン・難易度:${DIFF_NAME}) =====`);
  console.log(`実行時間: ${elapsedSec}秒 (バンドル${buildSec}秒 別途)`);
  console.log(`平均到達階: ${avgFloor}F`);
  console.log(`クリア率: ${clearRate}% (${clears}/${results.length})`);
  console.log(`エラー数: ${errors.length}`);
  console.log(`タイムアウト数: ${timeouts.length}`);
  if (errors.length) {
    console.log(`\n--- エラー詳細 ---`);
    for (const e of errors.slice(0, 10)) {
      console.log(`[${e.floor}F, ${e.cls}] ${e.error.message}`);
      console.log(e.error.stack?.split("\n").slice(0, 4).join("\n"));
    }
  }

  console.log(`\n--- クラス別 平均到達階 ---`);
  const byClass = {};
  for (const r of results) (byClass[r.cls || "(不明)"] ??= []).push(r.floor || 0);
  for (const [c, fs] of Object.entries(byClass).sort()) {
    console.log(`${c}: ${(fs.reduce((a, b) => a + b, 0) / fs.length).toFixed(2)}F (n=${fs.length})`);
  }

  console.log(`\n--- 到達階の分布(死亡・タイムアウトのみ) ---`);
  const distTargets = results.filter(r => r.result === "dead" || r.result === "timeout");
  const dist = {};
  for (const r of distTargets) dist[r.floor || 0] = (dist[r.floor || 0] || 0) + 1;
  for (const f of Object.keys(dist).map(Number).sort((a, b) => a - b)) console.log(`${f}F: ${dist[f]}件`);

  console.log(`\n--- クラス別 死亡階分布(死亡・タイムアウトのみ) ---`);
  const classesInDist = [...new Set(distTargets.map(r => r.cls || "(不明)"))].sort();
  for (const c of classesInDist) {
    const rs = distTargets.filter(r => (r.cls || "(不明)") === c);
    const d = {};
    for (const r of rs) d[r.floor || 0] = (d[r.floor || 0] || 0) + 1;
    const parts = Object.keys(d).map(Number).sort((a, b) => a - b).map(f => `${f}F:${d[f]}件`).join(" ");
    console.log(`${c} (n=${rs.length}): ${parts}`);
  }

  console.log(`\n--- ボス階(5/10/15/20F)死亡 ---`);
  const bossFloorDeaths = distTargets.filter(r => r.floor && r.floor % 5 === 0);
  console.log(`ボス階死亡: ${bossFloorDeaths.length}/${distTargets.length}件 (${distTargets.length ? (bossFloorDeaths.length / distTargets.length * 100).toFixed(1) : "0.0"}%)`);
  const byBossFloor = {};
  for (const r of bossFloorDeaths) byBossFloor[r.floor] = (byBossFloor[r.floor] || 0) + 1;
  for (const f of Object.keys(byBossFloor).map(Number).sort((a, b) => a - b)) console.log(`  ${f}F: ${byBossFloor[f]}件`);
  console.log(`\nボス名別死亡数:`);
  const byBossName = {};
  for (const r of bossFloorDeaths) { const name = r.lastEnemy?.name || "(不明)"; byBossName[name] = (byBossName[name] || 0) + 1; }
  for (const [name, n] of Object.entries(byBossName).sort((a, b) => b[1] - a[1])) console.log(`  ${name}: ${n}件`);

  console.log(`\n--- 契約(キーストーン)別 平均到達階 ---`);
  const byKeystone = {};
  for (const r of results) (byKeystone[keystoneLabel(r.blessing)] ??= []).push(r.floor || 0);
  for (const [label, fs] of Object.entries(byKeystone).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${label}: ${(fs.reduce((a, b) => a + b, 0) / fs.length).toFixed(2)}F (n=${fs.length})`);
  }
  console.log("");
}

function keystoneLabel(blessingKey) {
  if (!blessingKey) return "(不明)";
  return KEYSTONE_NAMES[blessingKey] || "契約なし";
}
