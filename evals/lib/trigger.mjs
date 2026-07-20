import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function skillDescription(markdown) {
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  if (!frontmatter) throw new Error("SKILL.md is missing YAML frontmatter");
  const lines = frontmatter.split(/\r?\n/);
  const index = lines.findIndex((line) => /^description\s*:/.test(line));
  if (index < 0) throw new Error("SKILL.md frontmatter is missing description");
  const value = lines[index].replace(/^description\s*:\s*/, "");
  if (/^[>|][-+]?\s*$/.test(value)) {
    const body = [];
    for (const line of lines.slice(index + 1)) {
      if (!/^\s+/.test(line)) break;
      body.push(line.replace(/^\s+/, ""));
    }
    return body.join(value.startsWith(">") ? " " : "\n").trim();
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  return value.trim();
}

function rippleSkillName(value, skillName) {
  return typeof value === "string" && (value === skillName || value.endsWith(`:${skillName}`));
}

function toolCalls(host, event) {
  if (host === "claude" && event?.type === "assistant") {
    return (event.message?.content ?? [])
      .filter((item) => item?.type === "tool_use")
      .map((item) => ({ name: item.name, input: item.input ?? {} }));
  }
  if (host === "codex" && (event?.type === "item.started" || event?.type === "item.completed")) {
    const item = event.item ?? {};
    if (item.type === "command_execution") return [{ name: item.type, input: { command: item.command ?? "" } }];
    if (item.type === "skill") return [{ name: item.type, input: { name: item.name, path: item.path } }];
    if (/tool/i.test(item.type ?? "")) {
      return [{ name: item.name ?? item.type, input: item.arguments ?? item.input ?? {} }];
    }
  }
  return [];
}

export function inspectTriggerEvent(host, event, { skillName = "ripple", pluginRoot } = {}) {
  let pluginVerified = false;
  if (host === "claude" && event?.type === "system" && event?.subtype === "init") {
    const plugin = (event.plugins ?? []).find((item) => item?.name === skillName);
    const expectedPlugin = !pluginRoot || plugin?.path === pluginRoot;
    pluginVerified = Boolean(plugin && expectedPlugin && (event.skills ?? []).some((name) => rippleSkillName(name, skillName)));
  }

  const calls = toolCalls(host, event);
  let triggered = false;
  let triggerCallIndex = null;
  for (const [index, call] of calls.entries()) {
    let hit = false;
    if (host === "claude") {
      hit = call.name === "Skill" && rippleSkillName(call.input?.skill, skillName);
    } else if (call.name === "skill") {
      hit = rippleSkillName(call.input?.name, skillName);
    } else {
      const command = typeof call.input?.command === "string" ? call.input.command : "";
      const expected = pluginRoot ? `${pluginRoot}/skills/${skillName}/SKILL.md` : null;
      hit = command.includes("SKILL.md") && (expected
        ? command.includes(expected)
        : command.includes(`skills/${skillName}/SKILL.md`));
    }
    if (hit && triggerCallIndex == null) triggerCallIndex = index;
    triggered ||= hit;
  }
  return { calls, pluginVerified, triggered, triggerCallIndex };
}

export function runStreamingTrial({
  host,
  command,
  args,
  cwd,
  env,
  transcriptPath,
  stderrPath,
  timeoutMs,
  skillName = "ripple",
  pluginRoot,
  pluginVerified = false,
}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const stdout = createWriteStream(transcriptPath, { flags: "w" });
    const stderr = createWriteStream(stderrPath, { flags: "w" });
    const grouped = process.platform !== "win32";
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: grouped,
    });
    let buffer = "";
    let lineNumber = 0;
    let firstTool = null;
    let evidence = null;
    let triggered = false;
    let triggerWasFirstTool = null;
    let timedOut = false;
    let terminating = false;
    let killTimer = null;
    let spawnError = null;

    const signal = (name) => {
      if (grouped && child.pid) {
        try { process.kill(-child.pid, name); return; } catch { /* child already exited */ }
      }
      child.kill(name);
    };
    const stop = () => {
      if (terminating) return;
      terminating = true;
      signal("SIGTERM");
      killTimer = setTimeout(() => signal("SIGKILL"), 2_000);
    };
    const timer = setTimeout(() => {
      if (triggered) return;
      timedOut = true;
      stop();
    }, timeoutMs);

    const inspectLine = (line) => {
      lineNumber += 1;
      let event;
      try { event = JSON.parse(line); } catch { return; }
      const signal = inspectTriggerEvent(host, event, { skillName, pluginRoot });
      pluginVerified ||= signal.pluginVerified;
      const hadFirstTool = Boolean(firstTool);
      if (!firstTool && signal.calls.length) firstTool = signal.calls[0];
      if (!triggered && signal.triggered) {
        triggered = true;
        triggerWasFirstTool = !hadFirstTool && signal.triggerCallIndex === 0;
        clearTimeout(timer);
        evidence = {
          line: lineNumber,
          elapsedMs: Date.now() - startedAt,
          event: line.length > 4_000 ? `${line.slice(0, 4_000)}…` : line,
        };
        stop();
      }
    };

    child.stdout.on("data", (chunk) => {
      stdout.write(chunk);
      buffer += chunk.toString("utf8");
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim()) inspectLine(line);
      }
    });
    child.stderr.pipe(stderr);
    child.on("error", (error) => {
      spawnError = error.message;
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      if (buffer.trim()) inspectLine(buffer);
      stdout.end();
      stderr.end();
      const cleanMiss = !triggered && !timedOut && !spawnError && exitCode === 0 && pluginVerified;
      const valid = triggered ? pluginVerified : cleanMiss;
      resolve({
        status: triggered ? "trigger" : valid ? "no-trigger" : "indeterminate",
        valid,
        triggered,
        timedOut,
        pluginVerified,
        firstTool,
        evidence,
        triggerWasFirstTool,
        elapsedMs: Date.now() - startedAt,
        exitCode,
        signal,
        ...(spawnError ? { error: spawnError } : {}),
        terminatedAfterTrigger: triggered && terminating,
      });
    });
  });
}

export function classifyTriggerCase(item, trials, threshold = 0.5) {
  const valid = trials.filter((trial) => trial.valid);
  const triggerRate = valid.length ? valid.filter((trial) => trial.triggered).length / valid.length : null;
  const complete = valid.length === trials.length;
  const pass = complete
    ? item.should_trigger ? triggerRate >= threshold : triggerRate < threshold
    : null;
  return {
    query: item.query,
    shouldTrigger: item.should_trigger,
    requestedRuns: trials.length,
    validRuns: valid.length,
    triggerRate,
    pass,
    trials,
  };
}
