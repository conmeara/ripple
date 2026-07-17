import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { intentionalRegions, missingEndings, parseBlackdetect, parseFreezedetect, unexplainedSpans } from "./qa.mjs";
import { RULE_INDEX } from "./rules.mjs";
import { findTool } from "./util.mjs";

const QA = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), "qa.mjs")).href;
const ffmpeg = findTool(["ffmpeg"]);

test("every qa gate id is a registered delivery rule", () => {
  const gates = [
    "decode", "probe", "color-policy", "clip-count", "clip-decode", "scene-tails",
    "dialogue-loudness", "leading-silence", "tail-silence", "loudness",
    "prompt-leak", "scene-endings", "content-gates", "black-frames", "freeze-frames",
  ];
  for (const id of gates) {
    const rule = RULE_INDEX.get(id);
    assert.ok(rule, `${id} missing from the registry`);
    assert.equal(rule.phase, "delivery", id);
  }
});

test("missingEndings matches across whisper's hard line wraps", () => {
  const text = "everything in between is just a\n bonus.\n";
  assert.deepEqual(missingEndings(text, [{ slug: "married", expectEnding: "just a bonus" }]), []);
  assert.deepEqual(
    missingEndings(text, [{ slug: "married", expectEnding: "take two" }]).map((s) => s.slug),
    ["married"]
  );
  assert.deepEqual(missingEndings("JUST  A   BONUS", [{ slug: "m", expectEnding: "just a bonus" }]), []);
});

test("parseBlackdetect extracts spans from ffmpeg stderr", () => {
  const stderr = [
    "[blackdetect @ 0x600] black_start:0.8 black_end:1.2 black_duration:0.4",
    "frame= 20 fps=0.0 unrelated",
    "[blackdetect @ 0x600] black_start:3 black_end:3.067 black_duration:0.067",
  ].join("\n");
  assert.deepEqual(parseBlackdetect(stderr), [
    { start: 0.8, end: 1.2, duration: 0.4 },
    { start: 3, end: 3.067, duration: 0.067 },
  ]);
  assert.deepEqual(parseBlackdetect("nothing"), []);
});

test("parseFreezedetect pairs the three metadata lines; EOF freeze keeps end null", () => {
  const stderr = [
    "[freezedetect @ 0x600] lavfi.freezedetect.freeze_start: 1.0",
    "[freezedetect @ 0x600] lavfi.freezedetect.freeze_duration: 2.5",
    "[freezedetect @ 0x600] lavfi.freezedetect.freeze_end: 3.5",
    "[freezedetect @ 0x600] lavfi.freezedetect.freeze_start: 8.2",
  ].join("\n");
  assert.deepEqual(parseFreezedetect(stderr), [
    { start: 1.0, end: 3.5, duration: 2.5 },
    { start: 8.2, end: null, duration: null },
  ]);
});

test("intentionalRegions: cards always, transition overlaps only for blacks", () => {
  const scenes = [
    { slug: "a", source: "s.mov", start: 0, end: 5 },
    { slug: "b", source: "s.mov", start: 10, end: 15, card: "Q2?", cardDuration: 2.5 },
    { slug: "c", source: "s.mov", start: 20, end: 24, transition: { type: "fadeblack", duration: 1 } },
  ];
  const black = intentionalRegions(scenes);
  assert.deepEqual(black.map((r) => [r.start, r.end]), [[5, 7.5], [11.5, 12.5]]);
  assert.match(black[1].why, /fadeblack into c/);
  const freeze = intentionalRegions(scenes, { transitions: false });
  assert.deepEqual(freeze.map((r) => r.why), ["card b"]);
});

test("unexplainedSpans: inside passes (±pad), bleeding past a region is the 2-frame-blink failure", () => {
  const regions = [{ start: 5, end: 7.5 }];
  // Fully inside, and inside within pad slop: explained.
  assert.deepEqual(unexplainedSpans([{ start: 5.1, end: 7.4 }, { start: 4.9, end: 7.6 }], regions), []);
  // A black flash at a join far from any card: flagged.
  assert.equal(unexplainedSpans([{ start: 12.0, end: 12.07 }], regions).length, 1);
  // Starts under the card but bleeds into the scene: flagged.
  assert.equal(unexplainedSpans([{ start: 7.0, end: 8.4 }], regions).length, 1);
  // Open-ended span closes at duration.
  assert.equal(unexplainedSpans([{ start: 6.0, end: null }], regions, { duration: 20 }).length, 1);
  assert.deepEqual(unexplainedSpans([{ start: 6.0, end: null }], [{ start: 5, end: 20 }], { duration: 20 }), []);
});

test("unexplainedSpans: a blink wholly outside a region never rides the pad to a pass", () => {
  // The origin defect at its most likely address: a 2-frame black gap right
  // AFTER the card ends (an assembly gap at the join). It sits inside the
  // ±pad halo but touches no region — that's a defect, not card slop.
  const card = [{ start: 9, end: 11.5 }];
  assert.equal(unexplainedSpans([{ start: 11.55, end: 11.63 }], card).length, 1);
  // ...and the mirror image before the card's fade-in.
  assert.equal(unexplainedSpans([{ start: 8.85, end: 8.95 }], card).length, 1);
  // A span that touches the region and overhangs within pad still passes
  // (the accepted fade-rounding slop).
  assert.deepEqual(unexplainedSpans([{ start: 11.4, end: 11.6 }], card), []);
});

// ---------- end-to-end on synthesized fixtures ----------

function synth(dir, name, inputs, filter) {
  const out = join(dir, name);
  const args = ["-hide_banner", "-v", "error", "-y"];
  for (const i of inputs) args.push("-f", "lavfi", "-i", i);
  if (filter) args.push("-filter_complex", filter);
  args.push("-pix_fmt", "yuv420p", out);
  const res = spawnSync(ffmpeg, args, { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr);
  return out;
}

// qa's exit code + envelope are the contract: drive main() in a child.
function runQa(args, cwd) {
  const res = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `const m = await import(${JSON.stringify(QA)}); await m.main(${JSON.stringify(args)});`],
    { encoding: "utf8", cwd }
  );
  return { status: res.status, json: JSON.parse(res.stdout), stderr: res.stderr };
}

const gate = (json, id) => json.checks.find((c) => c.id === id);

// Every concat input is normalized to one pix_fmt first — lavfi sources
// disagree and concat refuses mixed formats.
const norm3 = "[0]format=yuv420p[a];[1]format=yuv420p[b];[2]format=yuv420p[c];[a][b][c]concat=n=3:v=1:a=0";

test("a black flash at a join fails black-frames (checks carry the rule id)", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const file = synth(dir, "flash.mp4",
    ["testsrc=s=64x36:r=10:d=2", "color=c=black:s=64x36:r=10:d=0.4", "testsrc2=s=64x36:r=10:d=2"],
    norm3);
  const { status, json } = runQa([file, "--no-snapshot"], dir);
  assert.equal(status, 1);
  const black = gate(json, "black-frames");
  assert.equal(black.ok, false);
  assert.equal(black.rule, "black-frames");
  assert.match(black.detail, /unexplained black/);
  assert.equal(gate(json, "freeze-frames").ok, true);
});

test("a mid-scene freeze fails freeze-frames; a whole-file still is intentional", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const frozen = synth(dir, "frozen.mp4",
    ["testsrc=s=64x36:r=10:d=1", "color=c=gray:s=64x36:r=10:d=3", "testsrc=s=64x36:r=10:d=1"],
    norm3);
  const bad = runQa([frozen, "--no-snapshot"], dir);
  assert.equal(bad.status, 1);
  assert.equal(gate(bad.json, "freeze-frames").ok, false);
  assert.match(gate(bad.json, "freeze-frames").detail, /picture frozen/);

  const still = synth(dir, "still.mp4", ["color=c=gray:s=64x36:r=10:d=3"]);
  const ok = runQa([still, "--no-snapshot"], dir);
  assert.equal(gate(ok.json, "freeze-frames").ok, true);
});

test("moving footage with no blacks passes both gates", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const file = synth(dir, "clean.mp4", ["testsrc=s=64x36:r=10:d=2"]);
  const { status, json } = runQa([file, "--no-snapshot"], dir);
  assert.equal(status, 0, JSON.stringify(json.checks));
  assert.equal(gate(json, "black-frames").ok, true);
  assert.equal(gate(json, "freeze-frames").ok, true);
});

test("blacks and freezes the manifest explains (an opening card) pass", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  // 2.5s black static "card" then 2s of moving footage — exactly what the
  // assembly renders for scenes: [{card, cardDuration: 2.5}, body].
  const file = synth(dir, "carded.mp4",
    ["color=c=black:s=64x36:r=10:d=2.5", "testsrc=s=64x36:r=10:d=2"],
    "[0]format=yuv420p[a];[1]format=yuv420p[b];[a][b]concat=n=2:v=1:a=0");
  writeFileSync(join(dir, "edit.json"), JSON.stringify({
    version: 1,
    scenes: [{ id: 1, slug: "a", source: "src.mp4", start: 10, end: 12, status: "locked", card: "Q?", cardDuration: 2.5 }],
  }));
  const { status, json } = runQa([file, "--manifest", join(dir, "edit.json"), "--no-snapshot"], dir);
  assert.equal(gate(json, "black-frames").ok, true, gate(json, "black-frames").detail);
  assert.equal(gate(json, "freeze-frames").ok, true, gate(json, "freeze-frames").detail);
  assert.equal(status, 0, JSON.stringify(json.checks));
});

test("bare `ripple qa` discovers the project manifest — a carded final must not fail red", { skip: !ffmpeg }, () => {
  // The docs say just "run ripple qa": without discovery, freeze regions
  // were [] and black regions edges-only, so every mid-timeline card (a
  // static picture fading through black by design) hard-failed a
  // defect-free final unless the caller re-ran with --manifest.
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const file = synth(dir, "carded.mp4",
    ["color=c=black:s=64x36:r=10:d=2.5", "testsrc=s=64x36:r=10:d=2"],
    "[0]format=yuv420p[a];[1]format=yuv420p[b];[a][b]concat=n=2:v=1:a=0");
  writeFileSync(join(dir, "edit.json"), JSON.stringify({
    version: 1,
    scenes: [{ id: 1, slug: "a", source: "src.mp4", start: 10, end: 12, status: "locked", card: "Q?", cardDuration: 2.5 }],
  }));
  const { status, json } = runQa([file, "--no-snapshot"], dir); // no --manifest
  // Discovery is visible (cwd realpath may differ from the tmpdir alias).
  assert.match(json.manifest, /edit\.json$/);
  assert.equal(gate(json, "black-frames").ok, true, gate(json, "black-frames").detail);
  assert.equal(gate(json, "freeze-frames").ok, true, gate(json, "freeze-frames").detail);
  assert.equal(status, 0, JSON.stringify(json.checks));
});

test("agent-dialect leak patterns: (?i) is stripped, an invalid pattern fails loudly, never crashes", { skip: !ffmpeg }, () => {
  // A real session wrote "(?i)question number" (Python inline flag) into
  // edit.json and `ripple qa --transcribe` died with an unhandled regex
  // SyntaxError instead of reporting the gate.
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const file = synth(dir, "clean.mp4", ["testsrc=s=64x36:r=10:d=2"]);
  const transcript = join(dir, "final.txt");
  writeFileSync(transcript, "And that is how we met. Question Number Four. What is her biggest pet peeve?");
  const manifest = (patterns) => {
    writeFileSync(join(dir, "edit.json"), JSON.stringify({ version: 1, scenes: [], qa: { leakPatterns: patterns } }));
    return join(dir, "edit.json");
  };

  // (?i) prefix: stripped, still matches case-insensitively → a real leak, reported not thrown.
  const leaked = runQa([file, "--manifest", manifest(["(?i)question number"]), "--transcript", transcript, "--no-snapshot"], dir);
  assert.equal(leaked.status, 1, leaked.stderr);
  assert.equal(gate(leaked.json, "prompt-leak").ok, false);
  assert.match(gate(leaked.json, "prompt-leak").detail, /leaked: \(\?i\)question number/);

  // A pattern JS can't compile at all: the gate fails loudly (unverifiable ≠ pass).
  const invalid = runQa([file, "--manifest", manifest(["(unclosed"]), "--transcript", transcript, "--no-snapshot"], dir);
  assert.equal(invalid.status, 1);
  assert.equal(gate(invalid.json, "prompt-leak").ok, false);
  assert.match(gate(invalid.json, "prompt-leak").detail, /unusable leak pattern/);

  // Clean patterns over clean text still pass.
  const clean = runQa([file, "--manifest", manifest(["next question", "take [0-9]"]), "--transcript", transcript, "--no-snapshot"], dir);
  assert.equal(gate(clean.json, "prompt-leak").ok, true, gate(clean.json, "prompt-leak").detail);
});

test("manifest-less edge blacks (a normal fade-in from black) pass black-frames", { skip: !ffmpeg }, () => {
  // The bare-file PASS path: without a manifest only the file's own edges
  // excuse blacks. Deleting edgeRegions would fail every final that opens
  // with a fade from black — exactly the red-fatigue failure the gate's
  // design comment warns against.
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const file = synth(dir, "fadein.mp4",
    ["color=c=black:s=64x36:r=10:d=0.5", "testsrc=s=64x36:r=10:d=2"],
    "[0]format=yuv420p[a];[1]format=yuv420p[b];[a][b]concat=n=2:v=1:a=0");
  const { status, json } = runQa([file, "--no-snapshot"], dir);
  const black = gate(json, "black-frames");
  assert.equal(black.ok, true, black.detail);
  assert.match(black.detail, /black region/); // the black was seen AND excused
  assert.equal(status, 0, JSON.stringify(json.checks));
});
