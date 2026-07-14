import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWav, rmsTrack, sliceSeconds, zcrTrack } from "./pcm.mjs";

// Build a minimal PCM s16le mono WAV in memory.
function wavBuffer(samples, sampleRate = 16000) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(s * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "latin1");
  header.write("fmt ", 12, "latin1");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "latin1");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test("readWav round-trips samples and sample rate", () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-pcm-"));
  const path = join(dir, "t.wav");
  writeFileSync(path, wavBuffer([0, 0.5, -0.5, 1, -1]));
  const { sampleRate, samples } = readWav(path);
  assert.equal(sampleRate, 16000);
  assert.equal(samples.length, 5);
  assert.ok(Math.abs(samples[1] - 0.5) < 0.001);
  assert.ok(Math.abs(samples[4] + 1) < 0.001);
});

test("readWav rejects non-wav input", () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-pcm-"));
  const path = join(dir, "bad.wav");
  writeFileSync(path, Buffer.from("not a wav at all, sorry"));
  assert.throws(() => readWav(path), /not a RIFF/);
});

test("rmsTrack: silence is floor, full-scale is ~0 dB", () => {
  const sr = 1000;
  const samples = new Float32Array(2000);
  samples.fill(0, 0, 1000); // 1s silence
  for (let i = 1000; i < 2000; i++) samples[i] = i % 2 ? 1 : -1; // 1s full-scale square
  const track = rmsTrack(samples, sr, { windowSec: 0.5 });
  assert.equal(track.length, 4);
  assert.equal(track[0].db, -120);
  assert.ok(track[3].db > -1 && track[3].db <= 0.1);
});

test("zcrTrack separates low-frequency from noisy content", () => {
  const sr = 16000;
  const samples = new Float32Array(sr); // 1s
  // First half: 100Hz sine (voiced-like, ~200 crossings/s).
  for (let i = 0; i < sr / 2; i++) samples[i] = Math.sin((2 * Math.PI * 100 * i) / sr);
  // Second half: alternating (nyquist noise, crossings ≈ sr).
  for (let i = sr / 2; i < sr; i++) samples[i] = i % 2 ? 0.1 : -0.1;
  const track = zcrTrack(samples, sr, { windowSec: 0.25 });
  assert.ok(track[0].zcr < 400);
  assert.ok(track[3].zcr > 5000);
});

test("sliceSeconds clamps to buffer bounds", () => {
  const samples = new Float32Array(1000);
  assert.equal(sliceSeconds(samples, 100, 2, 8).length, 600);
  assert.equal(sliceSeconds(samples, 100, -5, 4).length, 400);
  assert.equal(sliceSeconds(samples, 100, 50, 60).length, 0);
});
