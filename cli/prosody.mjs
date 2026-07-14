import { rmsTrack, sliceSeconds, zcrTrack } from "./pcm.mjs";
import { round3 } from "./util.mjs";

// Prosody: the melody and breath of speech — the signals an editor HEARS
// that no transcript carries. Terminal pitch (falling = thought complete,
// level/rising = more coming) is the strongest "safe to cut here" cue after
// the words themselves. Pure node; parameters calibrated on real interview
// footage (see reference/perception.md for reliability notes).
//
// IMPORTANT: terminal pitch signals thought-completion, never question
// detection — wh-questions fall in American English.

// RBJ-cookbook biquad high-pass, fc=70Hz Q=0.7071 @ the given rate: kills
// music-bed bass and rumble that fake 60-76Hz "pitch" in low-energy frames.
export function highpass(samples, sampleRate, { fc = 70, q = Math.SQRT1_2 } = {}) {
  const w0 = (2 * Math.PI * fc) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cosw0 = Math.cos(w0);
  const a0 = 1 + alpha;
  const b0 = (1 + cosw0) / 2 / a0;
  const b1 = -(1 + cosw0) / a0;
  const b2 = (1 + cosw0) / 2 / a0;
  const a1 = (-2 * cosw0) / a0;
  const a2 = (1 - alpha) / a0;
  const out = new Float32Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return out;
}

const YIN = {
  W: 400, // 25ms integration window @16k
  tauMin: 40, // 400Hz
  tauMax: 267, // 60Hz
  threshold: 0.2, // CMNDF dip (0.1 in the paper; real footage needs 0.2)
  fallback: 0.3, // accept the global min below this when nothing dips
  hop: 160, // 10ms
};

// One YIN frame: cumulative-mean-normalized difference over `frame`
// (length ≥ W + tauMax). Returns f0 in Hz or null (unvoiced).
export function yinFrame(frame, sampleRate, p = YIN) {
  const d = new Float32Array(p.tauMax + 1);
  for (let tau = 1; tau <= p.tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < p.W; i++) {
      const diff = frame[i] - frame[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  const cmndf = new Float32Array(p.tauMax + 1);
  cmndf[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= p.tauMax; tau++) {
    running += d[tau];
    cmndf[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
  }
  // First dip below threshold (structurally avoids octave-low errors),
  // descended to its local minimum.
  let tau = -1;
  for (let t = p.tauMin; t <= p.tauMax; t++) {
    if (cmndf[t] < p.threshold) {
      tau = t;
      while (tau + 1 <= p.tauMax && cmndf[tau + 1] < cmndf[tau]) tau++;
      break;
    }
  }
  if (tau === -1) {
    let best = p.tauMin;
    for (let t = p.tauMin + 1; t <= p.tauMax; t++) if (cmndf[t] < cmndf[best]) best = t;
    if (cmndf[best] < p.fallback) tau = best;
    else return null;
  }
  // Parabolic interpolation for sub-sample lag precision.
  let refined = tau;
  if (tau > 1 && tau < p.tauMax) {
    const a = cmndf[tau - 1], b = cmndf[tau], c = cmndf[tau + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) refined = tau + (a - c) / (2 * denom);
  }
  return sampleRate / refined;
}

const st = (f0) => 12 * Math.log2(f0 / 100);
const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const percentile = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(Math.floor((p / 100) * s.length), s.length - 1)];
};

// Pitch-track a window of (already high-passed) samples. Two passes: an
// adaptive energy gate (skip frames well below the window's own speech
// level), then YIN + 5-point median smoothing + octave-outlier rejection.
// Returns [{t, f0}] with f0=null for unvoiced frames; t relative to window.
export function pitchTrack(samples, sampleRate, p = YIN) {
  const frameLen = p.W + p.tauMax;
  const frames = [];
  for (let start = 0; start + frameLen <= samples.length; start += p.hop) {
    let sum = 0;
    for (let i = start; i < start + p.W; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / p.W);
    frames.push({ start, db: rms > 0 ? 20 * Math.log10(rms) : -120 });
  }
  if (!frames.length) return [];
  const gate = Math.max(-65, percentile(frames.map((f) => f.db), 85) - 15);
  const track = frames.map((f) => ({
    t: round3(f.start / sampleRate),
    f0: f.db < gate ? null : yinFrame(samples.subarray(f.start, f.start + frameLen), sampleRate, p),
  }));
  // 5-point median smoothing over voiced frames; reject >6st local outliers
  // (residual octave errors). Smoothing reads raw values, writes smoothed.
  const raw = track.map((f) => f.f0);
  for (let i = 0; i < track.length; i++) {
    if (raw[i] === null) continue;
    const local = [];
    for (let j = Math.max(0, i - 2); j <= Math.min(track.length - 1, i + 2); j++) {
      if (raw[j] !== null) local.push(raw[j]);
    }
    const m = median(local);
    track[i].f0 = Math.abs(st(raw[i]) - st(m)) > 6 ? null : round3(m);
  }
  return track;
}

// Theil-Sen slope (median of pairwise slopes): robust to residual octave
// outliers, exactly what a 0.5s terminal window needs.
export function theilSen(points) {
  const slopes = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dt = points[j].x - points[i].x;
      if (dt > 0) slopes.push((points[j].y - points[i].y) / dt);
    }
  }
  return median(slopes);
}

// Terminal pitch of one sentence: track the last 2s, anchor a 0.5s window
// at the LAST VOICED frame (whisper word-ends sit in unvoiced consonants),
// classify falling / level / rising / unknown.
export function sentenceProsody(samples, sampleRate, sentence, p = YIN) {
  const from = Math.max(sentence.start, sentence.end - 2.0);
  const slice = sliceSeconds(samples, sampleRate, from, sentence.end);
  const track = pitchTrack(slice, sampleRate, p);
  const voiced = track.filter((f) => f.f0 !== null);
  const voicedRatio = track.length ? round3(voiced.length / track.length) : 0;
  const base = { voicedRatio, f0Mean: voiced.length ? Math.round(voiced.reduce((a, f) => a + f.f0, 0) / voiced.length) : null };
  if (voiced.length < 8) return { terminalPitch: "unknown", slopeSemitonesPerSec: null, netSemitones: null, ...base };

  const lastT = voiced[voiced.length - 1].t;
  const window = voiced.filter((f) => f.t >= lastT - 0.5);
  if (window.length < 4) return { terminalPitch: "unknown", slopeSemitonesPerSec: null, netSemitones: null, ...base };

  const points = window.map((f) => ({ x: f.t, y: st(f.f0) }));
  const slope = theilSen(points);
  const bucket = Math.max(Math.ceil(window.length * 0.2), 1);
  const net = median(points.slice(-bucket).map((pt) => pt.y)) - median(points.slice(0, bucket).map((pt) => pt.y));

  let terminalPitch = "level";
  if (slope <= -2.5 && net <= -1.0) terminalPitch = "falling";
  else if (slope >= 2.5 && net >= 1.0) terminalPitch = "rising";
  return {
    terminalPitch,
    slopeSemitonesPerSec: round3(slope),
    netSemitones: round3(net),
    ...base,
  };
}

// Breath detection: aspiration noise in word gaps — 8-30dB below local
// speech, high zero-crossing rate, above the noise floor. Precision-first:
// a false breath an agent cuts could delete a word; a missed breath costs
// nothing (the silence map already covers the gap). Recall is capture-chain
// bound: close-mic audio yields many, processed/distant-mic audio near zero.
export function breathSpans(samples, sampleRate, words, {
  windowSec = 0.025, hopSec = 0.01, minGap = 0.25,
  minDur = 0.15, maxDur = 1.2, contextSec = 8,
} = {}) {
  if (!words?.length) return [];
  // rms and zcr share framing exactly — index i is the same window in both.
  const rms = rmsTrack(samples, sampleRate, { windowSec, hopSec });
  const zcr = zcrTrack(samples, sampleRate, { windowSec, hopSec });
  const frameAt = (t) => Math.round(t / hopSec);

  // Binary search over sorted word starts: is time t inside any word?
  const sorted = [...words].sort((a, b) => a.start - b.start);
  const starts = sorted.map((w) => w.start);
  const inWord = (t) => {
    let lo = 0, hi = starts.length - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
    }
    // Check a few neighbors back — words can nest after snapping.
    for (let j = idx; j >= 0 && j > idx - 4; j--) {
      if (t >= sorted[j].start && t <= sorted[j].end) return true;
    }
    return false;
  };

  const gaps = [];
  for (let i = 0; i + 1 < words.length; i++) {
    const gapStart = words[i].end;
    const gapEnd = words[i + 1].start;
    if (gapEnd - gapStart >= minGap) gaps.push([gapStart, gapEnd]);
  }

  const out = [];
  for (const [gapStart, gapEnd] of gaps) {
    const ctxLo = Math.max(frameAt(gapStart - contextSec), 0);
    const ctxHi = Math.min(frameAt(gapEnd + contextSec), rms.length - 1);
    const speechDbs = [];
    const ctxDbs = [];
    for (let i = ctxLo; i <= ctxHi; i++) {
      ctxDbs.push(rms[i].db);
      if (inWord(rms[i].t)) speechDbs.push(rms[i].db);
    }
    if (speechDbs.length < 20) continue;
    const speechRef = median(speechDbs);
    const noiseFloor = percentile(ctxDbs, 10);

    let run = null;
    let dropout = 0;
    const flush = () => {
      if (!run) return;
      const dur = round3(run.end - run.start);
      if (dur >= minDur && dur <= maxDur) {
        out.push({
          t: round3(run.start),
          dur,
          db: round3(run.dbSum / run.n),
          belowSpeechDb: round3(speechRef - run.dbSum / run.n),
          kind: "breath",
        });
      }
      run = null;
    };
    const lo = Math.max(frameAt(gapStart), 0);
    const hi = Math.min(frameAt(gapEnd), rms.length - 1);
    for (let i = lo; i <= hi; i++) {
      const f = rms[i];
      const isBreath =
        f.db >= speechRef - 30 && f.db <= speechRef - 8 &&
        f.db >= noiseFloor + 6 && (zcr[i]?.zcr ?? 0) >= 1200;
      if (isBreath) {
        if (!run) run = { start: f.t, end: f.t + windowSec, dbSum: 0, n: 0 };
        run.end = f.t + windowSec;
        run.dbSum += f.db;
        run.n++;
        dropout = 0;
      } else if (run && dropout < 3) {
        dropout++;
      } else {
        flush();
        dropout = 0;
      }
    }
    flush();
  }
  return out;
}
