import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assessAudioBoundaries, runCheck } from "../evals/lib/checks.mjs";

const REQUIRED = ["scene-tails", "tail-silence"];

function workspace(snapshot) {
  const ws = mkdtempSync(join(tmpdir(), "ripple-eval-check-"));
  const dir = join(ws, ".ripple", "qa");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "qa-100.json"), JSON.stringify(snapshot));
  return ws;
}

function qaSnapshot(ws) {
  return runCheck(
    { ws, root: process.cwd() },
    { id: "qa", type: "qa_snapshot", status: "pass", gates: REQUIRED }
  );
}

test("release evals reject legacy N/N QA snapshots as verification evidence", () => {
  const checks = REQUIRED.map((id) => ({ id, ok: true }));
  const result = qaSnapshot(workspace({ passed: 2, total: 2, checks }));
  assert.equal(result.pass, false);
  assert.match(result.detail, /lacks explicit ok:true\/status:pass\/verified:true/);
});

test("release evals accept an explicit tri-state verified QA pass", () => {
  const checks = REQUIRED.map((id) => ({ id, ok: true, status: "pass", verified: true }));
  const result = qaSnapshot(workspace({
    ok: true, status: "pass", verified: true, passed: 2, total: 2, checks,
  }));
  assert.equal(result.pass, true);
  assert.match(result.detail, /passing gates: scene-tails, tail-silence/);
});

test("release QA evidence must target the latest render and postdate it", () => {
  const ws = workspace({
    file: "outputs/other.mp4", ok: true, status: "pass", verified: true,
    checks: REQUIRED.map((id) => ({ id, ok: true, status: "pass", verified: true })),
  });
  mkdirSync(join(ws, "outputs"), { recursive: true });
  writeFileSync(join(ws, "outputs", "final.mp4"), "synthetic render marker");
  const result = runCheck(
    { ws, root: process.cwd() },
    { id: "qa", type: "qa_snapshot", glob: "outputs/*.mp4", status: "pass", gates: REQUIRED }
  );
  assert.equal(result.pass, false);
  assert.match(result.detail, /does not match latest render/);
});

test("release QA evidence must name and postdate the current manifest", () => {
  const ws = workspace({
    file: "outputs/final.mp4", manifest: "other.json",
    ok: true, status: "pass", verified: true,
    checks: REQUIRED.map((id) => ({ id, ok: true, status: "pass", verified: true })),
  });
  mkdirSync(join(ws, "outputs"), { recursive: true });
  writeFileSync(join(ws, "outputs", "final.mp4"), "synthetic render marker");
  writeFileSync(join(ws, "edit.json"), "{}");
  const result = runCheck(
    { ws, root: process.cwd() },
    { id: "qa", type: "qa_snapshot", glob: "outputs/*.mp4", manifest: "edit.json", status: "pass", gates: REQUIRED }
  );
  assert.equal(result.pass, false);
  assert.match(result.detail, /snapshot manifest other\.json does not match edit\.json/);
});

test("release QA evidence accepts only a current recorded timestamp, not a touched old snapshot", () => {
  const ws = mkdtempSync(join(tmpdir(), "ripple-eval-bound-"));
  const qaDir = join(ws, ".ripple", "qa");
  const outputsDir = join(ws, "outputs");
  mkdirSync(qaDir, { recursive: true });
  mkdirSync(outputsDir, { recursive: true });
  const manifest = join(ws, "edit.json");
  const render = join(outputsDir, "final.mp4");
  const snapshotPath = join(qaDir, "qa-100.json");
  const now = Date.now() / 1000;
  writeFileSync(manifest, "{}");
  writeFileSync(render, "render");
  const snapshot = {
    file: render, manifest,
    timestamp: new Date((now + 10) * 1000).toISOString(),
    ok: true, status: "pass", verified: true,
    checks: REQUIRED.map((id) => ({ id, ok: true, status: "pass", verified: true })),
  };
  writeFileSync(snapshotPath, JSON.stringify(snapshot));
  utimesSync(manifest, now - 20, now - 20);
  utimesSync(render, now - 10, now - 10);
  utimesSync(snapshotPath, now + 10, now + 10);
  const check = { id: "qa", type: "qa_snapshot", glob: "outputs/*.mp4", manifest: "edit.json", status: "pass", gates: REQUIRED };
  assert.equal(runCheck({ ws, root: process.cwd() }, check).pass, true);

  snapshot.timestamp = new Date((now - 30) * 1000).toISOString();
  writeFileSync(snapshotPath, JSON.stringify(snapshot));
  utimesSync(snapshotPath, now + 20, now + 20);
  const stale = runCheck({ ws, root: process.cwd() }, check);
  assert.equal(stale.pass, false);
  assert.match(stale.detail, /recorded timestamp predates/);
});

test("hard-cut boundary evals cannot pass vacuously with no hard join", () => {
  assert.equal(assessAudioBoundaries({
    tail: 0.4, joins: [], minHardJoins: 1, maxHardJoins: 1,
  }), false);
  assert.equal(assessAudioBoundaries({
    tail: 0.4, joins: [{ at: 10, silence: 0.3 }], minHardJoins: 1, maxHardJoins: 1,
  }), true);
});

test("manifest source-order eval rejects swaps and extra scenes", () => {
  const ws = mkdtempSync(join(tmpdir(), "ripple-eval-order-"));
  const check = {
    id: "order", type: "manifest_source_order",
    sources: ["media/01_answer-a.mp4", "media/10_answer-b.mp4"],
  };
  writeFileSync(join(ws, "edit.json"), JSON.stringify({ scenes: [
    { source: "media/10_answer-b.mp4" }, { source: "media/01_answer-a.mp4" },
  ] }));
  assert.equal(runCheck({ ws }, check).pass, false);
  writeFileSync(join(ws, "edit.json"), JSON.stringify({ scenes: [
    { source: "media/01_answer-a.mp4" }, { source: "media/10_answer-b.mp4" }, { source: "media/extra.mp4" },
  ] }));
  assert.equal(runCheck({ ws }, check).pass, false);
  writeFileSync(join(ws, "edit.json"), JSON.stringify({ scenes: [
    { source: "media/01_answer-a.mp4" }, { source: "media/10_answer-b.mp4" },
  ] }));
  assert.equal(runCheck({ ws }, check).pass, true);
});
