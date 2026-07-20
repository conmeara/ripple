import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadAnalysis, referenceSilences, resolveProxy } from "./analyze.mjs";
import { endpointFlags } from "./cut-safety.mjs";
import { cropFilter } from "./frame-sheet.mjs";
import { clampWordEnds, cutTiming } from "./timing.mjs";
import { renderSheet } from "./timeline-sheet.mjs";
import { resolveModel, transcribeFile, transcribeWords } from "./transcribe.mjs";
import {
  ensureDir, fail, findTool, output, parseArgs, parseSilence, requireTool, round3, run, silenceEdges,
} from "./util.mjs";

// candidates and lint judge a range with the SAME cut-safety implementation.
// Re-exported here because this is where editing sessions historically
// imported it from.
export { endpointFlags };

// Conservative guard defaults prevent blind silence-cutting failures. These
// flags are candidates-local: they inform the lock decision but lint doesn't
// gate on them (a micro-clip may be an intentional beat).
const MIN_CUT = 0.25; // shortest silence a cut may land in
const MIN_CLIP = 1.0; // shortest kept range that still reads as a shot
const LEAD_MARGIN = 0.3; // air BEFORE the first word (less than the tail)

// Mechanical OUT suggestion: last word's acoustic end plus a breath of tail,
// capped so it can never reach the next speech. When no clean gap exists
// between the last word and the next sound, there is no suggestion — that
// cut needs a human-grade judgment call, not a nudge.
export function suggestOut(timing, { tailPreference = 0.6 } = {}) {
  if (!timing || timing.lastWordEnd === null) return null;
  let out = timing.lastWordEnd + tailPreference;
  const ceiling = Math.min(
    timing.nextWordStart ?? Infinity,
    timing.nextAudioStart ?? Infinity
  );
  if (out > ceiling - 0.15) out = ceiling - 0.15;
  return out > timing.lastWordEnd ? round3(out) : null;
}

// The IN mirror of suggestOut, deliberately asymmetric (auto-editor's
// `--margin lead,trail`: LESS air before a phrase than after). Place the IN a
// short lead margin before the first word, floored so it can never cross back
// into prior speech or audio; null when there is no clean air to give (the
// previous sound butts up against the phrase — that IN needs a judgment call,
// not a nudge). suggestOut's 0.6s tail stays the OUT default: more air after.
export function suggestIn(timing, { leadPreference = LEAD_MARGIN } = {}) {
  if (!timing || timing.firstWordStart === null) return null;
  const floor = Math.max(
    timing.prevWordEnd ?? -Infinity,
    timing.prevAudioEnd ?? -Infinity,
    0
  );
  let inn = timing.firstWordStart - leadPreference;
  if (inn < floor + 0.15) inn = floor + 0.15;
  return inn < timing.firstWordStart - 0.001 ? round3(inn) : null;
}

// mincut guard — (instrument: the duration of the silence a cut point lands
// in; opinion (auto-editor `--smooth MINCUT`, margin-as-hysteresis): a silence
// shorter than minCut sitting between speech is a micro-pause INSIDE speech,
// not a cut opportunity — a cut placed there stutters). Boundary cuts (a cut
// exactly on a silence edge) are the clean ones, so only a cut strictly
// INSIDE a too-short span flags.
export function stutterCutFlags(cuts, silences, { minCut = MIN_CUT } = {}) {
  const flags = [];
  for (const { at, label } of cuts) {
    const span = silences.find((s) => at > s.start + 0.001 && at < (s.end ?? Infinity) - 0.001);
    if (!span) continue;
    const dur = round3((span.end ?? Infinity) - span.start);
    if (dur < minCut) {
      flags.push({
        flag: "STUTTER_CUT",
        detail: `the ${label} at ${round3(at)}s falls inside a ${dur}s silence (min-cut ${minCut}s) — too short to be a real pause; a cut here stutters. Nudge it to a longer gap.`,
      });
    }
  }
  return flags;
}

// minclip guard — (instrument: the kept range's duration; opinion (auto-editor
// `--smooth MINCLIP`): a kept clip shorter than minClip flashes rather than
// reads — extend the range or absorb it into a neighbor).
export function microClipFlag(duration, { minClip = MIN_CLIP } = {}) {
  if (duration >= minClip) return null;
  return {
    flag: "MICRO_CLIP",
    detail: `the kept range is ${round3(duration)}s (min-clip ${minClip}s) — too short to read as a shot; widen the range or merge it into a neighbor.`,
  };
}

// The index's word timing vs an isolated re-transcription of the same range.
// Whisper drifts on long sources (utterance-final timestamps land seconds
// late) but is accurate on a short extracted window — so the isolated pass
// is ground truth, and a disagreement past `threshold` means every index
// number near this OUT is suspect. `isolatedWords` are range-local
// (t=0 at `start`), already silence-clamped by the caller. The threshold
// sits between benign inter-run whisper jitter (~0.8s observed on a clean
// 24s clip, EOF-adjacent) and the smallest real drift failure (1.9s): the
// flag blocks locking, so it must not cry wolf — the raw delta is always
// reported for the editor to weigh.
export function driftCheckFrom(timing, isolatedWords, { start, threshold = 1.25 }) {
  if (!timing || timing.lastWordEnd === null) return null;
  const words = (isolatedWords ?? []).filter((w) => w.end > w.start);
  if (!words.length) return null;
  const isolatedLastWordEnd = round3(start + Math.max(...words.map((w) => w.end)));
  const deltaSeconds = round3(timing.lastWordEnd - isolatedLastWordEnd);
  return {
    indexLastWordEnd: timing.lastWordEnd,
    isolatedLastWordEnd,
    deltaSeconds,
    verdict: Math.abs(deltaSeconds) > threshold ? "drifted" : "aligned",
  };
}

// Prosody + breath enrichment at the OUT: the melody of the last sentence
// says whether the thought is complete; a sharp inhale right after the last
// word says the speaker is about to continue. Mutates `timing` in place.
function enrichTiming(timing, index) {
  if (!timing || timing.lastWordEnd === null) return;
  // Nearest sentence end within tolerance — first-match can bind the wrong
  // sentence when two end close together.
  const ending = (index.sentences ?? []).reduce((best, s) => {
    const d = Math.abs(s.end - timing.lastWordEnd);
    if (d > 0.3) return best;
    return !best || d < Math.abs(best.end - timing.lastWordEnd) ? s : best;
  }, null);
  if (ending?.terminalPitch) {
    timing.terminalPitch = ending.terminalPitch;
    timing.terminalPitchDetail = {
      slopeSemitonesPerSec: ending.slopeSemitonesPerSec,
      voicedRatio: ending.voicedRatio,
      reliable: ending.voicedRatio >= 0.25,
    };
  }
  const inhale = (index.breaths ?? []).find(
    (b) => b.t >= timing.lastWordEnd - 0.05 && b.t <= timing.lastWordEnd + 1.0
  );
  if (inhale) timing.breathAfterLastWord = { t: inhale.t, dur: inhale.dur };
}

// One cut range, the full three-signal verification (minus the human-facing
// strips/sheets, which the single-range CLI adds on top). Returns everything
// both callers share: timing, red flags (endpoint checks + auto-editor guards +
// drift), fresh per-range silence, and the mechanical IN/OUT suggestions.
// `wantTranscript` gates the range-text pass (single mode reads it; the
// manifest batch only needs driftCheck). Transcription is serial by
// construction — one range at a time — because whisper-cpp Metal throws
// buffer errors under parallel load.
async function verifyRange({
  src, index, fileEnd, start, end, label, prompt, thresholds,
  project, guards, ffmpeg, outDir, noTranscribe = false, wantTranscript = true,
}) {
  const duration = round3(end - start);

  // Signal 1: word-level timing from the whole-file index, then prosody.
  const silenceRef = referenceSilences(index).map((s) => ({ ...s, end: s.end ?? fileEnd }));
  const timing = index.words
    ? cutTiming(index.words, silenceRef, { start, end })
    : null;
  enrichTiming(timing, index);

  // Signal 2: silence at each threshold, across the exact candidate range.
  const silence = {};
  const spansByDb = {};
  for (const db of thresholds) {
    const res = run(ffmpeg, [
      "-hide_banner", "-nostats",
      "-ss", String(start), "-t", String(duration), "-i", src,
      "-vn", "-map", "0:a:0", "-af", `silencedetect=noise=${db}dB:d=0.25`,
      "-f", "null", "-",
    ]);
    if (res.status !== 0) fail(`silencedetect (${db}dB) failed: ${res.stderr.trim().slice(-500)}`, 1);
    const spans = parseSilence(res.stderr);
    spansByDb[db] = spans;
    silence[`${db}dB`] = { ...silenceEdges(spans, duration), spans: spans.length };
  }
  // Range-local reference spans (closest to -40dB): the clamp map for the
  // isolated word pass below, mirroring the index's own fusion.
  const refDb = thresholds.reduce((a, b) =>
    Math.abs(parseFloat(b) - -40) < Math.abs(parseFloat(a) - -40) ? b : a);
  const refSpans = (spansByDb[refDb] ?? []).map((s) => ({ ...s, end: s.end ?? duration }));

  const flags = endpointFlags(timing, silence, {
    maxTail: project.maxTail,
    maxLead: project.maxLead,
    end,
  });
  // auto-editor guards, alongside the endpoint flags. Cut points are the
  // range edges; the whole-file silenceRef gives their absolute-time context.
  flags.push(...stutterCutFlags(
    [{ at: start, label: "IN" }, { at: end, label: "OUT" }],
    silenceRef, { minCut: guards.minCut }
  ));
  const micro = microClipFlag(duration, { minClip: guards.minClip });
  if (micro) flags.push(micro);

  // Transcript of the range (the "final phrase present?" check) AND the drift
  // arbiter: whisper drifts on long sources but is accurate on a short
  // extracted window, so the isolated word pass is ground truth for this
  // range. Runs before the suggestions — a drifted index vetoes the OUT.
  let transcript = null;
  let driftCheck = null;
  if (!noTranscribe) {
    const whisperAvailable = findTool(["whisper-cli", "whisper-cpp", "main"]) && resolveModel(null);
    if (whisperAvailable) {
      const wavPath = join(outDir, `${label}.wav`);
      const extract = run(ffmpeg, [
        "-hide_banner", "-v", "error", "-y",
        "-ss", String(start), "-t", String(duration), "-i", src,
        "-vn", "-map", "0:a:0", "-ac", "1", "-ar", "16000", wavPath,
      ]);
      if (extract.status === 0) {
        if (wantTranscript) {
          const t = transcribeFile(wavPath, { outDir, prompt });
          transcript = {
            files: t.files,
            text: existsSync(t.files.txt) ? readFileSync(t.files.txt, "utf8").trim() : null,
          };
        }
        if (timing?.lastWordEnd !== null && timing) {
          try {
            const iso = transcribeWords(wavPath, { outDir, prompt });
            driftCheck = driftCheckFrom(timing, clampWordEnds(iso.words, refSpans), { start });
            if (driftCheck) driftCheck.isolatedWordsJson = iso.files.wordsJson;
          } catch (e) {
            driftCheck = { skipped: `isolated word pass failed: ${e.message}` };
          }
          if (driftCheck?.verdict === "drifted") {
            flags.push({
              flag: "INDEX_DRIFT",
              detail: `the index says the last word ends at ${driftCheck.indexLastWordEnd}s but an isolated re-transcription of this exact range ends it at ${driftCheck.isolatedLastWordEnd}s (Δ ${driftCheck.deltaSeconds}s). Two measurements disagree — do not lock an OUT from either number alone. The chunked index is usually right and the isolated pass smears when the range ends in near-silence, so: re-run candidates with --end just past the EARLIER of the two endings (a window with no long silent tail), compare (words: ${driftCheck.isolatedWordsJson ?? "see transcript"}), and confirm on frames extending well PAST the chosen OUT.`,
            });
          }
        }
      }
    } else if (wantTranscript) {
      transcript = { skipped: "whisper-cpp or model unavailable — run `ripple doctor` for setup" };
    }
  }

  // A nudge only helps when the range ends where it means to. Ending
  // mid-speech means the OUT is scoped to the wrong sentence — re-scope
  // (the index's `sentences` array is the lattice), don't nudge. A drifted
  // index means lastWordEnd itself is fiction — no suggestion can stand on it.
  const brokenScope = flags.some((f) =>
    ["SPEECH_AT_OUT", "MID_WORD_OUT", "NEXT_SPEECH_INSIDE", "INDEX_DRIFT"].includes(f.flag));
  const suggestedOut = brokenScope
    ? null
    : suggestOut(timing, { tailPreference: project.tailPreference });
  // The IN mirror: skip only when the range OPENS wrong (mid-word IN); a bad
  // OUT doesn't invalidate the IN suggestion.
  const inBroken = flags.some((f) => f.flag === "MID_WORD_IN");
  const suggestedIn = inBroken ? null : suggestIn(timing, { leadPreference: guards.lead });

  return {
    duration, timing, flags, silence, refSpans,
    transcript, driftCheck, suggestedOut, suggestedIn,
  };
}

// --manifest batch: run the full per-range verification across every
// source-backed scene of an edit.json — including the isolated
// re-transcription driftCheck that lint deliberately skips (fast and
// side-effect-free by contract). Cards and generated/silent scenes are
// skipped. Informs, never gates: exits 0 even with flags (lint is the gate).
async function verifyManifest(manifestPath, { prompt, thresholds, guards, noTranscribe, ffmpeg, outDir }) {
  if (!existsSync(manifestPath)) fail(`Manifest not found: ${manifestPath}. Run /ripple plan first.`, 2);
  const baseDir = dirname(resolve(manifestPath));
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    fail(`Manifest unreadable: ${e.message}`, 2);
  }
  const project = { maxTail: 1.0, maxLead: 0.5, tailPreference: 0.6 };

  const results = [];
  const skipped = [];
  for (const s of manifest.scenes ?? []) {
    const src = s.source ? resolve(baseDir, s.source) : null;
    if (!src || !existsSync(src)) {
      skipped.push({ slug: s.slug, reason: `no source on disk (card/generated): ${s.source ?? "(none)"}` });
      continue;
    }
    if (typeof s.start !== "number" || typeof s.end !== "number" || s.end <= s.start) {
      skipped.push({ slug: s.slug, reason: "no valid start/end bounds (cut owns bounds errors)" });
      continue;
    }
    const { index } = loadAnalysis(src, { prompt });
    if (index.hasAudio === false) {
      skipped.push({ slug: s.slug, reason: "source has no audio (silent b-roll) — no endpoints to verify" });
      continue;
    }
    const fileEnd = index.duration;
    if (s.start >= fileEnd || s.end > fileEnd + 0.05) {
      skipped.push({ slug: s.slug, reason: `bounds past EOF (${fileEnd}s)` });
      continue;
    }
    const v = await verifyRange({
      src, index, fileEnd, start: s.start, end: s.end, label: s.slug,
      prompt, thresholds, project, guards, ffmpeg, outDir,
      noTranscribe, wantTranscript: false,
    });
    results.push({
      slug: s.slug,
      range: { start: s.start, end: s.end, duration: v.duration },
      timing: v.timing,
      redFlags: v.flags,
      driftCheck: v.driftCheck,
      suggestedOut: v.suggestedOut,
      suggestedIn: v.suggestedIn,
    });
  }

  const flagged = results.filter((r) => r.redFlags.length);
  const drifted = results.filter((r) => r.driftCheck?.verdict === "drifted");
  output({
    ok: true,
    manifest: manifestPath,
    scenes: results,
    ...(skipped.length ? { skipped } : {}),
    summary: {
      scenesChecked: results.length,
      scenesWithFlags: flagged.length,
      scenesDrifted: drifted.length,
      scenesSkipped: skipped.length,
    },
    hint: flagged.length
      ? `Flags on: ${flagged.map((r) => r.slug).join(", ")}. Re-scope each with ripple candidates "<src>" --start S --end E (apply its suggestedOut/suggestedIn), then run ripple lint. candidates informs; lint gates.`
      : "Every checked scene cleared the endpoint checks. next: ripple lint",
  });
}

// The three-signal endpoint check in one command:
//   1. timing — word-level numbers fused with silence (lastWordEnd, tailGap,
//      nextWordStart) + categorical red flags + auto-editor guards
//   2. silence at multiple thresholds (soft-speech safety)
//   3. sight — head/tail cut-card sheets and frame strips (READ them)
// plus the transcript text of the range (final phrase present? next prompt absent?)
export async function main(argv) {
  const args = parseArgs(argv, {
    start: "number", end: "number", label: "string", out: "string",
    thresholds: "string", "no-transcribe": "boolean", prompt: "string",
    "max-tail": "number", "max-lead": "number", "tail-preference": "number",
    "min-cut": "number", "min-clip": "number", "lead": "number",
    manifest: "string", "no-sheet": "boolean", crop: "string", "no-proxy": "boolean",
  });
  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  const thresholds = (args.thresholds ?? "-35,-40,-45").split(",").map((t) => t.trim());
  // Auto-editor guard tunables (flag overrides with conservative defaults).
  const guards = {
    minCut: args["min-cut"] ?? MIN_CUT,
    minClip: args["min-clip"] ?? MIN_CLIP,
    lead: args["lead"] ?? LEAD_MARGIN,
  };

  // Batch mode: verify every source-backed scene of a manifest.
  if (args.manifest !== undefined) {
    const outDir = ensureDir(args.out ?? join(process.cwd(), "work", "candidates"));
    await verifyManifest(args.manifest, {
      prompt: args.prompt, thresholds, guards,
      noTranscribe: args["no-transcribe"] ?? false, ffmpeg, outDir,
    });
    return;
  }

  const src = args._[0];
  if (!src || args.start === undefined || args.end === undefined) {
    fail("Usage: ripple candidates <src> --start S --end E [--label slug] [--out dir] [--prompt \"hints\"]\n" +
      "       [--thresholds -35,-40,-45] [--max-tail 1.0] [--max-lead 0.5] [--tail-preference 0.6]\n" +
      "       [--min-cut 0.25] [--min-clip 1.0] [--lead 0.3] [--crop x,y,w,h] [--no-sheet] [--no-transcribe]\n" +
      "       ripple candidates --manifest edit.json   batch-verify every source-backed scene", 2);
  }
  if (!existsSync(src)) fail(`File not found: ${src}`, 2);
  if (args.end <= args.start) fail("--end must be greater than --start", 2);

  const duration = round3(args.end - args.start);
  const label = args.label ?? `cand_${String(args.start).replace(".", "_")}`;
  const outDir = ensureDir(args.out ?? join(process.cwd(), "work", "candidates"));

  // Signal 1 built first so the range can be validated against the real
  // duration — a range past EOF must be a usage error, not fabricated
  // silence numbers.
  const { index } = loadAnalysis(src, { prompt: args.prompt });
  const fileEnd = index.duration;
  if (args.start >= fileEnd) fail(`--start ${args.start} is past the end of the file (${fileEnd}s)`, 2);
  if (args.end > fileEnd + 0.05) fail(`--end ${args.end} is past the end of the file (${fileEnd}s)`, 2);

  const project = {
    maxTail: args["max-tail"] ?? 1.0,
    maxLead: args["max-lead"] ?? 0.5,
    tailPreference: args["tail-preference"] ?? 0.6,
  };

  const v = await verifyRange({
    src, index, fileEnd, start: args.start, end: args.end, label,
    prompt: args.prompt, thresholds, project, guards, ffmpeg, outDir,
    noTranscribe: args["no-transcribe"] ?? false, wantTranscript: true,
  });

  // Signal 3a: head and tail frame strips (2s each, 4 fps). With --crop
  // "x,y,w,h" (state it once per locked-off source) the strips zoom to the
  // eye region — a look-down and a read-the-next-question are separable at
  // eye scale, not at 360px-frame scale.
  let crop = "";
  try {
    crop = cropFilter(args.crop);
  } catch (e) {
    fail(e.message, 2);
  }
  const strips = {};
  const stripLen = Math.min(2, duration);
  // Proxy for speed — but --crop coords are SOURCE pixels, so crop bypasses.
  const stripSrc = crop || args["no-proxy"] ? src : resolveProxy(src) ?? src;
  const stripSpecs = [
    ["head", args.start],
    ["tail", Math.max(args.start, args.end - stripLen)],
  ];
  for (const [name, at] of stripSpecs) {
    const path = join(outDir, `${label}_${name}.jpg`);
    const res = run(ffmpeg, [
      "-hide_banner", "-v", "error", "-y",
      "-ss", String(at), "-t", String(stripLen), "-i", stripSrc,
      "-vf", `fps=4,${crop}scale=360:-1,tile=8x1:padding=6:margin=6:color=0x222222`,
      "-frames:v", "1", path,
    ]);
    strips[name] = res.status === 0 ? path : `strip failed: ${res.stderr.trim()}`;
  }

  // Signal 3b: cut-card sheets — the editor's zoomed timeline around each
  // endpoint (thumbnails + waveform + silence + words + the cut line).
  const sheets = {};
  if (!args["no-sheet"]) {
    // "S" is the Set-of-Marks anchor for suggestedOut — the envelope's
    // number and the dashed chip on the image share the ID.
    const cards = [
      ["in", args.start, [{ t: args.start, label: "IN" }],
        v.suggestedIn !== null && Math.abs(v.suggestedIn - args.start) > 0.15
          ? [{ mark: "S", t: v.suggestedIn }] : []],
      ["out", args.end, [{ t: args.end, label: "OUT" }],
        v.suggestedOut !== null && Math.abs(v.suggestedOut - args.end) > 0.15
          ? [{ mark: "S", t: v.suggestedOut }] : []],
    ];
    for (const [name, at, markers, somMarks] of cards) {
      const path = join(outDir, `${label}_${name}_card.png`);
      try {
        renderSheet({
          file: src,
          start: Math.max(0, at - 6),
          end: Math.min(fileEnd, at + 6),
          out: path,
          index,
          markers,
          somMarks,
          mode: "detail",
          noProxy: args["no-proxy"] ?? false,
        });
        sheets[name] = path;
      } catch (e) {
        sheets[name] = `sheet failed: ${e.message}`;
      }
    }
  }

  output({
    ok: true,
    src,
    label,
    range: { start: args.start, end: args.end, duration },
    timing: v.timing,
    ...(v.timing === null && index.wordsNote ? { timingNote: index.wordsNote } : {}),
    flags: v.flags,
    suggestedOut: v.suggestedOut,
    suggestedIn: v.suggestedIn,
    silence: v.silence,
    strips,
    ...(Object.keys(sheets).length ? { sheets } : {}),
    transcript: v.transcript,
    driftCheck: v.driftCheck,
    verdictHints: [
      "The endpoint check is arithmetic: OUT = timing.lastWordEnd + tail preference (default 0.6s). Verify tailGap against the default 1.0s maximum or the explicit --max-tail value.",
      "suggestedIn/suggestedOut are the mechanical nudges: less air before the phrase (lead ≤0.3s), more after (tail ≤0.6s) — auto-editor's asymmetric margin. null means no clean air; re-scope by hand.",
      "Any entry in `flags` blocks locking this range until it is resolved.",
      "STUTTER_CUT: the cut lands in a silence too short to be a real pause (min-cut 0.25s) — move it to a longer gap. MICRO_CLIP: the kept range is shorter than min-clip (1.0s) — widen or merge it.",
      "driftCheck compares the index against an isolated re-transcription of this exact range. verdict:'drifted' (INDEX_DRIFT) means the index's word timing is wrong here — the isolated numbers are ground truth.",
      "timing.terminalPitch falling = thought complete (safe OUT); rising/level = may be mid-thought — re-read the transcript before trusting the cut. Never use it as a question detector.",
      "timing.breathAfterLastWord = a sharp inhale after the last word: the speaker is about to continue — check what follows.",
      "READ the cut-card sheets and strips: no look-down, reset, or glance at notes near the cut — and the OUT line must not touch the next waveform burst.",
      "Confirm the final intended phrase appears in transcript.text and timing.nextText is the next prompt/take, NOT more of the answer.",
    ],
  });
}
