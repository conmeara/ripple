import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import {
  ensureDir, fail, fileStamp, findTool, output, parseArgs, requireTool, run,
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
    const bins = readdirSync(dir).filter((f) => f.endsWith(".bin")).sort();
    const preferred = bins.find((f) => f.includes("base.en")) ?? bins[0];
    if (preferred) return join(dir, preferred);
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

  const extract = run(ffmpeg, [
    "-hide_banner", "-y", "-v", "error",
    "-i", file, "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-vn", wav,
  ]);
  if (extract.status !== 0) fail(`Audio extraction failed: ${extract.stderr.trim()}`, 1);

  const whisperArgs = [
    "-m", resolvedModel, "-f", wav, "-l", lang,
    "-oj", "-osrt", "-otxt", "-of", prefix,
  ];
  if (prompt) whisperArgs.push("--prompt", prompt);
  const res = run(whisper, whisperArgs);
  if (res.status !== 0) fail(`whisper failed: ${(res.stderr || res.stdout).trim().slice(-2000)}`, 1);

  return { files, cached: false, model: resolvedModel };
}

export async function main(argv) {
  const args = parseArgs(argv, {
    out: "string", model: "string", prompt: "string", lang: "string", force: "boolean",
  });
  const file = args._[0];
  if (!file) fail("Usage: ripple transcribe <file> [--out dir] [--model path] [--prompt hints] [--lang en] [--force]", 2);
  if (!existsSync(file)) fail(`File not found: ${file}`, 2);

  const result = transcribeFile(file, {
    outDir: args.out ?? join(process.cwd(), "work", "transcripts"),
    model: args.model,
    prompt: args.prompt,
    lang: args.lang ?? "en",
    force: args.force ?? false,
  });

  output({ ok: true, file, ...result });
}
