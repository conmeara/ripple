import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

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
  assert.deepEqual(codex.interface.capabilities, ["Read", "Write"]);
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

test("Ripple skill metadata and setup support Codex invocation", () => {
  const skill = readFileSync(join(ROOT, "skills", "ripple", "SKILL.md"), "utf8");
  const metadata = readFileSync(
    join(ROOT, "skills", "ripple", "agents", "openai.yaml"),
    "utf8"
  );

  assert.match(skill, /<ripple-skill-dir>/);
  assert.match(skill, /<ripple-plugin-root>\/cli\/index\.mjs/);
  assert.match(skill, /\$ripple <phase>/);
  assert.match(metadata, /display_name: "Ripple"/);
  assert.match(metadata, /default_prompt: "Use \$ripple/);
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
