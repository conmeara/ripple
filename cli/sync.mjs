import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fft } from "./beats.mjs";
import { readWav, rmsTrack } from "./pcm.mjs";
import { ensureDir, extractWav16k, fail, fileStamp, output, parseArgs, round3 } from "./util.mjs";

// Multicam sync: two recordings of the same event align by their audio
// energy envelopes — the editor's "sync by waveform" button. Offsets are
// reported so that other_time + offset = ref_time.

const HOP = 0.01; // 10ms envelope resolution

// Mean-removed linear-amplitude envelope of a PCM buffer.
export function energyEnvelope(samples, sampleRate) {
  const track = rmsTrack(samples, sampleRate, { windowSec: 0.05, hopSec: HOP });
  const env = new Float32Array(track.length);
  for (let i = 0; i < track.length; i++) env[i] = 10 ** (track[i].db / 20);
  const mean = env.reduce((a, b) => a + b, 0) / (env.length || 1);
  for (let i = 0; i < env.length; i++) env[i] -= mean;
  return env;
}

// Cross-correlate two envelopes via FFT; returns { lag, ncc } where a
// positive lag means `other` contains the shared content LATER than `ref`
// (other has extra head), so ref_time = other_time − lag·hop.
export function correlateEnvelopes(ref, other, { maxLagFrames } = {}) {
  const n = ref.length + other.length;
  let N = 1;
  while (N < n) N <<= 1;
  const ra = new Float32Array(N), ia = new Float32Array(N);
  const rb = new Float32Array(N), ib = new Float32Array(N);
  ra.set(ref);
  rb.set(other);
  fft(ra, ia);
  fft(rb, ib);
  // C = IFFT(FFT(ref) · conj(FFT(other))) via the conjugate trick.
  const cr = new Float32Array(N), ci = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    cr[i] = ra[i] * rb[i] + ia[i] * ib[i];
    ci[i] = ia[i] * rb[i] - ra[i] * ib[i];
  }
  // inverse: conj → fft → conj → /N (imaginary part discarded; input is real)
  for (let i = 0; i < N; i++) ci[i] = -ci[i];
  fft(cr, ci);
  const corr = (m) => cr[((m % N) + N) % N] / N;

  const maxLag = Math.min(maxLagFrames ?? N / 2 - 1, Math.max(ref.length, other.length) - 1);
  let best = { lag: 0, value: -Infinity };
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    // C[m] with m ≡ -lag: Σ ref[t]·other[t+lag]
    const v = corr(-lag);
    if (v > best.value) best = { lag, value: v };
  }
  const energyR = ref.reduce((a, b) => a + b * b, 0);
  const energyO = other.reduce((a, b) => a + b * b, 0);
  const ncc = energyR && energyO ? best.value / Math.sqrt(energyR * energyO) : 0;
  return { lag: best.lag, ncc: round3(Math.max(ncc, 0)) };
}

export async function main(argv) {
  const args = parseArgs(argv, { "max-offset": "number", out: "string" });
  const [ref, ...others] = args._;
  if (!ref || !others.length) {
    fail("Usage: ripple sync <ref> <other...> [--max-offset 600]\n" +
      "       Reports per file: offset such that other_time + offset = ref_time.", 2);
  }
  for (const f of [ref, ...others]) if (!existsSync(f)) fail(`File not found: ${f}`, 2);

  const outDir = ensureDir(args.out ?? join(process.cwd(), "work", "analysis"));
  const envelope = (file) => {
    const wav = join(outDir, `${basename(file, extname(file))}_${fileStamp(file)}.16k.wav`);
    extractWav16k(file, wav);
    const { samples, sampleRate } = readWav(wav);
    return energyEnvelope(samples, sampleRate);
  };

  const refEnv = envelope(ref);
  const maxLagFrames = Math.round((args["max-offset"] ?? 600) / HOP);
  const results = others.map((file) => {
    const { lag, ncc } = correlateEnvelopes(refEnv, envelope(file), { maxLagFrames });
    // positive lag: shared content sits LATER in `other` → subtract to reach ref.
    const offset = round3(-lag * HOP);
    return {
      file,
      offset,
      confidence: ncc,
      ...(ncc < 0.2 ? { warning: "weak correlation — these may not share audio; distrust this offset" } : {}),
      note: offset >= 0
        ? `${file} starts ${Math.abs(offset)}s AFTER ${ref} (missing head) — add ${offset}s to its times to reach the ref timeline`
        : `${file} starts ${Math.abs(offset)}s BEFORE ${ref} (extra head) — subtract ${Math.abs(offset)}s from its times to reach the ref timeline`,
    };
  });

  output({
    ok: true,
    ref,
    results,
    hints: [
      "offset semantics: other_time + offset = ref_time. Apply when mapping a moment found in one angle onto another.",
      "confidence is normalized cross-correlation (0–1); below ~0.2 the files likely don't share audio.",
    ],
  });
}
