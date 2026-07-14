import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { optionalChecks } from "./doctor.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "ripple-doctor-"));

// Subprocess: main() exits non-zero when required tools are missing, and the
// probes read PATH — both need a child process, not an import.
const runner = join(scratch, "runner.mjs");
writeFileSync(runner,
  `import { main } from ${JSON.stringify(pathToFileURL(join(ROOT, "cli", "doctor.mjs")).href)};\n` +
  "await main();\n");

function runDoctor(env = {}) {
  const res = spawnSync(process.execPath, [runner], {
    encoding: "utf8",
    cwd: scratch,
    env: { ...process.env, ...env },
  });
  return { status: res.status, json: JSON.parse(res.stdout) };
}

test("yt-dlp never gates readiness (optional like tdrz)", () => {
  const opt = optionalChecks({ magick: null });
  assert.ok(opt.has("yt-dlp"));
  assert.ok(opt.has("tdrz-model"));
  assert.ok(!opt.has("drawtext-filter")); // no magick: drawtext matters
  assert.ok(optionalChecks({ magick: "magick" }).has("drawtext-filter"));
});

test("doctor reports a missing yt-dlp with the install hint", () => {
  // A PATH that PROVABLY lacks yt-dlp: system dirs vary by distro (apt
  // installs it to /usr/bin on Debian), so build a dir holding only `which`.
  const bareBin = join(scratch, "bare-bin");
  mkdirSync(bareBin, { recursive: true });
  const whichPath = spawnSync("which", ["which"], { encoding: "utf8" }).stdout.trim() || "/usr/bin/which";
  symlinkSync(whichPath, join(bareBin, "which"));
  const { json } = runDoctor({ PATH: bareBin });
  const row = json.checks.find((c) => c.id === "yt-dlp");
  assert.ok(row, "yt-dlp check missing from doctor output");
  assert.equal(row.ok, false);
  assert.match(row.detail, /optional/);
  assert.match(row.hint, /brew install yt-dlp/);
});

test("doctor detects yt-dlp on PATH", () => {
  const shimDir = join(scratch, "shim");
  mkdirSync(shimDir, { recursive: true });
  writeFileSync(join(shimDir, "yt-dlp"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(shimDir, "yt-dlp"), 0o755);
  const { json } = runDoctor({ PATH: `${shimDir}:${process.env.PATH}` });
  const row = json.checks.find((c) => c.id === "yt-dlp");
  assert.equal(row.ok, true);
  assert.equal(row.detail, "yt-dlp");
});
