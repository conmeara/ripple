import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { dtwPreset, parseWhisperWords } from "./timing.mjs";
import {
  ensureDir, extractWav16k, fail, ffprobeJson, fileStamp, findTool, output, parseArgs,
  parseSilence, readJsonOrNull, requireTool, round3, run, writeJsonAtomic,
} from "./util.mjs";

// Bump whenever transcription inputs, chunk planning, or merge semantics
// change. The source stamp alone cannot distinguish an old whole-file pass
// from the drift-resistant chunked pipeline.
export const TRANSCRIPTION_CACHE_VERSION = 2;
export const VAD_CHUNK_THRESHOLD_SEC = 60;
export const VAD_CHUNK_MAX_SEC = 30;
const VAD_MIN_FINAL_CHUNK_SEC = 10;
const VAD_SILENCE_DB = -40;
const VAD_SILENCE_MIN_SEC = 0.25;

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

// Plan contiguous, non-overlapping ownership windows. For every full window,
// use the latest available point inside measured silence; if the window has no
// silence, hard-split at 30s. Since a sample belongs to exactly one window,
// chunk-edge output cannot be duplicated. Silence boundaries keep speech from
// being cut in the common case.
export function planVadChunks(duration, silences, {
  thresholdSec = VAD_CHUNK_THRESHOLD_SEC,
  maxSec = VAD_CHUNK_MAX_SEC,
} = {}) {
  if (duration < thresholdSec) {
    return { mode: "single", chunks: [{ start: 0, end: round3(duration), boundary: "eof" }] };
  }

  const chunks = [];
  let start = 0;
  while (duration - start > 0.001) {
    const hardEnd = Math.min(duration, start + maxSec);
    if (hardEnd >= duration - 0.001) {
      chunks.push({ start: round3(start), end: round3(duration), boundary: "eof" });
      break;
    }

    let silenceEnd = null;
    // A greedy boundary near EOF can leave a tiny final chunk made almost
    // entirely of trailing silence. Whisper then hallucinates across that
    // silence without the preceding speech context. When possible, choose an
    // earlier silence so the final chunk owns at least 10s.
    const silenceWindowEnd = duration - hardEnd < VAD_MIN_FINAL_CHUNK_SEC
      ? Math.max(start, duration - VAD_MIN_FINAL_CHUNK_SEC)
      : hardEnd;
    for (const silence of silences) {
      const spanStart = Math.max(start, silence.start);
      const spanEnd = Math.min(silenceWindowEnd, silence.end ?? duration);
      const width = spanEnd - spanStart;
      if (width <= 0.02) continue;
      const pad = Math.min(0.05, width / 4);
      // Cut just inside silence onset. The outgoing chunk keeps the word
      // before the pause; the incoming chunk keeps almost all of the pause as
      // context before speech resumes. A midpoint cut can starve that next
      // chunk and drop its first small word (observed: "in" after "hand").
      const candidate = spanStart + pad;
      if (candidate <= start + 0.25) continue;
      if (silenceEnd === null || candidate > silenceEnd) silenceEnd = candidate;
    }

    const end = round3(silenceEnd ?? hardEnd);
    // Rounding must never stall the planner or create a >maxSec chunk.
    const safeEnd = end > start ? Math.min(end, round3(hardEnd)) : round3(hardEnd);
    chunks.push({ start: round3(start), end: safeEnd, boundary: silenceEnd === null ? "hard" : "silence" });
    start = safeEnd;
  }
  return { mode: "chunked", chunks };
}

function mediaDuration(file) {
  const duration = Number(ffprobeJson(file).format?.duration ?? 0);
  if (!duration) fail(`Could not read duration of ${file}`, 1);
  return round3(duration);
}

function detectChunkSilences(ffmpeg, wav) {
  const res = run(ffmpeg, [
    "-hide_banner", "-nostats", "-i", wav,
    "-af", `silencedetect=noise=${VAD_SILENCE_DB}dB:d=${VAD_SILENCE_MIN_SEC}`,
    "-f", "null", "-",
  ]);
  if (res.status !== 0) fail(`silencedetect for transcription chunks failed: ${res.stderr.trim().slice(-500)}`, 1);
  return parseSilence(res.stderr).map((span) => ({
    start: round3(Math.max(0, span.start)),
    end: span.end === null ? null : round3(span.end),
  }));
}

function cacheDescriptor({ mode, chunks, model, prompt, lang }) {
  return {
    transcriptionCacheVersion: TRANSCRIPTION_CACHE_VERSION,
    mode,
    chunkMaxSec: mode === "chunked" ? VAD_CHUNK_MAX_SEC : null,
    chunks: chunks.map(({ start, end, boundary }) => ({ start, end, boundary })),
    model: basename(model),
    prompt: prompt ?? null,
    lang,
  };
}

export function transcriptionCacheMatches(raw, { mode, model, prompt, lang }) {
  const cached = raw?.ripple;
  return Boolean(
    cached?.transcriptionCacheVersion === TRANSCRIPTION_CACHE_VERSION &&
    cached.mode === mode &&
    cached.model === basename(model) &&
    cached.prompt === (prompt ?? null) &&
    cached.lang === lang
  );
}

const whisperTimestamp = (ms) => {
  const whole = Math.max(0, Math.round(ms));
  const hours = Math.floor(whole / 3_600_000);
  const minutes = Math.floor((whole % 3_600_000) / 60_000);
  const seconds = Math.floor((whole % 60_000) / 1000);
  const millis = whole % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
};

// Add each chunk's absolute anchor to whisper-cpp's local millisecond
// offsets. Clamp model padding to the owned window so one chunk can never
// spill timestamps into its neighbor.
export function mergeChunkJson(parts) {
  const first = parts[0]?.raw ?? {};
  const transcription = [];
  for (const { chunk, raw } of parts) {
    const chunkMs = Math.round((chunk.end - chunk.start) * 1000);
    const offsetMs = Math.round(chunk.start * 1000);
    for (const segment of raw?.transcription ?? []) {
      const rawFrom = Math.max(0, Number(segment.offsets?.from ?? 0));
      // whisper pads short inputs internally and can emit tokens starting at
      // 30s+ even when the owned audio ends sooner. The next chunk owns that
      // boundary (or EOF owns nothing), so retaining those tokens creates
      // duplicates/hallucinations at the merge seam.
      if (rawFrom >= chunkMs) continue;
      const localFrom = Math.min(chunkMs, rawFrom);
      const localTo = Math.min(chunkMs, Math.max(localFrom, Number(segment.offsets?.to ?? localFrom)));
      const from = offsetMs + localFrom;
      const to = offsetMs + localTo;
      transcription.push({
        ...segment,
        timestamps: { from: whisperTimestamp(from), to: whisperTimestamp(to) },
        offsets: { from, to },
      });
    }
  }
  return { ...first, transcription };
}

function extractChunk(ffmpeg, wav, chunk, path) {
  return run(ffmpeg, [
    "-hide_banner", "-y", "-v", "error",
    "-ss", String(chunk.start), "-i", wav,
    "-t", String(round3(chunk.end - chunk.start)),
    "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-vn", path,
  ]);
}

function runChunkedWhisper({ ffmpeg, whisper, wav, chunks, whisperArgs }) {
  const tempDir = mkdtempSync(join(tmpdir(), "ripple-whisper-chunks-"));
  const parts = [];
  let error = null;
  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkWav = join(tempDir, `chunk-${String(i).padStart(3, "0")}.wav`);
      const extracted = extractChunk(ffmpeg, wav, chunk, chunkWav);
      if (extracted.status !== 0) {
        error = `audio chunk extraction failed at ${chunk.start}s: ${extracted.stderr.trim().slice(-1000)}`;
        break;
      }
      const rawPrefix = join(tempDir, `chunk-${String(i).padStart(3, "0")}`);
      const res = whisperArgs(chunkWav, rawPrefix);
      if (res.status !== 0) {
        error = `whisper failed on chunk ${i + 1}/${chunks.length} (${chunk.start}-${chunk.end}s): ${(res.stderr || res.stdout).trim().slice(-2000)}`;
        break;
      }
      const raw = readJsonOrNull(`${rawPrefix}.json`);
      if (!raw) {
        error = `whisper produced unreadable chunk JSON at ${rawPrefix}.json`;
        break;
      }
      parts.push({ chunk, raw });
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  return { raw: error ? null : mergeChunkJson(parts), error };
}

function readableTranscriptArtifacts(raw, files) {
  const segments = (raw.transcription ?? []).filter((segment) => (segment.text ?? "").trim());
  writeJsonAtomic(files.json, raw);
  writeFileSync(files.txt, segments.map((segment) => segment.text).join("\n") + (segments.length ? "\n" : ""));
  writeFileSync(files.srt, segments.map((segment, i) =>
    `${i + 1}\n${segment.timestamps.from} --> ${segment.timestamps.to}\n${segment.text}\n`
  ).join("\n"));
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

  const duration = mediaDuration(file);
  const mode = duration < VAD_CHUNK_THRESHOLD_SEC ? "single" : "chunked";

  if (!force && existsSync(files.json) && existsSync(files.srt) && existsSync(files.txt)) {
    const cached = readJsonOrNull(files.json);
    if (transcriptionCacheMatches(cached, { mode, model: resolvedModel, prompt, lang })) {
      return { files, cached: true, model: resolvedModel };
    }
  }

  extractWav16k(file, wav, { force });

  if (mode === "chunked") {
    const plan = planVadChunks(duration, detectChunkSilences(ffmpeg, wav));
    const result = runChunkedWhisper({
      ffmpeg, whisper, wav, chunks: plan.chunks,
      whisperArgs: (chunkWav, rawPrefix) => {
        const args = ["-m", resolvedModel, "-f", chunkWav, "-l", lang, "-oj", "-of", rawPrefix];
        if (prompt) args.push("--prompt", prompt);
        return run(whisper, args);
      },
    });
    if (result.error) fail(result.error, 1);
    result.raw.ripple = cacheDescriptor({ ...plan, model: resolvedModel, prompt, lang });
    readableTranscriptArtifacts(result.raw, files);
    return { files, cached: false, model: resolvedModel };
  }

  const whisperArgs = [
    "-m", resolvedModel, "-f", wav, "-l", lang,
    "-oj", "-osrt", "-otxt", "-of", prefix,
  ];
  if (prompt) whisperArgs.push("--prompt", prompt);
  const res = run(whisper, whisperArgs);
  if (res.status !== 0) fail(`whisper failed: ${(res.stderr || res.stdout).trim().slice(-2000)}`, 1);

  const raw = readJsonOrNull(files.json);
  if (!raw) fail(`whisper produced unreadable JSON at ${files.json}`, 1);
  const plan = planVadChunks(duration, []);
  raw.ripple = cacheDescriptor({ ...plan, model: resolvedModel, prompt, lang });
  writeJsonAtomic(files.json, raw);

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

  const duration = mediaDuration(file);
  const mode = duration < VAD_CHUNK_THRESHOLD_SEC ? "single" : "chunked";

  if (!force) {
    const cached = readJsonOrNull(wordsJson);
    if (cached?.words && transcriptionCacheMatches(cached, { mode, model: resolvedModel, prompt, lang })) {
      return {
        files: { wordsJson, wav }, cached: true, model: resolvedModel,
        words: cached.words, timingMode: cached.ripple.mode, chunks: cached.ripple.chunks,
      };
    }
  }

  extractWav16k(file, wav, { force });

  const rawPrefix = join(outDir, `${stem}.words-raw`);
  // Token-level DTW alignment when this build and model support it; a build
  // that chokes on it falls back to plain -ml 1 -sow rather than failing.
  const preset = whisperWordCapable().dtw ? dtwPreset(resolvedModel) : null;
  const runWordPass = (chunkWav, prefix) => {
    const baseArgs = ["-m", resolvedModel, "-f", chunkWav, "-l", lang, "-ml", "1", "-sow", "-oj", "-of", prefix];
    if (prompt) baseArgs.push("--prompt", prompt);
    let res = run(whisper, preset ? [...baseArgs, "--dtw", preset] : baseArgs);
    if (res.status !== 0 && preset) res = run(whisper, baseArgs);
    return res;
  };

  let raw;
  let plan;
  if (mode === "chunked") {
    plan = planVadChunks(duration, detectChunkSilences(ffmpeg, wav));
    const result = runChunkedWhisper({
      ffmpeg, whisper, wav, chunks: plan.chunks,
      whisperArgs: runWordPass,
    });
    if (result.error) fail(result.error.replace("whisper failed", "whisper (word pass) failed"), 1);
    raw = result.raw;
    raw.ripple = cacheDescriptor({ ...plan, model: resolvedModel, prompt, lang });
    writeJsonAtomic(`${rawPrefix}.json`, raw);
  } else {
    plan = planVadChunks(duration, []);
    const res = runWordPass(wav, rawPrefix);
    if (res.status !== 0) fail(`whisper (word pass) failed: ${(res.stderr || res.stdout).trim().slice(-2000)}`, 1);
    raw = readJsonOrNull(`${rawPrefix}.json`);
  }
  if (!raw) fail(`whisper produced unreadable word JSON at ${rawPrefix}.json`, 1);
  const words = parseWhisperWords(raw);
  writeJsonAtomic(wordsJson, {
    file,
    model: basename(resolvedModel),
    prompt: prompt ?? null,
    lang,
    ripple: cacheDescriptor({ ...plan, model: resolvedModel, prompt, lang }),
    words,
  });
  return {
    files: { wordsJson, wav }, cached: false, model: resolvedModel,
    words, timingMode: plan.mode, chunks: plan.chunks,
  };
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
