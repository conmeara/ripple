#!/usr/bin/env node
// Rebuild the public timeline-sheet image from synthetic media only.
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCardFont } from "../cli/cut.mjs";
import { renderSheet } from "../cli/timeline-sheet.mjs";
import { findTool, run } from "../cli/util.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ffmpeg = findTool(["ffmpeg"]);
const magick = findTool(["magick", "convert"]);
const font = resolveCardFont();

if (!ffmpeg || !magick || !font) {
  throw new Error("Generating the public screenshot needs ffmpeg, ImageMagick, and a standard font.");
}

function checked(command, args, label) {
  const result = run(command, args);
  if (result.status !== 0) throw new Error(`${label}: ${result.stderr.trim()}`);
}

const scratch = mkdtempSync(join(tmpdir(), "ripple-public-timeline-"));
const source = join(scratch, "synthetic-source.mp4");
const sheet = join(scratch, "timeline-sheet.png");
const legend = join(scratch, "legend.png");
const composed = join(scratch, "timeline-with-legend.png");

try {
  checked(ffmpeg, [
    "-hide_banner", "-v", "error", "-y",
    "-f", "lavfi", "-i",
    "gradients=size=1280x720:rate=30:duration=12:c0=0x0f766e:c1=0x312e81:c2=0xc2410c:c3=0x0f172a:nb_colors=4:type=spiral:speed=0.08:x0=640:y0=360:x1=1280:y1=720:seed=4242",
    "-f", "lavfi", "-i",
    String.raw`aevalsrc=(0.025+0.075*abs(sin(2*PI*2.3*t))*abs(sin(2*PI*0.41*t+0.7)))*(sin(2*PI*180*t)+0.45*sin(2*PI*360*t))*if(between(t\,0.3\,3.9)+between(t\,5.1\,8.8)+between(t\,9.7\,11.5)\,1\,0):s=48000:d=12`,
    "-shortest", "-c:v", "libx264", "-preset", "fast", "-crf", "20",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", source,
  ], "synthetic media render failed");

  const words = [
    [0.55, 0.95, "shape"], [1.05, 1.35, "the"], [1.45, 2.0, "opening"],
    [2.1, 2.5, "then"], [2.65, 3.2, "hold"], [5.35, 5.7, "for"],
    [5.8, 6.4, "motion"], [6.55, 6.9, "and"], [7.05, 7.45, "land"],
    [7.62, 7.95, "on"], [8.05, 8.35, "the"], [8.45, 8.78, "beat"],
    [9.92, 10.25, "final"], [10.38, 10.82, "frame"], [10.95, 11.35, "clear"],
  ].map(([start, end, text]) => ({ start, end, text }));
  const index = {
    hasAudio: true,
    duration: 12,
    silences: {
      "-40dB": [
        { start: 0, end: 0.3 },
        { start: 3.9, end: 5.1 },
        { start: 8.8, end: 9.7 },
        { start: 11.5, end: 12 },
      ],
    },
    words,
    sentences: [
      { start: 0.55, end: 3.2 },
      { start: 5.35, end: 8.78 },
      { start: 9.92, end: 11.35 },
    ],
    nonSpeech: [{ start: 7.12, end: 7.72, duration: 0.6, label: "accent" }],
    motion: {
      values: Array.from({ length: 121 }, (_, i) => ({
        t: i / 10,
        ydif: 4 + 12 * Math.abs(Math.sin(i * 0.19)) + (i > 50 && i < 70 ? 3 : 0),
      })),
    },
  };

  const result = renderSheet({
    file: source,
    start: 0,
    end: 12,
    out: sheet,
    width: 1920,
    index,
    markers: [{ t: 9.7, label: "final IN", kind: "in", slug: "final" }],
    mode: "detail",
    noProxy: true,
  });

  const { height } = result.geometry;
  const legendWidth = 360;
  const labelRows = [
    [22, "time ruler"],
    [76, "synthetic source frames"],
    [126, "motion strip"],
    [214, "waveform + silence"],
    [292, "sound events"],
    [370, "aligned transcript"],
  ];
  const draw = labelRows.flatMap(([y, label]) => [
    "-stroke", "#aaa7a1", "-strokewidth", "1", "-draw", `line 0,${y} 34,${y}`,
    "-stroke", "none", "-fill", "#55524e", "-pointsize", "19",
    "-draw", `text 50,${y + 6} '${label}'`,
  ]);
  checked(magick, [
    "-size", `${legendWidth}x${height}`, "xc:white", "-font", font, ...draw, legend,
  ], "legend render failed");
  checked(magick, [sheet, legend, "+append", "-strip", composed], "screenshot compose failed");

  copyFileSync(composed, join(ROOT, "assets", "screenshot-timeline-sheet.png"));
  copyFileSync(composed, join(ROOT, "docs", "assets", "anatomy-of-a-timeline-sheet.png"));
  process.stdout.write(`wrote synthetic timeline screenshot (${1920 + legendWidth}x${height})\n`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
