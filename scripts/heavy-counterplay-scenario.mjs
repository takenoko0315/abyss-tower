import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runScenarioSet,
  SCENARIO_POLICIES,
  SCENARIOS,
  summarizeScenario,
} from "./lib/heavy-counterplay-scenario-core.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const match = arg.match(/^--([^=]+)=(.*)$/);
  return match ? [match[1], match[2]] : [arg.replace(/^--/, ""), "true"];
}));
const runs = Number(args.runs || 100);
const seed = Number(args.seed || 7001);
const workers = Number(args.workers || 4);
const scenarios = (args.scenarios || "A,B,C,D").split(",").filter(Boolean);
const policies = (args.policies || SCENARIO_POLICIES.join(",")).split(",").filter(Boolean);
const out = args.out || path.join(root, "scripts", "out", `heavy-counterplay-scenario-${new Date().toISOString().replace(/[:.]/g, "-")}`);

if (!Number.isInteger(runs) || runs < 1) throw new Error("--runsは1以上の整数で指定してください");
if (!Number.isInteger(seed)) throw new Error("--seedは整数で指定してください");
if (!Number.isInteger(workers) || workers < 1) throw new Error("--workersは1以上の整数で指定してください");
if (scenarios.some(name => !SCENARIOS[name])) throw new Error(`未知のシナリオ: ${scenarios.filter(name => !SCENARIOS[name]).join(",")}`);
if (policies.some(name => !SCENARIO_POLICIES.includes(name))) throw new Error(`未知の方針: ${policies.filter(name => !SCENARIO_POLICIES.includes(name)).join(",")}`);

const results = {};
const summaries = {};
for (const scenario of scenarios) {
  results[scenario] = {};
  summaries[scenario] = {};
  for (const policy of policies) {
    const rows = runScenarioSet({ scenario, policy, runs, seed, workers });
    results[scenario][policy] = rows;
    summaries[scenario][policy] = summarizeScenario(rows);
  }
}

console.log(`鉄の処刑人 固定シナリオ計測: ${scenarios.length}シナリオ×${policies.length}方針×${runs}戦 seed=${seed} workers=${workers}`);
for (const scenario of scenarios) {
  console.log(`\n=== Scenario ${scenario} ===`);
  for (const policy of policies) {
    const s = summaries[scenario][policy];
    const choiceTotal = Object.values(s.choices).reduce((sum, value) => sum + value, 0);
    const choiceText = choiceTotal ? Object.entries(s.choices).map(([key, value]) => `${key}:${(value / choiceTotal * 100).toFixed(1)}%`).join(" ") : "-";
    console.log(`${policy.padEnd(16)} 勝率${(s.winRate * 100).toFixed(1)}% HP ${s.endHp.mean.toFixed(1)}/${s.endHp.median.toFixed(1)} 被ダメ ${s.damageTaken.mean.toFixed(1)}/${s.damageTaken.median.toFixed(1)} Turn ${s.turns.mean.toFixed(1)}/${s.turns.median.toFixed(1)} 大技予告/発動${s.heavyTelegraphs}/${s.heavyExecuted} 防御${s.defended} 反撃${s.riposteGained}/${s.riposteConsumed} 火力中断/撃破${s.damageInterrupts}/${s.damageKills}/${s.damageAttempts} CC中断/撃破${s.ccInterrupts}/${s.ccKills}/${s.ccAttempts} CC可${s.ccAvailable} skill${s.skills} potion${s.potions} strategic[${choiceText}]`);
  }
}

fs.mkdirSync(path.dirname(out), { recursive: true });
const target = `${out}.json`;
const temp = `${target}.${process.pid}.tmp`;
try {
  fs.writeFileSync(temp, JSON.stringify({ meta: { runs, seed, workers, scenarios, policies }, summaries, results }, null, 2));
  fs.renameSync(temp, target);
} finally {
  if (fs.existsSync(temp)) fs.unlinkSync(temp);
}
console.log(`\n出力: ${target}`);
