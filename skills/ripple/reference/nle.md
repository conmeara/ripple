# /ripple handoff — working with Premiere, Resolve, and Final Cut

Some editors want ripple's rough cut, not ripple's final render. `ripple
handoff` converts edit.json into timeline files that reference the ORIGINAL
media at full quality — the agent does the tedious 80% (takes, endpoints,
order), the editor finishes the taste-heavy 20% in their own tool.

## When to hand off vs. finish

- User mentions Premiere / Resolve / Final Cut / Avid, "rough cut", "I'll
  finish it myself", or a team review → `handoff`.
- User wants a watchable file → `finish` (`ripple cut --profile final`).
- Both is normal: a draft render to check the cut, plus a handoff.

## Which file for which editor

| Editor | File | Notes |
|---|---|---|
| DaVinci Resolve | `.otio` | Native since 18.5 (File > Import Timeline); markers carry name + comment |
| Premiere Pro | `.xml` (FCP7 XML) | The stable path; scene reasoning arrives as sequence markers (colors don't survive — don't promise them). Premiere's own OTIO import exists but is beta — offer the .otio too |
| Avid | `.otio` | Media Composer imports OTIO since 2025.6 |
| Final Cut Pro | none yet | FCP only takes modern FCPXML (different format). Offer the EDL, or route through Resolve. Say so honestly |
| Anything else | `.edl` | Single video track, no markers — the always-works fallback |

## Rules

1. **Handoff uses clean scene bounds.** J-cuts flatten to straight cuts with
   the intent noted in the scene's marker — editors rebuild J-cuts natively
   in seconds; a pre-baked overlap is a nuisance to them.
2. **Cards are the editor's to rebuild.** The handoff references ripple's
   rendered card segments so the timeline plays, but expect the editor to
   replace them with native titles. `--no-cards` hands off footage only.
3. **Media stays put.** Timelines reference absolute paths. If the project
   moves machines, the editor relinks — mention it when delivering.
4. **QA still applies.** Run `ripple qa` on the draft render before handing
   off; a handoff of a broken cut wastes an editor's session. Tell the user
   which scenes are `proposed` vs `locked` — the markers carry it.

## Driving an NLE directly

- **Resolve** is genuinely scriptable (official Python API; community MCP
  servers exist). If the user asks for automation *inside* Resolve — "import
  this and apply my grade" — point them at a Resolve MCP server rather than
  simulating it; ripple's job ends at the timeline file.
- **Premiere / Final Cut** have no sanctioned automation surface for edits.
  Do not attempt UI scripting; hand off the file.
