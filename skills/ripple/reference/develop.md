# /ripple develop — pre-production

When someone wants a video that doesn't exist yet, the cheapest place to
align is words on a page — not renders. Develop the right paper artifact
first, get agreement on it, and only then produce footage or graphics.
Renders are expensive to argue about; scripts are cheap.

## Diagnose before writing anything

Three questions decide which artifact(s) to make (interview style — 2–3
questions per round, propose defaults from what you can see in the folder):

1. **What is it?** Talking-head / explainer / promo / social clip / doc-style?
2. **Where does the picture come from?** A shoot, existing footage, generated
   video, screen recording, or authored graphics (HyperFrames/Remotion)?
3. **Who has to say yes?** Just the user → lightest artifact that works.
   A client/team → lean toward AV script or storyboard (they align strangers).

If VIDEO.md doesn't exist, fold `init`'s questions into the same interview —
pre-production is where taste gets decided anyway.

## The artifacts

| Artifact | Use when | Structure |
|---|---|---|
| `script.md` | Voice carries it: talking-head, VO-led | Sections with narration text + est. duration each |
| `av-script.md` | Graphics carry meaning: explainers, promos | Two-column rows: AUDIO / VISUAL (see below) |
| `shotlist.md` | Someone is going to point a camera | Shot #, description, framing, movement, location, audio, must-get flag |
| `boards/` | Composition matters or stakeholders need pictures | Numbered frames + captions; optional |

Default format is markdown in the project root. If the user wants Word or
another format, use the available document skills — the structure matters,
not the container.

**Duration math**: spoken narration runs ~150 words/minute. Script sections
and AV rows should each carry an estimate, and the total should hit the
VIDEO.md target ±10% — catching an overlong video at script stage costs
nothing.

### The AV script is the ancestor of edit.json

Each AV row is one future scene. Give rows stable slugs — they become scene
slugs when footage exists:

```markdown
| # | slug        | AUDIO (VO / music / sfx)                  | VISUAL                          | assets            | ~sec |
|---|-------------|-------------------------------------------|---------------------------------|-------------------|------|
| 1 | hook        | VO: "Every edit you make is a decision…"  | Fast montage of timeline cuts   | screen recordings | 6    |
| 2 | problem     | VO continues; music enters low            | Talking head, medium shot       | shoot             | 12   |
```

When production delivers sources, `/ripple plan` seeds edit.json from these
rows: slug per row, `title` from the visual description, `reasoning` = "from
av-script row N".

### Shot list craft (what non-shooters forget)

Include on every shot list: multiple takes per setup (last is usually best,
but keep rolling); 2–3s of pre-roll and tail on every take; room tone (30s of
location silence — it saves audio repairs later); framing vocabulary
(WS/MS/CU) so the shooter isn't guessing; a must-get column, because light
runs out.

### Storyboards (optional, generate don't draw)

If boards earn their place: generate frames (image APIs if configured, or
HyperFrames comps rendered to stills for graphic scenes) into `boards/` with
numbered filenames matching AV slugs. A simple `boards.html` listing
image+caption is plenty — do not build tooling for this.

## Approval is the gate

Present the artifact, revise on feedback, and get an explicit yes before
producing anything expensive. When the user changes creative direction during
this ("less corporate", "shorter"), that's VIDEO.md steering-log material.

## Handoff

- Shoot → shot list travels to the shoot; footage comes back → `/ripple plan`.
- Generated/authored visuals → produce per row (HyperFrames/Remotion via
  their official skills, gen APIs if the user has them), landing files in
  `sources/`, then `/ripple plan`.
- Script-only projects (VO over existing footage) → record/generate the VO
  first; it becomes the timing spine that picture gets cut against.
