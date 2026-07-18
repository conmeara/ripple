# Ripple

**Give agents the skills, tools, and taste to make video with you.**

Ripple is an open-source video-making toolkit for coding agents. It helps an
agent plan, produce, edit, verify, and deliver video from a brief, existing
footage, or both.

Agents cannot watch or hear a timeline directly. Ripple translates video into
evidence they can reason over: word-aligned transcripts, frame sheets, timeline
sheets, measured timing, and explicit edit decisions. Its CLI supplies the
senses and actions, its skill supplies the workflow, and `VIDEO.md` preserves
your taste.

> **Start here:** [Install Ripple](#install), then tell your agent: `Make a
> 30-second promo from these clips and verify every cut.`

## Why Ripple?

A shell gives an agent access to FFmpeg, but not editorial perception. It still
needs to know whether a speaker finished, a breath landed, a shot reset, or a
render preserved its color and sound. Ripple puts words, sound, motion, frames,
and cut markers on the same time axis, then records the edit as inspectable
project state.

**Perceive, decide with the user, assemble, verify, deliver.**

![A Ripple timeline sheet aligns source frames, motion, waveform, silence, non-speech events, transcript, and a cut marker on one time axis](docs/assets/anatomy-of-a-timeline-sheet.png)

## What's included

| Layer | Included | Role |
|---|---|---|
| **Tools** | The [`ripple`](#tools-ripple-cli) CLI | Understand media, inspect timelines, make edits, and export results |
| **Skill** | One [video-making workflow](skills/ripple/SKILL.md) | Carry the craft from creative direction through delivery |
| **Taste** | [`VIDEO.md`](skills/ripple/templates/VIDEO.md) and [`edit.json`](schemas/edit.schema.json) | Preserve user direction and every decision in the current cut |

## Tools: Ripple CLI

Core analysis and editing run locally with FFmpeg and whisper-cpp. Every command
prints structured JSON; run `ripple help` or `ripple <command> --help` for usage.

| Command | What it does |
|---|---|
| `analyze` | Build a cached index of words, silence, pace, sound events, scenes, motion, and energy |
| `candidates` | Check proposed IN/OUT points with transcripts, silence, frames, and cut-safety flags |
| `frame-sheet` | Render tiled frames, including scene-change sampling, for visual inspection |
| `timeline-sheet` | Align frames, motion, waveform, silence, words, and cut markers in one image |
| `lint` | Check `edit.json` before rendering against cached transcript and timing evidence |
| `cut` | Render clips and the full assembly, including cards, J/L cuts, dissolves, and music |
| `qa` | Inspect the rendered file, save QA evidence, and optionally render an HTML report |
| `search` | Find spoken phrases across indexed sources |
| `select` | Group similar takes and recommend the strongest in each group |
| `sync` | Measure multicam offsets with audio cross-correlation |
| `beats` | Detect BPM and a beat grid for music |
| `study` | Measure a reference edit and propose matching `VIDEO.md` values |
| `doctor` | Check FFmpeg, whisper, encoders, and optional tools, then print fixes |
| `probe` | Inspect media streams and HDR, or inventory the project media bin |
| `history` | Save, list, and diff edit snapshots |
| `captions` | Create output-time SRT and ASS captions, with optional burn-in |
| `handoff` | Export OTIO, Premiere XML, FCPXML, or EDL timelines for an NLE |
| `transcribe` | Reuse subtitles or transcribe locally, with optional word timing |

```bash
ripple analyze interview.mov
ripple timeline-sheet interview.mov
```

## Skill

The full [`ripple` skill](skills/ripple/SKILL.md) teaches one flexible workflow.
It enters wherever the task begins and skips phases the job does not need.

| Phase | What the agent does with you |
|---|---|
| **Taste** | Capture standing creative direction in `VIDEO.md` |
| **Develop** | Agree on a script, AV script, or shot list before production |
| **Produce** | Choose specialist generation tools and preserve provenance |
| **Edit** | Analyze sources, inspect evidence, place cuts, and repair locally |
| **Finish** | Verify, grade, caption, reframe, render, or hand off to an NLE |

Generation is routed to the right specialist tool; it is not hard-wired into
the CLI. Ripple keeps ownership of timing, assembly, and verification.

## Taste

Taste comes from the user, not the model. `VIDEO.md` stores the project's
standing direction: pacing, format, color, brand, references, and
anti-references. `edit.json` is the machine-checkable paper edit for the current
video: sources, bounds, reasoning, transitions, and delivery settings.

`ripple study` can measure a reference edit and propose values. Nothing becomes
standing direction until the user approves it.

## QA loop

After every render or repair, Ripple gives a read-only
[`qa-reviewer`](agents/qa-reviewer.md) subagent a narrow checklist for what
changed. It returns `PASS` or `FAIL` with direct evidence and cannot edit or
re-render the video.

A separate agent brings fresh context, so the editor is not the only judge of
its own work.

## Install

### Plugin (recommended)

The plugin installs the skill and its bundled CLI.

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

### Standalone CLI

> The plugin installs the current repository version. The standalone CLI
> installs the latest published npm release.

```bash
npm install --global ripple-video
ripple doctor
```

Requirements: Node.js 20+, `ffmpeg`, and `ffprobe`. Add whisper-cpp and a model
for word-accurate editing; existing subtitles work without it. ImageMagick adds
fully labeled timeline sheets, and `yt-dlp` enables `study` with URLs. Optional
production providers may require their own credentials, but the core CLI does
not.

## Comparison

Ripple combines the full local-first loop in one toolkit.

| Capability | Ripple | [video-use](https://github.com/browser-use/video-use) | [OpenMontage](https://github.com/calesthio/OpenMontage) | [auto-editor](https://github.com/WyattBlue/auto-editor) |
|---|:---:|:---:|:---:|:---:|
| Make from a brief or edit footage | ● | ◐ | ● | ○ |
| Local transcript + visual analysis | ● | ◐ | ● | ◐ |
| No cloud service required for core editing | ● | ○ | ● | ● |
| Agent-readable timeline | ● | ● | ◐ | ○ |
| Verified cut endpoints | ● | ◐ | ○ | ○ |
| Persistent creative direction | ● | ◐ | ● | ○ |
| Independent read-only QA reviewer | ● | ○ | ○ | ○ |
| NLE timeline export | ● | ○ | ○ | ● |

**● Included · ◐ Partial or different · ○ Not included or not documented**

## Contributing

[Issues](https://github.com/conmeara/ripple/issues) and pull requests are
welcome. Run `npm test` before submitting a change.

## License

[Apache-2.0](LICENSE)
