import assert from "node:assert/strict";
import { test } from "node:test";
import { searchWords } from "./search.mjs";

// Suspect words are whisper fabrications (marked by markSuspectWords in the
// index) — search must never hand back a timestamp for a phrase the speaker
// never said.
test("searchWords skips suspect words: no hit for fabricated text, real text still found", () => {
  const words = [
    { start: 1.0, end: 1.4, text: "she" },
    { start: 1.4, end: 1.8, text: "loves" },
    { start: 1.8, end: 2.3, text: "that" },
    { start: 2.3, end: 2.8, text: "toilet." },
    // Classic outro fabrication written across a music bed nobody spoke in.
    { start: 30.0, end: 30.5, text: "Thanks", suspect: true, suspectReason: "in-silence" },
    { start: 30.5, end: 30.9, text: "for", suspect: true, suspectReason: "in-silence" },
    { start: 30.9, end: 31.4, text: "watching.", suspect: true, suspectReason: "in-silence" },
  ];
  assert.equal(searchWords(words, "thanks for watching").length, 0);
  assert.equal(searchWords(words, "watching").length, 0);
  const hits = searchWords(words, "loves that toilet");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].start, 1.4);
  assert.equal(hits[0].end, 2.8);
});

test("searchWords with only suspect words returns nothing, and null input stays safe", () => {
  const fabricated = [
    { start: 5, end: 5.5, text: "subscribe", suspect: true, suspectReason: "over-music" },
  ];
  assert.equal(searchWords(fabricated, "subscribe").length, 0);
  assert.equal(searchWords(null, "subscribe").length, 0);
  assert.equal(searchWords(fabricated, "").length, 0);
});
