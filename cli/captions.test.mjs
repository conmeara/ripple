import assert from "node:assert/strict";
import { test } from "node:test";
import { assemblyTimeline } from "./cut.mjs";
import { chunkCaptions, escapeSubtitlesPath, mapWordsToOutput, toAss, toSrt, wrapLines } from "./captions.mjs";

const W = (start, end, text) => ({ start, end, text });

test("mapWordsToOutput: bodies, J-cut heads, and L-cut tails all land in output time", () => {
  const scenes = [
    { slug: "a", source: "s.mov", start: 10, end: 14, lcut: 1 }, // body out 0-3 (src 10-13), tail 13-14 under next card
    { slug: "b", source: "s.mov", start: 20, end: 24, card: "Q", cardDuration: 2.5, jcut: 0.5 }, // card 3-5.5, body 5.5-9 (src 20.5-24)
  ];
  const timeline = assemblyTimeline(scenes);
  const words = {
    "s.mov": [
      W(10.2, 10.8, "hello"), // body a → out 0.2
      W(13.2, 13.8, "trailing"), // lcut tail → out 3.2 (card starts at 3)
      W(20.1, 20.4, "head"), // jcut head → out 5.1 (card 3 + 2.5 − 0.5 + 0.1... card audio part outStart 5 + 0.1)
      W(21.0, 21.5, "body"), // body b → out 6.0
      W(50, 51, "nowhere"), // outside everything → dropped
    ],
  };
  const { words: mapped, dropped } = mapWordsToOutput(timeline, words);
  assert.equal(dropped, 1);
  assert.deepEqual(mapped.map((m) => [m.text, m.start]), [
    ["hello", 0.2],
    ["trailing", 3.2],
    ["head", 5.1],
    ["body", 6.0],
  ]);
});

test("suspect words never become captions — excluded from mapping and the emitted srt/ass", () => {
  const scenes = [{ slug: "a", source: "s.mov", start: 10, end: 14 }];
  const timeline = assemblyTimeline(scenes);
  const words = {
    "s.mov": [
      W(10.2, 10.8, "hello"),
      { ...W(11.5, 12.1, "Thanks"), suspect: true, suspectReason: "in-silence" }, // fabricated mid-scene
      W(12.4, 12.9, "again"),
    ],
  };
  const { words: mapped, dropped, suspects } = mapWordsToOutput(timeline, words);
  assert.equal(suspects, 1);
  assert.equal(dropped, 0); // a fabrication is not a "real word outside the cut"
  assert.deepEqual(mapped.map((m) => m.text), ["hello", "again"]);
  const chunks = chunkCaptions(mapped, "subtitle");
  const srt = toSrt(chunks);
  const ass = toAss(chunks);
  assert.ok(!srt.includes("Thanks"), srt);
  assert.ok(!ass.includes("Thanks"), ass);
  assert.match(srt, /hello/);
  assert.match(ass, /again/);
});

test("chunkCaptions subtitle: sentence breaks, silence gaps, min duration", () => {
  const words = [
    { start: 0, end: 0.4, text: "Hi.", segIndex: 0 },
    { start: 0.5, end: 0.9, text: "This", segIndex: 0 },
    { start: 0.9, end: 1.2, text: "continues", segIndex: 0 },
    { start: 4.0, end: 4.5, text: "after", segIndex: 0 }, // 2.8s gap → break
    { start: 4.5, end: 4.9, text: "silence", segIndex: 0 },
  ];
  const chunks = chunkCaptions(words, "subtitle");
  assert.equal(chunks.length, 3); // "Hi." | "This continues" | "after silence"
  assert.equal(chunks[0].lines[0], "Hi.");
  // min-duration extension is capped by the next cue — never overlap.
  assert.ok(chunks[0].end <= chunks[1].start);
  assert.ok(chunks[1].end <= chunks[2].start);
  // The gap-isolated last cue CAN extend to the readability minimum.
  assert.ok(chunks[2].end - chunks[2].start >= 0.833 - 0.001);
});

test("chunkCaptions social: ~3 words, uppercase, karaoke-ready words", () => {
  const words = Array.from({ length: 7 }, (_, i) => ({
    start: i * 0.3, end: i * 0.3 + 0.25, text: `word${i}`, segIndex: 0,
  }));
  const chunks = chunkCaptions(words, "social");
  assert.ok(chunks.length >= 2);
  assert.ok(chunks[0].words.length <= 3);
  assert.equal(chunks[0].lines[0], chunks[0].lines[0].toUpperCase());
});

test("wrapLines: two bottom-heavy lines under the char cap", () => {
  const words = "the quick brown fox jumps over the lazy sleeping dog tonight".split(" ")
    .map((text, i) => ({ start: i, end: i + 0.5, text }));
  const lines = wrapLines(words, 30);
  assert.equal(lines.length, 2);
  assert.ok(lines[0].length <= 30 && lines[1].length <= 30, lines.join(" | "));
});

test("toSrt formats times and counters", () => {
  const srt = toSrt([{ start: 0.2, end: 2.8, lines: ["Hello there"], words: [] }]);
  assert.match(srt, /^1\n00:00:00,200 --> 00:00:02,800\nHello there\n$/);
});

test("toAss: header scales to geometry; social events carry \\k sweeps", () => {
  const chunks = [{
    start: 0.2, end: 2.8,
    words: [W(0.2, 0.8, "THE"), W(0.9, 1.4, "GROOM")],
    lines: ["THE GROOM"],
  }];
  const ass = toAss(chunks, { width: 1080, height: 1920, style: "social" });
  assert.match(ass, /PlayResX: 1080/);
  assert.match(ass, /Style: social,[^\n]*,60,60,634,1/); // MarginV = 0.33 × 1920
  assert.match(ass, /\{\\k70\}THE \{\\k50\}GROOM/); // sweep to next start; last = own duration
  const sub = toAss([{ start: 0, end: 1, words: [], lines: ["a", "b"] }], { style: "subtitle" });
  assert.match(sub, /Dialogue: 0,0:00:00\.00,0:00:01\.00,subtitle,,0,0,0,,a\\Nb/);
});

test("escapeSubtitlesPath survives apostrophes and spaces (two parser levels)", () => {
  const esc = escapeSubtitlesPath("/tmp/groom's cut/caps.ass");
  assert.ok(!esc.includes("groom's")); // raw apostrophe must not survive
  assert.ok(esc.startsWith("\\'"));
  assert.equal(escapeSubtitlesPath("/plain/path.ass"), "\\'/plain/path.ass\\'");
});
