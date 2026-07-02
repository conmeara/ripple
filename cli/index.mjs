#!/usr/bin/env node
const HELP = `Usage: ripple <command> [options]

Commands:
  doctor                          Check ffmpeg/whisper/encoders and print fixes
  probe <file> [--filters]        Inspect media: streams, duration, HDR, ffmpeg capabilities
  transcribe <file>               Word-level transcript via whisper-cpp (cached)
      [--out dir] [--model path] [--prompt "hints"] [--lang en] [--force]
  select <f1> <f2> [...]          Group takes across files by transcript; recommend best per group
      [--threshold 0.45] [--prompt "hints"]
  candidates <file> --start S --end E [--label slug]
      [--out dir] [--thresholds -35,-40,-45] [--no-transcribe]
                                  Verify a cut range: audio, transcript, silence, edge frames
  frame-sheet <file>              Tiled frame sheet so you can SEE the video
      [--fps 1] [--cols 6] [--scale 480] [--start S] [--end E] [--tail N] [--out path]
  cut [edit.json]                 Render the manifest: per-scene clips + cards/J-cuts + full assembly
      [--profile draft|final] [--scene slug,slug] [--out path] [--no-clips] [--no-full]
  grade <file>                    Same-frame grading variants; --choose records the pick
      [--at s] [--variants warm,cool,...] | --choose <preset> [--manifest edit.json]
  qa <file> [--manifest edit.json]
      [--clips-dir clips] [--expect-clips N] [--transcript path] [--transcribe]
      [--max-tail-silence 1.0] [--max-leading-silence 0.5] [--no-snapshot]
                                  Deterministic delivery gates + trend snapshots
  review [--manifest edit.json]   Generate the HTML review page (cut list, QA, evidence strips)
      [--out qa/review.html] [--title "..."]

All commands print JSON. Non-zero exit means a failed gate or missing tool.
`;

const command = process.argv[2];
const rest = process.argv.slice(3);

const commands = {
  doctor: () => import("./doctor.mjs"),
  probe: () => import("./probe.mjs"),
  transcribe: () => import("./transcribe.mjs"),
  select: () => import("./select.mjs"),
  candidates: () => import("./candidates.mjs"),
  "frame-sheet": () => import("./frame-sheet.mjs"),
  cut: () => import("./cut.mjs"),
  grade: () => import("./grade.mjs"),
  qa: () => import("./qa.mjs"),
  review: () => import("./review.mjs"),
};

if (!command || command === "help" || command === "--help" || command === "-h") {
  process.stdout.write(HELP);
  process.exit(0);
}

const loader = commands[command];
if (!loader) {
  process.stdout.write(JSON.stringify({ ok: false, error: { message: `Unknown command: ${command}. Run \`ripple help\`.` } }, null, 2) + "\n");
  process.exit(2);
}

const mod = await loader();
await mod.main(rest);
