import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadAnalysis, referenceSilences, resolveProxy } from "./analyze.mjs";
import { cropFilter } from "./frame-sheet.mjs";
import { endpointFlags, projectOverrides } from "./rules.mjs";
import { cutTiming } from "./timing.mjs";
import { renderSheet } from "./timeline-sheet.mjs";
import { resolveModel, transcribeFile } from "./transcribe.mjs";
import {
  ensureDir, fail, findTool, output, parseArgs, parseSilence, requireTool, round3, run, silenceEdges,
} from "./util.mjs";

// The red-flag implementation lives in rules.mjs (the rule registry) so
// candidates and lint judge a range with the SAME code — re-exported here
// because this is where editing sessions historically imported it from.
export { endpointFlags };

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

// The three-signal endpoint check in one command:
//   1. timing — word-level numbers fused with silence (lastWordEnd, tailGap,
//      nextWordStart) + categorical red flags
//   2. silence at multiple thresholds (soft-speech safety)
//   3. sight — head/tail cut-card sheets and frame strips (READ them)
// plus the transcript text of the range (final phrase present? next prompt absent?)
export async function main(argv) {
  const args = parseArgs(argv, {
    start: "number", end: "number", label: "string", out: "string",
    thresholds: "string", "no-transcribe": "boolean", prompt: "string",
    "max-tail": "number", "max-lead": "number", "tail-preference": "number",
    "no-sheet": "boolean", crop: "string", "no-proxy": "boolean",
  });
  const src = args._[0];
  if (!src || args.start === undefined || args.end === undefined) {
    fail("Usage: ripple candidates <src> --start S --end E [--label slug] [--out dir] [--prompt \"hints\"]\n" +
      "       [--thresholds -35,-40,-45] [--max-tail 1.0] [--max-lead 0.5] [--tail-preference 0.6]\n" +
      "       [--crop x,y,w,h] [--no-sheet] [--no-transcribe]", 2);
  }
  if (!existsSync(src)) fail(`File not found: ${src}`, 2);
  if (args.end <= args.start) fail("--end must be greater than --start", 2);

  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  const duration = round3(args.end - args.start);
  const label = args.label ?? `cand_${String(args.start).replace(".", "_")}`;
  const outDir = ensureDir(args.out ?? join(process.cwd(), "work", "candidates"));
  const thresholds = (args.thresholds ?? "-35,-40,-45").split(",").map((t) => t.trim());

  // Signal 1: word-level timing from the per-source index (whole-file, so
  // no window-edge truncation can hide the next prompt). Built first so the
  // range can be validated against the real duration — a range past EOF
  // must be a usage error, not fabricated silence numbers.
  const { index } = loadAnalysis(src, { prompt: args.prompt });
  const fileEnd = index.duration;
  if (args.start >= fileEnd) fail(`--start ${args.start} is past the end of the file (${fileEnd}s)`, 2);
  if (args.end > fileEnd + 0.05) fail(`--end ${args.end} is past the end of the file (${fileEnd}s)`, 2);
  const silenceRef = referenceSilences(index).map((s) => ({ ...s, end: s.end ?? fileEnd }));
  const timing = index.words
    ? cutTiming(index.words, silenceRef, { start: args.start, end: args.end })
    : null;
  // Prosody at the OUT: the melody of the last sentence says whether the
  // thought is complete; a sharp inhale right after the last word says the
  // speaker is about to continue.
  if (timing?.lastWordEnd !== null && timing) {
    // Nearest sentence end within tolerance — first-match can bind the
    // wrong sentence when two end close together.
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

  // Signal 2: silence at each threshold, across the exact candidate range.
  const silence = {};
  for (const db of thresholds) {
    const res = run(ffmpeg, [
      "-hide_banner", "-nostats",
      "-ss", String(args.start), "-t", String(duration), "-i", src,
      "-vn", "-map", "0:a:0", "-af", `silencedetect=noise=${db}dB:d=0.25`,
      "-f", "null", "-",
    ]);
    if (res.status !== 0) fail(`silencedetect (${db}dB) failed: ${res.stderr.trim().slice(-500)}`, 1);
    const spans = parseSilence(res.stderr);
    silence[`${db}dB`] = { ...silenceEdges(spans, duration), spans: spans.length };
  }
  // Project-tier retunes (VIDEO.md at the cwd project root, same anchor as
  // work/analysis) apply here exactly as at the lint gate — the same range
  // must never flag differently at the two moments. An explicit flag
  // outranks the retune (rules.mjs projectOverrides precedence).
  const project = projectOverrides(join(process.cwd(), "VIDEO.md"), {
    maxTail: args["max-tail"],
    maxLead: args["max-lead"],
  });
  const flags = endpointFlags(timing, silence, {
    maxTail: project.maxTail,
    maxLead: project.maxLead,
    end: args.end,
  });
  // A nudge only helps when the range ends where it means to. Ending
  // mid-speech means the OUT is scoped to the wrong sentence — re-scope
  // (the index's `sentences` array is the lattice), don't nudge.
  const brokenScope = flags.some((f) =>
    ["SPEECH_AT_OUT", "MID_WORD_OUT", "NEXT_SPEECH_INSIDE"].includes(f.flag));
  const suggestedOut = brokenScope
    ? null
    : suggestOut(timing, { tailPreference: args["tail-preference"] ?? 0.6 });

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
      ["in", args.start, [{ t: args.start, label: "IN" }], []],
      ["out", args.end, [{ t: args.end, label: "OUT" }],
        suggestedOut !== null && Math.abs(suggestedOut - args.end) > 0.15
          ? [{ mark: "S", t: suggestedOut }] : []],
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

  // Transcript text of the range (the "final phrase present?" check).
  let transcript = null;
  if (!args["no-transcribe"]) {
    const whisperAvailable = findTool(["whisper-cli", "whisper-cpp", "main"]) && resolveModel(null);
    if (whisperAvailable) {
      const wavPath = join(outDir, `${label}.wav`);
      const extract = run(ffmpeg, [
        "-hide_banner", "-v", "error", "-y",
        "-ss", String(args.start), "-t", String(duration), "-i", src,
        "-vn", "-map", "0:a:0", "-ac", "1", "-ar", "16000", wavPath,
      ]);
      if (extract.status === 0) {
        const t = transcribeFile(wavPath, { outDir, prompt: args.prompt });
        transcript = {
          files: t.files,
          text: existsSync(t.files.txt) ? readFileSync(t.files.txt, "utf8").trim() : null,
        };
      }
    } else {
      transcript = { skipped: "whisper-cpp or model unavailable — run `ripple doctor` for setup" };
    }
  }

  output({
    ok: true,
    src,
    label,
    range: { start: args.start, end: args.end, duration },
    timing,
    ...(timing === null && index.wordsNote ? { timingNote: index.wordsNote } : {}),
    flags,
    // Retunes are never silent: echo them exactly as lint does.
    ...(project.overrides.length ? { overrides: project.overrides } : {}),
    suggestedOut,
    silence,
    strips,
    ...(Object.keys(sheets).length ? { sheets } : {}),
    transcript,
    verdictHints: [
      "The endpoint rule is arithmetic: OUT = timing.lastWordEnd + tail preference (VIDEO.md, default ≤1.0s). Verify tailGap against it.",
      "Any entry in `flags` blocks locking this range until resolved or overridden with a written reason.",
      "timing.terminalPitch falling = thought complete (safe OUT); rising/level = may be mid-thought — re-read the transcript before trusting the cut. Never use it as a question detector.",
      "timing.breathAfterLastWord = a sharp inhale after the last word: the speaker is about to continue — check what follows.",
      "READ the cut-card sheets and strips: no look-down, reset, or glance at notes near the cut — and the OUT line must not touch the next waveform burst.",
      "Confirm the final intended phrase appears in transcript.text and timing.nextText is the next prompt/take, NOT more of the answer.",
    ],
  });
}
