import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTEXT_SCRIPT = join(ROOT, "skills", "ripple", "scripts", "context.mjs");

function runContext(cwd, home) {
  const result = spawnSync(process.execPath, [CONTEXT_SCRIPT], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HOME: home },
  });
  assert.equal(result.status, 0, result.stderr);
  const prefix = "RESOLVED_CONTEXT: ";
  const line = result.stdout.split("\n").find((entry) => entry.startsWith(prefix));
  assert.ok(line, result.stdout);
  return JSON.parse(line.slice(prefix.length));
}

test("context ignores the global ~/.ripple model cache", (t) => {
  const sandbox = mkdtempSync(join(tmpdir(), "ripple-context-"));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const home = join(sandbox, "home");
  const project = join(home, "Projects", "new-video");
  mkdirSync(join(home, ".ripple", "models"), { recursive: true });
  mkdirSync(project, { recursive: true });

  const context = runContext(project, home);
  assert.equal(context.projectRoot, realpathSync(project));
  assert.equal(context.videoMd, null);
  assert.equal(context.manifest, null);
});

test("context uses the nearest repository root for a new video project", (t) => {
  const sandbox = mkdtempSync(join(tmpdir(), "ripple-context-"));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const home = join(sandbox, "home");
  const project = join(home, "Projects", "video-repo");
  const nested = join(project, "sources", "interviews");
  mkdirSync(join(home, ".ripple", "models"), { recursive: true });
  mkdirSync(join(project, ".git"), { recursive: true });
  mkdirSync(nested, { recursive: true });

  const context = runContext(nested, home);
  assert.equal(context.projectRoot, realpathSync(project));
});
