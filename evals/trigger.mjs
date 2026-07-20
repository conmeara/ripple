#!/usr/bin/env node
// Real-plugin trigger eval. Every trial gets a fresh workspace; both hosts use
// temporary config homes so globally installed skills, memories, and settings
// cannot affect routing. Raw JSONL is classified while it streams: once Ripple
// is invoked, the hit is durable and the task is stopped before it can render.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stageCodexPlugin } from "./lib/agents.mjs";
import {
  classifyTriggerCase,
  runStreamingTrial,
  sha256,
  skillDescription,
} from "./lib/trigger.mjs";

const EVALS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(EVALS);
const SET_PATH = path.join(EVALS, "trigger-set.json");
const SKILL_PATH = path.join(ROOT, "skills", "ripple", "SKILL.md");
const argv = process.argv.slice(2);

function option(name, fallback) {
  const index = argv.indexOf(`--${name}`);
  return index < 0 ? fallback : argv[index + 1];
}

function stamp() {
  return new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
}

function commandText(command, args, env = process.env) {
  return execFileSync(command, args, { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function commandJson(command, args, env = process.env) {
  return JSON.parse(commandText(command, args, env));
}

function createWorkspace(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const files = [
    "standup_recording.mov", "final_v3.mp4", "intro.mp4", "demo.mp4",
    "promo_v2.mp4", "masterclass_intro.mp4", "toast_full.mov", "zoom_0424.mp4",
    "vacation.mp4", "lecture.mp4", "outputs/final_render.mp4",
    ...Array.from({ length: 4 }, (_, i) => `footage/clip_${String(i + 1).padStart(2, "0")}.mp4`),
    ...Array.from({ length: 6 }, (_, i) => `interview/part_${String(i + 1).padStart(2, "0")}.mp4`),
    ...Array.from({ length: 3 }, (_, i) => `shots/product_${String(i + 1).padStart(2, "0")}.jpg`),
  ];
  for (const relative of files) {
    const file = path.join(dir, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "Ripple trigger-eval placeholder; file existence only.\n");
  }
}

function copyAuth(profile) {
  const sourceHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const source = path.join(sourceHome, "auth.json");
  if (!fs.existsSync(source)) throw new Error(`Codex auth not found: ${source}`);
  fs.symlinkSync(source, path.join(profile, "auth.json"));
}

function setupProfiles(hosts) {
  const profiles = fs.mkdtempSync(path.join(os.tmpdir(), "ripple-trigger-profiles-"));
  const result = { root: profiles, claude: path.join(profiles, "claude"), codex: path.join(profiles, "codex") };
  try {
    fs.mkdirSync(result.claude, { recursive: true });
    result.claudeSettings = path.join(result.claude, "settings.json");
    fs.writeFileSync(result.claudeSettings, `${JSON.stringify({ enabledPlugins: {} }, null, 2)}\n`);
    if (hosts.includes("codex")) {
      fs.mkdirSync(result.codex, { recursive: true });
      copyAuth(result.codex);
      stageCodexPlugin(EVALS);
      const env = { ...process.env, CODEX_HOME: result.codex };
      commandJson("codex", ["plugin", "marketplace", "add", path.join(EVALS, "codex"), "--json"], env);
      commandJson("codex", ["plugin", "add", "ripple@ripple-local", "--json"], env);
      const list = commandJson("codex", ["plugin", "list", "--json"], env);
    const ripple = list.installed?.find((item) => item.pluginId === "ripple@ripple-local" && item.enabled);
    if (!ripple) throw new Error("isolated Codex profile did not enable ripple@ripple-local");
    result.codexPlugin = ripple;
    result.codexPluginRoot = path.join(
      result.codex, "plugins", "cache", ripple.marketplaceName, ripple.name, ripple.version
    );
    if (!fs.existsSync(path.join(result.codexPluginRoot, "skills", "ripple", "SKILL.md"))) {
      throw new Error(`isolated Codex profile did not cache the installed Ripple skill at ${result.codexPluginRoot}`);
    }
    }
    return result;
  } catch (error) {
    fs.rmSync(profiles, { recursive: true, force: true });
    throw error;
  }
}

function hostCommand(host, { query, model, ws, profiles }) {
  if (host === "claude") {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_PLUGIN_ROOT;
    return {
      command: "claude",
      args: [
        "-p", query,
        "--model", model,
        "--plugin-dir", ROOT,
        "--settings", profiles.claudeSettings,
        "--setting-sources", "",
        "--permission-mode", "dontAsk",
        "--output-format", "stream-json",
        "--verbose",
        "--no-session-persistence",
      ],
      env,
      pluginRoot: ROOT,
      pluginVerified: false,
    };
  }
  return {
    command: "codex",
    args: [
      "exec",
      "--cd", ws,
      "--sandbox", "read-only",
      "--skip-git-repo-check",
      "--ephemeral",
      "--disable", "memories",
      "--dangerously-bypass-hook-trust",
      "--json",
      "-m", model,
      query,
    ],
    env: { ...process.env, CODEX_HOME: profiles.codex },
    pluginRoot: profiles.codexPluginRoot,
    pluginVerified: Boolean(profiles.codexPlugin),
  };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function relative(file, root) {
  return path.relative(root, file).split(path.sep).join("/");
}

function summaryMarkdown(report) {
  const lines = [
    `# Ripple real-plugin trigger eval — ${report.startedAt}`,
    "",
    `Commit: \`${report.repo.commit}\`${report.repo.dirty ? " (dirty)" : ""}  `,
    `Description SHA-256: \`${report.skill.descriptionSha256}\`  `,
    `Threshold: ${report.config.threshold}; ${report.config.runs} runs per query`,
    "",
    "| host | model | classifications | valid trials | first-tool hits | result |",
    "|---|---|---:|---:|---:|---|",
  ];
  for (const host of report.hosts) {
    const passed = host.cases.filter((item) => item.pass === true).length;
    const valid = host.cases.reduce((sum, item) => sum + item.validRuns, 0);
    const requested = host.cases.reduce((sum, item) => sum + item.requestedRuns, 0);
    const hits = host.cases.flatMap((item) => item.trials).filter((trial) => trial.triggered);
    const first = hits.filter((trial) => trial.triggerWasFirstTool).length;
    const result = host.cases.every((item) => item.pass === true) ? "PASS" : "FAIL";
    lines.push(`| ${host.host} | ${host.model} | ${passed}/${host.cases.length} | ${valid}/${requested} | ${first}/${hits.length} | ${result} |`);
  }
  lines.push("", "## Cases", "", "| host | # | expected | rate | valid | result | query |", "|---|---:|---|---:|---:|---|---|");
  for (const host of report.hosts) {
    host.cases.forEach((item, index) => {
      const rate = item.triggerRate == null ? "—" : item.triggerRate.toFixed(2);
      lines.push(`| ${host.host} | ${index + 1} | ${item.shouldTrigger ? "trigger" : "skip"} | ${rate} | ${item.validRuns}/${item.requestedRuns} | ${item.pass === true ? "PASS" : item.pass === false ? "FAIL" : "INDETERMINATE"} | ${item.query.replaceAll("|", "\\|")} |`);
    });
  }
  lines.push("", "A timed-out or failed no-hit trial is indeterminate, never a miss. A streamed Ripple invocation remains a hit even when the runner stops the task immediately afterward.", "");
  return lines.join("\n");
}

async function main() {
  const set = JSON.parse(fs.readFileSync(SET_PATH, "utf8"));
  const hosts = String(option("host", "claude,codex")).split(",").filter(Boolean);
  if (hosts.some((host) => !["claude", "codex"].includes(host))) throw new Error("--host must be claude, codex, or both comma-separated");
  const runs = Number(option("runs", "3"));
  const workers = Number(option("workers", "3"));
  const timeoutMs = Number(option("timeout-seconds", "150")) * 1_000;
  const threshold = Number(option("threshold", "0.5"));
  const only = option("only", null);
  const selected = only
    ? set.evals.filter((_, index) => String(only).split(",").includes(String(index + 1)))
    : set.evals;
  if (argv.includes("--list")) {
    selected.forEach((item, index) => process.stdout.write(`${index + 1}\t${item.should_trigger ? "trigger" : "skip"}\t${item.query}\n`));
    return;
  }
  if (!Number.isInteger(runs) || runs < 1 || !Number.isInteger(workers) || workers < 1) throw new Error("--runs and --workers must be positive integers");
  if (!(threshold > 0 && threshold <= 1)) throw new Error("--threshold must be in (0, 1]");

  const startedAt = new Date().toISOString();
  const runRoot = path.resolve(option("out", path.join(EVALS, "runs", `trigger-${stamp()}`)));
  fs.mkdirSync(runRoot, { recursive: true });
  const skill = fs.readFileSync(SKILL_PATH, "utf8");
  const description = skillDescription(skill);
  const repoStatus = commandText("git", ["status", "--short"], process.env);
  const models = {
    claude: option("claude-model", process.env.RIPPLE_TRIGGER_CLAUDE_MODEL || "sonnet"),
    codex: option("codex-model", process.env.RIPPLE_TRIGGER_CODEX_MODEL || process.env.RIPPLE_EVAL_CODEX_MODEL || "gpt-5.5"),
  };
  for (const host of hosts) {
    if (/fable/i.test(models[host])) {
      throw new Error(`Fable is not allowed for release evals (${host} model: ${models[host]})`);
    }
  }
  const report = {
    schemaVersion: 1,
    startedAt,
    repo: {
      commit: commandText("git", ["rev-parse", "HEAD"]),
      branch: commandText("git", ["branch", "--show-current"]),
      dirty: Boolean(repoStatus),
      status: repoStatus ? repoStatus.split("\n") : [],
    },
    skill: { path: relative(SKILL_PATH, ROOT), description, descriptionSha256: sha256(description) },
    config: { hosts, runs, workers, timeoutMs, threshold, querySet: relative(SET_PATH, ROOT) },
    runtime: {
      node: process.version,
      claude: hosts.includes("claude") ? commandText("claude", ["--version"]) : null,
      codex: hosts.includes("codex") ? commandText("codex", ["--version"]) : null,
      isolation: "fresh workspace per trial; isolated Claude settings and Codex config; only the working-tree Ripple plugin requested",
    },
    hosts: [],
  };
  fs.writeFileSync(path.join(runRoot, "metadata.json"), `${JSON.stringify(report, null, 2)}\n`);

  let profiles;
  try {
    profiles = setupProfiles(hosts);
    report.runtime.codexPlugin = profiles.codexPlugin ? {
      pluginId: profiles.codexPlugin.pluginId,
      version: profiles.codexPlugin.version,
      enabled: profiles.codexPlugin.enabled,
      source: profiles.codexPlugin.source,
    } : null;
    fs.writeFileSync(path.join(runRoot, "metadata.json"), `${JSON.stringify(report, null, 2)}\n`);
    for (const host of hosts) {
      const jobs = [];
      selected.forEach((item, caseIndex) => {
        for (let run = 1; run <= runs; run += 1) jobs.push({ item, caseIndex, run });
      });
      process.stderr.write(`trigger eval: ${host}/${models[host]} — ${jobs.length} trials\n`);
      let completed = 0;
      const trials = await mapLimit(jobs, workers, async ({ item, caseIndex, run }) => {
        const trialDir = path.join(runRoot, host, String(caseIndex + 1).padStart(2, "0"), String(run));
        const ws = path.join(trialDir, "ws");
        fs.mkdirSync(trialDir, { recursive: true });
        createWorkspace(ws);
        const transcriptPath = path.join(trialDir, "transcript.jsonl");
        const stderrPath = path.join(trialDir, "stderr.txt");
        const invocation = hostCommand(host, { query: item.query, model: models[host], ws, profiles });
        const result = await runStreamingTrial({
          host,
          ...invocation,
          cwd: ws,
          transcriptPath,
          stderrPath,
          timeoutMs,
        });
        result.run = run;
        result.transcript = relative(transcriptPath, runRoot);
        result.stderr = relative(stderrPath, runRoot);
        fs.writeFileSync(path.join(trialDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
        completed += 1;
        process.stderr.write(`[${completed}/${jobs.length}] ${result.status.padEnd(13)} case ${caseIndex + 1} run ${run}\n`);
        return { ...result, caseIndex };
      });
      const cases = selected.map((item, caseIndex) => classifyTriggerCase(
        item,
        trials.filter((trial) => trial.caseIndex === caseIndex).map(({ caseIndex: _, ...trial }) => trial),
        threshold
      ));
      report.hosts.push({ host, model: models[host], cases });
      fs.writeFileSync(path.join(runRoot, "results.json"), `${JSON.stringify(report, null, 2)}\n`);
      fs.writeFileSync(path.join(runRoot, "summary.md"), summaryMarkdown(report));
    }
  } finally {
    if (profiles?.root) fs.rmSync(profiles.root, { recursive: true, force: true });
  }
  const pass = report.hosts.every((host) => host.cases.every((item) => item.pass === true));
  process.stdout.write(`${summaryMarkdown(report)}\nArtifacts: ${runRoot}\n`);
  process.exitCode = pass ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`trigger eval failed: ${error.stack ?? error.message}\n`);
  process.exitCode = 2;
});
