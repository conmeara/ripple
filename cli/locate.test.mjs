import assert from "node:assert/strict";
import { test } from "node:test";
import { assemblyTimeline } from "./cut.mjs";
import { locateOutputTime, locateScene, parseTimecode } from "./locate.mjs";

const SCENES = [
  { slug: "a", source: "s.mov", start: 10, end: 14, card: "Q1", cardDuration: 2 }, // out: card 0-2, body 2-6
  { slug: "b", source: "s.mov", start: 20, end: 25 }, // out: body 6-11
  { slug: "c", source: "s.mov", start: 30, end: 33, card: "Q3", cardDuration: 2.5, jcut: 1 }, // card 11-13.5, body 13.5-15.5 (src 31-33)
];

test("assemblyTimeline maps cards, bodies, and J-cuts to output time", () => {
  const tl = assemblyTimeline(SCENES);
  assert.deepEqual(tl.map((s) => [s.kind, s.slug, s.outStart, s.outEnd]), [
    ["card", "a", 0, 2],
    ["body", "a", 2, 6],
    ["body", "b", 6, 11],
    ["card", "c", 11, 13.5],
    ["body", "c", 13.5, 15.5],
  ]);
  assert.equal(tl[4].sourceStart, 31); // jcut head already played under the card
  assert.equal(tl[4].sourceEnd, 33);
});

test("parseTimecode reads seconds, m:ss, and h:mm:ss", () => {
  assert.equal(parseTimecode("83.5"), 83.5);
  assert.equal(parseTimecode("1:23"), 83);
  assert.equal(parseTimecode("1:23.5"), 83.5);
  assert.equal(parseTimecode("1:02:03"), 3723);
  assert.equal(parseTimecode("edit.json"), null);
});

test("locateOutputTime: card, body (J-cut aware), end, beyond", () => {
  const inCard = locateOutputTime(SCENES, 1.0);
  assert.equal(inCard.segment.kind, "card");
  assert.equal(inCard.sourceTime, null);

  const inBody = locateOutputTime(SCENES, 3.5); // scene a body, 1.5s in
  assert.equal(inBody.segment.slug, "a");
  assert.equal(inBody.sourceTime, 11.5); // 10 + 1.5

  const jcutBody = locateOutputTime(SCENES, 14.0); // scene c body, 0.5 in
  assert.equal(jcutBody.sourceTime, 31.5); // sourceStart 31 (jcut) + 0.5

  assert.equal(locateOutputTime(SCENES, 15.5).segment.slug, "c"); // exact end → last
  assert.ok(locateOutputTime(SCENES, 99).beyond);
});

test("locateScene reverses source time to output time (incl. card audio parts)", () => {
  const r = locateScene(SCENES, "c", 32);
  assert.equal(r.outputTime, 14.5); // 13.5 + (32 − 31)
  // Inside c's J-cut head: audible under the card, not "outside bounds".
  const jhead = locateScene(SCENES, "c", 30.5);
  assert.equal(jhead.audioKind, "jcut");
  assert.equal(jhead.underCard, "c");
  assert.equal(jhead.outputTime, 13); // card 11–13.5, jcut part 12.5–13.5, source 30–31
  assert.ok(locateScene(SCENES, "c", 29).outsideBounds); // genuinely before the scene
  assert.equal(locateScene(SCENES, "nope", 1), null);
  assert.equal(locateScene(SCENES, "b").segment.outStart, 6);
});
