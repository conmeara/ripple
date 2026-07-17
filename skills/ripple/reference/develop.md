# develop — from nothing to a first edit.json

When someone wants a video that doesn't exist yet, the cheapest place to align is
words on a page, not renders. This playbook covers the pre-production arc: develop
the right paper artifact, get agreement on it, seed the paper edit from it, and
generate any missing elements — all before a single expensive render.

## 1 — Diagnose before writing anything

Three questions decide which artifact(s) to make. Interview style — 2–3
questions per round, propose defaults from what you can already see in the
folder:

1. **What is it?** Talking-head / explainer / promo / social clip / doc-style?
2. **Where does the picture come from?** A shoot, existing footage, generated
   video, screen recording, or authored graphics (HyperFrames/Remotion)?
3. **Who has to say yes?** Just the user → lightest artifact that works.
   A client/team → lean toward AV script or storyboard (they align strangers).

If VIDEO.md doesn't exist, fold the taste interview into the same round —
pre-production is where taste gets decided anyway (see `reference/taste.md`).

## 2 — Draft the paper artifact

| Artifact | Use when | Structure |
|---|---|---|
| `script.md` | Voice carries it: talking-head, VO-led | Sections with narration text + est. duration each |
| `av-script.md` | Graphics carry meaning: explainers, promos | Two-column rows: AUDIO / VISUAL (see below) |
| `shotlist.md` | Someone is going to point a camera | Shot #, description, framing, movement, location, audio, must-get flag |
| `boards/` | Composition matters or stakeholders need pictures | Numbered frames + captions; optional |

Default format is markdown in the project root. If the user wants Word or
another format, use the available document skills — the structure matters, not
the container.

**Duration math**: spoken narration runs ~150 words/minute. Script sections and
AV rows should each carry an estimate, and the total should hit the VIDEO.md
target ±10% — catching an overlong video at script stage costs nothing.

### The AV script is the ancestor of edit.json

Each AV row is one future scene. Give rows stable slugs — they become scene
slugs when footage exists:

```markdown
| # | slug        | AUDIO (VO / music / sfx)                  | VISUAL                          | assets            | ~sec |
|---|-------------|-------------------------------------------|---------------------------------|-------------------|------|
| 1 | hook        | VO: "Every edit you make is a decision…"  | Fast montage of timeline cuts   | screen recordings | 6    |
| 2 | problem     | VO continues; music enters low            | Talking head, medium shot       | shoot             | 12   |
```

When production delivers sources, step 4 below seeds edit.json from these rows:
slug per row, `title` from the visual description, `reasoning` = "from av-script
row N".

### Shot list craft (what non-shooters forget)

Include on every shot list: multiple takes per setup (last is usually best, but
keep rolling); 2–3s of pre-roll and tail on every take; room tone (30s of
location silence — it saves audio repairs later); framing vocabulary (WS/MS/CU)
so the shooter isn't guessing; a must-get column, because light runs out.

### Storyboards (optional, generate don't draw)

If boards earn their place: generate frames (image APIs if configured, or
HyperFrames comps rendered to stills for graphic scenes) into `boards/` with
numbered filenames matching AV slugs. A simple `boards.html` listing
image+caption is plenty — do not build tooling for this.

### Approval is the gate

Present the artifact, revise on feedback, and get an explicit yes before
producing anything expensive. When the user changes creative direction here
("less corporate", "shorter"), that's VIDEO.md steering-log material.

## 3 — Generate the missing elements

Most users can't produce a voiceover, music bed, or b-roll shot on demand. When
the plan needs an element nobody recorded, generate it — with opinionated
defaults, recorded provenance, and the same file discipline as footage. Don't
present a menu of providers; the standing service picks live in
`reference/taste.md`'s production stack — pick from there and say why.

- **Generated assets are sources.** They land in `sources/generated/`, get
  probed/transcribed like any footage, and flow into the paper edit below.
- **Provenance is required.** Every generated file gets a sidecar
  `<name>.gen.json`: `{provider, model, prompt, seed, params, date}`. A
  generation you can't reproduce is a generation you can't iterate.
- **Official skills first.** If the vendor's own agent skills are installed
  (ElevenLabs publishes them), use those; raw API calls are the fallback.
- **Keys come from the environment** — provider-prefixed (`ELEVENLABS_API_KEY`,
  `GEMINI_API_KEY`, `PEXELS_API_KEY`, `FAL_KEY`, …). Missing key → stop, tell
  the user exactly which variable to set and where to create the key, never ask
  for a key in chat, and never write one into a project file.
- **Standing choices live in VIDEO.md.** Voice ID, music direction, image
  style: ask once, record it, reuse it (`reference/taste.md`). Regenerating with
  a different voice every session is a taste failure.
- **Deviations are decisions.** A non-default provider (cost, language coverage)
  gets a reason in the `.gen.json` sidecar; a standing switch goes to VIDEO.md's
  steering log. "It seemed fine" is not reasoning.

### Voiceover is the timing spine

Script-led projects generate VO **first**; picture is cut against it. Voice
comes from VIDEO.md; if unset, have the user pick one and record the ID.
Generate per script section, not one monolith — sections re-generate and re-time
independently. Then transcribe each file: the word-level timings drive scene
bounds exactly like shot footage.

### Music bed

Duration comes from the manifest (sum of scenes + cards), padded ~2s. Wire the
bed into `manifest.music`, never into clips (fields: see
`<ripple-plugin-root>/schemas/edit.schema.json`). `ripple cut` mixes it into the **full assembly
only** — sidechain-ducked under dialogue, faded, loudness-normalized — so
per-scene clips stay clean and the bed can change without touching a cut.
Loudness targets and QA live in `reference/deliver.md`.

### Stills and b-roll

Match the manifest's aspect ratio and resolution — a 1:1 still on a 16:9
timeline is a QA failure waiting to happen. Generated video is for gap b-roll,
not primary content: storyboard the shot first, generate once, and probe the
result. Generated clips get no special treatment from the three-signal rule.

### No key? Still ship

Every element has a zero-key path. Degrade gracefully and say what was degraded
— never block the edit on a missing API key.

- **Voiceover** → Piper TTS, local and free. Serviceable as a timing spine: cut
  picture against the Piper read, swap in the real voice at finish and re-verify
  only endpoints.
- **Music / SFX** → ask for a licensed track, or cut to a temp track and swap at
  finish. Never pull audio of unknown license into `sources/`.
- **Cards / stills** → often no generation needed: `ripple cut` renders text
  cards, and designed cards route to HyperFrames with no API key.
- **B-roll** → recut what exists first: frame-sheet the footage for cutaways,
  punch in / reframe. Then free stock. Generation is the last resort.

## 4 — Seed the paper edit (edit.json)

Structured edit data before any rendering. Do not cut anything yet. If
`av-script.md` (or a script) exists, seed edit.json from it: one scene per AV
row, same slug, `title` from the visual column, `reasoning` = "from av-script
row N" until real bounds replace estimates.

1. **Inventory sources.** `ripple probe`, and record the color-policy implication
   (`reference/deliver.md`).
2. **Analyze everything.** `ripple analyze` per source builds the cached
   perception index (`reference/perception.md`). Pass the proper nouns you expect
   (names, places, product terms) — it materially improves whisper accuracy.
3. **Group takes.** Cluster same-content takes; verify don't assume (later takes
   usually better, fewer fillers better, a complete final sentence beats a
   trailing reset). Record candidate takes per scene (craft: `reference/edit.md`).
4. **Draft edit.json** (schema: `<ripple-plugin-root>/schemas/edit.schema.json`). Per scene: id, slug,
   source, proposed start/end from transcript timestamps, chosen take, and a
   one-line **reasoning**. Mark every scene `status: "proposed"` — a paper edit's
   bounds are estimates the edit loop will confirm, not locked cuts.
5. **Lint the draft** (`ripple lint`). On proposed bounds its findings are the
   worklist the edit loop will clear, not blockers.
6. **Look at what you plan to use** — `ripple timeline-sheet` and `ripple
   frame-sheet` before committing to any range.
7. **Present the plan.** Scene table (slug, take, in/out, duration, reasoning)
   plus the color policy and any risks (HDR, noisy audio). Get confirmation
   before moving to the edit loop.

### Project layout to create

```
sources/       raw + generated media (sources/generated/ for gen assets)
work/          transcripts, candidate audio, intermediate files
clips/         per-scene exports
outputs/       final renders
qa/            frame sheets, contact strips, QA snapshots
edit.json      the manifest (project root)
```

## Handoff onward

Every path lands files in `sources/` and rejoins at step 4: a shoot's footage
comes back, generated/authored visuals produce per row, script-only projects
generate the VO first (the timing spine picture gets cut against). Once edit.json
is drafted, the core loop takes over (`reference/edit.md`).
