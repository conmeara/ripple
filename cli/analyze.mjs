import { existsSync, renameSync, rmSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { readWav } from "./pcm.mjs";
import { breathSpans, highpass, sentenceProsody } from "./prosody.mjs";
import {
  fillerSpans, nonSpeechSpans, parseMetadataTrack, sceneChangesFromMotion,
  sentenceEnds, sentenceSpans, snapWords, subtractSpans,
} from "./timing.mjs";
import {
  resolveModel, resolveTdrzModel, transcribeTurns, transcribeWords, whisperWordCapable,
} from "./transcribe.mjs";
import {
  ensureDir, extractWav16k, fail, ffprobeJson, fileStamp, output, parseArgs, parseSilence,
  readJsonOrNull, requireTool, round3, run, writeJsonAtomic,
} from "./util.mjs";

// The perception index: everything deterministic compute can extract from a
// source ONCE, so every downstream decision (candidates, timeline-sheet,
// repair loops) slices cached JSON instead of re-running ffmpeg/whisper.
// ~1 min for a 13-minute 4K source, then free (cache keys on file stamp).

export const DEFAULT_THRESHOLDS = ["-35", "-40", "-45"];
const INDEX_VERSION = 4;

// Snap a fuzzy speaker-turn time (±300ms segment granularity) into the
// nearest silence span — the cut belongs in the inter-speaker gap. Snap to
// the closest point inside the span padded off its edges: for a short gap
// that's near the midpoint; for a long silence it stays near the turn
// itself instead of drifting to the middle of 30 empty seconds.
export function snapTurnToSilence(t, silences, duration) {
  let best = null;
  for (const s of silences) {
    const end = s.end ?? duration;
    const dist = t >= s.start && t <= end ? 0 : Math.min(Math.abs(t - s.start), Math.abs(t - end));
    if (dist > 1.5) continue;
    if (!best || dist < best.dist) best = { start: s.start, end, dist };
  }
  if (!best) return t;
  const pad = Math.min(0.3, (best.end - best.start) / 2);
  const snapped = Math.min(Math.max(t, best.start + pad), best.end - pad);
  return Math.round(snapped * 1000) / 1000;
}

// The silence map downstream timing reads by default: the stored threshold
// closest to -40dB. Consumers must use this instead of hardcoding a key —
// an index built with custom --thresholds has no "-40dB" entry.
export function referenceSilences(index) {
  const keys = Object.keys(index?.silences ?? {});
  if (!keys.length) return [];
  const best = keys.reduce((a, b) =>
    Math.abs(parseFloat(b) - -40) < Math.abs(parseFloat(a) - -40) ? b : a);
  return index.silences[best] ?? [];
}

// Speech spans = the window minus silence. `silences` from parseSilence.
export function speechSpans(silences, duration) {
  const holes = silences.map((s) => ({ start: Math.max(s.start, 0), end: s.end ?? duration }));
  return subtractSpans([{ start: 0, end: duration }], holes)
    .filter((s) => s.end - s.start > 0.05)
    .map((s) => ({ start: round3(s.start), end: round3(s.end) }));
}

function detectSilences(ffmpeg, wav, thresholdKeys) {
  const out = {};
  for (const key of thresholdKeys) {
    const res = run(ffmpeg, [
      "-hide_banner", "-nostats", "-i", wav,
      "-af", `silencedetect=noise=${key}:d=0.25`, "-f", "null", "-",
    ]);
    if (res.status !== 0) fail(`silencedetect (${key}) failed: ${res.stderr.trim().slice(-500)}`, 1);
    out[key] = parseSilence(res.stderr).map((s) => ({
      start: round3(Math.max(s.start, 0)),
      end: s.end === null ? null : round3(s.end),
    }));
  }
  return out;
}

// Seek-friendly small proxy for FRAME EXTRACTION ONLY (thumbnails, strips,
// motion) — 12x realtime via videotoolbox on 4K HDR, ~0.5s GOP for fast
// accurate -ss. Never for grade/cut/qa decisions (8-bit re-encode), and -an
// so accidental audio use fails loudly. Staleness is free: the stem embeds
// fileStamp.
export function ensureProxy(file, {
  outDir = join(process.cwd(), "work", "analysis"), force = false,
} = {}) {
  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  ensureDir(outDir);
  const stem = `${basename(file, extname(file))}_${fileStamp(file)}`;
  const proxyPath = join(outDir, `${stem}.proxy.mp4`);
  if (!force && existsSync(proxyPath)) return { path: proxyPath, cached: true };

  const probe = ffprobeJson(file);
  const video = (probe.streams ?? []).find((s) => s.codec_type === "video");
  if (!video || (video.width ?? 0) <= 1280) return null; // nothing to gain

  const tmp = `${proxyPath}.tmp-${process.pid}.mp4`;
  const hwaccels = run(ffmpeg, ["-hide_banner", "-hwaccels"]).stdout;
  const encoders = run(ffmpeg, ["-hide_banner", "-encoders"]).stdout;
  const vt = process.platform === "darwin" && /videotoolbox/.test(hwaccels) && /h264_videotoolbox/.test(encoders);
  // videotoolbox propagates color tags itself (verified); libx264 needs them
  // passed explicitly — built unconditionally because the libx264 path also
  // runs as the fallback when a videotoolbox attempt fails.
  const colorArgs = [];
  for (const [flag, key] of [["-color_primaries", "color_primaries"], ["-color_trc", "color_transfer"], ["-colorspace", "color_space"]]) {
    if (video[key]) colorArgs.push(flag, video[key]);
  }
  let res = run(ffmpeg, [
    "-hide_banner", "-v", "error", "-y",
    ...(vt ? ["-hwaccel", "videotoolbox"] : []),
    "-i", file, "-map", "0:v:0", "-vf", "scale=960:-2",
    ...(vt
      ? ["-c:v", "h264_videotoolbox", "-b:v", "2000k"]
      : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", ...colorArgs]),
    "-g", "12", "-an", tmp,
  ]);
  if (res.status !== 0 && vt) {
    res = run(ffmpeg, [
      "-hide_banner", "-v", "error", "-y", "-i", file, "-map", "0:v:0",
      "-vf", "scale=960:-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      "-pix_fmt", "yuv420p", ...colorArgs, "-g", "12", "-an", tmp,
    ]);
  }
  if (res.status !== 0) {
    rmSync(tmp, { force: true });
    return null; // proxy is an optimization, never a failure
  }
  renameSync(tmp, proxyPath);
  return { path: proxyPath, cached: false };
}

// The proxy for a source, if one exists (frame extraction callers only).
export function resolveProxy(file, { outDir = join(process.cwd(), "work", "analysis") } = {}) {
  try {
    const stem = `${basename(file, extname(file))}_${fileStamp(file)}`;
    const proxyPath = join(outDir, `${stem}.proxy.mp4`);
    return existsSync(proxyPath) ? proxyPath : null;
  } catch {
    return null;
  }
}

// Options that change the index's content. A cached index is reusable only
// when every option the caller EXPLICITLY set matches what it was built
// with; unset options accept whatever is cached.
export function optionsCompatible(cached, requested) {
  const built = cached.options ?? {};
  for (const [key, value] of Object.entries(requested)) {
    if (value === undefined) continue;
    if (JSON.stringify(built[key]) !== JSON.stringify(value)) return false;
  }
  return true;
}

// Build (or load from cache) the index for one source file.
export function loadAnalysis(file, {
  outDir = join(process.cwd(), "work", "analysis"),
  model, prompt, lang, force = false, thresholds,
  rmsWindow, scenes,
} = {}) {
  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  ensureDir(outDir);
  const stem = `${basename(file, extname(file))}_${fileStamp(file)}`;
  const indexPath = join(outDir, `${stem}.analysis.json`);

  const requested = {
    thresholds: thresholds ? thresholds.map((t) => `${Number(t)}dB`) : undefined,
    model,
    prompt,
    lang,
    rmsWindow,
    scenes,
  };
  const whisperReady = Boolean(
    whisperWordCapable().ok && resolveModel(model ?? null)
  );

  const tdrzReady = Boolean(whisperWordCapable().tdrz && resolveTdrzModel());
  if (!force) {
    const cached = readJsonOrNull(indexPath);
    if (
      cached?.version === INDEX_VERSION &&
      optionsCompatible(cached, requested) &&
      // A degraded index goes stale the moment the missing capability
      // arrives — installing whisper (or the tdrz model) later must upgrade
      // the index, not be ignored.
      !(cached.words === null && cached.hasAudio !== false && whisperReady) &&
      !(cached.turns == null && cached.hasAudio !== false && tdrzReady)
    ) {
      return { index: cached, path: indexPath, cached: true };
    }
  }

  const thresholdKeys = requested.thresholds ?? DEFAULT_THRESHOLDS.map((t) => `${Number(t)}dB`);
  const effRmsWindow = rmsWindow ?? 0.5;
  const effScenes = scenes ?? true;

  const probe = ffprobeJson(file);
  const duration = round3(Number(probe.format?.duration ?? 0));
  if (!duration) fail(`Could not read duration of ${file}`, 1);
  const hasVideo = (probe.streams ?? []).some((s) => s.codec_type === "video");
  const hasAudio = (probe.streams ?? []).some((s) => s.codec_type === "audio");

  // Audio layer (soft: a video-only source still gets motion/scenes).
  const wav = join(outDir, `${stem}.16k.wav`);
  let rawWords = null;
  let wordsNote = null;
  let silences = {};
  let rms = [];
  let turns = null;
  let turnsNote = null;
  if (hasAudio) {
    // All audio passes run on the cached 16kHz mono wav (fast to decode, and
    // identical timing to the source since it was extracted from t=0).
    // --force re-extracts FIRST — every pass below, including the whisper
    // word pass, must see the healed wav, not a corrupt cached one.
    extractWav16k(file, wav, { force });

    if (whisperReady) {
      rawWords = transcribeWords(file, { outDir, model, prompt, lang, force }).words;
    } else {
      wordsNote = "whisper-cpp (with --split-on-word) or model unavailable — no word timing; run `ripple doctor`";
    }

    silences = detectSilences(ffmpeg, wav, thresholdKeys);

    const rmsRes = run(ffmpeg, [
      "-hide_banner", "-nostats", "-i", wav,
      "-af", `asetnsamples=n=${Math.round(16000 * effRmsWindow)},astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-`,
      "-f", "null", "-",
    ]);
    rms = parseMetadataTrack(rmsRes.stdout, "RMS_level").map((v) => ({ t: v.t, db: v.value }));

    // Speaker turns (optional tier: needs the tinydiarize model + a tdrz
    // whisper build). turns:[] means "ran, found none" — common on interview
    // footage with a quiet off-camera interviewer; null means "not run".
    if (tdrzReady) {
      const t = transcribeTurns(file, { outDir, lang, force });
      turns = t?.turns ?? null;
      if (t === null) turnsNote = "turns pass failed (whisper -tdrz errored) — turns unavailable this build";
    }
  } else {
    wordsNote = "source has no audio stream — no words, silence, or energy data";
  }

  // Motion curve (per-frame luma diff at low res) with scene changes derived
  // from its spikes: ONE full-video decode covers both, hardware-accelerated
  // when the platform offers it (a 13-min 4K HEVC source is minutes of CPU
  // decode otherwise).
  let sceneChanges = null;
  let motion = null;
  if (effScenes && hasVideo) {
    const motionVf = "fps=6,scale=160:-2,signalstats,metadata=print:key=lavfi.signalstats.YDIF:file=-";
    const hwaccels = run(ffmpeg, ["-hide_banner", "-hwaccels"]).stdout;
    const hw = process.platform === "darwin" && /videotoolbox/.test(hwaccels) ? ["-hwaccel", "videotoolbox"] : [];
    let motionRes = run(ffmpeg, [
      "-hide_banner", "-nostats", ...hw, "-i", file, "-vf", motionVf, "-an", "-f", "null", "-",
    ]);
    if (motionRes.status !== 0 && hw.length) {
      motionRes = run(ffmpeg, ["-hide_banner", "-nostats", "-i", file, "-vf", motionVf, "-an", "-f", "null", "-"]);
    }
    const track = parseMetadataTrack(motionRes.stdout, "YDIF");
    if (track.length) {
      motion = { fps: 6, values: track.map((v) => ({ t: v.t, ydif: v.value })) };
      sceneChanges = sceneChangesFromMotion(track);
    }
  }

  // Fuse whisper words with the silence map ONCE, here: starts snapped
  // forward out of silence, ends clamped back to silence onset. The most
  // sensitive threshold (lowest dB) is the safest snap reference — it only
  // calls truly quiet audio "silence", so soft speech never ejects a word.
  const snapKey = thresholdKeys.slice().sort((a, b) => parseFloat(a) - parseFloat(b))[0];
  const words = rawWords ? snapWords(rawWords, silences[snapKey] ?? []) : null;

  const silenceRef = referenceSilences({ silences });

  // Prosody layer: terminal pitch per sentence (falling = thought complete)
  // and breath events, both from one high-passed read of the cached wav.
  // Bounded: the whole-file Float32 + high-passed copy is ~8MB/min — past
  // 45 minutes we skip rather than risk memory pressure (analyze a trimmed
  // working copy for prosody on very long sources).
  let sentences = words ? sentenceSpans(words, silenceRef) : null;
  let breaths = null;
  let prosodyNote = null;
  if (words && existsSync(wav)) {
    if (duration <= 2700) {
      let pcm = null;
      try {
        pcm = readWav(wav);
      } catch {
        extractWav16k(file, wav, { force: true }); // heal a corrupt cached wav
        pcm = readWav(wav);
      }
      const hp = highpass(pcm.samples, pcm.sampleRate);
      sentences = sentences.map((s) => ({ ...s, ...sentenceProsody(hp, pcm.sampleRate, s) }));
      breaths = breathSpans(hp, pcm.sampleRate, words);
    } else {
      prosodyNote = "source over 45 min — terminal-pitch/breath analysis skipped (bounded); analyze a trimmed working copy if the edit needs prosody";
    }
  }
  const index = {
    version: INDEX_VERSION,
    file,
    duration,
    hasAudio,
    options: {
      thresholds: thresholdKeys,
      model: model ?? null,
      prompt: prompt ?? null,
      lang: lang ?? null,
      rmsWindow: effRmsWindow,
      scenes: effScenes,
    },
    snapKey,
    model: rawWords ? basename(resolveModel(model ?? null)) : null,
    words,
    ...(wordsNote ? { wordsNote } : {}),
    silences,
    speech: hasAudio ? speechSpans(silenceRef, duration) : [],
    sentences,
    ...(prosodyNote ? { prosodyNote } : {}),
    ...(turnsNote ? { turnsNote } : {}),
    sentenceEnds: words ? sentenceEnds(words, silenceRef) : null,
    fillers: words ? fillerSpans(words) : null,
    nonSpeech: words
      ? nonSpeechSpans(silenceRef, words, { start: 0, end: duration })
      : null,
    breaths,
    turns: turns
      ? turns.map((t) => ({ ...t, snappedT: snapTurnToSilence(t.t, silenceRef, duration) }))
      : turns,
    sceneChanges,
    motion,
    rms: { windowSec: effRmsWindow, values: rms },
  };
  writeJsonAtomic(indexPath, index);
  return { index, path: indexPath, cached: false };
}

export async function main(argv) {
  const args = parseArgs(argv, {
    out: "string", model: "string", prompt: "string", lang: "string",
    force: "boolean", thresholds: "string", "rms-window": "number",
    "no-scenes": "boolean", "no-proxy": "boolean",
  });
  const file = args._[0];
  if (!file) {
    fail("Usage: ripple analyze <file> [--out dir] [--model path] [--prompt hints] [--lang en] [--force]\n" +
      "       [--thresholds -35,-40,-45] [--rms-window 0.5] [--no-scenes]", 2);
  }
  if (!existsSync(file)) fail(`File not found: ${file}`, 2);

  const { index, path, cached } = loadAnalysis(file, {
    outDir: args.out ? args.out : undefined,
    model: args.model,
    prompt: args.prompt,
    lang: args.lang,
    force: args.force ?? false,
    thresholds: args.thresholds ? args.thresholds.split(",").map((t) => t.trim()) : undefined,
    rmsWindow: args["rms-window"],
    scenes: args["no-scenes"] ? false : undefined,
  });

  // Proxy generation lives in main (not loadAnalysis): it must never enter
  // the cache-validity logic, and a cached index run still fills in a
  // missing proxy.
  let proxy = null;
  if (!args["no-proxy"]) {
    proxy = ensureProxy(file, { outDir: args.out ? args.out : undefined, force: args.force ?? false })?.path ?? null;
  }

  // The envelope is a summary — the index itself can be thousands of words.
  // Slice it with timeline-sheet/candidates or jq; don't cat the whole file.
  output({
    ok: true,
    file,
    index: path,
    cached,
    ...(proxy ? { proxy } : {}),
    duration: index.duration,
    words: index.words ? index.words.length : null,
    ...(index.wordsNote ? { wordsNote: index.wordsNote } : {}),
    speechSpans: index.speech.length,
    sentences: index.sentences ? index.sentences.length : null,
    fillers: index.fillers ? index.fillers.length : null,
    nonSpeech: index.nonSpeech
      ? { count: index.nonSpeech.length, longest: index.nonSpeech.reduce((a, b) => (b.duration > (a?.duration ?? 0) ? b : a), null) }
      : null,
    sceneChanges: index.sceneChanges ? index.sceneChanges.length : null,
    motion: index.motion ? index.motion.values.length : null,
    terminalPitch: index.sentences
      ? index.sentences.reduce((acc, s) => {
          if (s.terminalPitch) acc[s.terminalPitch] = (acc[s.terminalPitch] ?? 0) + 1;
          return acc;
        }, {})
      : null,
    breaths: index.breaths ? index.breaths.length : null,
    turns: index.turns ? index.turns.length : index.turns,
    hints: [
      "The index is the cached perception layer — candidates and timeline-sheet read it automatically.",
      "nonSpeech spans are audible-but-wordless (laughs, claps, music stings): prime reaction cut-aways.",
      "sentences carry wps and terminalPitch — falling = thought complete (safe OUT); rising/level = more coming. Never use it as a question detector.",
      "Trust terminalPitch only when the sentence's voicedRatio ≥ 0.25.",
      "Don't cat the index; slice it (jq) or view it (ripple timeline-sheet).",
    ],
  });
}
