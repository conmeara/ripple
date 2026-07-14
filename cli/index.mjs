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
  sources: {
    load: () => import("./sources.mjs"),
    usage: `  sources [dir]                   The bins panel: every media file with duration/codec/HDR and
                                  whether the perception index has seen it`,
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
      [--crop x,y,w,h]            zoom strips to a source region (eyes) — set once per locked-off shot
      [--no-proxy]                read the original source, not the 960px proxy, for strips/sheets
      [--no-sheet]                skip the cut-card sheets
      [--no-transcribe]           skip the range transcript (word timing still
                                  comes from the cached index)
                                  Verify a cut range: word timing + red flags + suggested OUT,
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
      [--markers "209:IN,233.3:OUT"]  orange cut lines with time chips
      [--marks "A:493.5,B:494.2"]     lettered candidate anchors (image ↔ JSON share IDs)
      [--out path] [--width 1920] [--force] [--no-proxy]`,
  },
  beats: {
    load: () => import("./beats.mjs"),
    usage: `  beats <audio>                   Beat grid for a music bed: bpm + beat times + confidence
      [--out dir] [--force]       (auto-reports "no grid" on non-periodic audio like speech)`,
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
  locate: {
    load: () => import("./locate.mjs"),
    usage: `  locate <output-time> [edit.json]   "At 1:23 it drags" → which scene, which SOURCE time
      [--scene slug [--source-time T]]   (reverse: where a source moment lands in the output)`,
  },
  snapshot: {
    load: () => import("./snapshot.mjs"),
    usage: `  snapshot [edit.json]            The undo stack: save a manifest version to .ripple/history
      [--label "before tighten"]  (cut auto-snapshots before every render; identical cuts dedup)
      [--list]                    list saved versions`,
  },
  compare: {
    load: () => import("./compare.mjs"),
    usage: `  compare <a.json> <b.json>       Cut-list diff: per-scene bounds deltas, added/removed scenes,
                                  duration change (either side can be a .ripple/history snapshot)`,
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
  handoff: {
    load: () => import("./handoff.mjs"),
    usage: `  handoff [edit.json]             Hand the cut to an NLE: timeline files referencing original media
      [--format otio,xmeml,edl]       otio → Resolve (native) · xmeml → Premiere · edl → universal
      [--out handoff/] [--no-cards]   scene reasoning travels as timeline markers`,
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
