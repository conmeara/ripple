# Ripple

**Give agents skills, tools, and taste for video editing.**

Ripple is a video-editing plugin for Claude Code and Codex. It translates
footage and timelines into artifacts models can reason about—images,
structured text, and explicit edit decisions—then gives the agent tools and
opinionated playbooks to change the cut, plus an independent QA subagent to
verify the result.

**One unified skill · 11 editing playbooks · 25 CLI commands · 26 deterministic rules**

![The timeline as an agent sees it: frames, motion, waveform, measured silence, word-aligned transcript, and cut markers on one time axis](docs/assets/timeline-sheet.png)

This is the same timeline an editor reads, translated into one image for the
model: picture, motion, waveform, measured silence, word-aligned transcript,
and cut markers on a shared time axis.

## Quick start

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

Run `/ripple init` in Claude Code or `$ripple init` in Codex—or simply describe
the edit:

```text
Cut a 30-second promo from these clips, synced to the track.
```

Requires Node.js 20+ and `ffmpeg`/`ffprobe` on `PATH` (`brew install ffmpeg`).
For word-accurate editing, install `whisper-cpp` and place a model in
`~/.ripple/models/`. The plugin guides you through setup. The standalone
`ripple-video` npm package is not published yet; plugin installation is the
supported path today.

## Why Ripple?

Models experience video as text and image tokens, not as a continuous
timeline. A frame sheet shows what the picture looks like, but not whether a
speaker has finished, how long the silence lasts, where a breath lands, or
whether the next take has started leaking into the cut.

Ripple gives the agent two synchronized views:

- **An image channel:** timeline sheets combine frames, motion, waveform,
  silence, transcript, and edit markers.
- **A text channel:** structured outputs expose sources, sentences, words,
  silences, pace, pitch, breaths, scene changes, cut-point flags, and exact
  timestamps.

Both views come from the same cached perception index and use the same source
timecodes. The agent can reason in tokens and make an
edit without guessing how one view maps to the other.

## How it works

### 1. Index the footage once

```bash
ripple analyze interview.mov
```

`analyze` builds a cached perception index for the source: word timings fused
with measured silence, sentence boundaries and pace, fillers, audible
non-speech events, terminal pitch, breaths, motion, scene changes, and energy.
The index is keyed to the media content, so moving the source does not throw
the analysis away.

### 2. Read the timeline as image or text

```bash
ripple timeline-sheet interview.mov --around 233 --span 12
ripple describe interview.mov --around 233 --span 12
```

`timeline-sheet` is the visual view above. `describe` is its text twin: a
compact, searchable account of the same period with word-level detail and
editorial signals. Long sources collapse into useful groups so the agent gets
the important evidence without flooding its context window.

### 3. Evaluate the cut

```bash
ripple candidates interview.mov --start 209 --end 233.3
```

`candidates` checks a proposed range against the index and returns exact
cut-point arithmetic, a suggested endpoint, and named problems:

```jsonc
{
  "timing": {
    "lastWordEnd": 231.92,
    "tailGap": 1.38,
    "nextAudioStart": 235.893,
    "terminalPitch": "level"
  },
  "flags": [{ "flag": "DEAD_AIR_TAIL" }],
  "suggestedOut": 232.52
}
```

![A cut-card sheet showing the proposed OUT in measured dead air and the suggested endpoint at the final word plus the configured tail](docs/assets/cut-card.png)

Here, the proposed OUT at `233.3` sits inside `3.9s` of measured dead air. The
suggested OUT at `232.52` is the final word plus the project's `0.6s` tail
preference. The agent can move the cut for a reason, not just because it looks
close.

### 4. Render and verify

```bash
ripple lint edit.json
ripple cut edit.json
ripple qa outputs/final.mp4 --manifest edit.json
```

`edit.json` is the source of truth for the cut. It records scene bounds,
transitions, audio decisions, and the reasoning behind them. `lint` checks the
manifest before rendering; `cut` produces the video; `qa` gates the delivered
artifact for failures such as clipped speech, leaked takes, unexplained frozen
picture, black frames, loudness problems, and color-policy violations.

Blocking findings must be fixed or deliberately waived with a written reason.

### 5. Give the render to a fresh reviewer

After every render or repair, Ripple hands the output to a bundled, read-only
[`qa-reviewer`](agents/qa-reviewer.md) subagent. The editor does not get to be
the only judge of its own work.

The reviewer receives a narrow checklist of the failure modes that matter for
that change—such as a complete sentence ending, no leaked prompt audio,
unchanged neighboring scenes, preserved color metadata, and a clean decode.
It gathers direct evidence with the Ripple CLI, transcripts, timeline sheets,
and media probes, then reports `PASS` or `FAIL` for each item with timestamps
and measurements. It cannot edit or re-render the video.

This separation is deliberate: deterministic QA catches known technical
failures, while a fresh context checks the specific editorial promise the
editing agent just made. When the host cannot run subagents, Ripple applies the
same checklist in the current context and discloses that the review was not
independent.

## Taste, tools, and opinionated skills

### Taste

[`VIDEO.md`](skills/ripple/templates/VIDEO.md) stores the project's standing
creative direction: pacing, register, color policy, brand, anti-references,
and confirmed steering. [`edit.json`](schemas/edit.schema.json) stores the
decisions for the current cut. Direction becomes project state instead of a
prompt that must be reconstructed every session.

`ripple study` can measure a reference edit's rhythm, delivery pace, tail
preference, silence usage, energy, and grade lean, then propose matching
`VIDEO.md` values with the evidence behind them. Ripple never changes the
project's taste without user approval.

### Tools

The CLI gives the agent the practical tools of an editor: source inspection,
transcription, perception, timeline navigation, phrase search, take selection,
multicam sync, cut comparison, captions, grading, rendering, QA, and NLE
handoff. Commands return structured JSON and write inspectable artifacts, so
decisions remain traceable and renders remain reproducible.

### Opinionated skills

One Ripple skill routes to 11 editing playbooks covering development,
planning, generation, take selection, editing, grading, finishing, repair,
review, and NLE handoff. The review playbook includes the independent,
failure-specific QA pass above. The skill also turns directions such as
`/ripple tighter`, `punchier`, `breathe`, and `quieter` into defined inspect,
change, render, and verify loops.

The opinions are concrete: inspect the timeline before locking a cut, calculate
endpoints instead of eyeballing them, use multiple signals, repair one scene
instead of rebuilding the edit, and never silently convert color.

Ripple also has an opinionated production stack:

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


## Playbooks

Ask in plain language or invoke a phase directly with `/ripple <phase>` in
Claude Code and `$ripple <phase>` in Codex.

| Command | What it does |
|---|---|
| `init` | Capture the project's taste and write `VIDEO.md` |
| `develop` | Create a script, AV script, shot list, or storyboard |
| `plan` | Inspect sources and draft the first `edit.json` |
| `generate` | Create missing voice-over, music, stills, or b-roll |
| `select` | Compare takes and record why the best ones were chosen |
| `edit` | Execute and iterate the cut with verified endpoints |
| `grade` | Compare color variants and record the choice |
| `finish` | Assemble safely and run delivery QA |
| `repair` | Fix a flagged scene without rebuilding the edit |
| `review` | Generate a review page and run an independent QA pass |
| `handoff` | Export OTIO, FCP7 XML, or EDL for Premiere or Resolve |

## CLI

Run `ripple help` or `ripple <command> --help` for details.

| | Commands |
|---|---|
| **Perceive** | `analyze` · `timeline-sheet` · `describe` · `frame-sheet` · `candidates` · `transcribe` · `probe` · `sources` · `search` · `beats` · `sync` |
| **Decide** | `status` · `select` · `locate` · `snapshot` · `compare` |
| **Render** | `cut` · `captions` · `grade` |
| **Verify** | `lint` · `qa` · `review` · `doctor` |
| **Taste** | `study` |
| **Ship** | `handoff` |

All commands print JSON to stdout, including error envelopes. Exit codes are
`0` for success, `1` for a failed gate or runtime failure, and `2` for invalid
usage or a missing dependency. State lives in `~/.ripple/`.


## License

Apache-2.0
