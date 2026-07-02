import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findTool } from "./util.mjs";
import {
  ensureDir, fail, output, parseArgs, parseSilence, requireTool, round3, run, silenceEdges,
} from "./util.mjs";
import { resolveModel, transcribeFile } from "./transcribe.mjs";

// The three-signal endpoint check in one command:
//   1. transcript of the candidate range (final phrase present? next prompt absent?)
//   2. leading/tail silence at multiple thresholds (soft speech safety)
//   3. head/tail frame strips (look-down / reset detection — read them!)
export async function main(argv) {
  const args = parseArgs(argv, {
    start: "number", end: "number", label: "string", out: "string",
    thresholds: "string", "no-transcribe": "boolean", prompt: "string",
  });
  const src = args._[0];
  if (!src || args.start === undefined || args.end === undefined) {
    fail("Usage: ripple candidates <src> --start S --end E [--label slug] [--out dir] [--thresholds -35,-40,-45] [--no-transcribe]", 2);
  }
  if (!existsSync(src)) fail(`File not found: ${src}`, 2);
  if (args.end <= args.start) fail("--end must be greater than --start", 2);

  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  const duration = round3(args.end - args.start);
  const label = args.label ?? `cand_${String(args.start).replace(".", "_")}`;
  const outDir = ensureDir(args.out ?? join(process.cwd(), "work", "candidates"));
  const thresholds = (args.thresholds ?? "-35,-40,-45").split(",").map((t) => t.trim());

  // Signal 2: silence at each threshold, across the exact candidate range.
  const silence = {};
  for (const db of thresholds) {
    const res = run(ffmpeg, [
      "-hide_banner", "-nostats",
      "-ss", String(args.start), "-t", String(duration), "-i", src,
      "-vn", "-af", `silencedetect=noise=${db}dB:d=0.25`,
      "-f", "null", "-",
    ]);
    const spans = parseSilence(res.stderr);
    silence[`${db}dB`] = { ...silenceEdges(spans, duration), spans: spans.length };
  }

  // Signal 3: head and tail frame strips (2s each, 4 fps).
  const strips = {};
  const stripLen = Math.min(2, duration);
  const stripSpecs = [
    ["head", args.start],
    ["tail", Math.max(args.start, args.end - stripLen)],
  ];
  for (const [name, at] of stripSpecs) {
    const path = join(outDir, `${label}_${name}.jpg`);
    const res = run(ffmpeg, [
      "-hide_banner", "-v", "error", "-y",
      "-ss", String(at), "-t", String(stripLen), "-i", src,
      "-vf", "fps=4,scale=360:-1,tile=8x1:padding=6:margin=6:color=0x222222",
      "-frames:v", "1", path,
    ]);
    strips[name] = res.status === 0 ? path : `strip failed: ${res.stderr.trim()}`;
  }

  // Signal 1: transcript of the candidate audio.
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
      transcript = { skipped: "whisper-cpp or model unavailable — run `ripple transcribe` guidance to set up" };
    }
  }

  output({
    ok: true,
    src,
    label,
    range: { start: args.start, end: args.end, duration },
    silence,
    strips,
    transcript,
    verdictHints: [
      "Confirm the final intended phrase appears in transcript.text and the next prompt/take does NOT.",
      "Leading silence should be ~0; tail silence within VIDEO.md bounds (default ≤1.0s). Distrust a single threshold.",
      "READ the head/tail strips: no look-down, reset, or glance at notes near the cut.",
    ],
  });
}
