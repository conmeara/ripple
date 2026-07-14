import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  downsampleTrack, layoutLanes, manifestMarkers, parseMarkers, renderSheet, rulerSteps, wordLaneDraws,
} from "./timeline-sheet.mjs";
import { findTool, run } from "./util.mjs";

const ffmpeg = findTool(["ffmpeg"]);

test("parseMarkers reads t:label pairs, bare times, and junk", () => {
  assert.deepEqual(parseMarkers("209:IN,233.3:OUT howmet"), [
    { t: 209, label: "IN" },
    { t: 233.3, label: "OUT howmet" },
  ]);
  assert.deepEqual(parseMarkers("495.8"), [{ t: 495.8, label: "" }]);
  assert.deepEqual(parseMarkers("abc:X,42:ok"), [{ t: 42, label: "ok" }]);
  assert.deepEqual(parseMarkers(undefined), []);
});

test("manifestMarkers keeps only bounds inside the window", () => {
  const manifest = {
    scenes: [
      { slug: "howmet", start: 209, end: 233.3 },
      { slug: "chore", start: 465, end: 495.8 },
    ],
  };
  assert.deepEqual(manifestMarkers(manifest, { start: 200, end: 240 }), [
    { t: 209, label: "howmet IN", kind: "in", slug: "howmet" },
    { t: 233.3, label: "howmet OUT", kind: "out", slug: "howmet" },
  ]);
  assert.deepEqual(manifestMarkers(manifest, { start: 230, end: 470 }), [
    { t: 233.3, label: "howmet OUT", kind: "out", slug: "howmet" },
    { t: 465, label: "chore IN", kind: "in", slug: "chore" },
  ]);
  assert.deepEqual(manifestMarkers(null, { start: 0, end: 10 }), []);
});

test("rulerSteps adapts tick density to the window", () => {
  assert.deepEqual(rulerSteps(12, 1920), { minor: 1, major: 5 });
  assert.deepEqual(rulerSteps(30, 1920), { minor: 1, major: 5 });
  assert.deepEqual(rulerSteps(300, 1920), { minor: 2, major: 10 });
  assert.deepEqual(rulerSteps(785, 1920), { minor: 5, major: 30 });
  assert.deepEqual(rulerSteps(7200, 1920), { minor: 60, major: 600 });
});

test("layoutLanes places words greedily and reports crowding", () => {
  const words = [
    { start: 0, end: 0.4, text: "one" },
    { start: 0.1, end: 0.5, text: "two" },
    { start: 0.2, end: 0.6, text: "three" },
    { start: 0.3, end: 0.7, text: "four" }, // all lanes busy at x≈29
    { start: 5, end: 5.4, text: "five" }, // clear again
  ];
  const { placed, crowded } = layoutLanes(words, { start: 0, end: 10, width: 1000 });
  assert.equal(placed[0].lane, 0);
  assert.equal(placed[1].lane, 1);
  assert.equal(placed[2].lane, 2);
  assert.equal(placed[3].lane, null); // crowded → bare tick
  assert.equal(crowded, 1);
  assert.equal(placed[4].lane, 0);
  assert.equal(placed[4].x, 500);
});

test("wordLaneDraws keeps suspect words visible but dimmed with a '?' marker", () => {
  const { placed } = layoutLanes([
    { start: 1, end: 1.4, text: "real" },
    { start: 5, end: 5.5, text: "ghost", suspect: true, suspectReason: "over-music" },
  ], { start: 0, end: 10, width: 1000 });
  const px = (t) => Math.round((t / 10) * 1000);
  const draw = wordLaneDraws(placed, { px, textY: 100, laneH: 30 });

  // Text draws push [..., "-fill", COLOR, "-pointsize", "18", "-draw", value]
  // — the color sits 4 slots before the draw value. Trusted words render
  // bright; suspects reuse the ruler's muted tick gray and gain a '?'.
  const realText = draw.findIndex((d) => d.includes("'real'"));
  const ghostText = draw.findIndex((d) => d.includes("'?ghost'"));
  assert.notEqual(realText, -1);
  assert.notEqual(ghostText, -1, draw.join(" | "));
  assert.equal(draw[realText - 4], "#f0f0f0");
  assert.equal(draw[ghostText - 4], "#8a8a8a");
  assert.ok(!draw.some((d) => d.includes("'ghost'"))); // never drawn unmarked

  // The tick line dims too (px(5) = 500).
  const ghostTick = draw.findIndex((d) => d.startsWith("line 500"));
  assert.equal(draw[ghostTick - 4], "#8a8a8a");
  const realTick = draw.findIndex((d) => d.startsWith("line 100"));
  assert.equal(draw[realTick - 4], "#53a6ff");
});

test("renderSheet renders a window containing suspect words", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-tsheet-"));
  const file = join(dir, "clip.mp4");
  const gen = run(ffmpeg, [
    "-hide_banner", "-v", "error", "-y",
    "-f", "lavfi", "-i", "testsrc=s=64x36:r=10:d=3",
    "-pix_fmt", "yuv420p", file,
  ]);
  assert.equal(gen.status, 0, gen.stderr);

  // Hand-built index: hasAudio false keeps the waveform synthetic, so the
  // fixture needs no audio stream or whisper run.
  const index = {
    hasAudio: false,
    duration: 3,
    silences: { "-40dB": [] },
    words: [
      { start: 0.5, end: 0.9, text: "real" },
      { start: 2.0, end: 2.4, text: "ghost", suspect: true, suspectReason: "in-silence" },
    ],
  };

  // renderSheet writes its scratch under cwd/qa/frame-sheets — keep that
  // inside the fixture dir, not the repo.
  const prevCwd = process.cwd();
  process.chdir(dir);
  try {
    const out = join(dir, "sheet.png");
    const result = renderSheet({ file, start: 0, end: 3, out, width: 320, index });
    assert.equal(result.sheet, out);
    assert.ok(existsSync(out));
    assert.equal(result.geometry.width, 320);
  } finally {
    process.chdir(prevCwd);
  }
});

test("downsampleTrack preserves peaks", () => {
  const track = Array.from({ length: 100 }, (_, i) => ({ t: i, value: i === 37 ? 99 : 1 }));
  const down = downsampleTrack(track, 10);
  assert.equal(down.length, 10);
  assert.ok(down.some((v) => v.value === 99)); // the spike survives
  assert.deepEqual(downsampleTrack([{ t: 0, value: 1 }], 10), [{ t: 0, value: 1 }]);
});
