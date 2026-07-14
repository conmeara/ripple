import { readFileSync } from "node:fs";
import { round3 } from "./util.mjs";

// Raw-audio utilities for the DSP perception blocks (pitch, breath, beats).
// Everything operates on the 16kHz mono s16le wav that analyze already
// caches per source — one decode, many measurements.

// Minimal RIFF/WAVE parser for the wavs ffmpeg writes: walks chunks, expects
// PCM s16le. Returns { sampleRate, samples: Float32Array (-1..1) }.
export function readWav(path) {
  const buf = readFileSync(path);
  if (buf.toString("latin1", 0, 4) !== "RIFF" || buf.toString("latin1", 8, 12) !== "WAVE") {
    throw new Error(`not a RIFF/WAVE file: ${path}`);
  }
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("latin1", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      data = { start: body, size: Math.min(size, buf.length - body) };
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }
  if (!fmt || !data) throw new Error(`no fmt/data chunk in ${path}`);
  if (fmt.audioFormat !== 1 || fmt.bitsPerSample !== 16) {
    throw new Error(`expected PCM s16le, got format ${fmt.audioFormat}/${fmt.bitsPerSample}bit`);
  }
  const frames = Math.floor(data.size / 2 / fmt.channels);
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    // Fold multi-channel to mono on the fly (our wavs are already mono).
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) {
      sum += buf.readInt16LE(data.start + (i * fmt.channels + c) * 2);
    }
    samples[i] = sum / fmt.channels / 32768;
  }
  return { sampleRate: fmt.sampleRate, samples };
}

// Windowed RMS in dBFS: [{t, db}] per hop. Fine-grained (10-50ms) tracks
// power breath/emphasis analysis; the index's coarse 0.5s envelope stays
// with ffmpeg astats.
export function rmsTrack(samples, sampleRate, { windowSec = 0.05, hopSec = windowSec } = {}) {
  const win = Math.max(Math.round(windowSec * sampleRate), 1);
  const hop = Math.max(Math.round(hopSec * sampleRate), 1);
  const out = [];
  for (let start = 0; start + win <= samples.length; start += hop) {
    let sum = 0;
    for (let i = start; i < start + win; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / win);
    out.push({ t: round3(start / sampleRate), db: round3(rms > 0 ? 20 * Math.log10(rms) : -120) });
  }
  return out;
}

// Zero-crossing rate per window (crossings/sec): voiced speech is low
// (~100-1000), breaths and fricatives are high (~2000+). Cheap spectral
// proxy — no FFT.
export function zcrTrack(samples, sampleRate, { windowSec = 0.05, hopSec = windowSec } = {}) {
  const win = Math.max(Math.round(windowSec * sampleRate), 1);
  const hop = Math.max(Math.round(hopSec * sampleRate), 1);
  const out = [];
  for (let start = 0; start + win <= samples.length; start += hop) {
    let crossings = 0;
    for (let i = start + 1; i < start + win; i++) {
      if ((samples[i] >= 0) !== (samples[i - 1] >= 0)) crossings++;
    }
    out.push({ t: round3(start / sampleRate), zcr: Math.round(crossings / windowSec) });
  }
  return out;
}

// Slice a time range out of a sample buffer.
export function sliceSeconds(samples, sampleRate, start, end) {
  const a = Math.max(Math.floor(start * sampleRate), 0);
  const b = Math.min(Math.ceil(end * sampleRate), samples.length);
  return samples.subarray(a, Math.max(a, b));
}
