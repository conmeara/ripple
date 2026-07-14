import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveManifestPath } from "./status.mjs";
import { fileStamp } from "./util.mjs";

const STATUS = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), "status.mjs")).href;

// Drive main() in a child so exit codes and the JSON envelope are the real
// contract (dispatch through cli/index.mjs is pinned by plugin.test.mjs's
// registry smoke test).
function runStatus(args, cwd) {
  const res = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `const m = await import(${JSON.stringify(STATUS)}); await m.main(${JSON.stringify(args)});`],
    { encoding: "utf8", cwd }
  );
  let json = null;
  try {
    json = JSON.parse(res.stdout);
  } catch { /* asserted by callers */ }
  return { status: res.status, json, stderr: res.stderr };
}

// Same fixture shape as lint.test.mjs: clean scene at 0–10, 3s dead tail at
// 15–25 — all cached JSON, no ffmpeg/whisper anywhere near these tests.
function indexFixture(src, { suspects = 0 } = {}) {
  const words = [
    { start: 0.3, end: 0.6, text: "We" },
    { start: 0.7, end: 1.1, text: "met" },
    { start: 1.2, end: 9.2, text: "here." },
    { start: 15.2, end: 15.5, text: "I" },
    { start: 15.6, end: 22.0, text: "do." },
    { start: 26.5, end: 27.0, text: "What's" },
    { start: 27.1, end: 27.5, text: "next?" },
  ];
  for (let i = 0; i < suspects; i++) {
    words.push({ start: 28 + i, end: 28.4 + i, text: "ghost", suspect: true, suspectReason: "in-silence" });
  }
  return {
    version: 5, file: src, duration: 30, hasAudio: true, words,
    silences: { "-40dB": [{ start: 9.2, end: 15.2 }, { start: 22.0, end: 26.5 }, { start: 27.5, end: null }] },
  };
}

function project({ scenes, videoMd = "# VIDEO.md\n\nTight tails.", indexed = true, suspects = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ripple-status-"));
  const src = join(dir, "src.mp4");
  writeFileSync(src, "stub");
  if (indexed) {
    mkdirSync(join(dir, "work", "analysis"), { recursive: true });
    writeFileSync(
      join(dir, "work", "analysis", `src_${fileStamp(src)}.analysis.json`),
      JSON.stringify(indexFixture(src, { suspects }))
    );
  }
  if (scenes) writeFileSync(join(dir, "edit.json"), JSON.stringify({ version: 1, scenes }));
  if (videoMd) writeFileSync(join(dir, "VIDEO.md"), videoMd);
  return dir;
}

const CLEAN = { id: 1, slug: "met", source: "src.mp4", start: 0, end: 10, status: "locked" };
const DEAD_TAIL = { id: 2, slug: "vows", source: "src.mp4", start: 15, end: 25, status: "proposed" };

// mtime control makes staleness deterministic — two writes in the same ms
// must not decide a verdict.
function backdate(path, secondsAgo) {
  const t = new Date(Date.now() - secondsAgo * 1000);
  utimesSync(path, t, t);
}

test("empty project: ok envelope, everything null/zero, verdict routes to init", () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-status-"));
  const { status, json } = runStatus([dir]);
  assert.equal(status, 0);
  assert.equal(json.ok, true);
  assert.equal(json.videoMd.present, false);
  assert.equal(json.sources.count, 0);
  assert.equal(json.manifest, null);
  assert.equal(json.findings, null);
  assert.equal(json.renders, null);
  assert.deepEqual(json.qa, { runs: 0, latest: null });
  assert.deepEqual(json.history, { count: 0, latest: null });
  assert.equal(json.next, "init");
  assert.match(json.verdict, /VIDEO\.md/);
});

test("unindexed sources: cached-only facts (duration null) and an analyze verdict", () => {
  const dir = project({ indexed: false });
  const { status, json } = runStatus([dir]);
  assert.equal(status, 0);
  assert.deepEqual(json.sources.list, [{ file: join(dir, "src.mp4"), indexed: false, duration: null }]);
  assert.equal(json.sources.unindexed, 1);
  assert.equal(json.next, "analyze");
  assert.match(json.verdict, /ripple analyze/);
});

test("indexed footage, no manifest: degrades to manifest null and routes to plan", () => {
  const dir = project({});
  const { status, json } = runStatus([dir]);
  assert.equal(status, 0);
  assert.equal(json.sources.indexed, 1);
  assert.equal(json.sources.list[0].duration, 30);
  assert.equal(json.sources.list[0].words, 7);
  assert.equal(json.manifest, null);
  assert.equal(json.findings, null);
  assert.equal(json.next, "plan");
});

test("suspect words surface per source, from the index alone", () => {
  const dir = project({ suspects: 2 });
  const { json } = runStatus([dir]);
  assert.equal(json.sources.list[0].suspectWords, 2);
  assert.equal(json.sources.list[0].words, 9);
});

test("block findings surface with lint's summary shape and route to lint", () => {
  const dir = project({ scenes: [CLEAN, DEAD_TAIL] });
  const { status, json } = runStatus([dir]);
  assert.equal(status, 0); // status reports, it never gates
  assert.deepEqual(json.findings, { block: 1, warn: 0, waived: 0 });
  assert.deepEqual(json.manifest.statuses, { locked: 1, proposed: 1 });
  assert.deepEqual(json.manifest.scenes[1], { slug: "vows", source: "src.mp4", duration: 10, status: "proposed" });
  assert.equal(json.next, "lint");
  assert.match(json.verdict, /1 block finding/);
});

test("preset clip dirs from ripple cut are never counted as sources", () => {
  const dir = project({ scenes: [CLEAN] });
  // What `ripple cut --preset vertical` leaves behind (cut.mjs dirSuffix).
  mkdirSync(join(dir, "clips_vertical"));
  writeFileSync(join(dir, "clips_vertical", "01_met.mp4"), "derived clip");
  const { json } = runStatus([dir]);
  assert.equal(json.sources.count, 1); // src.mp4 only — no phantom unindexed source
  assert.equal(json.next, "cut"); // renders missing; the derived clips must not misroute to analyze
});

test("clean manifest with missing renders routes to cut; stale renders too", () => {
  const dir = project({ scenes: [CLEAN] });
  const missing = runStatus([dir]);
  assert.deepEqual(missing.json.findings, { block: 0, warn: 0, waived: 0 });
  assert.deepEqual(missing.json.renders, {
    clipsDir: join(dir, "clips"), expected: 1, rendered: 0, missing: 1, stale: 0, final: null,
  });
  assert.equal(missing.json.next, "cut");

  mkdirSync(join(dir, "clips"));
  writeFileSync(join(dir, "clips", "01_met.mp4"), "clip");
  backdate(join(dir, "clips", "01_met.mp4"), 60); // older than edit.json
  const stale = runStatus([dir]);
  assert.equal(stale.json.renders.rendered, 1);
  assert.equal(stale.json.renders.stale, 1);
  assert.equal(stale.json.next, "cut");
});

test("current renders on a clean cut route to qa; last QA snapshot is picked up", () => {
  const dir = project({ scenes: [CLEAN] });
  backdate(join(dir, "edit.json"), 60);
  mkdirSync(join(dir, "clips"));
  writeFileSync(join(dir, "clips", "01_met.mp4"), "clip");
  mkdirSync(join(dir, "outputs"));
  writeFileSync(join(dir, "outputs", "wedding_final.mp4"), "final");
  const clean = runStatus([dir]);
  assert.equal(clean.json.renders.stale, 0);
  assert.equal(clean.json.renders.final.stale, false);
  assert.equal(clean.json.next, "qa");

  mkdirSync(join(dir, ".ripple", "qa"), { recursive: true });
  writeFileSync(join(dir, ".ripple", "qa", "qa-100.json"), JSON.stringify({ passed: 8, total: 10, timestamp: "2026-07-01T00:00:00Z" }));
  writeFileSync(join(dir, ".ripple", "qa", "qa-200.json"), JSON.stringify({ passed: 9, total: 10, timestamp: "2026-07-02T00:00:00Z" }));
  const after = runStatus([dir]);
  assert.deepEqual(after.json.qa, {
    runs: 2,
    latest: { passed: 9, total: 10, when: "2026-07-02T00:00:00Z", ok: false },
  });
  assert.equal(after.json.next, "qa");
  assert.match(after.json.verdict, /Last QA failed \(9\/10\)/);
});

test("history: snapshot count and latest label from .ripple/history", () => {
  const dir = project({ scenes: [CLEAN] });
  mkdirSync(join(dir, ".ripple", "history"), { recursive: true });
  writeFileSync(
    join(dir, ".ripple", "history", "2026-07-01_00-00-00-000.json"),
    JSON.stringify({ savedAt: "2026-07-01T00:00:00Z", label: "before tighten", hash: "abc", manifest: { scenes: [] } })
  );
  const { json } = runStatus([dir]);
  assert.deepEqual(json.history, { count: 1, latest: { label: "before tighten", savedAt: "2026-07-01T00:00:00Z" } });
});

test("VIDEO.md front-matter rules block is detected", () => {
  const plain = runStatus([project({})]);
  assert.deepEqual(plain.json.videoMd.rulesBlock, false);
  const dir = project({
    videoMd: ["---", "rules:", '  DEAD_AIR_TAIL: {maxTail: 3.5, reason: "contemplative"}', "---", "# VIDEO.md"].join("\n"),
  });
  const { json } = runStatus([dir]);
  assert.equal(json.videoMd.present, true);
  assert.equal(json.videoMd.rulesBlock, true);
});

test("unreadable manifest degrades to a fact, never a crash", () => {
  const dir = project({});
  writeFileSync(join(dir, "edit.json"), "{not json");
  const { status, json } = runStatus([dir]);
  assert.equal(status, 0);
  assert.equal(json.ok, true);
  assert.match(json.manifest.error, /^unreadable: /);
  assert.equal(json.findings, null);
  assert.equal(json.next, "plan");
  assert.match(json.verdict, /does not parse/);
});

test("a dangling symlink in outputs/ degrades to no final, never a crash", () => {
  // A render moved or cleaned up out from under its symlink is ordinary
  // project state; statSync on it once crashed gatherStatus — and with it
  // the context gate that runs before every ripple command.
  const dir = project({ scenes: [CLEAN] });
  mkdirSync(join(dir, "outputs"));
  symlinkSync("/nonexistent-render-target", join(dir, "outputs", "final.mp4"));
  const { status, json } = runStatus([dir]);
  assert.equal(status, 0);
  assert.equal(json.ok, true);
  assert.equal(json.renders.final, null); // not a render, not a crash
  assert.equal(json.next, "cut");
});

// chmod-based denial doesn't bite when running as root (CI containers).
const asRoot = typeof process.getuid === "function" && process.getuid() === 0;

test("permission errors degrade to facts: unreadable VIDEO.md/qa/history never crash", { skip: asRoot }, () => {
  const dir = project({ scenes: [CLEAN] });
  mkdirSync(join(dir, ".ripple", "qa"), { recursive: true });
  mkdirSync(join(dir, ".ripple", "history"), { recursive: true });
  chmodSync(join(dir, "VIDEO.md"), 0o000);
  chmodSync(join(dir, ".ripple", "qa"), 0o000);
  chmodSync(join(dir, ".ripple", "history"), 0o000);
  try {
    const { status, json } = runStatus([dir]);
    assert.equal(status, 0);
    assert.equal(json.ok, true);
    assert.equal(json.videoMd.present, true); // it exists — just unreadable
    assert.equal(json.videoMd.rulesBlock, false);
    assert.deepEqual(json.qa, { runs: 0, latest: null });
    assert.deepEqual(json.history, { count: 0, latest: null });
  } finally {
    chmodSync(join(dir, "VIDEO.md"), 0o644);
    chmodSync(join(dir, ".ripple", "qa"), 0o755);
    chmodSync(join(dir, ".ripple", "history"), 0o755);
  }
});

test("usage errors exit 2: missing dir, explicit missing --manifest", () => {
  const gone = runStatus(["/nonexistent/nowhere"]);
  assert.equal(gone.status, 2);
  assert.equal(gone.json.ok, false);
  const dir = project({});
  const badManifest = runStatus([dir, "--manifest", join(dir, "missing.json")]);
  assert.equal(badManifest.status, 2);
  assert.equal(badManifest.json.ok, false);
});

test("resolveManifestPath prefers edit.json, falls back to work/edit.json, else null", () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-status-"));
  assert.equal(resolveManifestPath(dir), null);
  mkdirSync(join(dir, "work"));
  writeFileSync(join(dir, "work", "edit.json"), "{}");
  assert.equal(resolveManifestPath(dir), join(dir, "work", "edit.json"));
  writeFileSync(join(dir, "edit.json"), "{}");
  assert.equal(resolveManifestPath(dir), join(dir, "edit.json"));
});
