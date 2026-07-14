import assert from "node:assert/strict";
import { test } from "node:test";
import { beatGrid, estimateTempo, fft, melFilterbank, onsetEnvelope, placeBeats } from "./beats.mjs";
import { segmentBoundaries } from "./cut.mjs";
import { snapTurnToSilence } from "./analyze.mjs";

const SR = 16000;

// mulberry32: deterministic tests need a PRNG without spectral structure —
// a naive LCG's correlations leak through the STFT pipeline and fake
// periodicity (found the hard way).
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("fft: a pure tone concentrates energy at its bin", () => {
  const N = 512;
  const k = 32; // bin 32 → 1000Hz at 16k
  const re = Float32Array.from({ length: N }, (_, i) => Math.sin((2 * Math.PI * k * i) / N));
  const im = new Float32Array(N);
  fft(re, im);
  const mags = Array.from({ length: N / 2 }, (_, b) => Math.hypot(re[b], im[b]));
  const peak = mags.indexOf(Math.max(...mags));
  assert.equal(peak, k);
});

test("melFilterbank: 40 filters with positive weights covering the spectrum", () => {
  const filters = melFilterbank(257, SR);
  assert.equal(filters.length, 40);
  const covered = new Set(filters.flat().map(([b]) => b));
  assert.ok(covered.size > 200);
  assert.ok(filters.every((f) => f.every(([, w]) => w > 0 && w <= 1)));
});

// 30s click track at 120 BPM: 40ms 880Hz bursts every 0.5s over quiet noise.
function clickTrack(bpm = 120, durSec = 30) {
  const samples = new Float32Array(durSec * SR);
  const rand = mulberry32(7);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = 0.005 * (rand() * 2 - 1);
  }
  const period = 60 / bpm;
  for (let t = 0.25; t < durSec; t += period) {
    const start = Math.round(t * SR);
    for (let i = 0; i < 0.04 * SR && start + i < samples.length; i++) {
      samples[start + i] += 0.6 * Math.sin((2 * Math.PI * 880 * i) / SR) * (1 - i / (0.04 * SR));
    }
  }
  return samples;
}

test("beatGrid recovers a 120 BPM click track with confident, regular beats", () => {
  const grid = beatGrid(clickTrack(120), SR);
  assert.ok(grid, "expected a grid");
  assert.ok(Math.abs(grid.bpm - 120) < 3, `bpm ${grid.bpm}`);
  assert.ok(grid.confidence >= 0.2);
  assert.ok(grid.beats.length >= 50);
  const gaps = grid.beats.slice(1).map((b, i) => b - grid.beats[i]);
  const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  assert.ok(Math.abs(meanGap - 0.5) < 0.02, `mean beat gap ${meanGap}`);
});

test("beatGrid refuses aperiodic audio and too-short audio", () => {
  const rand = mulberry32(3);
  const noise = Float32Array.from({ length: 30 * SR }, () => 0.3 * (rand() * 2 - 1));
  assert.equal(beatGrid(noise, SR), null);
  assert.equal(beatGrid(clickTrack(120, 5), SR), null); // < 10s
});

test("estimateTempo + placeBeats on a synthetic periodic envelope", () => {
  // Impulses every 50 frames (0.5s at 100Hz envelope rate) → 120 BPM.
  const env = new Float32Array(2000);
  for (let i = 10; i < env.length; i += 50) env[i] = 3;
  const tempo = estimateTempo(env);
  assert.ok(tempo);
  assert.ok(Math.abs(tempo.bpm - 120) < 3, `bpm ${tempo.bpm}`);
  const beats = placeBeats(env, tempo.tauFrames);
  assert.ok(beats.length > 30);
  const near = beats.filter((b) => Math.abs(((b * 100 - 10) % 50)) < 3 || Math.abs(((b * 100 - 10) % 50) - 50) < 3);
  assert.ok(near.length / beats.length > 0.9, "beats land on the impulses");
});

test("snapTurnToSilence pulls a fuzzy turn time into the gap, near the turn", () => {
  const silences = [{ start: 232, end: 236 }];
  assert.equal(snapTurnToSilence(232.5, silences, 785), 232.5); // already inside, off-edge
  assert.equal(snapTurnToSilence(231.9, silences, 785), 232.3); // clamped in, padded
  assert.equal(snapTurnToSilence(236.8, silences, 785), 235.7); // in from the far edge
  // A 36s silence must NOT snap to its distant midpoint.
  const long = [{ start: 678, end: 714.3 }];
  assert.equal(snapTurnToSilence(714.3, long, 785), 714);
  assert.equal(snapTurnToSilence(300, silences, 785), 300); // nothing near
  assert.equal(snapTurnToSilence(300, [], 785), 300);
});

test("segmentBoundaries: card and body starts in assembly time", () => {
  const scenes = [
    { slug: "a", start: 10, end: 14, card: "Q1", cardDuration: 2 }, // card 0-2, body 2-6
    { slug: "b", start: 20, end: 25 }, // body 6-11 (direct join at 6)
    { slug: "c", start: 30, end: 33, card: "Q3", cardDuration: 2.5, jcut: 1 }, // card 11-13.5, body 13.5-15.5
  ];
  assert.deepEqual(segmentBoundaries(scenes), [
    { t: 2, label: "a body" },
    { t: 6, label: "b body" },
    { t: 11, label: "c card" },
    { t: 13.5, label: "c body" },
  ]);
});

test("beatGrid is sample-rate aware (frame period threads through)", () => {
  // The same 120 BPM click track rendered at 32kHz must not halve the bpm.
  const SR2 = 32000;
  const samples = new Float32Array(30 * SR2);
  const rand = mulberry32(7);
  for (let i = 0; i < samples.length; i++) samples[i] = 0.005 * (rand() * 2 - 1);
  for (let t = 0.25; t < 30; t += 0.5) {
    const start = Math.round(t * SR2);
    for (let i = 0; i < 0.04 * SR2 && start + i < samples.length; i++) {
      samples[start + i] += 0.6 * Math.sin((2 * Math.PI * 880 * i) / SR2) * (1 - i / (0.04 * SR2));
    }
  }
  const grid = beatGrid(samples, SR2);
  assert.ok(grid, "expected a grid at 32kHz");
  assert.ok(Math.abs(grid.bpm - 120) < 3, `bpm ${grid.bpm}`);
  const gaps = grid.beats.slice(1).map((b, i) => b - grid.beats[i]);
  const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  assert.ok(Math.abs(meanGap - 0.5) < 0.02, `mean beat gap ${meanGap}`);
});
