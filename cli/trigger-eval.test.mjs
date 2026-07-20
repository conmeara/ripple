import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  classifyTriggerCase,
  inspectTriggerEvent,
  runStreamingTrial,
  skillDescription,
} from "../evals/lib/trigger.mjs";

test("trigger eval hashes the actual YAML description text", () => {
  assert.equal(skillDescription("---\nname: ripple\ndescription: 'Make videos.'\n---\n"), "Make videos.");
  assert.equal(skillDescription("---\nname: ripple\ndescription: >-\n  Make videos and\n  verify edits.\n---\n"), "Make videos and verify edits.");
});

test("trigger detection requires the real Ripple skill invocation", () => {
  const init = inspectTriggerEvent("claude", {
    type: "system", subtype: "init",
    plugins: [{ name: "ripple", path: "/plugin" }], skills: ["ripple:ripple"],
  }, { pluginRoot: "/plugin" });
  assert.equal(init.pluginVerified, true);

  const stalePlugin = inspectTriggerEvent("claude", {
    type: "system", subtype: "init",
    plugins: [{ name: "ripple", path: "/global-cache" }], skills: ["ripple:ripple"],
  }, { pluginRoot: "/plugin" });
  assert.equal(stalePlugin.pluginVerified, false);

  const claude = inspectTriggerEvent("claude", {
    type: "assistant",
    message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "ripple:ripple" } }] },
  });
  assert.equal(claude.triggered, true);

  const other = inspectTriggerEvent("claude", {
    type: "assistant",
    message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "motion-graphics" } }] },
  });
  assert.equal(other.triggered, false);

  const codex = inspectTriggerEvent("codex", {
    type: "item.started",
    item: { type: "command_execution", command: "sed -n '1,220p' /plugin/skills/ripple/SKILL.md" },
  }, { pluginRoot: "/plugin" });
  assert.equal(codex.triggered, true);

  const wrongCodexPlugin = inspectTriggerEvent("codex", {
    type: "item.started",
    item: { type: "command_execution", command: "sed -n '1,220p' /working-tree/skills/ripple/SKILL.md" },
  }, { pluginRoot: "/plugin" });
  assert.equal(wrongCodexPlugin.triggered, false);

  const cliOnly = inspectTriggerEvent("codex", {
    type: "item.started",
    item: { type: "command_execution", command: "ripple probe media/demo.mp4" },
  }, { pluginRoot: "/plugin" });
  assert.equal(cliOnly.triggered, false);
});

function fakeTrial(lines, { hang = false, timeoutMs = 500 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ripple-trigger-test-"));
  const script = [
    ...lines.map((line) => `process.stdout.write(${JSON.stringify(`${JSON.stringify(line)}\n`)});`),
    hang ? "setInterval(() => {}, 1000);" : "process.exit(0);",
  ].join("\n");
  return runStreamingTrial({
    host: "claude",
    command: process.execPath,
    args: ["-e", script],
    cwd: dir,
    env: process.env,
    transcriptPath: join(dir, "transcript.jsonl"),
    stderrPath: join(dir, "stderr.txt"),
    timeoutMs,
  });
}

test("a streamed invocation remains a hit even when the task would later time out", async () => {
  const init = {
    type: "system", subtype: "init",
    plugins: [{ name: "ripple", path: "/plugin" }],
    skills: ["ripple:ripple"],
  };
  const hit = {
    type: "assistant",
    message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "ripple:ripple" } }] },
  };
  const result = await fakeTrial([init, hit], { hang: true, timeoutMs: 200 });
  assert.equal(result.status, "trigger");
  assert.equal(result.triggered, true);
  assert.equal(result.timedOut, false);
  assert.equal(result.pluginVerified, true);
  assert.equal(result.triggerWasFirstTool, true);
  assert.equal(result.terminatedAfterTrigger, true);
  assert.ok(result.evidence.line >= 2);
});

test("clean no-hit exits are misses; no-hit timeouts are indeterminate", async () => {
  const init = {
    type: "system", subtype: "init",
    plugins: [{ name: "ripple", path: "/plugin" }],
    skills: ["ripple:ripple"],
  };
  const miss = await fakeTrial([init]);
  assert.equal(miss.status, "no-trigger");
  assert.equal(miss.valid, true);

  const timeout = await fakeTrial([init], { hang: true, timeoutMs: 100 });
  assert.equal(timeout.status, "indeterminate");
  assert.equal(timeout.valid, false);
  assert.equal(timeout.timedOut, true);

  const classified = classifyTriggerCase(
    { query: "example", should_trigger: false },
    [miss, timeout]
  );
  assert.equal(classified.pass, null);
  assert.equal(classified.validRuns, 1);
});

test("trigger release eval rejects Fable before starting a host trial", () => {
  const out = mkdtempSync(join(tmpdir(), "ripple-trigger-fable-"));
  const res = spawnSync(process.execPath, [
    resolve("evals/trigger.mjs"), "--host", "claude", "--claude-model", "fable",
    "--runs", "1", "--only", "1", "--out", out,
  ], { encoding: "utf8" });
  assert.notEqual(res.status, 0);
  assert.match(`${res.stdout}${res.stderr}`, /Fable is not allowed/);
});
