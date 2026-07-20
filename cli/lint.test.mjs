import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fileStamp } from "./util.mjs";

const LINT = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), "lint.mjs")).href;

// Drive main() in a child so exit codes and the JSON envelope are the real
// contract CI gates see (dispatch through cli/index.mjs is pinned by
// plugin.test.mjs's registry smoke test).
function runLint(args, cwd) {
  const res = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `const m = await import(${JSON.stringify(LINT)}); await m.main(${JSON.stringify(args)});`],
    { encoding: "utf8", cwd }
  );
  let json = null;
  try {
    json = JSON.parse(res.stdout);
  } catch { /* asserted by callers */ }
  return { status: res.status, json, stderr: res.stderr };
}

// Clean scene at 0–10, 3s dead tail at 15–25.
function project({ scenes } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ripple-lint-"));
  const src = join(dir, "src.mp4");
  writeFileSync(src, "stub");
  mkdirSync(join(dir, "work", "analysis"), { recursive: true });
  writeFileSync(
    join(dir, "work", "analysis", `src_${fileStamp(src)}.analysis.json`),
    JSON.stringify({
      version: 4, file: src, duration: 30, hasAudio: true,
      words: [
        { start: 0.3, end: 0.6, text: "We" },
        { start: 0.7, end: 1.1, text: "met" },
        { start: 1.2, end: 9.2, text: "here." },
        { start: 15.2, end: 15.5, text: "I" },
        { start: 15.6, end: 22.0, text: "do." },
        { start: 26.5, end: 27.0, text: "What's" },
        { start: 27.1, end: 27.5, text: "next?" },
      ],
      silences: { "-40dB": [{ start: 9.2, end: 15.2 }, { start: 22.0, end: 26.5 }, { start: 27.5, end: null }] },
    })
  );
  writeFileSync(join(dir, "edit.json"), JSON.stringify({ version: 1, scenes }));
  return dir;
}

const CLEAN = { id: 1, slug: "met", source: "src.mp4", start: 0, end: 10, status: "locked" };
const DEAD_TAIL = { id: 2, slug: "vows", source: "src.mp4", start: 15, end: 25, status: "locked" };

test("clean manifest: ok envelope, exit 0", () => {
  const dir = project({ scenes: [CLEAN] });
  const { status, json } = runLint(["edit.json"], dir);
  assert.equal(status, 0);
  assert.equal(json.ok, true);
  assert.deepEqual(json.findings, []);
  assert.deepEqual(json.summary, { block: 0, warn: 0 });
});

test("a block finding fails the gate: ok:false, exit 1, hint present", () => {
  const dir = project({ scenes: [CLEAN, DEAD_TAIL] });
  const { status, json } = runLint(["edit.json"], dir);
  assert.equal(status, 1);
  assert.equal(json.ok, false);
  assert.equal(json.summary.block, 1);
  assert.equal(json.findings.find((f) => f.code === "DEAD_AIR_TAIL").scene, "vows");
  assert.match(json.hint, /re-scope the cut/);
});

test("--scene lints only the named scene; a miss is a usage error", () => {
  const dir = project({ scenes: [CLEAN, DEAD_TAIL] });
  const ok = runLint(["edit.json", "--scene", "met"], dir);
  assert.equal(ok.status, 0);
  assert.deepEqual(ok.json.scenes, ["met"]);
  const miss = runLint(["edit.json", "--scene", "nope"], dir);
  assert.equal(miss.status, 2);
  assert.equal(miss.json.ok, false);
});

test("missing manifest and unreadable manifest are usage errors (exit 2)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-lint-"));
  const missing = runLint(["edit.json"], dir);
  assert.equal(missing.status, 2);
  assert.equal(missing.json.ok, false);
  writeFileSync(join(dir, "edit.json"), "{not json");
  const broken = runLint(["edit.json"], dir);
  assert.equal(broken.status, 2);
  assert.match(broken.json.error.message, /Manifest unreadable/);
});

test("NO_INDEX blocks: lint never analyzes, it reports", () => {
  const dir = project({ scenes: [CLEAN] });
  writeFileSync(join(dir, "fresh.mp4"), "stub");
  writeFileSync(join(dir, "edit.json"), JSON.stringify({
    version: 1,
    scenes: [{ id: 1, slug: "fresh", source: "fresh.mp4", start: 0, end: 5, status: "proposed" }],
  }));
  const { status, json } = runLint(["edit.json"], dir);
  assert.equal(status, 1);
  assert.equal(json.findings[0].code, "NO_INDEX");
});

test("a warn finding surfaces but never gates: exit 0, ok:true", () => {
  // The core gate semantic — warns surface, only blocks gate — pinned
  // through main(): a silence-only project (words:null → NO_WORD_TIMING,
  // warn) must lint green or every legitimate whisper-less project turns
  // the CI gate red.
  const dir = project({ scenes: [CLEAN] });
  const src = join(dir, "src.mp4");
  writeFileSync(
    join(dir, "work", "analysis", `src_${fileStamp(src)}.analysis.json`),
    JSON.stringify({
      version: 4, file: src, duration: 30, hasAudio: true,
      words: null, wordsNote: "whisper-cpp unavailable",
      // The scene's out-point (10) sits inside this span, so the
      // silence-only checks stay quiet and ONLY the warn remains.
      silences: { "-40dB": [{ start: 9.2, end: 15.2 }] },
    })
  );
  const { status, json } = runLint(["edit.json"], dir);
  assert.equal(status, 0);
  assert.equal(json.ok, true);
  assert.deepEqual(json.summary, { block: 0, warn: 1 });
  assert.equal(json.findings[0].code, "NO_WORD_TIMING");
  assert.equal(json.findings[0].severity, "warn");
});

test("a drift-suspect index warns per scene and points to driftCheck", () => {
  // The interview failure's lint gap: scenes re-scoped by hand from a drifted
  // index kept passing green. The index self-report becomes a warn that
  // names the arbiter (candidates' driftCheck) without gating.
  const dir = project({ scenes: [CLEAN] });
  const src = join(dir, "src.mp4");
  const planted = JSON.parse(readFileSync(join(dir, "work", "analysis", `src_${fileStamp(src)}.analysis.json`), "utf8"));
  planted.drift = { stretchedEndings: 50, maxStretch: 13.598, suspected: true, samples: [] };
  writeFileSync(join(dir, "work", "analysis", `src_${fileStamp(src)}.analysis.json`), JSON.stringify(planted));

  const { status, json } = runLint(["edit.json"], dir);
  assert.equal(status, 0); // warn, never a gate
  const f = json.findings.find((x) => x.code === "DRIFT_SUSPECT");
  assert.ok(f, JSON.stringify(json.findings));
  assert.equal(f.severity, "warn");
  assert.equal(f.scene, "met");
  assert.match(f.detail, /driftCheck/);
});

test("an explicit max-tail changes the safety bound", () => {
  const dir = project({ scenes: [DEAD_TAIL] });
  const { status, json } = runLint(["edit.json", "--max-tail", "3.5"], dir);
  assert.equal(status, 0);
  assert.deepEqual(json.findings, []);
  assert.equal("overrides" in json, false);
});
