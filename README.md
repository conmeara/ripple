# Ripple

**Give agents skills, tools, and taste for video editing.**

Ripple is a command-line editor's workbench for AI agents. It turns footage
and timelines into time-aligned images, structured text, and explicit edit
decisions, then gives the agent the tools to change the cut and deterministic
gates to verify the result.

The CLI is the product. Install it and any agent harness can edit competently:

```bash
npm install --global ripple-video
```

This installs the `ripple` command. It works with any agent that can run a
shell — Claude Code, Codex, or a bare model at a terminal — and runs
local-first: perception is built with `whisper-cpp` and `ffmpeg` on your
machine, with no cloud transcription. A bare agent with no skill installed can
run `ripple help` and edit; every command prints guidance and names its
natural next command, so the CLI teaches its own use.

The optional plugin adds skills — opinionated playbooks that carry editorial
craft on top of the same CLI. See [Enhanced install](#enhanced-install-the-plugin).

## Where Ripple sits

**ffmpeg is hands. HyperFrames is imagination. The NLE is the finishing
suite. Ripple is the eyes, ears, and editorial judgment loop.** It never
competes with the other three — it routes to them and owns the timeline
decisions. A model experiences video as text and image tokens, not as a
continuous timeline: a frame sheet shows the picture but not whether a speaker
has finished, how long a silence lasts, where a breath lands, or whether the
next take has leaked into the cut. Editing depends on the relationships
between those signals over time, and that is what Ripple measures.

Nobody else combines all four of these: local-first perception, verified cut
endpoints, deterministic QA gates, and NLE handoff.

## Tools

`ripple analyze` builds a cached perception index for each source: word
timings fused with measured silence, sentence boundaries and pace, fillers,
audible non-speech events, terminal pitch, breaths, motion, scene changes, and
energy. Perceive once, cache forever; every later question is a cheap query.

The flagship artifact is the timeline sheet — the editor's timeline as one
image the model can inspect directly.

![Anatomy of a real Ripple timeline sheet, with each band labelled: a time ruler, source thumbnails, a motion strip, an audio waveform with measured silence, non-speech events, and a word-aligned transcript on one shared time axis, plus the orange OUT cut marker](docs/assets/anatomy-of-a-timeline-sheet.png)

`timeline-sheet` combines frames, motion, waveform, measured silence,
non-speech events, transcript, and edit markers into a single image on a
shared time axis. The agent can reason in tokens, confirm the situation
visually, and make an edit without guessing how one view maps to the other.

Commands return structured JSON to stdout and write inspectable artifacts, so
decisions stay traceable and renders stay reproducible. Run `ripple help` or
`ripple <command> --help` for details.

![Ripple has three parts: skills provide optional editing playbooks, tools provide the deterministic CLI commands, and taste persists creative direction in VIDEO.md](docs/assets/skills-tools-taste.png)

### Core loop

The path from raw clips to a verified, rendered cut.

| Command | What it does |
|---|---|
| `analyze` | Build the perception index — word timings, silence/speech maps, sentences with pace, fillers, non-speech events, scene changes, motion and energy — cached, run once per source; long sources transcribe in silence-anchored chunks so timestamps cannot drift |
| `candidates` | Verify a cut range: word timing, red flags, suggested IN/OUT, silence, transcript, edge frames, head/tail cut-card sheets; `--manifest` batch-verifies every scene of a cut |
| `frame-sheet` | Tiled frame sheet so you can see the video; `--scenes` samples where the picture changes — the discovery mode for takes and resets |
| `timeline-sheet` | The editor's timeline as one image: thumbnails, motion strip, waveform with silence shading, word-aligned transcript, and cut markers |
| `lint` | Pre-render rule check from cached perception: every scene's endpoint flags plus waiver accounting; exit 1 on an unwaived block |
| `cut` | Render the manifest: clips, cards, J/L-cuts, dissolves, music bed, full assembly — with 30ms de-pop fades at every cut boundary by default |
| `qa` | Deterministic delivery gates and trend snapshots; `--report` renders the HTML QA report |

### Scale & multicam

For hours of footage, repeated takes, and synced recordings.

| Command | What it does |
|---|---|
| `search` | Find where anyone says a phrase, word-accurate, across all indexed sources |
| `select` | Group takes across files by transcript and recommend the best per group |
| `sync` | Multicam: audio cross-correlation offsets between recordings |
| `beats` | Beat grid for a music bed: bpm, beat times, confidence |
| `study` | Taste extraction from a reference edit → proposed `VIDEO.md` values with the measurement behind each |

### Support

Inspection, transcripts, history, captions, and handoff.

| Command | What it does |
|---|---|
| `doctor` | Check ffmpeg, whisper, and encoders and print fixes |
| `probe` | Inspect one file's streams, HDR, and capabilities; no file lists the media bin and perception-index state |
| `history` | Save, list, and diff cut snapshots (identical versions dedup) |
| `captions` | Word-accurate captions in output time: `.srt` plus styled `.ass`; optional burn-in |
| `handoff` | Hand the cut to an NLE — OTIO (Resolve), xmeml (Premiere), EDL (universal) |
| `transcribe` | Transcript: existing subtitles first, whisper-cpp fallback, cached; `--words` for word-level timing |

All commands print JSON to stdout, including error envelopes. Exit codes are
`0` for success, `1` for a failed gate or runtime failure, and `2` for invalid
usage or a missing dependency. State lives in `~/.ripple/`.

## Independent QA

After every render or repair, Ripple can hand the output to a bundled,
read-only [`qa-reviewer`](agents/qa-reviewer.md) subagent. The editor does not
get to be the only judge of its own work.

The reviewer receives a narrow checklist of the failure modes that matter for
that change — such as a complete sentence ending, no leaked prompt audio,
unchanged neighboring scenes, preserved color metadata, and a clean decode. It
gathers direct evidence with the Ripple CLI, transcripts, timeline sheets, and
media probes, then reports `PASS` or `FAIL` for each item. It cannot edit or
re-render the video.

Deterministic QA (`lint`, `qa`) catches known technical failures; the fresh
context checks the specific editorial promise the editing agent just made. When
the host cannot run subagents, Ripple applies the same checklist in the current
context and discloses that the review was not independent.

## Taste

[`VIDEO.md`](skills/ripple/templates/VIDEO.md) stores the project's standing
creative direction: pacing, register, color policy, brand, anti-references, and
confirmed steering. [`edit.json`](schemas/edit.schema.json) stores the
decisions for the current cut — a machine-checkable paper edit. Direction
becomes project state instead of a prompt that must be reconstructed every
session.

`ripple study` measures a reference edit's cutting rhythm, delivery pace, tail
preference, silence usage, energy, and grade lean, then proposes matching
`VIDEO.md` values with the evidence behind each. Ripple never changes the
project's taste without user approval.

## Enhanced install: the plugin

The plugin adds one Ripple skill: a [`SKILL.md`](skills/ripple/SKILL.md) router
plus four optional playbooks. They are opinions about the craft, not CLI docs —
each one names the editorial rule and the instrument that applies it.

| Playbook | The opinion it carries |
|---|---|
| **develop** | Turn an idea into a script, AV script, shot list, or storyboard — and generate the missing elements (voice-over, music, stills, b-roll) when the footage isn't there yet |
| **edit** | The verified-endpoint cut loop: calculate endpoints instead of eyeballing them, select takes on evidence, repair one scene instead of rebuilding the edit |
| **taste** | Capture and defend `VIDEO.md`, extract taste from references with `study`, and hold the production-stack opinions |
| **deliver** | Finish and assemble safely, apply color recipes, run the QA report, and hand a clean structure off to an NLE |

Ask in plain language, or invoke a phase directly with `/ripple <phase>` in
Claude Code and `$ripple <phase>` in Codex.

### Opinionated defaults

The playbooks are concrete: inspect the timeline before locking a cut,
calculate endpoints instead of eyeballing them, use multiple signals, repair
one scene instead of rebuilding the edit, and never silently convert color.

They also choose a production stack:

| Need | Default |
|---|---|
| Cut, trim, or assemble existing footage | FFmpeg through the Ripple CLI; no framework |
| Motion graphics from scratch | Official [HyperFrames](https://github.com/heygen-com/hyperframes) skills |
| Timed overlays, React components, or design handoff | Official [Remotion](https://www.remotion.dev/docs/ai/skills) skills, timed from the word-level transcript |
| Voice-over | [ElevenLabs](https://github.com/elevenlabs/skills) TTS: `eleven_multilingual_v2` by default, `eleven_v3` for a more expressive read |
| Music bed and sound effects | ElevenLabs Music and SFX; instrumental beds generated to the manifest's exact duration |
| Stills, cards, and storyboards | Gemini Image (“Nano Banana”); Flash by default, Pro for complex composition |
| B-roll | Recut existing footage first, then Pexels/Pixabay stock; use Veo only for a storyboarded gap shot |
| Scratch or offline voice-over | Piper TTS, then swap the final voice and re-check the endpoints |
| Alternative image generation | Imagen when Gemini misses on photorealism; OpenAI only when the project already uses OpenAI; fal.ai when one key needs to cover broader models |
| Alternative video generation | fal.ai before a direct Kling integration for ordinary Kling shots; Kling directly for avatar or lip-sync work; Runway when one hero shot matters more than cost |
| Specialized formats | HeyGen for avatar-led video; Suno only when the project needs a song rather than a music bed |

## What Ripple is for

Every capability serves one of four scenarios: raw clips → finished cut (the
flagship), demo/product video, interview + b-roll at scale, and fiction /
scripted. All four share one spine — perceive → decide-with-user → assemble →
verify → deliver. See [docs/scenarios.md](docs/scenarios.md) for the full
frame, and [docs/prior-art.md](docs/prior-art.md) for what Ripple adopts,
learns from, and ignores.

**The wiki** — an interactive map of the whole plugin (the spine, every
command's internals, the skill playbooks verbatim, and how Ripple compares to
the rest of the landscape) — lives at
[conmeara.github.io/ripple](https://conmeara.github.io/ripple/). It is
generated from the tree by `npm run gen:wiki` into `docs/index.html`.

## Quick start

Analyze a source, look at its timeline, and go:

```bash
ripple analyze interview.mov
ripple timeline-sheet interview.mov
```

Or describe the edit to your agent:

```text
Cut a 30-second promo from these clips, synced to the track.
```

## Installing the plugin

Claude Code:

```text
/plugin marketplace add conmeara/ripple
/plugin install ripple@ripple
```

Codex:

```bash
codex plugin marketplace add conmeara/ripple
codex plugin add ripple@ripple
```

Then run `/ripple taste` in Claude Code or `$ripple taste` in Codex to capture
the project's taste in `VIDEO.md` — or just describe the edit; the skill
creates `VIDEO.md` with you on first touch.

## Requirements

- Node.js 20+
- `ffmpeg` and `ffprobe` on `PATH` (`brew install ffmpeg`)
- For word-accurate editing: `whisper-cpp` with a model in
  `~/.ripple/models/` (optional; Ripple falls back to existing subtitles)

Run `ripple doctor` to check tools and print fixes.

## License

Apache-2.0
