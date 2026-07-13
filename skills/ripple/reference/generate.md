# /ripple generate — create elements that don't exist

Most users can't produce a voiceover, music bed, or b-roll shot on demand.
When the edit needs an element nobody recorded, generate it — with
opinionated defaults, recorded provenance, and the same file discipline as
footage. Don't present a menu of providers; pick from the table below and
say why.

## Rules

- **Generated assets are sources.** They land in `sources/generated/`, get
  probed/transcribed like any footage, and flow through plan → edit.
- **Provenance is required.** Every generated file gets a sidecar
  `<name>.gen.json`: `{provider, model, prompt, seed, params, date}`.
  A generation you can't reproduce is a generation you can't iterate.
- **Official skills first.** If the vendor's own agent skills are installed
  (ElevenLabs publishes them: github.com/elevenlabs/skills), use those; the
  raw API calls below are the fallback, not the preference.
- **Keys come from the environment** — provider-prefixed
  (`ELEVENLABS_API_KEY`, `GEMINI_API_KEY`, `PEXELS_API_KEY`, `FAL_KEY`, …).
  Missing key → stop, tell the user exactly which variable to set and where
  to create the key (the setup ladder below), never ask for a key in chat,
  and never write one into a project file.
- **Standing choices live in VIDEO.md.** Voice ID, music direction, image
  style: ask once, record it, reuse it. Regenerating with a different voice
  every session is a taste failure.
- **Deviations are decisions.** Using a non-default provider (user
  preference, cost, language coverage) gets a reason in the `.gen.json`
  sidecar; a standing switch goes to VIDEO.md's steering log. Same
  discipline as take selection — "it seemed fine" is not reasoning.

## Default picks

| Element | Use | Why / cost |
|---|---|---|
| Voiceover | ElevenLabs TTS — `eleven_multilingual_v2` (default), `eleven_v3` when the read needs emotional range | Best quality/control; official agent skills exist. ~$0.10 per 1k characters |
| Music bed | ElevenLabs Music — `POST /v1/music` | Prompt or composition plan, `force_instrumental`, exact `music_length_ms` from the manifest. ~$0.15/min |
| SFX | ElevenLabs sound effects | Same key, same conventions. ~$0.12/min |
| Stills / cards / boards | Gemini image ("Nano Banana") — `gemini-3.1-flash-image`; `gemini-3-pro-image` for complex composition | Aspect ratios to 21:9, up to 4K; cards feed `cardFile`. Cheap per image — check vendor pricing |
| Generated b-roll | Veo via the Gemini API — `veo-3.1-generate-001` | 4–8s clips with native audio. Priced per clip-second — the premium tier of this table; storyboard first |

Model names drift. Before first use in a project, confirm current IDs
against the vendor docs (`elevenlabs.io/docs/llms.txt`,
`ai.google.dev/gemini-api/docs`) and record what you used in the sidecar.

## Voiceover — the timing spine

Script-led projects generate VO **first**; picture is cut against it
(develop.md). Voice comes from VIDEO.md; if unset, have the user pick one
from their ElevenLabs voices and record the ID.

```
curl -s -X POST "https://api.elevenlabs.io/v1/text-to-speech/$VOICE_ID?output_format=mp3_44100_128" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" \
  -d '{"text": "<section text>", "model_id": "eleven_multilingual_v2"}' \
  -o sources/generated/vo_hook.mp3
```

Generate per script section, not one monolith — sections are re-generated
and re-timed independently. Then `ripple transcribe` each file: the
word-level timings drive scene bounds exactly like shot footage.

## Music bed

Duration comes from the manifest (sum of scenes + cards), padded ~2s.

```
curl -s -X POST "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" \
  -d '{"prompt": "<direction from VIDEO.md>", "music_length_ms": 64000,
       "force_instrumental": true, "model_id": "music_v2"}' \
  -o sources/generated/bed.mp3
```

`music_length_ms` accepts 3s–10min with a plain prompt. For structured
beds (intro/verse/outro hitting scene boundaries) send a
`composition_plan` instead of `prompt` — sections cap at 120s each.

Wire the bed into the manifest, never into clips:

```json
"music": { "source": "sources/generated/bed.mp3", "gainDb": -18, "loudnessTarget": -14 }
```

`ripple cut` mixes it into the **full assembly only** — sidechain-ducked
under dialogue, faded in/out, loudness-normalized — and per-scene clips stay
clean, so the bed can change without touching a single cut. Use `-14` LUFS
for social delivery, `-23` for broadcast. `ripple qa --manifest` then
verifies integrated loudness against `loudnessTarget` (±1 LU) and warns
that edge-silence gates measure the mix, not dialogue.

## Stills and b-roll

```
curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/interactions" \
  -H "x-goog-api-key: $GEMINI_API_KEY" -H "Content-Type: application/json" \
  -d '{"model": "gemini-3.1-flash-image", "input": [{"type": "text", "text": "<prompt>"}]}'
```

Match the manifest's aspect ratio and resolution — a 1:1 still on a 16:9
timeline is a QA failure waiting to happen. Generated video (Veo) is for
gap b-roll, not primary content: storyboard the shot in `develop` terms
first, generate once, and `ripple probe` the result — generated clips get
no special treatment from the three-signal rule.

## No key? Still ship

Every element has a zero-key path. Degrade gracefully and say what was
degraded — never block the edit on a missing API key.

- **Voiceover** → Piper TTS, local and free (the whisper-cpp of TTS).
  Serviceable for scratch VO and perfectly good as a timing spine: cut
  picture against the Piper read, swap in the real voice at finish and
  re-verify only endpoints.
- **Music / SFX** → ask the user for a licensed track, or cut to a temp
  track and swap at finish. Never pull audio of unknown license into
  `sources/`.
- **Cards / stills** → often no generation needed: `ripple cut` renders
  text cards from `card:`, and designed cards route to HyperFrames
  (`cardFile`) with no API key.
- **B-roll** → recut what exists first: `frame-sheet` the footage for
  usable cutaways, punch in / reframe. Then free stock (ladder step 1).
  Generation is the last resort, not the first.

## Setup ladder — every option, in the order to add them

When the user asks "what do I need?", walk this ladder. Steps 1–4 cost
nothing and cover most edits; everything after is added per need, not up
front.

| Step | Cost | Set up | Unlocks | Our take |
|---|---|---|---|---|
| 1 | $0 | Pexels + Pixabay keys | Stock photos and video | **Do first.** Real footage beats generated for cutaways; search stock before generating anything |
| 2 | $0 | Google API key (`GEMINI_API_KEY`) | Nano Banana images, Veo b-roll, Google TTS (700+ voices, 1M chars/mo free), $300 new-account credit | **Recommended.** One key covers stills, cards, and gap b-roll |
| 3 | $0 | ElevenLabs (`ELEVENLABS_API_KEY`) | Premium TTS + music + SFX (10k chars/mo free) | **Recommended.** The default voice, bed, and SFX picks above |
| 4 | $0 | Piper (local install) | Fully offline TTS — no key, no network | **Recommended.** Scratch VO and the zero-key fallback |
| 5 | ~$0.03/image | fal.ai (`FAL_KEY`) | FLUX images + Kling/Veo/MiniMax video + Recraft under one key | Optional breadth: when Veo isn't the right look, this is the one extra key to add |
| 6 | ~$0.05/image | OpenAI | GPT Image 2 + OpenAI TTS | Only if the project already runs on OpenAI; otherwise redundant with 2–3 |
| 7 | ~$0.04/image | Google Imagen | Imagen 4 (same Google key as step 2) | Alternative when Nano Banana misses on photorealism |
| 8 | pay-as-you-go | Kling official | Direct Kling video, image, TTS, avatar, lip-sync | For avatar/lip-sync work; for plain Kling video, step 5's fal.ai route is simpler |
| 9 | $12/month | Runway | Gen-4 video — highest-quality generated video | When one hero generated shot matters more than cost |
| 10 | pay-as-you-go | HeyGen | Avatar videos, multi-model gateway | Avatar-led formats only |
| 11 | pay-as-you-go | Suno | Full songs with vocals and lyrics | When the video needs an actual song, not a bed — beds stay ElevenLabs |
