import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { removeLegacyCodexLink, stageCodexPlugin } from "../evals/lib/agents.mjs";
import { fileStamp } from "./util.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(...parts) {
  return JSON.parse(readFileSync(join(ROOT, ...parts), "utf8"));
}

test("Claude and Codex manifests expose the same Ripple release", () => {
  const pkg = readJson("package.json");
  const claude = readJson(".claude-plugin", "plugin.json");
  const codex = readJson(".codex-plugin", "plugin.json");

  assert.equal(codex.name, "ripple");
  assert.equal(codex.name, claude.name);
  assert.equal(codex.version, pkg.version);
  assert.equal(codex.version, claude.version);
  assert.equal(codex.skills, "./skills/");
  assert.equal(codex.interface.displayName, "Ripple");
  assert.equal(codex.interface.category, "Creativity");
  assert.equal(codex.interface.brandColor, "#C9520C");
  assert.deepEqual(codex.interface.capabilities, ["Read", "Write"]);
  for (const field of ["composerIcon", "logo", "logoDark"]) {
    assert.match(codex.interface[field], /^\.\/assets\//, `${field} stays in plugin assets`);
    assert.ok(existsSync(resolve(ROOT, codex.interface[field])), `missing ${field}`);
  }
  assert.deepEqual(codex.interface.screenshots, ["./assets/screenshot-timeline-sheet.png"]);
  const screenshot = resolve(ROOT, codex.interface.screenshots[0]);
  assert.ok(existsSync(screenshot), "missing marketplace screenshot");
  assert.ok(readFileSync(screenshot).byteLength > 100_000, "marketplace screenshot should be a real timeline render");
  const readmeScreenshot = join(ROOT, "docs", "assets", "anatomy-of-a-timeline-sheet.png");
  assert.ok(existsSync(readmeScreenshot), "missing README timeline sheet");
  assert.ok(readFileSync(readmeScreenshot).byteLength > 100_000, "README timeline sheet should be a real render");
  assert.equal("privacyPolicyURL" in codex.interface, false);
  assert.equal("termsOfServiceURL" in codex.interface, false);
  assert.ok(existsSync(resolve(ROOT, codex.skills)));
  assert.equal("apps" in codex, false);
  assert.equal("mcpServers" in codex, false);
  assert.equal("hooks" in codex, false);
});

test("Codex marketplace exposes Ripple with explicit install policy", () => {
  const marketplace = readJson(".agents", "plugins", "marketplace.json");
  assert.equal(marketplace.name, "ripple");
  assert.equal(marketplace.interface.displayName, "Ripple");
  assert.equal(marketplace.plugins.length, 1);

  const plugin = marketplace.plugins[0];
  assert.equal(plugin.name, "ripple");
  assert.deepEqual(plugin.source, {
    source: "url",
    url: "https://github.com/conmeara/ripple.git",
  });
  assert.deepEqual(plugin.policy, {
    installation: "AVAILABLE",
    authentication: "ON_INSTALL",
  });
  assert.equal(plugin.category, "Creativity");
});

test("Codex evals stage a lean, content-versioned plugin bundle", () => {
  const marketplace = readJson("evals", "codex", ".agents", "plugins", "marketplace.json");
  assert.deepEqual(marketplace.plugins[0].source, {
    source: "local",
    path: "./plugins/ripple",
  });

  const staged = stageCodexPlugin(join(ROOT, "evals"));
  assert.match(staged.version, /^\d+\.\d+\.\d+\+codex\.local-[0-9a-f]{12}$/);
  assert.ok(staged.files > 0);
  assert.ok(staged.bytes < 2 * 1024 * 1024, `staged bundle is ${staged.bytes} bytes`);
  for (const entry of [".codex-plugin", "agents", "assets", "bin", "cli", "hooks", "schemas", "skills", "LICENSE", "package.json"]) {
    assert.ok(existsSync(join(staged.bundle, entry)), `missing staged ${entry}`);
  }
  assert.equal(existsSync(join(staged.bundle, "evals")), false);
  assert.equal(existsSync(join(staged.bundle, ".git")), false);
  assert.equal(
    existsSync(join(staged.bundle, "cli", "plugin.test.mjs")),
    false,
    "tests do not belong in the runtime bundle"
  );
});

test("Codex staging removes only the legacy repo symlink", () => {
  const marketplace = mkdtempSync(join(tmpdir(), "ripple-codex-marketplace-"));
  const legacy = join(marketplace, "ripple");
  symlinkSync("../..", legacy);
  assert.equal(removeLegacyCodexLink(marketplace), true);
  assert.equal(existsSync(legacy), false);

  mkdirSync(legacy);
  assert.equal(removeLegacyCodexLink(marketplace), false);
  assert.equal(existsSync(legacy), true, "a real path must remain untouched");
});

test("the skill resolves the bundled CLI and carries Codex metadata", () => {
  const skill = readFileSync(join(ROOT, "skills", "ripple", "SKILL.md"), "utf8");
  const metadata = readFileSync(
    join(ROOT, "skills", "ripple", "agents", "openai.yaml"),
    "utf8"
  );

  assert.match(skill, /^name: ripple$/m, "frontmatter name");
  assert.match(skill, /<plugin-root>\/cli\/index\.mjs/, "CLI resolution line");
  assert.match(skill, /Do\s+not assume the host put\s+`ripple` on `PATH`/, "host PATH fallback");
  assert.match(skill, /open every returned sheet PNG with `view_image`/, "Codex visual review");
  assert.match(metadata, /display_name: "Ripple"/, "display_name");
  assert.match(metadata, /icon_small: "\.\/assets\/ripple-icon\.svg"/, "small icon");
  assert.match(metadata, /icon_large: "\.\/assets\/ripple-icon\.png"/, "large icon");
  assert.match(metadata, /default_prompt: "Use \$ripple/, "default_prompt");
  assert.deepEqual(
    readFileSync(join(ROOT, "assets", "ripple-icon.png")),
    readFileSync(join(ROOT, "skills", "ripple", "assets", "ripple-icon.png")),
    "plugin and skill use the same icon bytes"
  );
  const short = metadata.match(/short_description: "([^"]+)"/)?.[1] ?? "";
  assert.ok(short.length >= 25 && short.length <= 64, `short_description length: ${short.length}`);
});

test("the plugin-relative CLI path used by Codex is runnable", () => {
  const cli = join(ROOT, "cli", "index.mjs");
  const result = spawnSync(process.execPath, [cli, "--version"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), readJson("package.json").version);
});

test("the public launcher is a portable Node entry point", () => {
  const launcher = readFileSync(join(ROOT, "bin", "ripple"), "utf8");
  assert.match(launcher, /^#!\/usr\/bin\/env node\n/);
  assert.match(launcher, /import\("\.\.\/cli\/index\.mjs"\)/);
  assert.doesNotMatch(launcher, /bash|BASH_SOURCE|readlink/);

  const result = spawnSync(process.execPath, [join(ROOT, "bin", "ripple"), "--version"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), readJson("package.json").version);
});

test("the editor-suite commands dispatch through the CLI registry", () => {
  // Every other test drives the command modules directly, so a dropped or
  // typo'd COMMANDS entry (the user's only entry point) would stay green.
  // Each command proves dispatch by emitting ITS OWN JSON envelope.
  const cli = join(ROOT, "cli", "index.mjs");
  const dir = mkdtempSync(join(tmpdir(), "ripple-dispatch-"));
  const runCli = (args, cwd = dir) =>
    spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", cwd });

  const history = runCli(["history", "--list"]);
  assert.equal(history.status, 0, history.stderr);
  assert.equal(JSON.parse(history.stdout).ok, true);

  const probe = runCli(["probe", dir]);
  assert.equal(probe.status, 0, probe.stderr);
  assert.equal(JSON.parse(probe.stdout).ok, true);

  const deprecated = {
    sources: "ripple probe [dir]",
    describe: "ripple lint",
    status: "ripple lint",
    locate: "ripple timeline-sheet <src> --at <output-time> --manifest edit.json",
    snapshot: "ripple history [edit.json]",
    compare: "ripple history --diff <a> <b>",
    grade: "ripple cut",
    review: "ripple qa <file> --report",
  };
  for (const [command, replacement] of Object.entries(deprecated)) {
    const result = runCli([command]);
    assert.equal(result.status, 2, `${command}: ${result.stderr}`);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.ok, false);
    assert.ok(envelope.error.message.includes(replacement), `${command}: ${envelope.error.message}`);
  }

  const unknown = runCli(["definitely-not-a-command"]);
  assert.equal(unknown.status, 2, unknown.stderr);
  const envelope = JSON.parse(unknown.stdout);
  assert.equal(envelope.ok, false);
  assert.match(envelope.error.message, /Unknown command: definitely-not-a-command/);
});

test("the npm bin survives the .bin symlink npm installs", () => {
  // npm materializes `ripple` as node_modules/.bin/ripple -> the package's
  // bin/ripple. The shim once resolved SCRIPT_DIR from the symlink's own
  // directory, exec-ing node against node_modules/cli/index.mjs — a dead
  // binary for every registry user.
  const dir = mkdtempSync(join(tmpdir(), "ripple-bin-"));
  mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
  symlinkSync(ROOT, join(dir, "node_modules", "ripple-video"));
  symlinkSync(
    join("..", "ripple-video", "bin", "ripple"),
    join(dir, "node_modules", ".bin", "ripple")
  );
  const res = spawnSync(join(dir, "node_modules", ".bin", "ripple"), ["--version"], {
    encoding: "utf8",
    cwd: dir,
  });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout.trim(), readJson("package.json").version);
});

test("the packed npm artifact installs and runs its ripple command", { timeout: 120_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-packed-install-"));
  const packDir = join(dir, "pack");
  const project = join(dir, "project");
  mkdirSync(packDir, { recursive: true });
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "package.json"), JSON.stringify({ private: true, type: "module" }));

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const packed = spawnSync(npm, ["pack", "--json", "--pack-destination", packDir], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(packed.status, 0, packed.stderr);
  const [{ filename }] = JSON.parse(packed.stdout);
  const tarball = join(packDir, filename);

  const installed = spawnSync(npm, [
    "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", tarball,
  ], { cwd: project, encoding: "utf8" });
  assert.equal(installed.status, 0, installed.stderr);

  const command = spawnSync(npm, ["exec", "--offline", "--", "ripple", "--version"], {
    cwd: project,
    encoding: "utf8",
  });
  assert.equal(command.status, 0, command.stderr);
  assert.equal(command.stdout.trim(), readJson("package.json").version);
});

// ---------- lint-on-write hook ----------

const HOOK = join(ROOT, "hooks", "lint-manifest.mjs");

test("hooks.json wires the lint hook to manifest writes on both hosts", () => {
  // Both hosts auto-discover the file at its default hooks/hooks.json path;
  // neither manifest may also reference it (Codex validation rejects a
  // `hooks` field, and a Claude manifest entry would register the hook twice).
  assert.equal("hooks" in readJson(".claude-plugin", "plugin.json"), false);
  const entries = readJson("hooks", "hooks.json").hooks.PostToolUse;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].matcher, "Write|Edit");
  assert.equal(entries[0].hooks.length, 1);
  const [hook] = entries[0].hooks;
  assert.equal(hook.type, "command");
  // One documented variable serves both hosts: Claude substitutes and
  // exports CLAUDE_PLUGIN_ROOT; Codex exports it as a compat alias of its
  // PLUGIN_ROOT. A shell-default fallback (`:-`) would defeat Claude's
  // literal token substitution, so the plain form is pinned here.
  assert.match(hook.command, /"\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/lint-manifest\.mjs"/);
  assert.ok(existsSync(HOOK));
});

// Drive the hook exactly as a host does: PostToolUse JSON on stdin, exit
// code and stdout observed.
function runHook(event, cwd) {
  const res = spawnSync(process.execPath, [HOOK], {
    encoding: "utf8",
    cwd,
    input: typeof event === "string" ? event : JSON.stringify(event),
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

function writeEvent(dir, file, extra = {}) {
  return {
    hook_event_name: "PostToolUse",
    tool_name: "Write",
    cwd: dir,
    tool_input: { file_path: join(dir, file) },
    ...extra,
  };
}

// Same fixture shape as lint.test.mjs: clean scene at 0–10, 3s dead tail at
// 15–25.
function project({ scenes, indexed = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ripple-hook-"));
  const src = join(dir, "src.mp4");
  writeFileSync(src, "stub");
  mkdirSync(join(dir, "work", "analysis"), { recursive: true });
  if (indexed) {
    writeFileSync(
      join(dir, "work", "analysis", `src_${fileStamp(src)}.analysis.json`),
      JSON.stringify({
        version: 4, file: src, duration: 30, hasAudio: true,
        words: [
          { start: 0.3, end: 0.6, text: "We" },
          { start: 0.7, end: 1.1, text: "work" },
          { start: 1.2, end: 9.2, text: "here." },
          { start: 15.2, end: 15.5, text: "I" },
          { start: 15.6, end: 22.0, text: "do." },
          { start: 26.5, end: 27.0, text: "What's" },
          { start: 27.1, end: 27.5, text: "next?" },
        ],
        silences: { "-40dB": [{ start: 9.2, end: 15.2 }, { start: 22.0, end: 26.5 }, { start: 27.5, end: null }] },
      })
    );
  }
  writeFileSync(join(dir, "edit.json"), JSON.stringify({ version: 1, scenes }));
  return dir;
}

const CLEAN = { id: 1, slug: "opening", source: "src.mp4", start: 0, end: 10, status: "locked" };
const DEAD_TAIL = { id: 2, slug: "closing", source: "src.mp4", start: 15, end: 25, status: "locked" };

test("a manifest write with findings surfaces a compact summary and never blocks", () => {
  const dir = project({ scenes: [CLEAN, DEAD_TAIL] });
  const { status, stdout } = runHook(writeEvent(dir, "edit.json"), dir);
  assert.equal(status, 0);
  const out = JSON.parse(stdout);
  assert.deepEqual(Object.keys(out), ["hookSpecificOutput"]);
  assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.deepEqual(Object.keys(out.hookSpecificOutput).sort(), ["additionalContext", "hookEventName"]);
  assert.equal("decision" in out, false);
  const context = out.hookSpecificOutput.additionalContext;
  assert.match(context, /1 block, 0 warn/);
  assert.match(context, /\[DEAD_AIR_TAIL\] closing:/);
  assert.match(context, /run `ripple lint` for the full report/);
});

test("a clean manifest write stays silent", () => {
  const dir = project({ scenes: [CLEAN] });
  const { status, stdout } = runHook(writeEvent(dir, "edit.json"), dir);
  assert.equal(status, 0);
  assert.equal(stdout, "");
});

test("non-manifest writes are ignored in total silence", () => {
  const dir = project({ scenes: [CLEAN, DEAD_TAIL] });
  writeFileSync(join(dir, "notes.txt"), "version scenes edit.json");
  writeFileSync(join(dir, "data.json"), JSON.stringify({ version: 1, items: [] }));
  for (const file of ["notes.txt", "data.json"]) {
    const { status, stdout } = runHook(writeEvent(dir, file), dir);
    assert.equal(status, 0, file);
    assert.equal(stdout, "", file);
  }
});

test("a manifest under another name is sniffed by its schema markers", () => {
  const dir = project({ scenes: [CLEAN, DEAD_TAIL] });
  writeFileSync(join(dir, "alt-cut.json"), readFileSync(join(dir, "edit.json")));
  const { status, stdout } = runHook(writeEvent(dir, "alt-cut.json"), dir);
  assert.equal(status, 0);
  assert.match(JSON.parse(stdout).hookSpecificOutput.additionalContext, /DEAD_AIR_TAIL/);
});

test("broken JSON on stdin fails open: exit 0, debug note only", () => {
  const { status, stdout } = runHook("{not json", tmpdir());
  assert.equal(status, 0);
  assert.match(stdout, /fail-open/);
});

test("an unreadable manifest fails open instead of erroring the write", () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-hook-"));
  writeFileSync(join(dir, "edit.json"), "{not json");
  const { status, stdout } = runHook(writeEvent(dir, "edit.json"), dir);
  assert.equal(status, 0);
  assert.match(stdout, /fail-open/);
});

test("a scene with no cached index surfaces NO_INDEX without blocking", () => {
  const dir = project({ scenes: [CLEAN], indexed: false });
  const { status, stdout } = runHook(writeEvent(dir, "edit.json"), dir);
  assert.equal(status, 0);
  assert.match(JSON.parse(stdout).hookSpecificOutput.additionalContext, /\[NO_INDEX\]/);
});

test("Codex apply_patch envelopes reach the same lint", () => {
  const dir = project({ scenes: [CLEAN, DEAD_TAIL] });
  const patch = [
    "*** Begin Patch",
    "*** Update File: edit.json",
    "@@",
    '+{"version": 1}',
    "*** End Patch",
  ].join("\n");
  // Spawn cwd differs from the event cwd on purpose: relative patch paths
  // must resolve against the event's cwd, not the hook process's.
  const { status, stdout } = runHook(
    { hook_event_name: "PostToolUse", tool_name: "apply_patch", cwd: dir, tool_input: { command: patch } },
    tmpdir()
  );
  assert.equal(status, 0);
  assert.match(JSON.parse(stdout).hookSpecificOutput.additionalContext, /\[DEAD_AIR_TAIL\] closing:/);
});

// ---------- manifest schema ----------

// schemas/edit.schema.json is documentation (nothing loads it at runtime),
// so this is the only thing keeping it honest: every manifest field the
// CLI actually consumes must stay declared in the schema.
test("edit.schema.json declares every field the CLI consumes", () => {
  const schema = readJson("schemas", "edit.schema.json");
  const has = (obj, keys) => {
    for (const key of keys) assert.ok(key in obj.properties, `schema missing: ${key}`);
  };
  // cut/lint/qa/captions/locate read these — grep `manifest.<field>`.
  has(schema, ["version", "title", "color", "output", "grade", "music", "scenes", "qa"]);
  // cut and the safety checks read these per scene — grep `scene.<field>`.
  has(schema.properties.scenes.items, [
    "id", "slug", "source", "start", "end", "expectEnding",
    "card", "cardFile", "cardDuration", "jcut", "gainDb", "grade", "qa", "lcut", "transition",
  ]);
  // qa's delivery gates.
  has(schema.properties.qa, ["allowAudioAtEnd", "leakPatterns", "maxTailSilence", "maxLeadingSilence", "maxLoudnessSpread"]);
});
