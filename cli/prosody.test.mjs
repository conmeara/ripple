import assert from "node:assert/strict";
import { test } from "node:test";
import { breathSpans, highpass, pitchTrack, sentenceProsody, theilSen, yinFrame } from "./prosody.mjs";

const SR = 16000;

// Phase-continuous tone generator: freqAt(t) in Hz, amp 0..1.
function tone(durSec, freqAt, amp = 0.3) {
  const n = Math.round(durSec * SR);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    phase += (2 * Math.PI * freqAt(i / SR)) / SR;
    out[i] = amp * Math.sin(phase);
  }
  return out;
}

function noise(durSec, amp) {
  const n = Math.round(durSec * SR);
  const out = new Float32Array(n);
  let a = 42;
  for (let i = 0; i < n; i++) {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    out[i] = amp * ((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1);
  }
  return out;
}

function concat(...parts) {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

test("highpass removes DC offset", () => {
  const dc = new Float32Array(SR).fill(0.5);
  const out = highpass(dc, SR);
  // After the transient settles, output is ~0.
  const tail = out.subarray(SR / 2);
  const maxAbs = tail.reduce((a, v) => Math.max(a, Math.abs(v)), 0);
  assert.ok(maxAbs < 0.01, `expected ~0, got ${maxAbs}`);
});

test("yinFrame recovers a 120Hz sine, rejects silence and noise", () => {
  const sine = tone(0.1, () => 120);
  const f0 = yinFrame(sine.subarray(0, 667), SR);
  assert.ok(Math.abs(f0 - 120) < 2, `expected ~120, got ${f0}`);
  assert.equal(yinFrame(new Float32Array(667), SR), null);
  const f0n = yinFrame(noise(0.05, 0.3).subarray(0, 667), SR);
  assert.equal(f0n, null);
});

test("pitchTrack: voiced sine tracks its frequency", () => {
  const track = pitchTrack(tone(1.0, () => 150), SR);
  const voiced = track.filter((f) => f.f0 !== null);
  assert.ok(voiced.length > track.length * 0.7);
  const mean = voiced.reduce((a, f) => a + f.f0, 0) / voiced.length;
  assert.ok(Math.abs(mean - 150) < 3, `expected ~150, got ${mean}`);
});

test("theilSen is the median of pairwise slopes", () => {
  const pts = [0, 1, 2, 3].map((x) => ({ x, y: 2 * x + 1 }));
  assert.equal(theilSen(pts), 2);
  // One wild outlier doesn't move it.
  const noisy = [...pts, { x: 4, y: 100 }];
  assert.ok(Math.abs(theilSen(noisy) - 2) < 1.5);
});

test("sentenceProsody classifies falling / level / rising / unknown", () => {
  // 1.5s at 200Hz then a 0.5s glide to 120Hz: a clear terminal fall.
  const fall = tone(2, (t) => (t < 1.5 ? 200 : 200 - ((t - 1.5) / 0.5) * 80));
  const pFall = sentenceProsody(fall, SR, { start: 0, end: 2 });
  assert.equal(pFall.terminalPitch, "falling");
  assert.ok(pFall.slopeSemitonesPerSec < -2.5);

  const level = tone(2, () => 150);
  assert.equal(sentenceProsody(level, SR, { start: 0, end: 2 }).terminalPitch, "level");

  const rise = tone(2, (t) => (t < 1.5 ? 140 : 140 + ((t - 1.5) / 0.5) * 80));
  assert.equal(sentenceProsody(rise, SR, { start: 0, end: 2 }).terminalPitch, "rising");

  const unvoiced = noise(2, 0.3);
  const pU = sentenceProsody(unvoiced, SR, { start: 0, end: 2 });
  assert.equal(pU.terminalPitch, "unknown");
  assert.ok(pU.voicedRatio < 0.25);
});

test("breathSpans finds a noisy low-level burst in a word gap, precision-first", () => {
  // words 0-2 and 4-6 (150Hz voice), gap 2-4 with a breath at 2.5-2.9.
  const speech1 = tone(2, () => 150, 0.3);
  const preGap = noise(0.5, 0.0005);
  const breath = noise(0.4, 0.02);
  const postGap = noise(1.1, 0.0005);
  const speech2 = tone(2, () => 150, 0.3);
  const samples = concat(speech1, preGap, breath, postGap, speech2);
  const words = [
    { start: 0, end: 2, text: "hello" },
    { start: 4, end: 6, text: "world" },
  ];
  const spans = breathSpans(samples, SR, words);
  assert.equal(spans.length, 1);
  assert.ok(Math.abs(spans[0].t - 2.5) < 0.1, `breath at ${spans[0].t}`);
  assert.ok(spans[0].dur >= 0.3 && spans[0].dur <= 0.55);
  assert.ok(spans[0].belowSpeechDb > 8 && spans[0].belowSpeechDb < 30);

  // A silent gap yields nothing (no false breaths from room tone).
  const silentGap = concat(speech1, noise(2, 0.0005), speech2);
  assert.deepEqual(breathSpans(silentGap, SR, words), []);
});
