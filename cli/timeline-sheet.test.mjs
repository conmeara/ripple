import assert from "node:assert/strict";
import { test } from "node:test";
import {
  downsampleTrack, layoutLanes, manifestMarkers, parseMarkers, rulerSteps,
} from "./timeline-sheet.mjs";

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

test("downsampleTrack preserves peaks", () => {
  const track = Array.from({ length: 100 }, (_, i) => ({ t: i, value: i === 37 ? 99 : 1 }));
  const down = downsampleTrack(track, 10);
  assert.equal(down.length, 10);
  assert.ok(down.some((v) => v.value === 99)); // the spike survives
  assert.deepEqual(downsampleTrack([{ t: 0, value: 1 }], 10), [{ t: 0, value: 1 }]);
});
