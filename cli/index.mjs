#!/usr/bin/env node
const HELP = `Usage: ripple <command> [options]

Commands:
  probe <file> [--filters]        Inspect media: streams, duration, HDR, ffmpeg capabilities
  transcribe <file>               Word-level transcript via whisper-cpp (cached)
      [--out dir] [--model path] [--prompt "hints"] [--lang en] [--force]
  candidates <file> --start S --end E [--label slug]
      [--out dir] [--thresholds -35,-40,-45] [--no-transcribe]
                                  Verify a cut range: audio, transcript, silence, edge frames
  frame-sheet <file>              Tiled frame sheet so you can SEE the video
      [--fps 1] [--cols 6] [--scale 480] [--start S] [--end E] [--tail N] [--out path]
  qa <file> [--manifest edit.json]
      [--clips-dir clips] [--expect-clips N] [--transcript path]
      [--max-tail-silence 1.0] [--max-leading-silence 0.5] [--no-snapshot]
                                  Deterministic delivery gates + trend snapshots

All commands print JSON. Non-zero exit means a failed gate or missing tool.
`;

const command = process.argv[2];
const rest = process.argv.slice(3);

const commands = {
  probe: () => import("./probe.mjs"),
  transcribe: () => import("./transcribe.mjs"),
  candidates: () => import("./candidates.mjs"),
  "frame-sheet": () => import("./frame-sheet.mjs"),
  qa: () => import("./qa.mjs"),
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
