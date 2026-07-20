# Ripple plugin evals

Lightweight end-to-end evals that check three things before a release:

1. **Everything works** — the CLI pipeline runs on real footage (case 10, no agent).
2. **Agents understand the plugin** — Codex and Claude, given plain-language video
   asks that never say "ripple", discover the skill, use the CLI, and follow its
   workflow (cases 20–70).
3. **It actually helps, layer by layer** — the ablation rungs (cases 90-a…d) run
   the same tighten task at four levels: bare agent + ffmpeg, + the CLI with no
   skill, + the SKILL.md header only, + the full skill. The summary prints them
   side by side; the deltas are the measured value of each layer. Rung B (CLI,
   no skill) is the north-star acceptance case: if a bare agent can edit
   competently from `ripple help` alone, the CLI is the curriculum. Case 80 is
   the older codex-flavored baseline of the same idea.
4. **Which channel agents understand** — the perception probes (91–93) give
   Sonnet only the index JSON, only the timeline sheet, or both, and ask for a
   known-ground-truth OUT on a clip whose quiet ending traps single-signal
   reasoning. They measure which perception channel earns its tokens.
5. **Every scenario is served** — the scenario cases (94–98) cover five
   representative jobs: demo (motion, no speech), interview at scale (search),
   fiction-lite (J-cut), multicam (sync), and animation (routing). A capability
   that moves none of these scores is dead weight — this is the kill rule's
   measuring stick.
6. **The opinions route correctly** — the service cases (99-*) check the
   production-stack opinions fire when generation enters a task: VO → ElevenLabs
   with a standing voice ID, music → generated to the manifest's duration, b-roll
   → recut/stock before generation. Plan-only, no renders — cheap.
7. **The skill triggers right** — `trigger-set.json` holds 20 realistic positive
   and near-miss queries. Its positives cover both existing-footage work and
   make-from-scratch requests that Ripple should route to specialist production
   tools. `trigger.mjs` tests the real working-tree plugin in isolated Claude
   and Codex profiles and counts only a Ripple skill invocation.

Agent policy: mostly **Codex** (`gpt-5.5` by default — override with
`RIPPLE_EVAL_CODEX_MODEL`), some **Claude Sonnet**, one **Claude Opus** case.
Fable is rejected by the runner.

## Requirements

- `ffmpeg`/`ffprobe`, `whisper-cpp` + a model in `~/.ripple/models/` (`ripple doctor`)
- `claude` CLI (Claude Code) and `codex` CLI on PATH, both authenticated
- Sample footage: a single `interview-master.mov` in the footage dir
  (`RIPPLE_EVAL_FOOTAGE`, default `~/.ripple/eval-footage`; override the full
  path with `RIPPLE_EVAL_MASTER`). The fixture cuts are range-locked to that
  file. Every fixture is cut from the master into
  `~/.ripple/eval-cache/` on first run, so evals never depend on a live
  project's derived files. Delete the cache dir to rebuild.

## Run

```bash
node evals/run.mjs              # full suite (roughly 30-60 min, mostly agent time)
node evals/run.mjs --list       # list cases
node evals/run.mjs --only 10    # just the no-agent CLI smoke
node evals/run.mjs --only 30,80 # plugin vs baseline pair
node evals/trigger.mjs --host claude,codex --runs 3 --workers 3
```

Results land in `evals/runs/<timestamp>/` (gitignored): per-case workspace (`ws/`),
the agent's full event transcript (`transcript.jsonl`), its final message
(`final.txt`), `result.json`, and a run-level `summary.md` + `results.json`.
Exit code is 0 only when every non-baseline case passes.

Trigger results land in `evals/runs/trigger-<timestamp>/`. Each trial keeps its
raw JSONL, stderr, and classification; run metadata records the commit, dirty
state, host/model versions, and exact SKILL.md description hash. Classification
happens while events stream, so a later task timeout cannot erase an invocation.
A no-hit timeout or host failure is indeterminate, never a miss.

## How it works

- Each case in `evals/cases/*.json` declares an agent (`codex`, `claude`, or
  `none`), a natural-language prompt, fixtures copied into a fresh workspace,
  optional setup commands (`$RIPPLE` expands to the working-tree CLI), and
  deterministic checks.
- Claude runs load the plugin from the working tree via `--plugin-dir`, so evals
  test HEAD, not the installed marketplace copy.
- Claude cases can set `"skill": "none" | "router" | "full"` (default full):
  `none` loads no plugin, `router` loads a stripped copy with only SKILL.md's
  opening principles (built per run), and `full` loads the complete skill. Add
  `"bareCli": true` to also remove the `ripple` shim from PATH (ablation rung
  A). The knob is claude-only — codex installs its plugin globally.
- Every agent and setup command gets a PATH shim so a bare `ripple` resolves to
  the working-tree CLI (an installed plugin's cached bin can otherwise shadow it
  with a stale version).
- Codex runs disable memories (`--disable memories`) — otherwise the agent can
  recall prior sessions on the same footage and the eval stops measuring the
  plugin.
- Codex runs use `ripple@ripple-local`, reinstalled automatically each run from
  `evals/codex/`. The runner stages a lean, content-versioned plugin bundle from
  the working tree before Codex snapshots it into the plugin cache.
- The main fixture (`raw-interview.mp4`) is a 33s HLG-HDR slice of the
  interview master containing a leaked slate, 5s of dead air, a complete
  answer, and a throat-clear tail — real material for the
  slate-leak, endpoint, tail, and HDR-preservation failure modes the plugin
  exists to prevent. `answer-a.mp4` / `answer-b.mp4` are pre-trimmed answers for the
  assembly and routing cases. `long_qanda.mp4` is a 7.4-minute slice (audio
  copied bit-exact, video downscaled to keep it ~130MB) that reproduces the
  whisper timestamp drift a real session shipped bad cuts from — the drift
  case asserts the index warns and candidates blocks.
- Checks are deterministic: file existence, ffprobe duration/color bounds,
  audio correlation and source-window bounds (did the ending survive? did the
  slate leak?), manifest JSON assertions, and greps over the agent transcript
  (did it actually use the plugin?) and final message (did it report honestly?).

## Cases

| case | agent | what it proves |
|---|---|---|
| 10-cli-smoke | none | analyze → probe → candidates → timeline-sheet → cut → lint (incl. endpoint digest) → qa → history all work on real HDR footage |
| 12-drift-detection | none | on a 7.4-min source, chunked analysis prevents cumulative drift (suspected=false, no severe late endings) while candidates' isolated cross-check still flags an endpoint disagreement (INDEX_DRIFT), suppressing suggestedOut |
| 20-routing-codex | codex | plain "what footage do I have" routes through the plugin; HDR reported |
| 30-tighten-codex | codex | raw take → clean clip: slate dropped, ending kept, tail tight, HDR preserved |
| 32-tighten-codex-invoked | codex | same task with explicit `$ripple edit` — isolates skill *triggering* (30 fails, 32 passes ⇒ triggering gap; both fail the same check ⇒ skill-adherence gap) |
| 35-tighten-sonnet | claude/sonnet | same task — cross-host parity |
| 40-assembly-opus | claude/opus | two-scene assembly with manifest + QA discipline |
| 50-repair-codex | codex | localized repair: end extended, head untouched, ending restored |
| 60-handoff-sonnet | claude/sonnet | "I'll finish in Resolve" → timeline file exported |
| 70-qa-honesty-codex | codex | QA on a seeded-broken render reports FAIL, names the defect, changes nothing |
| 80-baseline-codex | codex (baseline) | same bar as case 30 without the plugin — the "does it help" comparison |
| 90-ablation-a-bare | claude/sonnet (baseline) | rung A: bare agent + ffmpeg only |
| 90-ablation-b-cli | claude/sonnet | rung B: + the CLI, no skill — **the north-star case** |
| 90-ablation-c-router | claude/sonnet (baseline) | rung C: + SKILL.md opening principles only |
| 90-ablation-d-full | claude/sonnet | rung D: full skill — B−A = CLI value, C−B = principles, D−C = craft guidance |
| 91-probe-index | claude/sonnet (baseline) | OUT from index JSON alone on a quiet-ending clip (ground truth 21.0–22.18s) |
| 92-probe-sheet | claude/sonnet (baseline) | same, from the timeline-sheet image alone |
| 93-probe-both | claude/sonnet (baseline) | same, from both channels — which perception channel earns its tokens |
| 94-scenario-demo-settle | claude/sonnet | demo scenario: "when did the UI settle" answered from motion/scene curves on a synthetic screen recording (ground truth 6.0s) |
| 95-scenario-interview-search | claude/sonnet | interview-at-scale scenario: find one answer inside 7.4 minutes by phrase and cut it clean |
| 96-scenario-fiction-jcut | claude/sonnet | fiction-lite scenario: clip → card → clip with a J-cut audio lead under the card |
| 97-scenario-multicam-sync | claude/sonnet | multicam scenario: recover the true two-camera offset (ground truth 3.7s, built by construction) |
| 98-scenario-animation-routing | claude/sonnet | animation scenario: motion graphics route to HyperFrames/Remotion instead of ffmpeg fakery |
| 99-service-vo | claude/sonnet | service routing: voiceover lands on ElevenLabs with a standing voice ID recorded for consistency |
| 99-service-music | claude/sonnet | service routing: music bed generated to the manifest's exact duration, wired via manifest.music not baked into clips |
| 99-service-broll | claude/sonnet | service routing: b-roll tries recut-existing and stock before generation |

## Reading a run

`summary.md` gives the table plus every failing check with its evidence.
For agent behavior questions, read `transcript.jsonl` (every command the agent
ran) and `final.txt` (what it told the user). A green 30 with a red 80
`duration-tight`/`source-window-preserved` is the expected "plugin helps"
signature.

Agent runs are nondeterministic. A single red agent case means read the
transcript before calling it a regression (same policy as the unit-test suite).
