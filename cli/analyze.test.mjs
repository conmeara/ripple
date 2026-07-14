import assert from "node:assert/strict";
import { test } from "node:test";
import { optionsCompatible, referenceSilences, speechSpans } from "./analyze.mjs";

test("referenceSilences picks the stored threshold closest to -40dB", () => {
  const spans40 = [{ start: 1, end: 2 }];
  const spans50 = [{ start: 1.2, end: 1.8 }];
  assert.equal(referenceSilences({ silences: { "-35dB": [], "-40dB": spans40, "-45dB": [] } }), spans40);
  // Custom thresholds without -40: nearest wins, never a silent empty [].
  assert.equal(referenceSilences({ silences: { "-30dB": [], "-48dB": spans50 } }), spans50);
  assert.deepEqual(referenceSilences({ silences: {} }), []);
  assert.deepEqual(referenceSilences(null), []);
});

test("speechSpans complements silences and handles EOF-open spans", () => {
  assert.deepEqual(
    speechSpans([{ start: 2, end: 4 }, { start: 9, end: null }], 10),
    [{ start: 0, end: 2 }, { start: 4, end: 9 }]
  );
  assert.deepEqual(speechSpans([], 5), [{ start: 0, end: 5 }]);
});

test("optionsCompatible: explicit options must match; unset options accept the cache", () => {
  const cached = { options: { thresholds: ["-35dB", "-40dB", "-45dB"], prompt: "Georgie", lang: null } };
  assert.ok(optionsCompatible(cached, {})); // caller doesn't care
  assert.ok(optionsCompatible(cached, { prompt: "Georgie" }));
  assert.ok(!optionsCompatible(cached, { prompt: "different hints" }));
  assert.ok(!optionsCompatible(cached, { thresholds: ["-30dB", "-50dB"] }));
  assert.ok(optionsCompatible(cached, { thresholds: ["-35dB", "-40dB", "-45dB"], prompt: undefined }));
  // Legacy cache without options: any explicit request misses.
  assert.ok(!optionsCompatible({}, { prompt: "x" }));
  assert.ok(optionsCompatible({}, {}));
});
