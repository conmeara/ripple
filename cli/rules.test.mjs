import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { driftCheckFrom } from "./candidates.mjs";
import { RULES, RULE_INDEX, endpointFlags, lintManifest, parseFrontMatter } from "./rules.mjs";
import { fileStamp } from "./util.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- registry integrity ----------

test("registry: unique ids, valid phases/severities, every field filled", () => {
  const ids = RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate rule id");
  for (const r of RULES) {
    assert.ok(["lock", "render", "delivery"].includes(r.phase), `${r.id}: phase`);
    assert.ok(["block", "warn"].includes(r.severity), `${r.id}: severity`);
    assert.ok(r.summary?.length > 10, `${r.id}: summary`);
    assert.ok(r.origin?.length > 10, `${r.id}: origin — a rule nobody can explain gets deleted`);
  }
  assert.equal(RULE_INDEX.size, RULES.length);
});

test("id conventions: SCREAMING_SNAKE for cut-point flags, kebab-case for delivery gates", () => {
  for (const r of RULES.filter((x) => x.phase === "lock")) {
    assert.match(r.id, /^[A-Z][A-Z_]+$/, r.id);
  }
  for (const r of RULES.filter((x) => x.phase === "delivery")) {
    assert.match(r.id, /^[a-z][a-z-]+$/, r.id);
  }
});

test("every rule is documented in reference/rules.md, and the opening count is honest", () => {
  const doc = readFileSync(join(ROOT, "skills", "ripple", "reference", "rules.md"), "utf8");
  for (const r of RULES) {
    assert.ok(doc.includes(`\`${r.id}\``), `${r.id} missing from rules.md`);
  }
  const count = doc.match(/(\d+) deterministic editing rules/);
  assert.ok(count, "rules.md must open with the rule count");
  assert.equal(Number(count[1]), RULES.length, "rules.md count drifted from the registry");
});

test("every candidates flag id is a lock rule, and every lock rule is producible", () => {
  // A range broken in every way at once: straddles both ends, dead tail,
  // late lead, next speech inside, zero tail silence corroborated.
  const timing = {
    wordsInRange: 5, firstWordStart: 11.2, leadGap: 1.2, straddleStart: "owns",
    lastWordEnd: 18, tailGap: 2.4, straddleEnd: "favorite",
    nextWordStart: 19, nextText: "What's next", nextAudioStart: 18.9,
  };
  const silence = { "-40dB": { leading: 0, tail: 0, spans: 1 } };
  const flags = endpointFlags(timing, silence, { maxTail: 1.0, maxLead: 0.5, end: 20 });
  // INDEX_DRIFT needs evidence endpointFlags can't see — an isolated
  // re-transcription of the range — so candidates raises it from
  // driftCheckFrom instead.
  const drifted = driftCheckFrom(timing, [{ start: 2.0, end: 4.5, text: "done." }], { start: 10 });
  assert.equal(drifted.verdict, "drifted");
  flags.push({ flag: "INDEX_DRIFT", detail: drifted });
  const lockIds = RULES.filter((r) => r.phase === "lock").map((r) => r.id).sort();
  assert.deepEqual(flags.map((f) => f.flag).sort(), lockIds);
  for (const f of flags) assert.equal(RULE_INDEX.get(f.flag).severity, "block");
});

// ---------- front-matter parser ----------

test("parseFrontMatter: no block, unterminated block, empty block", () => {
  assert.deepEqual(parseFrontMatter("# VIDEO.md\ntext"), {});
  assert.deepEqual(parseFrontMatter("---\nrules: {}\nno closing fence"), {});
  assert.deepEqual(parseFrontMatter("---\n---\nbody"), {});
});

test("parseFrontMatter: flow maps, comments, quoted reasons with commas", () => {
  const fm = parseFrontMatter([
    "---",
    "# project overrides",
    'rules:',
    '  DEAD_AIR_TAIL: {maxTail: 2.5, reason: "contemplative piece, long tails"}',
    "  jump-cut: {waive: true, reason: 'smash cuts intended'}",
    "register: social  # trailing comment",
    "---",
    "# VIDEO.md body",
  ].join("\n"));
  assert.deepEqual(fm.rules.DEAD_AIR_TAIL, { maxTail: 2.5, reason: "contemplative piece, long tails" });
  assert.deepEqual(fm.rules["jump-cut"], { waive: true, reason: "smash cuts intended" });
  assert.equal(fm.register, "social");
});

test("parseFrontMatter: a trailing comment after a flow map never corrupts the last entry", () => {
  // `}` plus the comment once glued onto the value: a waiver reason became
  // '"photo hold"} # accepted 2026-07' and a trailing maxTail parsed as the
  // string "2.5}" — silently disabling the retune it visibly declared.
  const fm = parseFrontMatter([
    "---",
    "rules:",
    '  DEAD_AIR_TAIL: {waive: true, reason: "photo hold"} # accepted 2026-07',
    '  LATE_FIRST_WORD: {reason: "x", maxLead: 2.5} # note',
    "---",
  ].join("\n"));
  assert.deepEqual(fm.rules.DEAD_AIR_TAIL, { waive: true, reason: "photo hold" });
  assert.deepEqual(fm.rules.LATE_FIRST_WORD, { reason: "x", maxLead: 2.5 });
});

test("parseFrontMatter: a quoted block-style scalar sheds its trailing comment", () => {
  const fm = parseFrontMatter([
    "---",
    "rules:",
    "  DEAD_AIR_TAIL:",
    '    reason: "x" # y',
    "    maxTail: 2.5",
    "---",
  ].join("\n"));
  assert.deepEqual(fm.rules.DEAD_AIR_TAIL, { reason: "x", maxTail: 2.5 });
});

test("parseFrontMatter: tab-indented children stay nested under a space-indented parent", () => {
  // A tab renders wider than two spaces, so this LOOKS correctly nested;
  // counting the tab as one column silently dedented the params out of
  // their rule and the retune never applied.
  const fm = parseFrontMatter([
    "---",
    "rules:",
    "  DEAD_AIR_TAIL:",
    "\tmaxTail: 2.5",
    "\treason: x",
    "---",
  ].join("\n"));
  assert.deepEqual(fm.rules, { DEAD_AIR_TAIL: { maxTail: 2.5, reason: "x" } });
});

test("parseFrontMatter: indent nesting and scalar types", () => {
  const fm = parseFrontMatter([
    "---",
    "rules:",
    "  LATE_FIRST_WORD:",
    "    maxLead: 0.8",
    "    reason: slow openings",
    "flag: false",
    "empty: {}",
    "---",
  ].join("\n"));
  assert.deepEqual(fm.rules.LATE_FIRST_WORD, { maxLead: 0.8, reason: "slow openings" });
  assert.equal(fm.flag, false);
  assert.deepEqual(fm.empty, {});
});

// ---------- lintManifest ----------

// A project on disk: stub source, hand-built perception index under the
// analyze cache stem, edit.json, optional VIDEO.md. Words shaped like the
// real wedding failure: clean answer at 0–10, a 3s dead tail at 15–25.
function project({ scenes, videoMd, index } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ripple-rules-"));
  const src = join(dir, "src.mp4");
  writeFileSync(src, "stub");
  mkdirSync(join(dir, "work", "analysis"), { recursive: true });
  const words = [
    { start: 0.3, end: 0.6, text: "We" },
    { start: 0.7, end: 1.1, text: "met" },
    { start: 1.2, end: 9.2, text: "here." },
    { start: 15.2, end: 15.5, text: "I" },
    { start: 15.6, end: 22.0, text: "do." },
    { start: 26.5, end: 27.0, text: "What's" },
    { start: 27.1, end: 27.5, text: "next?" },
  ];
  const silences = {
    "-40dB": [
      { start: 9.2, end: 15.2 },
      { start: 22.0, end: 26.5 },
      { start: 27.5, end: null },
    ],
  };
  writeFileSync(
    join(dir, "work", "analysis", `src_${fileStamp(src)}.analysis.json`),
    JSON.stringify(index ?? { version: 4, file: src, duration: 30, hasAudio: true, words, silences })
  );
  writeFileSync(join(dir, "edit.json"), JSON.stringify({ version: 1, scenes }));
  if (videoMd) writeFileSync(join(dir, "VIDEO.md"), videoMd);
  return join(dir, "edit.json");
}

const CLEAN = { id: 1, slug: "met", source: "src.mp4", start: 0, end: 10, status: "locked" };
const DEAD_TAIL = { id: 2, slug: "vows", source: "src.mp4", start: 15, end: 25, status: "locked" };

test("lintManifest: clean scene passes, dead tail blocks, findings carry the registry shape", () => {
  const manifest = project({ scenes: [CLEAN, DEAD_TAIL] });
  const { findings, scenes } = lintManifest(manifest);
  assert.deepEqual(scenes, ["met", "vows"]);
  assert.ok(!findings.some((f) => f.scene === "met"));
  const tail = findings.find((f) => f.rule === "DEAD_AIR_TAIL");
  assert.ok(tail, JSON.stringify(findings));
  assert.equal(tail.scene, "vows");
  assert.equal(tail.severity, "block");
  assert.equal(tail.waived, false);
  assert.equal(tail.waiverReason, null);
  assert.match(tail.detail, /3s of nothing/);
});

test("lintManifest: a missing index is a NO_INDEX block finding, never a rebuild", () => {
  const manifest = project({ scenes: [CLEAN] });
  const withoutIndex = { ...CLEAN, slug: "ghost", source: "other.mp4" };
  writeFileSync(join(dirname(manifest), "other.mp4"), "stub");
  writeFileSync(manifest, JSON.stringify({ version: 1, scenes: [withoutIndex] }));
  const { findings } = lintManifest(manifest);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "NO_INDEX");
  assert.equal(findings[0].severity, "block");
  assert.match(findings[0].detail, /ripple analyze/);
});

test("lintManifest: a missing source is also NO_INDEX", () => {
  const manifest = project({ scenes: [{ ...CLEAN, source: "gone.mp4" }] });
  const { findings } = lintManifest(manifest);
  assert.equal(findings[0].rule, "NO_INDEX");
  assert.match(findings[0].detail, /source not found/);
});

test("lintManifest: scene-tier waiver with a reason waives; without one it is ignored and reported", () => {
  const waived = project({
    scenes: [{ ...DEAD_TAIL, waivers: [{ rule: "DEAD_AIR_TAIL", reason: "she looks at the photo — the silence is the scene" }] }],
  });
  const a = lintManifest(waived);
  const tail = a.findings.find((f) => f.rule === "DEAD_AIR_TAIL");
  assert.equal(tail.waived, true);
  assert.equal(tail.waiverTier, "scene");
  assert.match(tail.waiverReason, /silence is the scene/);

  const reasonless = project({ scenes: [{ ...DEAD_TAIL, waivers: [{ rule: "DEAD_AIR_TAIL" }] }] });
  const b = lintManifest(reasonless);
  assert.equal(b.findings.find((f) => f.rule === "DEAD_AIR_TAIL").waived, false);
  const warn = b.findings.find((f) => f.rule === "waiver-missing-reason");
  assert.equal(warn.severity, "warn");
  assert.equal(warn.scene, "vows");
});

test("lintManifest: project-tier retune and waive from VIDEO.md front-matter", () => {
  const videoMd = [
    "---",
    "rules:",
    '  DEAD_AIR_TAIL: {maxTail: 3.5, reason: "contemplative piece"}',
    "---",
    "# VIDEO.md",
  ].join("\n");
  const manifest = project({ scenes: [DEAD_TAIL], videoMd });
  const { findings, overrides } = lintManifest(manifest);
  // 3s tail under the retuned 3.5s bound: no finding at all.
  assert.ok(!findings.some((f) => f.rule === "DEAD_AIR_TAIL"), JSON.stringify(findings));
  // But the retune itself is never silent.
  assert.deepEqual(overrides, [{ rule: "DEAD_AIR_TAIL", tier: "project", maxTail: 3.5, reason: "contemplative piece" }]);

  const waiveMd = [
    "---",
    "rules:",
    '  DEAD_AIR_TAIL: {waive: true, reason: "long-tail style"}',
    "---",
  ].join("\n");
  const m2 = project({ scenes: [DEAD_TAIL], videoMd: waiveMd });
  const r2 = lintManifest(m2);
  const tail = r2.findings.find((f) => f.rule === "DEAD_AIR_TAIL");
  assert.equal(tail.waived, true);
  assert.equal(tail.waiverTier, "project");
});

test("lintManifest: a quoted retune number coerces; the echo never asserts a dead retune", () => {
  // YAML users quote numbers by habit: "5.0" must retune like 5.0 — the
  // overrides echo once claimed maxTail "5.0" while lint kept blocking at
  // the 1s default, sending the user to debug the wrong thing.
  const quoted = project({
    scenes: [DEAD_TAIL],
    videoMd: ["---", "rules:", '  DEAD_AIR_TAIL: {maxTail: "5.0", reason: "quoted by habit"}', "---"].join("\n"),
  });
  const a = lintManifest(quoted);
  assert.ok(!a.findings.some((f) => f.rule === "DEAD_AIR_TAIL"), JSON.stringify(a.findings));
  assert.deepEqual(a.overrides, [{ rule: "DEAD_AIR_TAIL", tier: "project", maxTail: 5, reason: "quoted by habit" }]);

  // A value that can't become a number is not applied AND not echoed.
  const garbage = project({
    scenes: [DEAD_TAIL],
    videoMd: ["---", "rules:", '  DEAD_AIR_TAIL: {maxTail: loose, reason: "typo"}', "---"].join("\n"),
  });
  const b = lintManifest(garbage);
  assert.ok(b.findings.some((f) => f.rule === "DEAD_AIR_TAIL" && !f.waived)); // default 1s bound still enforced
  assert.deepEqual(b.overrides, [{ rule: "DEAD_AIR_TAIL", tier: "project", reason: "typo" }]);
});

test("lintManifest: an explicit maxTail outranks the project retune, and the echo says so", () => {
  // `lint --max-tail 0.2` asking for strict was silently loosened back to
  // the project's 5.0 — a false green driven by an advertised flag.
  const manifest = project({
    scenes: [DEAD_TAIL],
    videoMd: ["---", "rules:", '  DEAD_AIR_TAIL: {maxTail: 5.0, reason: "long-tail style"}', "---"].join("\n"),
  });
  const { findings, overrides } = lintManifest(manifest, { maxTail: 0.2 });
  const tail = findings.find((f) => f.rule === "DEAD_AIR_TAIL");
  assert.ok(tail && !tail.waived, JSON.stringify(findings));
  assert.match(tail.detail, /bound 0\.2s/);
  assert.deepEqual(overrides, [
    { rule: "DEAD_AIR_TAIL", tier: "project", maxTail: 5, superseded: true, reason: "long-tail style" },
  ]);
});

test("lintManifest: a sub-0.25s tail sliver flags SPEECH_AT_OUT exactly like candidates", () => {
  // The cached whole-file silence map carries a span candidates' windowed
  // silencedetect (d=0.25) structurally cannot report: a 0.1s sliver at the
  // range edge. Keeping it gave lint tail=0.1 (green) while the same range
  // blocked SPEECH_AT_OUT at lock — the one-implementation invariant broken.
  const src = "src.mp4";
  const manifest = project({
    scenes: [{ id: 1, slug: "tight", source: src, start: 0.5, end: 10.0, status: "locked" }],
    index: {
      version: 4, duration: 30, hasAudio: true,
      words: [
        { start: 0.6, end: 1.0, text: "We" },
        { start: 1.1, end: 9.9, text: "met." },
      ],
      silences: { "-40dB": [{ start: 9.9, end: 25.0 }] },
    },
  });
  const { findings } = lintManifest(manifest);
  const speech = findings.find((f) => f.rule === "SPEECH_AT_OUT");
  assert.ok(speech, JSON.stringify(findings));
  assert.equal(speech.severity, "block");
});

test("lintManifest: the work/edit.json layout finds the index analyze wrote, from any cwd", () => {
  // Manifest at <root>/work/edit.json, index at <root>/work/analysis (where
  // `ripple analyze` writes from <root>) — anchoring the default on
  // dirname(manifest) sent lint to <root>/work/work/analysis and every
  // scene became a false NO_INDEX block while status said clean.
  const dir = mkdtempSync(join(tmpdir(), "ripple-rules-"));
  const src = join(dir, "src.mp4");
  writeFileSync(src, "stub");
  mkdirSync(join(dir, "work", "analysis"), { recursive: true });
  writeFileSync(
    join(dir, "work", "analysis", `src_${fileStamp(src)}.analysis.json`),
    JSON.stringify({
      version: 4, file: src, duration: 30, hasAudio: true,
      words: [{ start: 0.3, end: 0.6, text: "We" }, { start: 0.7, end: 9.2, text: "met." }],
      silences: { "-40dB": [{ start: 9.2, end: 15.2 }] },
    })
  );
  const manifestPath = join(dir, "work", "edit.json");
  writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    scenes: [{ id: 1, slug: "met", source: "../src.mp4", start: 0, end: 10, status: "locked" }],
  }));
  const { findings } = lintManifest(manifestPath); // cwd is the repo, not the project
  assert.ok(!findings.some((f) => f.rule === "NO_INDEX"), JSON.stringify(findings));
});

test("lintManifest: a project override without a reason is ignored and reported once", () => {
  const videoMd = ["---", "rules:", "  DEAD_AIR_TAIL: {maxTail: 9}", "---"].join("\n");
  const manifest = project({ scenes: [DEAD_TAIL], videoMd });
  const { findings, overrides } = lintManifest(manifest);
  assert.deepEqual(overrides, []);
  assert.ok(findings.some((f) => f.rule === "waiver-missing-reason" && f.scene === null));
  // The retune was NOT applied: the 3s tail still blocks.
  assert.ok(findings.some((f) => f.rule === "DEAD_AIR_TAIL" && !f.waived));
});

test("lintManifest: --scene filter and index degradations", () => {
  const manifest = project({ scenes: [CLEAN, DEAD_TAIL] });
  const only = lintManifest(manifest, { scene: "met" });
  assert.deepEqual(only.scenes, ["met"]);
  assert.deepEqual(only.findings, []);

  // No word timing: warn, and silence-only checks still run.
  const src = join(dirname(manifest), "src.mp4");
  const noWords = project({
    scenes: [CLEAN],
    index: {
      version: 4, file: src, duration: 30, hasAudio: true, words: null,
      wordsNote: "whisper-cpp unavailable",
      silences: { "-40dB": [{ start: 9.2, end: 15.2 }] },
    },
  });
  const r = lintManifest(noWords);
  assert.ok(r.findings.some((f) => f.rule === "NO_WORD_TIMING" && f.severity === "warn"));

  // Silent b-roll: nothing to verify, no findings.
  const silent = project({ scenes: [CLEAN], index: { version: 4, duration: 30, hasAudio: false, words: null, silences: {} } });
  assert.deepEqual(lintManifest(silent).findings, []);
});
