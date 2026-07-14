import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diffManifests } from "./compare.mjs";
import { listSnapshots, manifestHash, saveSnapshot } from "./snapshot.mjs";
import { searchWords } from "./search.mjs";

const BASE = {
  version: 1,
  scenes: [
    { slug: "a", source: "s.mov", start: 10, end: 14 },
    { slug: "b", source: "s.mov", start: 20, end: 25, card: "Q2" },
  ],
};

test("diffManifests: bounds change with felt duration delta", () => {
  const b = structuredClone(BASE);
  b.scenes[0].end = 13.2; // tightened 0.8
  const d = diffManifests(BASE, b);
  assert.deepEqual(d.added, []);
  assert.deepEqual(d.removed, []);
  assert.equal(d.changed.length, 1);
  assert.equal(d.changed[0].slug, "a");
  assert.deepEqual(d.changed[0].changes.end, { from: 14, to: 13.2 });
  assert.equal(d.changed[0].changes.durationDelta, -0.8);
  assert.equal(d.duration.delta, -0.8);
  assert.ok(!d.identical);
});

test("diffManifests: add/remove/reorder/top-level", () => {
  const b = {
    version: 1,
    music: { source: "bed.mp3" },
    scenes: [BASE.scenes[1], { slug: "z", source: "s.mov", start: 1, end: 3 }],
  };
  const d = diffManifests(BASE, b);
  assert.deepEqual(d.added, ["z"]);
  assert.deepEqual(d.removed, ["a"]);
  assert.ok(d.top.music);
  assert.ok(!d.reordered); // only one shared scene — no order signal
  assert.ok(diffManifests(BASE, BASE).identical);
});

test("snapshot save/list dedups identical manifests", () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-hist-"));
  const first = saveSnapshot(BASE, { label: "first", dir });
  assert.ok(!first.existing);
  const dup = saveSnapshot(BASE, { label: "again", dir });
  assert.ok(dup.existing);
  assert.equal(dup.path, first.path);
  const b = structuredClone(BASE);
  b.scenes[0].end = 13;
  const second = saveSnapshot(b, { dir });
  assert.ok(!second.existing);
  const list = listSnapshots(dir);
  assert.equal(list.length, 2);
  assert.ok(list.some((l) => l.label === "first"));
  assert.notEqual(manifestHash(BASE), manifestHash(b));
});

test("searchWords: exact word sequence, punctuation- and case-insensitive", () => {
  const words = [
    { start: 1, end: 1.3, text: "God," },
    { start: 1.3, end: 1.5, text: "she" },
    { start: 1.5, end: 1.8, text: "loves" },
    { start: 1.8, end: 2.1, text: "that" },
    { start: 2.1, end: 2.5, text: "toilet." },
    { start: 5, end: 5.4, text: "toilet" },
  ];
  const hits = searchWords(words, "loves that toilet");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].start, 1.5);
  assert.equal(hits[0].end, 2.5);
  assert.equal(searchWords(words, "TOILET").length, 2);
  assert.equal(searchWords(words, "she hates").length, 0);
  assert.equal(searchWords(words, "").length, 0);
  assert.equal(searchWords(null, "x").length, 0);
});
