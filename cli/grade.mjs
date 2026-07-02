import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detectHdr, ensureDir, fail, ffprobeJson, output, parseArgs, requireTool, run } from "./util.mjs";

// Grading is config, not timeline work: each preset is an ffmpeg filter chain.
// Compare on stills of the SAME frame; only then render. SDR presets only —
// grading HDR requires an explicit HDR-aware pipeline.
export const PRESETS = {
  neutral: null,
  warm: "colorbalance=rs=.08:rm=.04:bs=-.06,eq=saturation=1.08",
  cool: "colorbalance=rs=-.06:bs=.08,eq=saturation=1.02",
  punchy: "eq=contrast=1.12:saturation=1.25:brightness=0.01",
  film: "curves=all='0/0.06 0.5/0.5 1/0.96',eq=saturation=0.9:contrast=1.04",
  bw: "hue=s=0,eq=contrast=1.06",
};

export async function main(argv) {
  const args = parseArgs(argv, {
    at: "number", variants: "string", out: "string", choose: "string", manifest: "string",
  });
  const file = args._[0];
  if (!file) {
    fail(
      `Usage: ripple grade <file> [--at seconds] [--variants ${Object.keys(PRESETS).join(",")}] [--out dir]\n` +
        "       ripple grade <file> --choose <preset> [--manifest edit.json]\n" +
        "Generates same-frame stills per grading preset for visual comparison; --choose records the pick.",
      2
    );
  }
  if (!existsSync(file)) fail(`File not found: ${file}`, 2);

  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  const probe = ffprobeJson(file);
  const color = detectHdr((probe.streams ?? []).find((s) => s.codec_type === "video"));
  if (color.hdr) {
    fail(
      "Source is HDR — these SDR presets would break its color. Either deliver SDR first (tone-map " +
        "explicitly, see /ripple finish) or grade in an HDR-aware tool.",
      2
    );
  }

  // Record a chosen preset into the manifest.
  if (args.choose) {
    const preset = PRESETS[args.choose];
    if (preset === undefined) fail(`Unknown preset: ${args.choose}. Options: ${Object.keys(PRESETS).join(", ")}`, 2);
    const manifestPath = args.manifest ?? "edit.json";
    if (!existsSync(manifestPath)) fail(`Manifest not found: ${manifestPath}`, 2);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.grade = { name: args.choose, filter: preset };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    output({
      ok: true,
      chosen: args.choose,
      filter: preset,
      manifest: manifestPath,
      next: "Re-render with `ripple cut <manifest> --profile final` — the grade applies to the final encode.",
    });
    return;
  }

  const duration = Number(probe.format?.duration ?? 0);
  const at = args.at ?? Math.max(0, duration * 0.4);
  const names = (args.variants ?? "neutral,warm,cool,punchy,film").split(",").map((v) => v.trim());
  for (const n of names) if (PRESETS[n] === undefined) fail(`Unknown preset: ${n}. Options: ${Object.keys(PRESETS).join(", ")}`, 2);

  const outDir = ensureDir(args.out ?? join(process.cwd(), "qa", "grades"));
  const stills = {};
  names.forEach((name, i) => {
    const still = join(outDir, `v${i}_${name}.png`);
    const vf = PRESETS[name] ? `${PRESETS[name]},scale=640:-1` : "scale=640:-1";
    const res = run(ffmpeg, [
      "-hide_banner", "-v", "error", "-y",
      "-ss", String(at), "-i", file, "-vf", vf, "-frames:v", "1", still,
    ]);
    if (res.status !== 0) fail(`grade still (${name}) failed: ${res.stderr.trim()}`, 1);
    stills[name] = still;
  });

  // One contact sheet, variants in listed order.
  const sheet = join(outDir, "grade_contact.jpg");
  const res = run(ffmpeg, [
    "-hide_banner", "-v", "error", "-y",
    "-framerate", "1", "-pattern_type", "glob", "-i", join(outDir, "v*_*.png"),
    "-vf", `tile=${names.length}x1:padding=8:margin=8:color=0x1a1a1a`,
    "-frames:v", "1", sheet,
  ]);
  if (res.status !== 0) fail(`grade contact sheet failed: ${res.stderr.trim()}`, 1);

  output({
    ok: true,
    file,
    frameAt: at,
    order: names,
    stills,
    contactSheet: sheet,
    next: "READ the contact sheet (left→right matches `order`), pick with the user, then `ripple grade <file> --choose <preset>`.",
  });
}
