import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  detectHdr, fail, ffprobeJson, output, parseArgs, parseSilence, requireTool, round3, run, silenceEdges,
} from "./util.mjs";

const DEFAULT_LEAK_PATTERNS = ["next question", "take [0-9]"];

function check(id, ok, detail) {
  return { id, ok: Boolean(ok), detail };
}

export async function main(argv) {
  const args = parseArgs(argv, {
    manifest: "string", "clips-dir": "string", "expect-clips": "number",
    transcript: "string", "max-tail-silence": "number", "max-leading-silence": "number",
    "no-snapshot": "boolean",
  });
  const file = args._[0];
  if (!file) fail("Usage: ripple qa <file> [--manifest edit.json] [--clips-dir clips] [--expect-clips N] [--transcript path] [--max-tail-silence 1.0] [--max-leading-silence 0.5]", 2);
  if (!existsSync(file)) fail(`File not found: ${file}`, 2);

  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  const checks = [];

  let manifest = null;
  if (args.manifest) {
    if (!existsSync(args.manifest)) fail(`Manifest not found: ${args.manifest}`, 2);
    manifest = JSON.parse(readFileSync(args.manifest, "utf8"));
  }
  const maxTail = args["max-tail-silence"] ?? manifest?.qa?.maxTailSilence ?? 1.0;
  const maxLeading = args["max-leading-silence"] ?? manifest?.qa?.maxLeadingSilence ?? 0.5;

  // 1. Full decode.
  const decode = run(ffmpeg, ["-hide_banner", "-v", "error", "-i", file, "-f", "null", "-"]);
  const decodeErrors = decode.stderr.trim();
  checks.push(check("decode", decode.status === 0 && !decodeErrors, decodeErrors ? decodeErrors.slice(0, 500) : "clean full decode"));

  // 2. Probe + color policy.
  const probe = ffprobeJson(file);
  const video = (probe.streams ?? []).find((s) => s.codec_type === "video");
  const color = detectHdr(video);
  const duration = Number(probe.format?.duration ?? 0);
  checks.push(check("probe", Boolean(video) && duration > 0, {
    duration: round3(duration),
    codec: video?.codec_name,
    profile: video?.profile,
    resolution: video ? `${video.width}x${video.height}` : null,
    color,
  }));
  const policy = manifest?.color?.policy;
  if (policy === "preserve" && manifest?.color?.source) {
    const sourceWasHdr =
      manifest.color.source.color_primaries === "bt2020" ||
      manifest.color.source.color_transfer === "arib-std-b67" ||
      manifest.color.source.color_transfer === "smpte2084";
    if (sourceWasHdr) {
      checks.push(check("color-policy", color.hdr,
        color.hdr ? `HDR preserved (${color.kind})` : `RELEASE BLOCKER: source was HDR but output is ${color.kind} — accidental SDR conversion`));
    }
  } else if (policy === "sdr") {
    checks.push(check("color-policy", !color.hdr,
      color.hdr ? "policy is sdr but output carries HDR metadata" : "SDR delivery as specified"));
  }

  // 3. Clip inventory + decode.
  const clipsDir = args["clips-dir"];
  const expected = args["expect-clips"] ?? manifest?.scenes?.length;
  if (clipsDir && existsSync(clipsDir)) {
    const clips = readdirSync(clipsDir).filter((f) => /\.(mp4|mov|webm)$/i.test(f)).sort();
    if (expected !== undefined) {
      checks.push(check("clip-count", clips.length === expected, `${clips.length}/${expected} clips in ${clipsDir}`));
    }
    let badClips = [];
    for (const clip of clips) {
      const res = run(ffmpeg, ["-hide_banner", "-v", "error", "-i", join(clipsDir, clip), "-f", "null", "-"]);
      if (res.status !== 0 || res.stderr.trim()) badClips.push(clip);
    }
    checks.push(check("clip-decode", badClips.length === 0, badClips.length ? `decode errors: ${badClips.join(", ")}` : `all ${clips.length} clips decode cleanly`));
  }

  // 4. Leading/tail silence of the final.
  const silenceRes = run(ffmpeg, [
    "-hide_banner", "-nostats", "-i", file,
    "-vn", "-af", "silencedetect=noise=-40dB:d=0.25", "-f", "null", "-",
  ]);
  const edges = silenceEdges(parseSilence(silenceRes.stderr), duration);
  checks.push(check("leading-silence", edges.leading <= maxLeading, `${edges.leading}s (max ${maxLeading}s)`));
  checks.push(check("tail-silence", edges.tail <= maxTail, `${edges.tail}s (max ${maxTail}s)`));

  // 5. Transcript content gates.
  if (args.transcript && existsSync(args.transcript)) {
    const text = readFileSync(args.transcript, "utf8");
    const leakPatterns = manifest?.qa?.leakPatterns ?? DEFAULT_LEAK_PATTERNS;
    const leaks = leakPatterns.filter((p) => new RegExp(p, "i").test(text));
    checks.push(check("prompt-leak", leaks.length === 0, leaks.length ? `leaked: ${leaks.join(" | ")}` : "no prompt/take leakage"));
    const endings = (manifest?.scenes ?? []).filter((s) => s.expectEnding);
    if (endings.length) {
      const missing = endings.filter((s) => !text.toLowerCase().includes(s.expectEnding.toLowerCase()));
      checks.push(check("scene-endings", missing.length === 0,
        missing.length ? `missing endings: ${missing.map((s) => s.slug).join(", ")}` : `all ${endings.length} expected endings present`));
    }
  } else {
    checks.push(check("transcript-gates", true, "skipped — pass --transcript qa/final_transcript.txt to enable prompt-leak and ending checks"));
  }

  const passed = checks.filter((c) => c.ok).length;
  const ok = passed === checks.length;

  // Snapshot + trend.
  let trend = null;
  if (!args["no-snapshot"]) {
    const qaDir = join(process.cwd(), ".ripple", "qa");
    mkdirSync(qaDir, { recursive: true });
    const previous = readdirSync(qaDir).filter((f) => f.startsWith("qa-")).sort().slice(-4);
    trend = previous.map((f) => {
      try {
        const snap = JSON.parse(readFileSync(join(qaDir, f), "utf8"));
        return `${snap.passed}/${snap.total}`;
      } catch {
        return "?";
      }
    });
    trend.push(`${passed}/${checks.length} (this run)`);
    writeFileSync(
      join(qaDir, `qa-${Date.now()}.json`),
      JSON.stringify({ file, timestamp: new Date().toISOString(), passed, total: checks.length, checks }, null, 2)
    );
  }

  output({ ok, file, passed: `${passed}/${checks.length}`, checks, trend });
  if (!ok) process.exit(1);
}
