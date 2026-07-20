import assert from "node:assert/strict";
import { test } from "node:test";
import { clusterTakes, endsComplete, fillerDensity, jaccard, scoreTake, tokenize } from "./select.mjs";

test("jaccard measures token overlap", () => {
  assert.equal(jaccard(tokenize("the launch is friday"), tokenize("the launch is friday")), 1);
  assert.equal(jaccard(tokenize("alpha beta"), tokenize("gamma delta")), 0);
  const sim = jaccard(
    tokenize("the product launch is friday"),
    tokenize("so the product launch is friday actually")
  );
  assert.ok(sim > 0.6 && sim < 1);
});

test("fillerDensity counts fillers per token", () => {
  assert.equal(fillerDensity("the review starts tomorrow"), 0);
  assert.ok(fillerDensity("um so like the um review you know starts tomorrow") > 0.2);
});

test("endsComplete detects trailing sentence punctuation", () => {
  assert.equal(endsComplete("It was perfect."), true);
  assert.equal(endsComplete("and then we sort of"), false);
});

test("clusterTakes groups similar transcripts and separates different ones", () => {
  const takes = [
    { file: "a1.mp4", text: "the product ships on friday after the final review" },
    { file: "a2.mp4", text: "so the product ships on friday after our final review" },
    { file: "b1.mp4", text: "the lighting test needs another blue pass tomorrow" },
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
    { file: "t1.mp4", text: "Um, so the product, uh, the product ships Friday after like the final review." },
    { file: "t2.mp4", text: "The product ships Friday after the final review. The release is ready." },
  ];
  const groups = clusterTakes(takes);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].length, 2);
});

test("scoreTake prefers later, cleaner, complete takes", () => {
  const rough = scoreTake({ text: "um so like the release uh goes somewhere and" }, 0, 2);
  const clean = scoreTake({ text: "The product ships after final review." }, 1, 2);
  assert.ok(clean.score > rough.score);
  assert.match(clean.reasoning, /latest/);
  assert.match(rough.reasoning, /does NOT end cleanly/);
});
