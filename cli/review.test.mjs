import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { qaCheckStatus, qaSnapshotEvidence, qaSnapshotStatus, readQaSnapshotEntries, reviewManifestPath } from "./review.mjs";

const REVIEW = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), "review.mjs")).href;

function runReview(args, cwd) {
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `const m = await import(${JSON.stringify(REVIEW)}); await m.main(${JSON.stringify(args)});`],
    { encoding: "utf8", cwd }
  );
  return { status: result.status, json: JSON.parse(result.stdout), stderr: result.stderr };
}

test("QA report keeps pass, fail, and not-verified visually distinct", () => {
  assert.equal(qaCheckStatus({ ok: true, status: "pass" }), "pass");
  assert.equal(qaCheckStatus({ ok: false, status: "fail" }), "fail");
  assert.equal(qaCheckStatus({ ok: null, status: "not-verified" }), "not-verified");
});

test("QA report treats every legacy snapshot without the explicit tri-state contract as not verified", () => {
  assert.equal(qaSnapshotStatus({ checks: [{ ok: true }, { ok: true, skipped: true }] }), "not-verified");
  assert.equal(qaSnapshotStatus({ checks: [{ ok: true }, { ok: false }] }), "not-verified");
  assert.equal(qaSnapshotStatus({ checks: [{ ok: true }] }), "not-verified");
  assert.equal(qaSnapshotStatus({ status: "fail", ok: false, verified: false, checks: [] }), "fail");
});

test("QA report snapshot discovery skips corrupt and partial JSON without hiding older evidence", () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-review-snapshots-"));
  writeFileSync(join(dir, "qa-100.json"), JSON.stringify({ status: "pass", ok: true, verified: true }));
  writeFileSync(join(dir, "qa-200.json"), "{\"status\":\"pass\"");
  writeFileSync(join(dir, "qa-300.json"), "null");
  writeFileSync(join(dir, ".qa-400.json.123.tmp"), "partial temporary write");

  const loaded = readQaSnapshotEntries(dir);
  assert.deepEqual(loaded.entries.map(({ file }) => file), ["qa-100.json"]);
  assert.deepEqual(loaded.unreadable.map(({ file }) => file), ["qa-200.json", "qa-300.json"]);
  assert.equal(loaded.newestCandidate, "qa-300.json");
});

test("qa --report survives an unreadable newest snapshot and refuses an older green badge", () => {
  const f = evidenceFixture();
  const partialPath = join(dirname(f.snapshotPath), "qa-200.json");
  const reportPath = join(f.dir, "qa", "review.html");
  writeFileSync(partialPath, "{\"status\":\"pass\"");

  const result = runReview(["--manifest", f.manifestPath, "--out", reportPath], f.dir);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.qaStatus, "not-verified");
  assert.deepEqual(result.json.qaSnapshotWarnings, ["ignored unreadable QA snapshot qa-200.json"]);
  assert.match(readFileSync(reportPath, "utf8"), /newest QA snapshot qa-200\.json is unreadable or incomplete/);
});

function evidenceFixture() {
  const dir = mkdtempSync(join(tmpdir(), "ripple-review-"));
  const manifestPath = join(dir, "edit.json");
  const outputsDir = join(dir, "outputs");
  const qaDir = join(dir, ".ripple", "qa");
  mkdirSync(outputsDir, { recursive: true });
  mkdirSync(qaDir, { recursive: true });
  const render = join(outputsDir, "final.mp4");
  const snapshotPath = join(qaDir, "qa-100.json");
  const now = Date.now() / 1000;
  const snapshot = {
    file: render, manifest: manifestPath,
    timestamp: new Date(now * 1000).toISOString(),
    ok: true, status: "pass", verified: true,
    passed: 1, total: 1,
    checks: [{ id: "decode", ok: true, status: "pass", verified: true }],
  };
  writeFileSync(manifestPath, "{}");
  writeFileSync(render, "render");
  writeFileSync(snapshotPath, JSON.stringify(snapshot));
  utimesSync(manifestPath, now - 20, now - 20);
  utimesSync(render, now - 10, now - 10);
  utimesSync(snapshotPath, now, now);
  return { dir, manifestPath, render, snapshotPath, snapshot, now };
}

test("QA report discovers work/edit.json like QA and status", () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-review-manifest-"));
  mkdirSync(join(dir, "work"));
  writeFileSync(join(dir, "work", "edit.json"), "{}");
  assert.equal(reviewManifestPath(null, dir), join(dir, "work", "edit.json"));
});

test("QA report accepts a verified snapshot bound to the current manifest and render", () => {
  const f = evidenceFixture();
  assert.deepEqual(qaSnapshotEvidence(f.snapshot, {
    snapshotPath: f.snapshotPath, manifestPath: f.manifestPath, currentRender: f.render,
  }), { status: "pass", detail: null });
});

test("QA report downgrades a snapshot after the manifest changes", () => {
  const f = evidenceFixture();
  utimesSync(f.manifestPath, f.now + 10, f.now + 10);
  // Touching/copied JSON cannot hide the old recorded QA time.
  utimesSync(f.snapshotPath, f.now + 20, f.now + 20);
  const result = qaSnapshotEvidence(f.snapshot, {
    snapshotPath: f.snapshotPath, manifestPath: f.manifestPath, currentRender: f.render,
  });
  assert.equal(result.status, "not-verified");
  assert.match(result.detail, /snapshot timestamp predates the manifest|render predates the manifest/);
});

test("QA report downgrades when the render was replaced after QA", () => {
  const f = evidenceFixture();
  utimesSync(f.render, f.now + 10, f.now + 10);
  const result = qaSnapshotEvidence(f.snapshot, {
    snapshotPath: f.snapshotPath, manifestPath: f.manifestPath, currentRender: f.render,
  });
  assert.equal(result.status, "not-verified");
  assert.match(result.detail, /snapshot predates the render/);
});

test("QA report downgrades a snapshot for a different target", () => {
  const f = evidenceFixture();
  const other = join(f.dir, "outputs", "other.mp4");
  writeFileSync(other, "other render");
  const result = qaSnapshotEvidence(f.snapshot, {
    snapshotPath: f.snapshotPath, manifestPath: f.manifestPath, currentRender: other,
  });
  assert.equal(result.status, "not-verified");
  assert.match(result.detail, /is not the latest render/);
});
