import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { readWav } from "./pcm.mjs";
import {
  ensureDir, extractWav16k, fail, fileStamp, output, parseArgs, readJsonOrNull, requireTool,
  round3, run, writeJsonAtomic,
} from "./util.mjs";

// Beat grid for music beds — the timing lattice montage cuts snap to.
// Ellis (2007) dynamic-programming beat tracker, pure node: log-mel spectral
// flux onset envelope → autocorrelation tempo with a log-Gaussian prior →
// DP beat placement. A confidence gate (periodicity of the onset envelope)
// cleanly separates music from speech, so interviews auto-report "no grid".

// In-place radix-2 FFT (real input packed as interleaved re/im).
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k], uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe; im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe; im[i + k + len / 2] = uIm - vIm;
        const nRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nRe;
      }
    }
  }
}

// 40 triangular HTK-mel filters over N/2+1 bins (0..sr/2).
export function melFilterbank(nBins, sampleRate, nMels = 40) {
  const hzToMel = (hz) => 2595 * Math.log10(1 + hz / 700);
  const melToHz = (mel) => 700 * (10 ** (mel / 2595) - 1);
  const maxMel = hzToMel(sampleRate / 2);
  const centers = [];
  for (let m = 0; m < nMels + 2; m++) centers.push(melToHz((m / (nMels + 1)) * maxMel));
  const binHz = sampleRate / 2 / (nBins - 1);
  const filters = [];
  for (let m = 1; m <= nMels; m++) {
    const [lo, mid, hi] = [centers[m - 1], centers[m], centers[m + 1]];
    const weights = [];
    for (let b = 0; b < nBins; b++) {
      const hz = b * binHz;
      let w = 0;
      if (hz > lo && hz < hi) w = hz <= mid ? (hz - lo) / (mid - lo) : (hi - hz) / (hi - mid);
      if (w > 0) weights.push([b, w]);
    }
    filters.push(weights);
  }
  return filters;
}

// Onset strength envelope at 100Hz: Hann/512 FFT, hop 160, 40 log-mel bands,
// half-wave-rectified per-band flux, 1s moving-average high-pass, 20ms
// Gaussian smoothing, unit variance.
export function onsetEnvelope(samples, sampleRate) {
  const N = 512, hop = 160, nBins = N / 2 + 1;
  const hann = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const filters = melFilterbank(nBins, sampleRate);
  const frames = Math.floor((samples.length - N) / hop);
  if (frames < 3) return [];
  let prev = null;
  const flux = new Float32Array(frames);
  let fileMaxDb = -Infinity;
  const melDbFrames = [];
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < N; i++) {
      re[i] = samples[f * hop + i] * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    const melDb = new Float32Array(filters.length);
    for (let m = 0; m < filters.length; m++) {
      let sum = 0;
      for (const [b, w] of filters[m]) sum += w * Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      melDb[m] = 20 * Math.log10(Math.max(sum, 1e-10));
      if (melDb[m] > fileMaxDb) fileMaxDb = melDb[m];
    }
    melDbFrames.push(melDb);
  }
  for (let f = 0; f < frames; f++) {
    const melDb = melDbFrames[f];
    for (let m = 0; m < melDb.length; m++) melDb[m] = Math.max(melDb[m], fileMaxDb - 80);
    if (prev) {
      let sum = 0;
      for (let m = 0; m < melDb.length; m++) sum += Math.max(0, melDb[m] - prev[m]);
      flux[f] = sum;
    }
    prev = melDb;
  }
  // ~0.4Hz high-pass: subtract a 101-frame moving average.
  const half = 50;
  const highpassed = new Float32Array(frames);
  let winSum = 0;
  for (let i = 0; i < Math.min(frames, half + 1); i++) winSum += flux[i];
  let winN = Math.min(frames, half + 1);
  for (let f = 0; f < frames; f++) {
    highpassed[f] = flux[f] - winSum / winN;
    const add = f + half + 1;
    const drop = f - half;
    if (add < frames) { winSum += flux[add]; winN++; }
    if (drop >= 0) { winSum -= flux[drop]; winN--; }
  }
  // Gaussian smooth sigma=2 frames, kernel length 9; then unit variance.
  const kernel = Float32Array.from({ length: 9 }, (_, i) => Math.exp(-0.5 * ((i - 4) / 2) ** 2));
  const kSum = kernel.reduce((a, b) => a + b, 0);
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let k = 0; k < 9; k++) {
      const idx = f + k - 4;
      if (idx >= 0 && idx < frames) sum += highpassed[idx] * kernel[k];
    }
    env[f] = sum / kSum;
  }
  const mean = env.reduce((a, b) => a + b, 0) / frames;
  const sd = Math.sqrt(env.reduce((a, b) => a + (b - mean) ** 2, 0) / frames) || 1;
  for (let f = 0; f < frames; f++) env[f] /= sd;
  return env;
}

// Tempo from the envelope's autocorrelation with a log-Gaussian prior around
// 120 BPM, harmonically reinforced. framePeriod = hop/sampleRate seconds.
// Returns { bpm, tauFrames, rn } or null.
export function estimateTempo(env, framePeriod = 0.01) {
  const maxTau = Math.min(400, env.length - 1);
  if (maxTau < 40) return null;
  const r = new Float32Array(maxTau + 1);
  for (let tau = 0; tau <= maxTau; tau++) {
    let sum = 0;
    for (let t = 0; t + tau < env.length; t++) sum += env[t] * env[t + tau];
    r[tau] = sum / (env.length - tau);
  }
  if (r[0] <= 0) return null;
  const rn = Array.from(r, (v) => v / r[0]);
  const weight = (tau) => Math.exp(-0.5 * ((Math.log2((tau * framePeriod) / 0.5)) / 0.9) ** 2);
  const tps = (tau) => (tau <= maxTau ? weight(tau) * rn[tau] : 0);
  const loTau = Math.max(2, Math.round(0.333 / framePeriod)); // 180 BPM
  const hiTau = Math.min(Math.round(1.0 / framePeriod), maxTau); // 60 BPM
  const score = (tau) => {
    const tps2 = tps(tau) + 0.5 * tps(2 * tau) + 0.25 * tps(2 * tau - 1) + 0.25 * tps(2 * tau + 1);
    const tps3 = tps(tau) + (tps(3 * tau) + tps(3 * tau - 1) + tps(3 * tau + 1)) / 3;
    return Math.max(tps2, tps3);
  };
  let best = null;
  for (let tau = loTau; tau <= hiTau; tau++) {
    const s = score(tau);
    if (!best || s > best.score) best = { tau, score: s };
  }
  if (!best) return null;
  // Parabolic refinement on the SAME reinforced score used for peak-picking,
  // only when the peak is a genuine local maximum, offset clamped to ±0.5 —
  // an unguarded parabola on the wrong curve can return a negative bpm.
  let refined = best.tau;
  if (best.tau > loTau && best.tau < hiTau) {
    const a = score(best.tau - 1), b = score(best.tau), c = score(best.tau + 1);
    const denom = a - 2 * b + c;
    if (denom < 0 && b >= a && b >= c) {
      refined = best.tau + Math.min(Math.max((a - c) / (2 * denom), -0.5), 0.5);
    }
  }
  return { bpm: round3(60 / (refined * framePeriod)), tauFrames: best.tau, tauRefined: refined, rn };
}

// Ellis DP beat placement (alpha=680) + trailing/leading weak-beat trim.
// Beat times are frames × framePeriod seconds.
export function placeBeats(env, tauFrames, { alpha = 680, framePeriod = 0.01 } = {}) {
  const n = env.length;
  const P = tauFrames;
  const lo = Math.round(-2 * P), hi = Math.round(-P / 2);
  const cumscore = new Float32Array(n);
  const backlink = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let best = 0, bestJ = -1;
    for (let l = lo; l <= hi; l++) {
      const j = i + l;
      if (j < 0) continue;
      const tx = -alpha * Math.log(-l / P) ** 2;
      const s = cumscore[j] + tx;
      if (s > best) { best = s; bestJ = j; }
    }
    cumscore[i] = env[i] + best;
    backlink[i] = bestJ;
  }
  let peak = 0;
  for (let i = 1; i < n; i++) if (cumscore[i] > cumscore[peak]) peak = i;
  const beats = [];
  for (let i = peak; i !== -1; i = backlink[i]) beats.push(i);
  beats.reverse();
  if (!beats.length) return [];
  const meanAtBeats = beats.reduce((a, b) => a + env[b], 0) / beats.length;
  const strong = (i) => env[i] >= 0.25 * meanAtBeats;
  let a = 0, b = beats.length - 1;
  while (a < b && !strong(beats[a])) a++;
  while (b > a && !strong(beats[b])) b--;
  return beats.slice(a, b + 1).map((i) => round3(i * framePeriod));
}

// Confidence that the envelope is genuinely periodic (music) rather than
// speech: ACF peak height + harmonic support + how much the beats stand out.
export function beatConfidence(env, tempo, beats, framePeriod = 0.01) {
  if (!tempo || !beats.length) return 0;
  const { rn, tauFrames } = tempo;
  const acfPeak = rn[tauFrames] ?? 0;
  const harmonic = Math.max(rn[2 * tauFrames] ?? 0, rn[Math.round(tauFrames / 2)] ?? 0);
  const meanAbs = env.reduce((a, b) => a + Math.abs(b), 0) / env.length || 1;
  const meanAtBeats = beats.reduce((a, t) => a + (env[Math.round(t / framePeriod)] ?? 0), 0) / beats.length;
  const beatRatio = Math.min(Math.max((meanAtBeats / meanAbs - 1) / 3, 0), 1);
  const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
  return round3(
    0.55 * clamp01(acfPeak / 0.5) + 0.25 * clamp01(harmonic / 0.4) + 0.2 * beatRatio
  );
}

// Cut-on-the-beat tolerance shared by cut's offGrid counter and the docs.
export const ON_BEAT_TOLERANCE = 0.07;

// Full pipeline over a PCM buffer. Returns {bpm, confidence, beats} or null
// when the audio isn't confidently periodic. The envelope's frame period is
// hop/sampleRate — every time conversion threads through it.
export function beatGrid(samples, sampleRate, { minConfidence = 0.2, minDuration = 10 } = {}) {
  if (samples.length / sampleRate < minDuration) return null;
  const framePeriod = 160 / sampleRate;
  const env = onsetEnvelope(samples, sampleRate);
  if (!env.length) return null;
  const tempo = estimateTempo(env, framePeriod);
  if (!tempo) return null;
  const beats = placeBeats(env, tempo.tauFrames, { framePeriod });
  const confidence = beatConfidence(env, tempo, beats, framePeriod);
  if (confidence < minConfidence) return null;
  return { bpm: tempo.bpm, confidence, beats };
}

// Cached grid loader (also used by cut's on-beat report for manifest.music).
// Returns { record: {bpm, confidence, beats}, path, cached }.
export function loadBeatGrid(file, { outDir = join(process.cwd(), "work", "analysis"), force = false } = {}) {
  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  ensureDir(outDir);
  const stem = `${basename(file, extname(file))}_${fileStamp(file)}`;
  const beatsPath = join(outDir, `${stem}.beats.json`);
  if (!force) {
    const cached = readJsonOrNull(beatsPath);
    if (cached) return { record: cached, path: beatsPath, cached: true };
  }
  const wav = join(outDir, `${stem}.16k.wav`);
  extractWav16k(file, wav, { force });
  let pcm;
  try {
    pcm = readWav(wav);
  } catch {
    // Corrupt cached wav (interrupted older run): heal, don't crash.
    extractWav16k(file, wav, { force: true });
    pcm = readWav(wav);
  }
  const { samples, sampleRate } = pcm;
  const grid = beatGrid(samples, sampleRate);
  const record = { file, ...(grid ?? { bpm: null, confidence: 0, beats: [] }) };
  writeJsonAtomic(beatsPath, record);
  return { record, path: beatsPath, cached: false };
}

export async function main(argv) {
  const args = parseArgs(argv, { out: "string", force: "boolean" });
  const file = args._[0];
  if (!file) fail("Usage: ripple beats <audio> [--out dir] [--force]", 2);
  if (!existsSync(file)) fail(`File not found: ${file}`, 2);

  const { record, path, cached } = loadBeatGrid(file, {
    outDir: args.out ? args.out : undefined,
    force: args.force ?? false,
  });
  const grid = record.bpm !== null ? record : null;
  output({
    ok: true,
    file,
    cached,
    ...summarize(record),
    grid: path,
    hints: grid
      ? [
          "Cut on the grid: land scene changes within ~70ms of a beat; card durations in whole beats.",
          "The beats array is in the music file's own time — offset by where the bed starts in the assembly (0 for manifest.music).",
        ]
      : ["No confident beat grid — this audio isn't periodic enough (speech, ambient). That's a finding, not a failure."],
  });
}

function summarize(record) {
  return {
    bpm: record.bpm,
    confidence: record.confidence,
    beats: record.beats.length,
    first: record.beats.slice(0, 8),
  };
}
