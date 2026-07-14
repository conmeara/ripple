import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { findTool, output, run } from "./util.mjs";
import { resolveModel, resolveTdrzModel } from "./transcribe.mjs";

// One-shot environment check: everything ripple needs, with the fix for
// anything missing. Run this before a first edit on a new machine.
export async function main() {
  const checks = [];
  const add = (id, ok, detail, hint) => checks.push({ id, ok, detail, ...(ok ? {} : { hint }) });

  const ffmpeg = findTool(["ffmpeg"]);
  const ffprobe = findTool(["ffprobe"]);
  add("ffmpeg", Boolean(ffmpeg), ffmpeg ?? "not found", "brew install ffmpeg");
  add("ffprobe", Boolean(ffprobe), ffprobe ?? "not found", "brew install ffmpeg");

  if (ffmpeg) {
    const filters = run(ffmpeg, ["-hide_banner", "-filters"]).stdout;
    const encoders = run(ffmpeg, ["-hide_banner", "-encoders"]).stdout;
    add(
      "drawtext-filter",
      /\sdrawtext\s/.test(filters),
      /\sdrawtext\s/.test(filters) ? "available" : "missing (common)",
      "Title cards will use ImageMagick or HyperFrames/Remotion instead — install ImageMagick: brew install imagemagick"
    );
    add("libx264", /libx264/.test(encoders), /libx264/.test(encoders) ? "available" : "missing", "reinstall ffmpeg with libx264");
    const hevcVt = /hevc_videotoolbox/.test(encoders);
    const x265 = /libx265/.test(encoders);
    add(
      "hdr-encoder",
      hevcVt || x265,
      hevcVt ? "hevc_videotoolbox (hardware)" : x265 ? "libx265 (software, slow)" : "none",
      "HDR-preserving exports need hevc_videotoolbox (macOS) or libx265"
    );
  }

  const magick = findTool(["magick", "convert"]);
  add("imagemagick", Boolean(magick), magick ?? "not found", "brew install imagemagick (title-card fallback)");

  const whisper = findTool(["whisper-cli", "whisper-cpp", "main"]);
  add("whisper-cpp", Boolean(whisper), whisper ?? "not found", "brew install whisper-cpp");
  if (whisper) {
    const help = run(whisper, ["--help"]);
    const sow = /--split-on-word/.test(help.stdout + help.stderr);
    add(
      "word-timing",
      sow,
      sow ? "split-on-word supported (word-level timing available)" : "whisper build lacks --split-on-word",
      "update whisper-cpp (brew upgrade whisper-cpp) — word-level cut timing needs it"
    );
  }
  const model = resolveModel(null);
  add(
    "whisper-model",
    Boolean(model),
    model ?? `none in ./models or ${join(homedir(), ".ripple", "models")}`,
    "mkdir -p ~/.ripple/models && curl -L --fail -o ~/.ripple/models/ggml-base.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"
  );
  const tdrz = resolveTdrzModel();
  add(
    "tdrz-model",
    Boolean(tdrz),
    tdrz ?? "not installed (optional: speaker-turn markers in the index)",
    "curl -L --fail -o ~/.ripple/models/ggml-small.en-tdrz.bin https://huggingface.co/akashmjn/tinydiarize-whisper.cpp/resolve/main/ggml-small.en-tdrz.bin  # 465 MB; detects conversational hand-offs, not quiet off-camera interviewers"
  );

  const major = Number(process.versions.node.split(".")[0]);
  add("node", major >= 20, `v${process.versions.node}`, "Node 20+ required");

  const required = ["ffmpeg", "ffprobe", "node"];
  const ok = checks.filter((c) => required.includes(c.id)).every((c) => c.ok);
  // Optional pieces don't hold readiness hostage: tdrz is an optional tier,
  // and missing drawtext is fully covered when ImageMagick is present.
  const optional = new Set(["tdrz-model", ...(magick ? ["drawtext-filter"] : [])]);
  const ready = checks.filter((c) => !optional.has(c.id)).every((c) => c.ok);

  output({
    ok,
    ready,
    checks,
    summary: ready
      ? "Everything ripple uses is available."
      : ok
        ? "Core tools present. Optional pieces missing — transcript-driven editing and/or title cards will prompt for setup when first needed."
        : "Missing required tools — fix the hints above before editing.",
  });
  if (!ok) process.exit(1);
}
