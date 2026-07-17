# What Ripple is for

Ripple exists because an agent cannot see or hear. A human editor perceives
footage continuously — the breath before a sentence, the glance after it, the
beat where a cut wants to land. An agent gets text and image tokens, paid for
per token, with no native sense of time. Everything Ripple does is a response
to that constraint.

This document is the standing answer to "what should Ripple be used for," the
source of truth for what belongs in the CLI, and the contract our evals
measure against.

## The frame

**ffmpeg is hands. HyperFrames is imagination. The NLE is the finishing
suite. Ripple is the eyes, ears, and editorial judgment loop.** We never
compete with the other three — we route to them and own the timeline
decisions.

What a human editor has that an agent lacks, and Ripple's answer to each:

| The editor has | The agent gets | Ripple's answer |
|---|---|---|
| Continuous perception | Tokens | The perception index: word timings fused with measured silence, energy, scenes (`analyze`) — plus sheets the agent can actually look at |
| Free re-watching / scrubbing | Expensive re-perception | Perceive once, cache forever; every later question is a cheap query |
| Craft attached to senses ("cut after the breath") | Craft theory with no way to apply it | **(instrument, opinion) pairs** — `candidates` is the instrument for "cut after the completed thought" |
| Involuntary playback review | Overconfident shipping | Deterministic gates (`lint`, `qa`) + the independent qa-reviewer |
| Taste held across weeks | Fresh context every session | `VIDEO.md` (taste) + `edit.json` (the paper edit) as project state |

### The (instrument, opinion) test

The unit of value in Ripple is the pair: a measurement plus the craft rule
that measurement enables. Craft knowledge without an instrument is useless to
an agent (it knows to cut after the breath; it can't hear the breath).
An instrument without an opinion gets misused. **A feature that can't name
both its measurement and its craft rule doesn't go in.**

## The four scenarios

Every capability must serve at least one of these. All four share one spine:

**perceive → decide-with-user → assemble → verify → deliver (render or hand off)**

### 1. Raw clips → finished cut (the flagship)

One or many raw clips — an interview, a Q&A, event footage, multiple takes.
Cut at the right moments like an editor would: complete thoughts, no dead
air, no leaked resets. Title cards, a music bed, maybe color. Render and QA.

- Core loop: `analyze` → `candidates` ⇄ `frame-sheet`/`timeline-sheet` →
  `lint` → `cut` → `qa`. Take selection via `select` when takes repeat.
- Terminal: rendered delivery.
- This scenario is fully served by the core tier and is the permanent
  regression benchmark.

### 2. Demo / product video

Screen recordings and app captures assembled into a story: smooth intro,
music, voiceover, animated inserts.

- The perception question is different: cuts land on *action* (the click,
  the transition settling), not speech. Whether motion + scene-change curves
  already answer "when did the UI settle" the way word timings answer "when
  did he stop talking" is an open question — **eval before feature**.
- Generation routes out: voiceover → ElevenLabs, animations → HyperFrames,
  music → generated to the manifest's duration. Ripple owns assembly timing.
- Terminal: rendered delivery.

### 3. Interview + b-roll (nonfiction at scale)

Hours of A-roll across files, b-roll on top, a storyline built **with the
user**: transcribe everything, find the story, paper-edit, select takes, cut
A-roll, lay b-roll, cut to music, cards.

- This is where the scale tier earns its keep: `search` (word-accurate
  phrase search), `select` (take grouping), scene-sampled `frame-sheet`
  (b-roll discovery — the agent's eyes are genuinely good at "look at 40
  tiles, pick the coffee pour"; no semantic-search command needed, sheets
  just have to stay cheap at three hours).
- `edit.json` is literally a paper edit — the documentary editor's native
  artifact, machine-checkable.
- Terminal: **often the NLE** — `handoff` (OTIO/FCP7 XML/EDL) is a peer
  terminal here, not a tail feature. Cut the structure right, hand it over.

### 4. Fiction / scripted

Takes matched to script lines, or generated footage cut to a script. J/L
cuts, multiple audio channels, everything smooth.

- `select`'s transcript grouping matches takes to script lines. The manifest
  carries J/L cuts and the music bed. The *craft* of the complex cuts lives
  in the edit playbook.
- Honest position: the complex end of this scenario should terminate in an
  NLE handoff. Ripple is not a finishing suite.

## What this implies

- **The CLI is the product and the curriculum.** A bare agent with no skill
  installed should run `ripple help` and edit competently — that claim has
  its own eval. Guidance lives in command stdout (the only channel with a
  proven 100% read rate); every command names its natural next command.
- **Skills are optional opinion.** Four playbooks — develop, edit, taste,
  deliver — carry the craft and the service choices. They teach; they don't
  document the CLI.
- **The per-scenario differences are almost entirely opinions**, which is why
  the playbooks are thin and the CLI is shared.

## The eval contract

Each scenario is (or becomes) an eval. Two standing rules:

1. **Ablation measures value.** The flagship scenario runs at four rungs —
   bare agent + ffmpeg, + CLI, + router, + full skill — on the models that
   actually drive Ripple in production (Sonnet, Codex). The deltas between
   rungs are the measured value of each layer.
2. **A capability that moves no scenario's score is dead weight**, no matter
   how clever it is. That's the standing kill rule, and the reason this file
   lists scenarios rather than features.

New features follow the loop: (instrument, opinion) pair named → prior-art
check (`docs/prior-art.md`) → ablation eval → ship.
