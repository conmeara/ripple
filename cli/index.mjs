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
    usage: `  probe [file|dir] [--filters]    Inspect one file's streams/HDR/capabilities; no file (or a dir)
                                  lists the media bin and perception-index state`,
  },
  search: {
    load: () => import("./search.mjs"),
    usage: `  search "phrase" [files...]      Find where anyone says it, word-accurate, across all indexed
      [--limit 50]                sources (run analyze first)`,
  },
  sync: {
    load: () => import("./sync.mjs"),
    usage: `  sync <ref> <other...>           Multicam: audio cross-correlation offsets between recordings
      [--max-offset 600]          (other_time + offset = ref_time)`,
  },
  analyze: {
    load: () => import("./analyze.mjs"),
    usage: `  analyze <file>                  Build the perception index: word timings, silence/speech maps,
      [--out dir] [--model path]  sentences (with pace), fillers, non-speech events (laughs/claps),
      [--prompt "hints"] [--lang en]  scene changes, motion + energy curves — cached; run once per source
      [--force] [--thresholds -35,-40,-45] [--rms-window 0.5] [--no-scenes]
      [--no-proxy]                skip the 960px frame-extraction proxy (made by default for >1280px sources)`,
  },
  transcribe: {
    load: () => import("./transcribe.mjs"),
    usage: `  transcribe <file>               Transcript: existing subtitles first, whisper-cpp fallback (cached)
      [--out dir] [--model path] [--prompt "hints"] [--lang en] [--force]
      [--whisper]                 force whisper even when subtitles exist
      [--words]                   also emit word-level timing (.words.json; implied by analyze)`,
  },
  select: {
    load: () => import("./select.mjs"),
    usage: `  select <f1> <f2> [...]          Group takes across files by transcript; recommend best per group
      [--threshold 0.4] [--prompt "hints"]`,
  },
  candidates: {
    load: () => import("./candidates.mjs"),
    usage: `  candidates <file> --start S --end E [--label slug]
      [--out dir] [--prompt "hints"] [--thresholds -35,-40,-45]
      [--max-tail 1.0] [--max-lead 0.5] [--tail-preference 0.6]
      [--min-cut 0.25] [--min-clip 1.0] [--lead 0.3]   auto-editor guards: stutter-cut /
                                  micro-clip red flags + a lead-in margin for suggestedIn
      [--crop x,y,w,h]            zoom strips to a source region (eyes) — set once per locked-off shot
      [--no-proxy]                read the original source, not the 960px proxy, for strips/sheets
      [--no-sheet]                skip the cut-card sheets
      [--no-transcribe]           skip the range transcript (word timing still
                                  comes from the cached index)
      --manifest edit.json        batch-verify every source-backed scene (incl. the isolated
                                  driftCheck lint skips); informs, never gates (exit 0 with flags)
                                  Verify a cut range: word timing + red flags + suggested IN/OUT,
                                  silence, transcript, edge frames, head/tail cut-card sheets`,
  },
  "frame-sheet": {
    load: () => import("./frame-sheet.mjs"),
    usage: `  frame-sheet <file>              Tiled frame sheet so you can SEE the video
      [--fps 1] [--cols 6] [--scale 480] [--start S] [--end E] [--tail N] [--out path]
      [--crop x,y,w,h]            zoom every tile to a source region (eyes, hands)
      [--no-proxy]                read the original source, not the 960px proxy
      [--scenes]                  sample where the picture CHANGES (scene detect +
      [--scene-threshold 0.3]     coverage floor + dedup); emits tile→timestamp map —
      [--gap 10]                  the discovery mode for takes/resets in long footage`,
  },
  "timeline-sheet": {
    load: () => import("./timeline-sheet.mjs"),
    usage: `  timeline-sheet <file>           The editor's timeline as one image: thumbnails + motion strip +
      [--start S --end E]         waveform with silence shading + word-aligned transcript + cut
      [--around T --span 12]      markers, on a shared time axis. Overview for discovery; zoom
      [--manifest edit.json [--scene slug]]   (--around/--scene) before locking any cut
      [--at T]                    map an output time through the manifest, then zoom its source moment
      [--source-time T --scene slug]  reverse-map a scene's source time into the output timeline
      [--markers "209:IN,233.3:OUT"]  orange cut lines with time chips
      [--marks "A:493.5,B:494.2"]     lettered candidate anchors (image ↔ JSON share IDs)
      [--out path] [--width 1920] [--force] [--no-proxy]`,
  },
  beats: {
    load: () => import("./beats.mjs"),
    usage: `  beats <audio>                   Beat grid for a music bed: bpm + beat times + confidence
      [--out dir] [--force]       (auto-reports "no grid" on non-periodic audio like speech)`,
  },
  lint: {
    load: () => import("./lint.mjs"),
    usage: `  lint [edit.json]                Pre-render rule check from cached perception only: every scene's
      [--scene slug]              endpoint flags + waiver accounting — exit 1 on unwaived block
      [--analysis-dir dir] [--video-md path] [--max-tail 1.0] [--max-lead 0.5]  findings`,
  },
  cut: {
    load: () => import("./cut.mjs"),
    usage: `  cut [edit.json]                 Render the manifest: clips + cards/J-cuts/L-cuts + dissolves +
      [--profile draft|final]     music bed + full assembly (auto-snapshots the manifest first)
      [--scene slug,slug] [--out path] [--no-clips] [--no-full]
      [--preset vertical|square]  reframed delivery of the same cut (never clobbers the primary)`,
  },
  captions: {
    load: () => import("./captions.mjs"),
    usage: `  captions [edit.json]            Word-accurate captions in OUTPUT time, mapped through cards and
      [--style subtitle|social]   J/L-cuts: .srt (universal) + styled .ass (social = karaoke words)
      [--out dir] [--font name] [--accent &H00XXXXXX] [--width W] [--height H]
      captions edit.json <video> --burn out.mp4    burn in (needs a libass ffmpeg; see RIPPLE_FFMPEG)`,
  },
  history: {
    load: () => import("./history.mjs"),
    usage: `  history [edit.json]             Save a snapshot to .ripple/history (identical versions dedup)
      [--label "text"]            attach a label to a newly saved snapshot
      [--list]                    list saved versions
      --diff <a> <b>              cut-list diff; either side can be a history snapshot`,
  },
  study: {
    load: () => import("./study.mjs"),
    usage: `  study <file-or-url>             Taste extraction from a reference edit: cutting rhythm, pacing,
      [--out dir] [--force]       tail preference, silence/energy character, grade fingerprint →
                                  proposed VIDEO.md values with the measurement behind each
                                  (URLs fetched via yt-dlp, cached in ~/.ripple/study)`,
  },
  qa: {
    load: () => import("./qa.mjs"),
    usage: `  qa <file> [--manifest edit.json]
      [--clips-dir clips] [--expect-clips N] [--transcript path] [--transcribe]
      [--max-tail-silence 1.0] [--max-leading-silence 0.5] [--no-snapshot]
                                  Deterministic delivery gates + trend snapshots
                                  (--manifest defaults to the project's edit.json /
                                  work/edit.json so cards stay explained)
      --report [--out path] [--title "..."]  render the HTML QA report from existing artifacts`,
  },
  handoff: {
    load: () => import("./handoff.mjs"),
    usage: `  handoff [edit.json]             Hand the cut to an NLE: timeline files referencing original media
      [--format otio,xmeml,edl]       otio → Resolve (native) · xmeml → Premiere · edl → universal
      [--out handoff/] [--no-cards]   scene reasoning travels as timeline markers`,
  },
};

const COMMAND_GROUPS = [
  {
    label: "Core loop",
    commands: ["analyze", "candidates", "frame-sheet", "timeline-sheet", "lint", "cut", "qa"],
  },
  {
    label: "Scale & multicam",
    commands: ["search", "select", "sync", "beats", "study"],
  },
  {
    label: "Support",
    commands: ["doctor", "probe", "history", "captions", "handoff", "transcribe"],
  },
];

const DEPRECATED = {
  sources: "ripple sources was merged into probe — run: ripple probe [dir]",
  describe: "ripple describe was removed — per-scene endpoint verdicts: ripple lint; timeline view: ripple timeline-sheet",
  status: "ripple status was removed — run: ripple lint (findings + next step) or ripple history --list",
  locate: "ripple locate was merged into timeline-sheet — run: ripple timeline-sheet <src> --at <output-time> --manifest edit.json",
  snapshot: "ripple snapshot was merged into history — run: ripple history [edit.json]",
  compare: "ripple compare was merged into history — run: ripple history --diff <a> <b>",
  grade: "ripple grade was removed — grading recipes live in the deliver playbook; the manifest grade field still renders via ripple cut",
  review: "ripple review was merged into qa — run: ripple qa <file> --report",
};

const HELP = `Usage: ripple <command> [options]

Commands:
${COMMAND_GROUPS.map(({ label, commands }) => `${label}:\n${commands.map((name) => COMMANDS[name].usage).join("\n")}`).join("\n\n")}

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
if (DEPRECATED[command]) {
  process.stdout.write(
    JSON.stringify({ ok: false, error: { message: DEPRECATED[command] } }, null, 2) + "\n"
  );
  process.exit(2);
}

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
