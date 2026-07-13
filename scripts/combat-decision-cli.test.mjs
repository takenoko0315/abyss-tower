import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const script = path.join(projectRoot, "scripts", "combat-decision-bot.mjs");

function runInvalid(...args) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: projectRoot, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

describe("combat-decision-bot CLI validation", () => {
  it("runs=0や非数値を拒否する", () => {
    expect(runInvalid("--runs=0")).toMatchObject({ status: 1 });
    expect(runInvalid("--runs=abc")).toMatchObject({ status: 1 });
  });

  it("未知の方針名を早期に拒否する", () => {
    const result = runInvalid("--policies=unknown");
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/未知の行動方針/);
  });

  it("未知のクラス・祝福を拒否する", () => {
    expect(runInvalid("--class=unknown")).toMatchObject({ status: 1 });
    expect(runInvalid("--blessing=unknown")).toMatchObject({ status: 1 });
  });
});
