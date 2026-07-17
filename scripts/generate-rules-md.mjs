#!/usr/bin/env node
// Generate skills/ripple/reference/rules.md from the RULES registry in
// cli/rules.mjs — the registry is the single source of truth, so the doc can
// never lie about the rules. Deterministic: stable ordering (registry order,
// filtered by phase), count derived from RULES.length. A test pins the
// committed file to this output byte-for-byte, so any drift fails CI.
//
//   node scripts/generate-rules-md.mjs          # write the doc
//   node scripts/generate-rules-md.mjs --check   # exit 1 if the doc is stale
//   npm run gen:rules                            # the same, via package.json
//
// Edit the per-rule `doc`/`why` columns in cli/rules.mjs, never this .md.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RULES } from "../cli/rules.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOC_PATH = join(ROOT, "skills", "ripple", "reference", "rules.md");

// One row per rule: id in code font, severity, the doc `Catches` cell, the doc
// `Origin` cell. Registry order within a phase is the doc order.
function table(phase) {
  const rows = RULES.filter((r) => r.phase === phase).map(
    (r) => `| \`${r.id}\` | ${r.severity} | ${r.doc} | ${r.why} |`
  );
  return ["| Rule | Severity | Catches | Origin |", "|---|---|---|---|", ...rows].join("\n");
}

export function generateRulesMd() {
  return `# The rule registry — ${RULES.length} deterministic editing rules

Every deterministic opinion ripple enforces has ONE name, defined in
\`cli/rules.mjs\` and checked at three moments:

- **lock** — \`ripple candidates\` flags a single cut range before it locks
- **render** — \`ripple lint\` re-judges every scene of edit.json from cached
  perception before anything renders (plus \`ripple cut\`'s advisories)
- **delivery** — \`ripple qa\` gates the rendered artifacts

The same rule ID means the same failure at every moment. The registry exists
because the same defect kept changing names between surfaces: a tail judged
and accepted at lock time came back as an anonymous red at delivery and got
re-litigated from scratch. Each rule's origin below names the real session
failure that created it — a rule nobody can explain gets deleted.

Severity: **block** stops the phase (candidates flags block locking, unwaived
lint blocks exit 1, failed qa gates exit 1); **warn** is surfaced and never
blocks.

## Lock rules (SCREAMING_SNAKE — cut-point flags)

Raised by \`ripple candidates\` on a range and by \`ripple lint\` on every scene.

${table("lock")}

## Render rules (pre-render findings and render-time advisories)

\`NO_INDEX\`, \`NO_WORD_TIMING\`, \`DRIFT_SUSPECT\`, and \`waiver-missing-reason\`
are raised by \`ripple lint\`; \`jump-cut\` and \`off-beat\` by \`ripple cut\` (they
need frames and a beat grid, which lint — fast and side-effect-free by
contract — never computes).

${table("render")}

## Delivery gates (kebab-case — \`ripple qa\`)

${table("delivery")}

## Waiving a rule

Waivers exist because a rule that cannot bend gets deleted instead of obeyed.
Every waiver is surfaced as waived-with-reason in the lint report — never
silently dropped — and a waiver without a reason is ignored and reported
(\`waiver-missing-reason\`).

### Scene tier — edit.json

One scene is intentionally an exception. Sits next to the bounds it excuses:

\`\`\`json
{
  "slug": "long_goodbye",
  "start": 771.2, "end": 779.0,
  "waivers": [
    { "rule": "DEAD_AIR_TAIL", "reason": "she looks at the photo for 2s — the silence is the scene" }
  ]
}
\`\`\`

### Project tier — VIDEO.md front-matter

The whole project's style bends a rule: retune its threshold or waive it
everywhere. Lives in the YAML block at the top of VIDEO.md:

\`\`\`yaml
---
rules:
  DEAD_AIR_TAIL: {maxTail: 2.5, reason: "contemplative piece — long tails are the point"}
  NEXT_SPEECH_INSIDE: {waive: true, reason: "single-take monologue, no prompts to leak"}
---
\`\`\`

\`maxTail\` retunes \`DEAD_AIR_TAIL\`; \`maxLead\` retunes \`LATE_FIRST_WORD\`;
\`waive: true\` waives the rule project-wide. Retunes are echoed in lint's
and candidates' \`overrides\` block so they are visible on every run, and
both commands read the same VIDEO.md — a range judges identically at lock
and pre-render. Precedence: an explicit CLI flag (\`--max-tail\`/\`--max-lead\`)
outranks the project retune (the echoed entry is marked \`superseded: true\`),
and the retune outranks the built-in default. A retune value that isn't a
number (quoted numbers like \`"2.5"\` are fine — they coerce) is not applied
and not echoed.

### Delivery thresholds — the manifest's qa block

Delivery gates were already tunable from edit.json and stay that way:
\`qa.maxTailSilence\`, \`qa.maxLeadingSilence\`, \`qa.maxLoudnessSpread\`,
\`qa.leakPatterns\`. The gates that compare against the manifest
(\`black-frames\`, \`freeze-frames\`, \`leading-silence\`) self-adjust to cards
and transitions — a declared opening card is quiet and black on purpose.

## Reading a lint report

\`ripple lint edit.json\` prints every finding:

\`\`\`json
{ "rule": "DEAD_AIR_TAIL", "scene": "long_goodbye", "severity": "block",
  "waived": true, "waiverReason": "she looks at the photo for 2s — the silence is the scene" }
\`\`\`

Exit 1 means at least one **unwaived block** finding stands: re-scope the cut
(\`ripple candidates\` — the index's \`sentences\` array is the lattice) or waive
it with a written reason. Exit 0 with warn findings means render, but read
them first.
`;
}

// CLI only when run directly — importing this module (the test does, to call
// generateRulesMd) must have no side effects. --check for CI/hooks; default
// writes the file.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const generated = generateRulesMd();
  if (process.argv.includes("--check")) {
    if (readFileSync(DOC_PATH, "utf8") !== generated) {
      process.stderr.write("rules.md is stale — run: npm run gen:rules\n");
      process.exit(1);
    }
  } else {
    writeFileSync(DOC_PATH, generated);
    process.stdout.write(`wrote ${DOC_PATH} (${RULES.length} rules)\n`);
  }
}
