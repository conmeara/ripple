# Ripple plugin evals

Lightweight end-to-end evals that check three things before a release:

1. **Everything works** — the CLI pipeline runs on real footage (case 10, no agent).
2. **Agents understand the plugin** — Codex and Claude, given plain-language editing
   asks that never say "ripple", discover the skill, use the CLI, and follow the
   playbooks (cases 20–70).
3. **It actually helps, layer by layer** — the ablation rungs (cases 90-a…d) run
   the same tighten task at four levels: bare agent + ffmpeg, + the CLI with no
   skill, + the SKILL.md router only, + the full plugin. The summary prints them
   side by side; the deltas are the measured value of each layer. Rung B (CLI,
   no skill) is the north-star acceptance case: if a bare agent can edit
   competently from `ripple help` alone, the CLI is the curriculum. Case 80 is
   the older codex-flavored baseline of the same idea.
4. **Which channel agents understand** — the perception probes (91–93) give
   Sonnet only the index JSON, only the timeline sheet, or both, and ask for a
   known-ground-truth OUT on a clip whose quiet ending traps single-signal
   reasoning. They measure which perception channel earns its tokens.
5. **Every scenario is served** — the scenario cases (94–98) put one
   representative task from each of `docs/scenarios.md`'s four scenarios in
   front of an agent: demo (motion, no speech), interview at scale (search),
   fiction-lite (J-cut), multicam (sync), and animation (routing). A capability
   that moves none of these scores is dead weight — this is the kill rule's
   measuring stick.

Agent policy: mostly **Codex** (`gpt-5.5` by default — override with
`RIPPLE_EVAL_CODEX_MODEL`), some **Claude Sonnet**, one **Claude Opus** case.
Fable is rejected by the runner.

## Requirements

- `ffmpeg`/`ffprobe`, `whisper-cpp` + a model in `~/.ripple/models/` (`ripple doctor`)
- `claude` CLI (Claude Code) and `codex` CLI on PATH, both authenticated
- Sample footage: only `~/Projects/Groom-Video/IMG_E1223.MOV` (override the dir
  with `RIPPLE_EVAL_FOOTAGE`). Every fixture is cut from that one master into
  `~/.ripple/eval-cache/` on first run, so evals never depend on a live
  project's derived files. Delete the cache dir to rebuild.

## Run

```bash
node evals/run.mjs              # full suite (roughly 30-60 min, mostly agent time)
node evals/run.mjs --list       # list cases
node evals/run.mjs --only 10    # just the no-agent CLI smoke
node evals/run.mjs --only 30,80 # plugin vs baseline pair
```

Results land in `evals/runs/<timestamp>/` (gitignored): per-case workspace (`ws/`),
the agent's full event transcript (`transcript.jsonl`), its final message
(`final.txt`), `result.json`, and a run-level `summary.md` + `results.json`.
Exit code is 0 only when every non-baseline case passes.

## How it works

- Each case in `evals/cases/*.json` declares an agent (`codex`, `claude`, or
  `none`), a natural-language prompt, fixtures copied into a fresh workspace,
  optional setup commands (`$RIPPLE` expands to the working-tree CLI), and
  deterministic checks.
- Claude runs load the plugin from the working tree via `--plugin-dir`, so evals
  test HEAD, not the installed marketplace copy.
- Claude cases can set `"skill": "none" | "router" | "full"` (default full):
  `none` loads no plugin, `router` loads a stripped copy with SKILL.md but no
  reference/ playbooks (built per run), `full` is the normal plugin. Add
  `"bareCli": true` to also remove the `ripple` shim from PATH (ablation rung
  A). The knob is claude-only — codex installs its plugin globally.
- Every agent and setup command gets a PATH shim so a bare `ripple` resolves to
  the working-tree CLI (an installed plugin's cached bin can otherwise shadow it
  with a stale version).
- Codex runs disable memories (`--disable memories`) — otherwise the agent can
  recall prior sessions on the same footage and the eval stops measuring the
  plugin.
- Codex runs use `ripple@ripple-local`, reinstalled automatically each run from
  `evals/codex/` (a local marketplace whose `ripple` entry symlinks back to the
  working tree; Codex snapshots it into its plugin cache at install time).
- The main fixture (`loose_married.mp4`) is a 33s HLG-HDR slice of the groom
  interview containing a leaked "take two" slate, 5s of dead air, a complete
  answer ending "…just a bonus", and a throat-clear tail — real material for the
  slate-leak, endpoint, tail, and HDR-preservation failure modes the plugin
  exists to prevent. `howmet.mp4` / `married.mp4` are pre-trimmed answers for the
  assembly and routing cases. `long_qanda.mp4` is a 7.4-minute slice (audio
  copied bit-exact, video downscaled to keep it ~130MB) that reproduces the
  whisper timestamp drift a real session shipped bad cuts from — the drift
  case asserts the index warns and candidates blocks.
- Checks are deterministic: file existence, ffprobe duration/color bounds,
  whisper transcript of the *rendered output* (did the ending survive? did the
  slate leak?), manifest JSON assertions, and greps over the agent transcript
  (did it actually use the plugin?) and final message (did it report honestly?).

## Cases

| case | agent | what it proves |
|---|---|---|
| 10-cli-smoke | none | analyze → probe → candidates → timeline-sheet → cut → lint (incl. endpoint digest) → qa → history all work on real HDR footage |
| 12-drift-detection | none | on a 7.4-min source, chunked analysis prevents cumulative drift (suspected=false, no severe late endings) while candidates' isolated cross-check still flags an endpoint disagreement (INDEX_DRIFT), suppressing suggestedOut |
| 20-routing-codex | codex | plain "what footage do I have" routes through the plugin; HDR reported |
| 30-tighten-codex | codex | raw take → clean clip: slate dropped, ending kept, tail tight, HDR preserved |
| 32-tighten-codex-invoked | codex | same task with explicit `$ripple edit` — isolates skill *triggering* (30 fails, 32 passes ⇒ triggering gap; both fail the same check ⇒ playbook-adherence gap) |
| 35-tighten-sonnet | claude/sonnet | same task — cross-host parity |
| 40-assembly-opus | claude/opus | two-scene assembly with manifest + QA discipline |
| 50-repair-codex | codex | localized repair: end extended, head untouched, ending restored |
| 60-handoff-sonnet | claude/sonnet | "I'll finish in Resolve" → timeline file exported |
| 70-qa-honesty-codex | codex | QA on a seeded-broken render reports FAIL, names the defect, changes nothing |
| 80-baseline-codex | codex (baseline) | same bar as case 30 without the plugin — the "does it help" comparison |
| 90-ablation-a-bare | claude/sonnet (baseline) | rung A: bare agent + ffmpeg only |
| 90-ablation-b-cli | claude/sonnet | rung B: + the CLI, no skill — **the north-star case** |
| 90-ablation-c-router | claude/sonnet (baseline) | rung C: + SKILL.md router, no playbooks |
| 90-ablation-d-full | claude/sonnet | rung D: full plugin — B−A = CLI value, C−B = router, D−C = playbooks |
| 91-probe-index | claude/sonnet (baseline) | OUT from index JSON alone on a quiet-ending clip (ground truth 21.0–22.18s) |
| 92-probe-sheet | claude/sonnet (baseline) | same, from the timeline-sheet image alone |
| 93-probe-both | claude/sonnet (baseline) | same, from both channels — which perception channel earns its tokens |
| 94-scenario-demo-settle | claude/sonnet | demo scenario: "when did the UI settle" answered from motion/scene curves on a synthetic screen recording (ground truth 6.0s) |
| 95-scenario-interview-search | claude/sonnet | interview-at-scale scenario: find one answer inside 7.4 minutes by phrase and cut it clean |
| 96-scenario-fiction-jcut | claude/sonnet | fiction-lite scenario: clip → card → clip with a J-cut audio lead under the card |
| 97-scenario-multicam-sync | claude/sonnet | multicam scenario: recover the true two-camera offset (ground truth 3.7s, built by construction) |
| 98-scenario-animation-routing | claude/sonnet | animation scenario: motion graphics route to HyperFrames/Remotion instead of ffmpeg fakery |

## Reading a run

`summary.md` gives the table plus every failing check with its evidence.
For agent behavior questions, read `transcript.jsonl` (every command the agent
ran) and `final.txt` (what it told the user). A green 30 with a red 80
`duration-tight`/`ending-kept` is the expected "plugin helps" signature.

Flaky notes: whisper wording can vary slightly between runs; checks only assert
stable words ("bonus", "coffee", "take"). Agent runs are nondeterministic —
a single red agent case means read the transcript before calling it a
regression (same policy as the unit-test suite).
