import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dedupFrames, densityFloor, meanAbsDiff, parsePgm, parseShowinfoTimes, thinToMax,
} from "./frame-sheet.mjs";
import { subtitleToText } from "./transcribe.mjs";

test("parseShowinfoTimes pulls pts_time values from showinfo stderr", () => {
  const stderr = [
    "[Parsed_showinfo_1 @ 0x600] n:   0 pts:  12345 pts_time:5.13876 duration:...",
    "irrelevant line",
    "[Parsed_showinfo_1 @ 0x600] n:   1 pts:  99999 pts_time:41.7 duration:...",
  ].join("\n");
  assert.deepEqual(parseShowinfoTimes(stderr), [5.139, 41.7]);
});

test("densityFloor guarantees coverage without duplicating scene frames", () => {
  const frames = densityFloor([25], 60, 10);
  const floors = frames.filter((f) => f.source === "floor").map((f) => f.t);
  const scenes = frames.filter((f) => f.source === "scene").map((f) => f.t);
  assert.deepEqual(scenes, [25]);
  assert.ok(floors.includes(0), "must cover the start");
  for (let i = 1; i < frames.length; i++) {
    assert.ok(frames[i].t - frames[i - 1].t <= 10.001, `gap too large before ${frames[i].t}`);
  }
});

test("densityFloor handles footage with no scene changes", () => {
  const frames = densityFloor([], 35, 10);
  assert.ok(frames.length >= 3);
  assert.ok(frames.every((f) => f.source === "floor"));
});

test("densityFloor always shows the start, even when the first cut is nearby", () => {
  // Regression: first scene change at 8s with gap 10 used to drop t=0
  // entirely — the opening of the video was never in the sheet.
  const frames = densityFloor([8, 16], 24, 10);
  assert.equal(frames[0].t, 0);
  assert.equal(frames[0].source, "floor");
  assert.deepEqual(frames.filter((f) => f.source === "scene").map((f) => f.t), [8, 16]);
});

test("thinToMax drops floor frames before scene frames", () => {
  const frames = [
    ...Array.from({ length: 8 }, (_, i) => ({ t: i * 10, source: "floor" })),
    ...Array.from({ length: 4 }, (_, i) => ({ t: i * 10 + 5, source: "scene" })),
  ];
  const thinned = thinToMax(frames, 6);
  assert.equal(thinned.length, 6);
  assert.equal(thinned.filter((f) => f.source === "scene").length, 4, "all scene frames survive");
});

test("parsePgm reads P5 header and pixels", () => {
  const header = Buffer.from("P5\n4 2\n255\n", "latin1");
  const pixels = Buffer.from([0, 50, 100, 150, 200, 250, 10, 20]);
  const pgm = parsePgm(Buffer.concat([header, pixels]));
  assert.equal(pgm.width, 4);
  assert.equal(pgm.height, 2);
  assert.equal(pgm.pixels.length, 8);
  assert.equal(pgm.pixels[5], 250);
});

test("dedupFrames drops near-identical frames within the window", () => {
  const flat = (v) => new Uint8Array(16).fill(v);
  const frames = [
    { t: 0, pixels: flat(100) },
    { t: 5, pixels: flat(101) }, // ~identical → dropped
    { t: 10, pixels: flat(180) }, // real change → kept
    { t: 15, pixels: flat(181) }, // ~identical to previous kept → dropped
  ];
  const { kept, dropped } = dedupFrames(frames, { threshold: 5, window: 4 });
  assert.deepEqual(kept.map((f) => f.t), [0, 10]);
  assert.equal(dropped.length, 2);
});

test("meanAbsDiff is 0 for identical and large for different frames", () => {
  const a = new Uint8Array([10, 20, 30]);
  assert.equal(meanAbsDiff(a, a), 0);
  assert.ok(meanAbsDiff(a, new Uint8Array([210, 220, 230])) === 200);
});

test("subtitleToText strips srt and vtt scaffolding", () => {
  const srt = "1\n00:00:01,000 --> 00:00:03,000\nWe met on <i>Bumble</i>.\n\n2\n00:00:04,000 --> 00:00:06,000\nIt was perfect.\n";
  assert.equal(subtitleToText(srt), "We met on Bumble.\nIt was perfect.");
  const vtt = "WEBVTT\n\nNOTE internal\n\n00:01.000 --> 00:03.000\nHello there.\n";
  assert.equal(subtitleToText(vtt), "Hello there.");
});
