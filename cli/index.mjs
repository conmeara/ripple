#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")
).version;

// Single source of truth for usage text: top-level help and per-command
// `--help` both render from these blocks.
const COMMANDS = {
  doctor: {
    load: () => import("./doctor.mjs"),
    usage: `  doctor                          Check ffmpeg/whisper/encoders and print fixes`,
  },
  probe: {
    load: () => import("./probe.mjs"),
    usage: `  probe <file> [--filters]        Inspect media: streams, duration, HDR, ffmpeg capabilities`,
  },
  transcribe: {
    load: () => import("./transcribe.mjs"),
    usage: `  transcribe <file>               Transcript: existing subtitles first, whisper-cpp fallback (cached)
      [--out dir] [--model path] [--prompt "hints"] [--lang en] [--force]
      [--whisper]                 force whisper (needed for word-level JSON timing)`,
  },
  select: {
    load: () => import("./select.mjs"),
    usage: `  select <f1> <f2> [...]          Group takes across files by transcript; recommend best per group
      [--threshold 0.4] [--prompt "hints"]`,
  },
  candidates: {
    load: () => import("./candidates.mjs"),
    usage: `  candidates <file> --start S --end E [--label slug]
      [--out dir] [--thresholds -35,-40,-45] [--no-transcribe]
                                  Verify a cut range: audio, transcript, silence, edge frames`,
  },
  "frame-sheet": {
    load: () => import("./frame-sheet.mjs"),
    usage: `  frame-sheet <file>              Tiled frame sheet so you can SEE the video
      [--fps 1] [--cols 6] [--scale 480] [--start S] [--end E] [--tail N] [--out path]
      [--scenes]                  sample where the picture CHANGES (scene detect +
      [--scene-threshold 0.3]     coverage floor + dedup); emits tile→timestamp map —
      [--gap 10]                  the discovery mode for takes/resets in long footage`,
  },
  cut: {
    load: () => import("./cut.mjs"),
    usage: `  cut [edit.json]                 Render the manifest: per-scene clips + cards/J-cuts + full assembly
      [--profile draft|final] [--scene slug,slug] [--out path] [--no-clips] [--no-full]`,
  },
  grade: {
    load: () => import("./grade.mjs"),
    usage: `  grade <file>                    Same-frame grading variants; --choose records the pick
      [--at s] [--variants warm,cool,...] | --choose <preset> [--manifest edit.json]`,
  },
  qa: {
    load: () => import("./qa.mjs"),
    usage: `  qa <file> [--manifest edit.json]
      [--clips-dir clips] [--expect-clips N] [--transcript path] [--transcribe]
      [--max-tail-silence 1.0] [--max-leading-silence 0.5] [--no-snapshot]
                                  Deterministic delivery gates + trend snapshots`,
  },
  review: {
    load: () => import("./review.mjs"),
    usage: `  review [--manifest edit.json]   Generate the HTML review page (cut list, QA, evidence strips)
      [--out qa/review.html] [--title "..."]`,
  },
};

const HELP = `Usage: ripple <command> [options]

Commands:
${Object.values(COMMANDS).map((c) => c.usage).join("\n")}

Global:
  -h, --help                      Show this help (or <command> --help for one command)
  --version                       Print the ripple version

All commands print JSON to stdout (including error envelopes: {ok:false, error}).
Exit codes: 0 success · 1 failed gate or runtime failure · 2 invalid usage or missing tool.
`;

const argv = process.argv.slice(2);
const command = argv[0];
const rest = argv.slice(1);

if (!command || command === "help" || command === "--help" || command === "-h") {
  process.stdout.write(HELP);
  process.exit(0);
}

if (command === "--version" || command === "-V" || command === "version") {
  process.stdout.write(`${VERSION}\n`);
  process.exit(0);
}

const entry = COMMANDS[command];
if (!entry) {
  process.stdout.write(
    JSON.stringify({ ok: false, error: { message: `Unknown command: ${command}. Run \`ripple help\`.` } }, null, 2) + "\n"
  );
  process.exit(2);
}

// `ripple <command> --help` always shows help and ignores other args.
if (rest.includes("--help") || rest.includes("-h")) {
  process.stdout.write(`Usage:\n${entry.usage}\n`);
  process.exit(0);
}

const mod = await entry.load();
await mod.main(rest);
