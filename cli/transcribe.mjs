import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { dtwPreset, parseWhisperWords } from "./timing.mjs";
import {
  ensureDir, extractWav16k, fail, ffprobeJson, fileStamp, findTool, output, parseArgs,
  readJsonOrNull, requireTool, round3, run, writeJsonAtomic,
} from "./util.mjs";

const WHISPER_HINT = [
  "whisper-cpp is not installed. Guided install:",
  "  brew install whisper-cpp",
  "  mkdir -p ~/.ripple/models && curl -L --fail -o ~/.ripple/models/ggml-base.en.bin \\",
  "    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
].join("\n");

export function resolveModel(explicit) {
  if (explicit) {
    if (!existsSync(explicit)) fail(`Model not found: ${explicit}`, 2);
    return explicit;
  }
  const dirs = [join(process.cwd(), "models"), join(homedir(), ".ripple", "models")];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    // tdrz models are for the speaker-turn pass — deprioritized, but a
    // tinydiarize model is still transcription-capable, so it remains the
    // last resort when it's the ONLY model installed.
    const all = readdirSync(dir).filter((f) => f.endsWith(".bin") && !/silero|vad/i.test(f)).sort();
    const bins = all.filter((f) => !/tdrz/i.test(f));
    const preferred = bins.find((f) => f.includes("base.en")) ?? bins[0] ?? all[0];
    if (preferred) return join(dir, preferred);
  }
  return null;
}

// The tinydiarize model (speaker-turn markers), if installed.
export function resolveTdrzModel() {
  const dirs = [join(process.cwd(), "models"), join(homedir(), ".ripple", "models")];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const bin = readdirSync(dir).find((f) => f.endsWith(".bin") && /tdrz/i.test(f));
    if (bin) return join(dir, bin);
  }
  return null;
}

// Strip SRT/VTT scaffolding (indices, timestamps, tags) down to spoken text.
export function subtitleToText(raw) {
  return raw
    .replace(/^WEBVTT[^\n]*\n/, "")
    .split("\n")
    .filter((line) => {
      const l = line.trim();
      if (!l) return false;
      if (/^\d+$/.test(l)) return false; // srt cue index
      if (/-->/.test(l)) return false; // timestamp line
      if (/^(NOTE|STYLE|REGION)\b/.test(l)) return false; // vtt blocks
      return true;
    })
    .map((line) => line.replace(/<[^>]+>/g, "").trim())
    .join("\n")
    .trim();
}

// Existing subtitles beat re-transcription: faster and usually more accurate.
// Returns { kind: "sidecar", path } | { kind: "embedded", streamIndex } | null.
export function findSubtitles(file) {
  const stem = join(dirname(file), basename(file, extname(file)));
  for (const ext of [".srt", ".vtt", ".en.srt", ".en.vtt"]) {
    if (existsSync(stem + ext)) return { kind: "sidecar", path: stem + ext };
  }
  if (/\.(mp4|mov|mkv|webm|m4v)$/i.test(file)) {
    const streams = ffprobeJson(file).streams ?? [];
    const sub = streams.find((s) => s.codec_type === "subtitle");
    if (sub) return { kind: "embedded", streamIndex: sub.index };
  }
  return null;
}

// Extract 16kHz mono wav and run whisper-cli. Returns file map. Reused by candidates.
export function transcribeFile(file, { outDir, model, prompt, lang = "en", force = false }) {
  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  const whisper = findTool(["whisper-cli", "whisper-cpp", "main"]);
  if (!whisper) fail(WHISPER_HINT, 2, { missing: "whisper-cpp" });
  const resolvedModel = resolveModel(model);
  if (!resolvedModel) fail(WHISPER_HINT, 2, { missing: "model" });

  ensureDir(outDir);
  const stem = `${basename(file, extname(file))}_${fileStamp(file)}`;
  const wav = join(outDir, `${stem}.16k.wav`);
  const prefix = join(outDir, stem);
  const files = { wav, json: `${prefix}.json`, srt: `${prefix}.srt`, txt: `${prefix}.txt` };

  if (!force && existsSync(files.json) && existsSync(files.txt)) {
    return { files, cached: true, model: resolvedModel };
  }

  extractWav16k(file, wav);

  const whisperArgs = [
    "-m", resolvedModel, "-f", wav, "-l", lang,
    "-oj", "-osrt", "-otxt", "-of", prefix,
  ];
  if (prompt) whisperArgs.push("--prompt", prompt);
  const res = run(whisper, whisperArgs);
  if (res.status !== 0) fail(`whisper failed: ${(res.stderr || res.stdout).trim().slice(-2000)}`, 1);

  return { files, cached: false, model: resolvedModel };
}

// Word-level timing pass: a second whisper run (`-ml 1 -sow`) over the same
// wav, normalized into `<stem>.words.json` — [{start, end, text}] in source
// seconds. Segment outputs (.json/.srt/.txt) are untouched; readable
// transcripts and word timing are different artifacts with different
// consumers. Word timestamps are fuzzy (±100–200ms, worse right after long
// pauses) — downstream code must fuse them with silencedetect via
// timing.mjs, never trust them alone.
// Word timing needs a whisper build with --split-on-word; probe once.
let whisperCapsCache = null;
export function whisperWordCapable() {
  if (whisperCapsCache) return whisperCapsCache;
  const whisper = findTool(["whisper-cli", "whisper-cpp", "main"]);
  if (!whisper) return (whisperCapsCache = { ok: false, dtw: false, tdrz: false });
  const help = run(whisper, ["--help"]);
  const text = help.stdout + help.stderr;
  whisperCapsCache = {
    ok: /--split-on-word/.test(text),
    dtw: /--dtw/.test(text),
    tdrz: /--tinydiarize/.test(text),
  };
  return whisperCapsCache;
}

// Speaker-turn pass via tinydiarize (-tdrz): each JSON segment gains
// speaker_turn_next. Works on conversational hand-offs (podcasts, two-mic
// chats); on interview footage with a quiet off-camera interviewer it often
// detects nothing — callers must treat turns as evidence, never proof.
export function transcribeTurns(file, { outDir, lang = "en", force = false }) {
  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  const whisper = findTool(["whisper-cli", "whisper-cpp", "main"]);
  const tdrzModel = resolveTdrzModel();
  if (!whisper || !tdrzModel || !whisperWordCapable().tdrz) return null;

  ensureDir(outDir);
  const stem = `${basename(file, extname(file))}_${fileStamp(file)}`;
  const wav = join(outDir, `${stem}.16k.wav`);
  const turnsJson = join(outDir, `${stem}.turns.json`);

  if (!force) {
    const cached = readJsonOrNull(turnsJson);
    if (cached?.turns) return { files: { turnsJson }, cached: true, turns: cached.turns };
  }

  extractWav16k(file, wav);

  const rawPrefix = join(outDir, `${stem}.turns-raw`);
  const res = run(whisper, ["-m", tdrzModel, "-f", wav, "-l", lang, "-tdrz", "-oj", "-of", rawPrefix]);
  // Optional tier: a failed turns pass degrades (turns stay null with a
  // note), it must never abort the whole index build.
  if (res.status !== 0) return null;

  const raw = readJsonOrNull(`${rawPrefix}.json`);
  const segments = raw?.transcription ?? [];
  const turns = [];
  for (let i = 0; i < segments.length; i++) {
    if (!segments[i].speaker_turn_next) continue;
    turns.push({
      t: round3((segments[i].offsets?.to ?? 0) / 1000),
      textBefore: (segments[i].text ?? "").trim().slice(-80),
      textAfter: (segments[i + 1]?.text ?? "").trim().slice(0, 80),
    });
  }
  writeJsonAtomic(turnsJson, { file, model: basename(tdrzModel), turns });
  return { files: { turnsJson }, cached: false, turns };
}

export function transcribeWords(file, { outDir, model, prompt, lang = "en", force = false }) {
  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  const whisper = findTool(["whisper-cli", "whisper-cpp", "main"]);
  if (!whisper) fail(WHISPER_HINT, 2, { missing: "whisper-cpp" });
  const resolvedModel = resolveModel(model);
  if (!resolvedModel) fail(WHISPER_HINT, 2, { missing: "model" });

  ensureDir(outDir);
  const stem = `${basename(file, extname(file))}_${fileStamp(file)}`;
  const wav = join(outDir, `${stem}.16k.wav`);
  const wordsJson = join(outDir, `${stem}.words.json`);

  if (!force) {
    const cached = readJsonOrNull(wordsJson);
    if (cached?.words && (prompt === undefined || cached.prompt === prompt)) {
      return { files: { wordsJson, wav }, cached: true, model: resolvedModel, words: cached.words };
    }
  }

  extractWav16k(file, wav);

  const rawPrefix = join(outDir, `${stem}.words-raw`);
  const baseArgs = ["-m", resolvedModel, "-f", wav, "-l", lang, "-ml", "1", "-sow", "-oj", "-of", rawPrefix];
  if (prompt) baseArgs.push("--prompt", prompt);
  // Token-level DTW alignment when this build and model support it; a build
  // that chokes on it falls back to plain -ml 1 -sow rather than failing.
  const preset = whisperWordCapable().dtw ? dtwPreset(resolvedModel) : null;
  let res = run(whisper, preset ? [...baseArgs, "--dtw", preset] : baseArgs);
  if (res.status !== 0 && preset) res = run(whisper, baseArgs);
  if (res.status !== 0) fail(`whisper (word pass) failed: ${(res.stderr || res.stdout).trim().slice(-2000)}`, 1);

  const raw = readJsonOrNull(`${rawPrefix}.json`);
  if (!raw) fail(`whisper produced unreadable word JSON at ${rawPrefix}.json`, 1);
  const words = parseWhisperWords(raw);
  writeJsonAtomic(wordsJson, { file, model: basename(resolvedModel), prompt: prompt ?? null, words });
  return { files: { wordsJson, wav }, cached: false, model: resolvedModel, words };
}

// Pull existing subtitles into the standard transcript file layout.
export function transcribeFromSubtitles(file, subs, { outDir, force = false }) {
  ensureDir(outDir);
  const stem = `${basename(file, extname(file))}_${fileStamp(file)}`;
  const prefix = join(outDir, stem);
  const files = { srt: `${prefix}.srt`, txt: `${prefix}.txt`, json: null, wav: null };
  if (!force && existsSync(files.srt) && existsSync(files.txt)) {
    return { files, cached: true, source: subs.kind };
  }
  if (subs.kind === "sidecar") {
    const raw = readFileSync(subs.path, "utf8");
    writeFileSync(files.srt, raw);
    writeFileSync(files.txt, subtitleToText(raw));
  } else {
    const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
    const res = run(ffmpeg, ["-hide_banner", "-y", "-v", "error", "-i", file, "-map", `0:${subs.streamIndex}`, files.srt]);
    if (res.status !== 0) fail(`Embedded subtitle extraction failed: ${res.stderr.trim()}`, 1);
    writeFileSync(files.txt, subtitleToText(readFileSync(files.srt, "utf8")));
  }
  return { files, cached: false, source: subs.kind };
}

export async function main(argv) {
  const args = parseArgs(argv, {
    out: "string", model: "string", prompt: "string", lang: "string",
    force: "boolean", whisper: "boolean", words: "boolean",
  });
  const file = args._[0];
  if (!file) fail("Usage: ripple transcribe <file> [--out dir] [--model path] [--prompt hints] [--lang en] [--force] [--whisper] [--words]", 2);
  if (!existsSync(file)) fail(`File not found: ${file}`, 2);

  const outDir = args.out ?? join(process.cwd(), "work", "transcripts");

  // Prefer existing subtitles unless --whisper/--words forces whisper
  // (subtitles can never provide word-level timing).
  if (!args.whisper && !args.words) {
    const subs = findSubtitles(file);
    if (subs) {
      const result = transcribeFromSubtitles(file, subs, { outDir, force: args.force ?? false });
      output({
        ok: true,
        file,
        ...result,
        note: `Used existing ${result.source} subtitles — no word-level timing. Re-run with --words when cutting (precise endpoints need word timing; \`ripple analyze\` builds it plus the full timing index).`,
      });
      return;
    }
  }

  const opts = {
    outDir,
    model: args.model,
    prompt: args.prompt,
    lang: args.lang ?? "en",
    force: args.force ?? false,
  };
  const result = transcribeFile(file, opts);

  if (args.words) {
    const w = transcribeWords(file, opts);
    result.files.wordsJson = w.files.wordsJson;
    result.words = w.words.length;
  }

  output({ ok: true, file, source: "whisper", ...result });
}
