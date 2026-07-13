import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  detectHdr, ensureDir, fail, ffprobeJson, findTool, output, parseArgs, requireTool, round3, run,
} from "./util.mjs";

// ---------- pure helpers (unit-tested) ----------

export function validateManifest(manifest, baseDir = ".") {
  const errors = [];
  if (manifest.version !== 1) errors.push("manifest version must be 1");
  const scenes = manifest.scenes;
  if (!Array.isArray(scenes) || scenes.length === 0) {
    errors.push("manifest needs a non-empty scenes array");
    return errors;
  }
  const slugs = new Set();
  for (const s of scenes) {
    const where = `scene ${s.slug ?? s.id ?? "?"}`;
    if (!s.slug) errors.push(`${where}: missing slug`);
    if (s.slug && slugs.has(s.slug)) errors.push(`${where}: duplicate slug`);
    slugs.add(s.slug);
    if (!s.source) errors.push(`${where}: missing source`);
    else if (!existsSync(resolve(baseDir, s.source))) errors.push(`${where}: source not found: ${s.source}`);
    if (typeof s.start !== "number" || typeof s.end !== "number" || s.end <= s.start) {
      errors.push(`${where}: start/end invalid (start=${s.start}, end=${s.end})`);
    }
    if (s.jcut !== undefined) {
      if (!s.card) errors.push(`${where}: jcut requires a card`);
      if (typeof s.jcut === "number" && s.jcut >= s.end - s.start) errors.push(`${where}: jcut longer than the scene`);
    }
  }
  const music = manifest.music;
  if (music !== undefined) {
    if (!music || typeof music !== "object" || Array.isArray(music)) {
      errors.push("music must be an object");
    } else {
      if (!music.source) errors.push("music: missing source");
      else if (!existsSync(resolve(baseDir, music.source))) errors.push(`music: source not found: ${music.source}`);
      for (const key of ["gainDb", "fadeIn", "fadeOut", "loudnessTarget"]) {
        if (music[key] !== undefined && typeof music[key] !== "number") errors.push(`music: ${key} must be a number`);
      }
      if (music.fadeIn < 0 || music.fadeOut < 0) errors.push("music: fades must be >= 0");
    }
  }
  return errors;
}

// Assembly duration implied by the manifest: cards + bodies, minus the J-cut
// head that plays under each card. Mirrors the segment math in main().
export function assemblyDuration(scenes) {
  return round3(
    scenes.reduce((total, s) => {
      const hasCard = Boolean(s.card || s.cardFile);
      const cardDuration = hasCard ? s.cardDuration ?? 2.5 : 0;
      const jcut = s.card ? s.jcut ?? 0 : 0;
      return total + cardDuration + (s.end - s.start) - jcut;
    }, 0)
  );
}

// Music-bed filtergraph, appended after buildConcatFilter's `[v][a]`.
// Bed: format → gain → fades; dialogue splits to feed the sidechain; the bed
// ducks under speech; the mix (optionally loudness-normalized) lands on [amix].
export function buildMusicFilter(music, { inputIndex, total }) {
  const gain = music.gainDb ?? -18;
  const duck = music.duck ?? {};
  const threshold = duck.threshold ?? 0.03;
  const ratio = duck.ratio ?? 8;
  const fadeIn = music.fadeIn ?? 1.0;
  const fadeOut = music.fadeOut ?? 2.0;
  const fades =
    (fadeIn > 0 ? `,afade=t=in:d=${round3(fadeIn)}` : "") +
    (fadeOut > 0 && total > fadeOut ? `,afade=t=out:st=${round3(total - fadeOut)}:d=${round3(fadeOut)}` : "");
  const loudnorm = music.loudnessTarget !== undefined ? `,loudnorm=I=${music.loudnessTarget}:TP=-1.5:LRA=11` : "";
  return (
    `[${inputIndex}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=${gain}dB${fades}[bed];` +
    `[a]asplit=2[dlg][sc];` +
    `[bed][sc]sidechaincompress=threshold=${threshold}:ratio=${ratio}:attack=20:release=400[ducked];` +
    `[dlg][ducked]amix=inputs=2:duration=first:normalize=0${loudnorm}[amix]`
  );
}

export function buildEncodeArgs({ profile, color, encoders }) {
  const audio = ["-c:a", "aac", "-b:a", profile === "draft" ? "128k" : "160k", "-ar", "48000", "-ac", "2"];
  if (color.mode === "hdr" && encoders.hevc_videotoolbox) {
    return {
      video: [
        "-c:v", "hevc_videotoolbox", "-profile:v", "main10", "-pix_fmt", "p010le", "-tag:v", "hvc1",
        "-color_primaries", "bt2020", "-color_trc", color.transfer, "-colorspace", "bt2020nc",
        "-b:v", profile === "draft" ? "6000k" : "18000k",
      ],
      audio,
      pixFmt: "p010le",
      warning: null,
    };
  }
  if (color.mode === "hdr" && encoders.libx265) {
    return {
      video: [
        "-c:v", "libx265", "-profile:v", "main10", "-pix_fmt", "yuv420p10le", "-tag:v", "hvc1",
        "-color_primaries", "bt2020", "-color_trc", color.transfer, "-colorspace", "bt2020nc",
        "-crf", profile === "draft" ? "30" : "20", "-preset", profile === "draft" ? "ultrafast" : "medium",
      ],
      audio,
      pixFmt: "yuv420p10le",
      warning: "hevc_videotoolbox unavailable — using libx265 (slow)",
    };
  }
  const args = {
    video: [
      "-c:v", "libx264", "-crf", profile === "draft" ? "28" : "18",
      "-preset", profile === "draft" ? "veryfast" : "medium", "-pix_fmt", "yuv420p",
    ],
    audio,
    pixFmt: "yuv420p",
    warning: color.mode === "hdr" ? "no 10-bit HEVC encoder found — output is an SDR-tagged approximation; do NOT ship this as final" : null,
  };
  return args;
}

export function setparamsFilter(color) {
  if (color.mode !== "hdr") return "";
  return `,setparams=range=tv:color_primaries=bt2020:color_trc=${color.transfer}:colorspace=bt2020nc`;
}

export function buildSceneVf({ color, gradeFilter, width, height, fps, pixFmt }) {
  const grade = gradeFilter ? `,${gradeFilter}` : "";
  const size = width && height ? `,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1` : "";
  return `setpts=PTS-STARTPTS${size},fps=${fps}${grade},format=${pixFmt}${setparamsFilter(color)}`;
}

export function buildConcatFilter(n, { width, height, fps, pixFmt, color }) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push(
      `[${i}:v]setpts=PTS-STARTPTS,fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=${pixFmt}${setparamsFilter(color)}[v${i}]`,
      `[${i}:a]asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a${i}]`
    );
  }
  const pads = Array.from({ length: n }, (_, i) => `[v${i}][a${i}]`).join("");
  parts.push(`${pads}concat=n=${n}:v=1:a=1[v][a]`);
  return parts.join(";");
}

export function clipName(scene) {
  return `${String(scene.id ?? 0).padStart(2, "0")}_${scene.slug}.mp4`;
}

// ---------- impl ----------

let encoderCache = null;
function detectEncoders(ffmpeg) {
  if (encoderCache) return encoderCache;
  const res = run(ffmpeg, ["-hide_banner", "-encoders"]);
  encoderCache = {
    hevc_videotoolbox: /hevc_videotoolbox/.test(res.stdout),
    libx265: /libx265/.test(res.stdout),
    libx264: /libx264/.test(res.stdout),
  };
  return encoderCache;
}

function ffmpegOrFail(args, what) {
  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  const res = run(ffmpeg, ["-hide_banner", "-v", "error", "-y", ...args]);
  if (res.status !== 0) fail(`${what} failed: ${res.stderr.trim().slice(0, 1200)}`, 1);
}

// ImageMagick caption rendering fails without an explicit font on many
// systems (the groom-session trap, again). Resolve a real font file first.
const FONT_CANDIDATES = [
  "/System/Library/Fonts/Helvetica.ttc",
  "/System/Library/Fonts/HelveticaNeue.ttc",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/Library/Fonts/Arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
];

export function resolveCardFont(candidates = FONT_CANDIDATES) {
  return candidates.find((f) => existsSync(f)) ?? null;
}

function renderCardPng(text, { width, height, out }) {
  const magick = findTool(["magick", "convert"]);
  if (!magick) {
    fail(
      "Title cards need ImageMagick (brew install imagemagick) since this ffmpeg lacks drawtext. " +
        "Alternatively render cards via HyperFrames/Remotion and set scene.cardFile.",
      2
    );
  }
  const font = resolveCardFont();
  if (!font) {
    fail(
      "No usable font found for title cards. Set scene.cardFile to a pre-rendered image, or install " +
        "a standard font (e.g. DejaVu Sans).",
      2
    );
  }
  const pointsize = Math.round(height / 12);
  const res = run(magick, [
    "-size", `${width}x${height}`, "-background", "#111418", "-fill", "#e8e6e0",
    "-font", font, "-gravity", "center", "-pointsize", String(pointsize),
    `caption:${text}`, out,
  ]);
  if (res.status !== 0) fail(`card PNG failed: ${res.stderr.trim()}`, 1);
}

export async function main(argv) {
  const args = parseArgs(argv, {
    profile: "string", scene: "string", out: "string",
    "clips-dir": "string", "no-clips": "boolean", "no-full": "boolean",
  });
  const manifestPath = args._[0] ?? "edit.json";
  if (!existsSync(manifestPath)) fail(`Manifest not found: ${manifestPath}. Run /ripple plan first.`, 2);
  const baseDir = dirname(resolve(manifestPath));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  const errors = validateManifest(manifest, baseDir);
  if (errors.length) fail(`Manifest invalid:\n- ${errors.join("\n- ")}`, 2);

  const profile = args.profile ?? "draft";
  if (!["draft", "final"].includes(profile)) fail("--profile must be draft or final", 2);

  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  const encoders = detectEncoders(ffmpeg);

  // Color pipeline from manifest.color.source or a probe of the first source.
  const firstSource = resolve(baseDir, manifest.scenes[0].source);
  const probed = detectHdr((ffprobeJson(firstSource).streams ?? []).find((s) => s.codec_type === "video"));
  const sourceColor = manifest.color?.source ?? probed;
  const policy = manifest.color?.policy ?? (probed.hdr ? "preserve" : "sdr");
  const isHdr = policy === "preserve" && (sourceColor.color_primaries === "bt2020" || probed.hdr);
  const color = { mode: isHdr ? "hdr" : "sdr", transfer: sourceColor.color_transfer ?? "arib-std-b67" };

  // Output geometry.
  const srcVideo = (ffprobeJson(firstSource).streams ?? []).find((s) => s.codec_type === "video");
  let width = manifest.output?.width ?? Math.min(srcVideo?.width ?? 1920, 1920);
  let height = manifest.output?.height ?? Math.round((width * (srcVideo?.height ?? 1080)) / (srcVideo?.width ?? 1920));
  const fps = manifest.output?.fps ?? srcVideo?.avg_frame_rate ?? "30";
  if (profile === "draft") {
    width = Math.round(width / 4) * 2;
    height = Math.round(height / 4) * 2;
  }

  const enc = buildEncodeArgs({ profile, color, encoders });
  const gradeFilter = color.mode === "sdr" ? manifest.grade?.filter ?? null : null;
  const gradeSkipped = color.mode === "hdr" && manifest.grade?.filter
    ? "grade filter skipped: SDR grade presets on HDR footage would break color — grade HDR explicitly or deliver SDR"
    : null;

  const sceneFilter = args.scene ? new Set(args.scene.split(",").map((s) => s.trim())) : null;
  const scenes = manifest.scenes.filter((s) => !sceneFilter || sceneFilter.has(s.slug));
  if (!scenes.length) fail(`--scene matched nothing (${args.scene})`, 2);

  const clipsDir = ensureDir(resolve(baseDir, args["clips-dir"] ?? "clips"));
  const segmentsDir = ensureDir(join(baseDir, "work", "segments"));
  const cardsDir = ensureDir(join(baseDir, "work", "cards"));
  const outputsDir = ensureDir(join(baseDir, "outputs"));

  const rendered = { clips: [], segments: [], warnings: [enc.warning, gradeSkipped].filter(Boolean) };

  const geo = { color, gradeFilter, width, height, fps, pixFmt: enc.pixFmt };

  for (const scene of scenes) {
    const src = resolve(baseDir, scene.source);
    const duration = round3(scene.end - scene.start);

    // 1. Clean per-scene clip (user-facing, full bounds, no card).
    if (!args["no-clips"]) {
      const clipPath = join(clipsDir, clipName(scene));
      ffmpegOrFail(
        [
          "-ss", String(scene.start), "-t", String(duration), "-i", src,
          "-map", "0:v:0", "-map", "0:a:0",
          "-vf", buildSceneVf(geo),
          "-af", "asetpts=PTS-STARTPTS,aresample=48000",
          ...enc.video, ...enc.audio, "-movflags", "+faststart", clipPath,
        ],
        `clip ${scene.slug}`
      );
      rendered.clips.push(clipPath);
    }

    // 2. Assembly segments: optional card (with J-cut audio) + body.
    const jcut = scene.card ? scene.jcut ?? 0 : 0;
    if (scene.card || scene.cardFile) {
      const cardDuration = scene.cardDuration ?? 2.5;
      if (jcut > cardDuration) fail(`scene ${scene.slug}: jcut (${jcut}s) exceeds card duration (${cardDuration}s)`, 2);
      const png = scene.cardFile
        ? resolve(baseDir, scene.cardFile)
        : join(cardsDir, `${scene.slug}.png`);
      if (!scene.cardFile) renderCardPng(scene.card, { width, height, out: png });

      const cardPath = join(segmentsDir, `${clipName(scene).replace(".mp4", "")}_card.mp4`);
      const fadeD = Math.min(0.4, cardDuration / 4);
      const cardVf = `fps=${fps},scale=${width}:${height},setsar=1,fade=t=in:d=${fadeD},fade=t=out:st=${round3(cardDuration - fadeD)}:d=${fadeD},format=${enc.pixFmt}${setparamsFilter(color)}`;
      if (jcut > 0) {
        // Card audio = silence, then the scene's first `jcut` seconds of audio under the card tail.
        ffmpegOrFail(
          [
            "-loop", "1", "-t", String(cardDuration), "-i", png,
            "-ss", String(scene.start), "-t", String(jcut), "-i", src,
            "-filter_complex",
            `[0:v]${cardVf}[v];` +
              `aevalsrc=0:d=${round3(cardDuration - jcut)}:s=48000[sil];` +
              `[1:a]asetpts=PTS-STARTPTS,aresample=48000[ja];` +
              `[sil][ja]concat=n=2:v=0:a=1,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a]`,
            "-map", "[v]", "-map", "[a]",
            ...enc.video, ...enc.audio, "-movflags", "+faststart", cardPath,
          ],
          `card ${scene.slug}`
        );
      } else {
        ffmpegOrFail(
          [
            "-loop", "1", "-t", String(cardDuration), "-i", png,
            "-f", "lavfi", "-t", String(cardDuration), "-i", "anullsrc=r=48000:cl=stereo",
            "-vf", cardVf, "-map", "0:v", "-map", "1:a",
            ...enc.video, ...enc.audio, "-movflags", "+faststart", cardPath,
          ],
          `card ${scene.slug}`
        );
      }
      rendered.segments.push(cardPath);
    }

    if (jcut > 0) {
      // Body starts after the J-cut head that already played under the card.
      const bodyPath = join(segmentsDir, `${clipName(scene).replace(".mp4", "")}_body.mp4`);
      ffmpegOrFail(
        [
          "-ss", String(round3(scene.start + jcut)), "-t", String(round3(duration - jcut)), "-i", src,
          "-map", "0:v:0", "-map", "0:a:0",
          "-vf", buildSceneVf(geo),
          "-af", "asetpts=PTS-STARTPTS,aresample=48000",
          ...enc.video, ...enc.audio, "-movflags", "+faststart", bodyPath,
        ],
        `body ${scene.slug}`
      );
      rendered.segments.push(bodyPath);
    } else if (!args["no-clips"]) {
      rendered.segments.push(join(clipsDir, clipName(scene)));
    } else {
      const bodyPath = join(segmentsDir, clipName(scene));
      ffmpegOrFail(
        [
          "-ss", String(scene.start), "-t", String(duration), "-i", src,
          "-map", "0:v:0", "-map", "0:a:0",
          "-vf", buildSceneVf(geo),
          "-af", "asetpts=PTS-STARTPTS,aresample=48000",
          ...enc.video, ...enc.audio, "-movflags", "+faststart", bodyPath,
        ],
        `segment ${scene.slug}`
      );
      rendered.segments.push(bodyPath);
    }
  }

  // 3. Full assembly: decode every segment, concat once, single clean encode.
  // The music bed (manifest.music) exists only here — clips and segments stay
  // clean so the bed can change without touching a single cut.
  const music = manifest.music ?? null;
  let finalPath = null;
  if (!args["no-full"] && !sceneFilter) {
    const slug = (manifest.title ?? "final").toLowerCase().replace(/[^a-z0-9]+/g, "_");
    finalPath = args.out ?? join(outputsDir, `${slug}_${profile}.mp4`);
    const inputs = rendered.segments.flatMap((s) => ["-i", s]);
    let filter = buildConcatFilter(rendered.segments.length, { width, height, fps, pixFmt: enc.pixFmt, color });
    let audioLabel = "[a]";
    if (music) {
      const musicPath = resolve(baseDir, music.source);
      const total = assemblyDuration(manifest.scenes);
      const bedDuration = Number(ffprobeJson(musicPath).format?.duration ?? 0);
      if (bedDuration && bedDuration + 0.05 < total) {
        rendered.warnings.push(
          `music bed is ${round3(bedDuration)}s but the assembly is ~${total}s — the bed ends early; regenerate at length`
        );
      }
      inputs.push("-i", musicPath);
      filter += ";" + buildMusicFilter(music, { inputIndex: rendered.segments.length, total });
      audioLabel = "[amix]";
    }
    ffmpegOrFail(
      [
        ...inputs,
        "-filter_complex", filter,
        "-map", "[v]", "-map", audioLabel,
        ...enc.video, ...enc.audio, "-movflags", "+faststart", finalPath,
      ],
      "assembly"
    );
  } else if (music) {
    rendered.warnings.push("music bed applies to the full assembly only — this scene-subset render has no bed");
  }

  output({
    ok: true,
    profile,
    color: { policy, mode: color.mode, transfer: color.mode === "hdr" ? color.transfer : null },
    geometry: { width, height, fps },
    scenes: scenes.map((s) => s.slug),
    clips: rendered.clips,
    segments: args["no-full"] || sceneFilter ? rendered.segments : undefined,
    final: finalPath,
    music: music ? { source: music.source, applied: Boolean(finalPath) } : undefined,
    warnings: rendered.warnings,
    next: finalPath
      ? `Run: ripple qa ${finalPath} --manifest ${manifestPath}  — then READ a frame sheet of it.`
      : "Scene subset rendered. Re-run without --scene/--no-full to assemble, then qa the result.",
  });
}
