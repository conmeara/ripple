import assert from "node:assert/strict";
import { test } from "node:test";
import { correlateEnvelopes, energyEnvelope } from "./sync.mjs";
import { findMedia } from "./sources.mjs";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Spiky envelope shared by both "recordings".
function spikes(len, at) {
  const env = new Float32Array(len);
  for (const i of at) if (i < len) env[i] = 1;
  return env;
}

test("correlateEnvelopes recovers a known offset with documented semantics", () => {
  // Shared content: spikes at ref frames 100, 250, 400. The other recording
  // started 3s (300 frames) EARLIER, so the same spikes sit 300 frames later
  // in its file: other_time + offset = ref_time with offset = -3s → lag +300.
  const ref = spikes(2000, [100, 250, 400]);
  const other = spikes(2000, [400, 550, 700]);
  const { lag, ncc } = correlateEnvelopes(ref, other);
  assert.equal(lag, 300);
  assert.ok(ncc > 0.9, `ncc ${ncc}`);
  // offset = -lag * 0.01 = -3 → other_time 4.0 + (-3) = ref_time 1.0 ✓

  // And the mirror: other started later → shared content earlier in it.
  const { lag: lag2 } = correlateEnvelopes(ref, spikes(2000, [50, 200, 350]));
  assert.equal(lag2, -50);
});

test("correlateEnvelopes reports weak correlation for unrelated audio", () => {
  const a = spikes(1000, [100, 300, 500]);
  const b = new Float32Array(1000);
  for (let i = 0; i < b.length; i++) b[i] = Math.sin(i * 0.37) * 0.01;
  const { ncc } = correlateEnvelopes(a, b);
  assert.ok(ncc < 0.3, `ncc ${ncc}`);
});

test("correlateEnvelopes honors the max-lag bound", () => {
  const ref = spikes(2000, [100]);
  const other = spikes(2000, [900]); // true lag 800
  const { lag } = correlateEnvelopes(ref, other, { maxLagFrames: 500 });
  assert.ok(Math.abs(lag) <= 500);
});

test("energyEnvelope is mean-removed", () => {
  const samples = new Float32Array(16000);
  for (let i = 4000; i < 5000; i++) samples[i] = 0.5;
  const env = energyEnvelope(samples, 16000);
  const mean = env.reduce((a, b) => a + b, 0) / env.length;
  assert.ok(Math.abs(mean) < 1e-6);
});

test("findMedia walks the tree but skips derived dirs and dotfiles", () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-src-"));
  mkdirSync(join(dir, "footage"));
  mkdirSync(join(dir, "work"));
  mkdirSync(join(dir, "clips"));
  writeFileSync(join(dir, "a.MOV"), "x");
  writeFileSync(join(dir, "footage", "b.mp4"), "x");
  writeFileSync(join(dir, "footage", "notes.txt"), "x");
  writeFileSync(join(dir, "work", "hidden.mp4"), "x");
  writeFileSync(join(dir, "clips", "01_scene.mp4"), "x");
  writeFileSync(join(dir, ".hidden.mp4"), "x");
  const found = findMedia(dir).map((f) => f.slice(dir.length + 1));
  assert.deepEqual(found, ["a.MOV", "footage/b.mp4"]);
});
