import assert from "node:assert/strict";
import { test } from "node:test";
import { clusterTakes, endsComplete, fillerDensity, jaccard, scoreTake, tokenize } from "./select.mjs";
import { PRESETS } from "./grade.mjs";

test("jaccard measures token overlap", () => {
  assert.equal(jaccard(tokenize("we met on bumble"), tokenize("we met on bumble")), 1);
  assert.equal(jaccard(tokenize("alpha beta"), tokenize("gamma delta")), 0);
  const sim = jaccard(
    tokenize("we met on bumble in denver"),
    tokenize("so we met on bumble in denver actually")
  );
  assert.ok(sim > 0.6 && sim < 1);
});

test("fillerDensity counts fillers per token", () => {
  assert.equal(fillerDensity("we met downtown"), 0);
  assert.ok(fillerDensity("um so like we um met you know downtown") > 0.2);
});

test("endsComplete detects trailing sentence punctuation", () => {
  assert.equal(endsComplete("It was perfect."), true);
  assert.equal(endsComplete("and then we sort of"), false);
});

test("clusterTakes groups similar transcripts and separates different ones", () => {
  const takes = [
    { file: "a1.mp4", text: "we met on bumble in denver at a coffee shop" },
    { file: "a2.mp4", text: "so we met on bumble in denver at a little coffee shop" },
    { file: "b1.mp4", text: "my favorite memory is the cabin in gold bar last winter" },
  ];
  const groups = clusterTakes(takes);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].length, 2);
  assert.equal(groups[1][0].file, "b1.mp4");
});

test("clusterTakes is not fooled by filler-heavy deliveries of the same content", () => {
  // Regression: real whisper output from the e2e smoke — fillers inflated the
  // token union and pushed similarity below the old threshold.
  const takes = [
    { file: "t1.mp4", text: "Um, so we met, uh, we met on Bumble in Denver and like we got coffee." },
    { file: "t2.mp4", text: "We met on Bumble in Denver and we got coffee at a little shop downtown. It was perfect." },
  ];
  const groups = clusterTakes(takes);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].length, 2);
});

test("scoreTake prefers later, cleaner, complete takes", () => {
  const rough = scoreTake({ text: "um so like we met uh somewhere and" }, 0, 2);
  const clean = scoreTake({ text: "We met on Bumble in Denver." }, 1, 2);
  assert.ok(clean.score > rough.score);
  assert.match(clean.reasoning, /latest/);
  assert.match(rough.reasoning, /does NOT end cleanly/);
});

test("grade presets are valid non-empty filter chains (or explicitly neutral)", () => {
  assert.equal(PRESETS.neutral, null);
  for (const [name, filter] of Object.entries(PRESETS)) {
    if (name === "neutral") continue;
    assert.equal(typeof filter, "string");
    assert.ok(filter.length > 5, `${name} should be a filter chain`);
    assert.ok(!filter.includes('"'), `${name} must not need shell quoting`);
  }
});
