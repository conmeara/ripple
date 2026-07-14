import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTEXT_SCRIPT = join(ROOT, "skills", "ripple", "scripts", "context.mjs");

function runContextRaw(cwd, home) {
  const result = spawnSync(process.execPath, [CONTEXT_SCRIPT], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HOME: home },
  });
  assert.equal(result.status, 0, result.stderr);
  const prefix = "RESOLVED_CONTEXT: ";
  const line = result.stdout.split("\n").find((entry) => entry.startsWith(prefix));
  assert.ok(line, result.stdout);
  return { stdout: result.stdout, context: JSON.parse(line.slice(prefix.length)) };
}

function runContext(cwd, home) {
  return runContextRaw(cwd, home).context;
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

// The directive lines are a contract the skill parses; they must survive the
// refactor onto status.mjs's gatherStatus byte-for-byte, with NEXT_STEP (and
// RESOLVED_CONTEXT.next) as the only additions.
test("context preserves NO_VIDEO_MD and adds a NEXT_STEP routing hint", (t) => {
  const sandbox = mkdtempSync(join(tmpdir(), "ripple-context-"));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const home = join(sandbox, "home");
  const project = join(home, "Projects", "new-video");
  mkdirSync(project, { recursive: true });

  const { stdout, context } = runContextRaw(project, home);
  assert.match(stdout, /^NO_VIDEO_MD: This project has no VIDEO\.md yet\./m);
  assert.match(stdout, /^NEXT_STEP: .*VIDEO\.md/m);
  assert.equal(context.next, "init");
});

test("context prints VIDEO.md and the edit.json summary in the standing shape", (t) => {
  const sandbox = mkdtempSync(join(tmpdir(), "ripple-context-"));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const home = join(sandbox, "home");
  const project = join(home, "Projects", "wedding");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "VIDEO.md"), "# VIDEO.md\n\nTight tails.");
  writeFileSync(join(project, "edit.json"), JSON.stringify({
    version: 1,
    color: { policy: "preserve" },
    scenes: [{ id: 1, slug: "met", source: "src.mp4", start: 0, end: 10, status: "locked" }],
  }));

  const { stdout, context } = runContextRaw(project, home);
  assert.match(stdout, /=== VIDEO\.md \(standing direction — honor this\) ===/);
  assert.match(stdout, /Tight tails\./);
  assert.match(stdout, /=== edit\.json summary ===/);
  const summary = JSON.parse(stdout.split("=== edit.json summary ===\n")[1].split("=== end edit.json summary ===")[0]);
  assert.deepEqual(summary, {
    path: join(realpathSync(project), "edit.json"),
    scenes: 1,
    colorPolicy: "preserve",
    statuses: { locked: 1 },
  });
  assert.equal(context.manifest, join(realpathSync(project), "edit.json"));
  assert.match(stdout, /^NEXT_STEP: /m);
});

test("context reports an unreadable manifest as MANIFEST_UNREADABLE, not a crash", (t) => {
  const sandbox = mkdtempSync(join(tmpdir(), "ripple-context-"));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const home = join(sandbox, "home");
  const project = join(home, "Projects", "broken");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "VIDEO.md"), "# VIDEO.md");
  writeFileSync(join(project, "edit.json"), "{not json");

  const { stdout, context } = runContextRaw(project, home);
  assert.match(stdout, /^MANIFEST_UNREADABLE: .*edit\.json exists but failed to parse \(.*\)\. Fix or regenerate it before editing\.$/m);
  assert.equal(context.manifest, null);
});
