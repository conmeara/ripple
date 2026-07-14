import { existsSync, readFileSync } from "node:fs";
import { assemblyTimeline } from "./cut.mjs";
import { fail, output, parseArgs, round3 } from "./util.mjs";

// Users give feedback in OUTPUT time ("at 1:23 it drags"); every fix happens
// in SOURCE time. This command is the translator — mapping through cards,
// J-cuts, and scene order so the agent never patches the wrong scene.

// "1:23", "01:23.5", or plain seconds → seconds.
export function parseTimecode(spec) {
  if (typeof spec === "number") return spec;
  const s = String(spec).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (!m) return null;
  return (Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]));
}

// Output time → segment + source time. During a transition overlap two
// segments cover the same instant: ownership flips at the dissolve MIDPOINT
// (the perceptual cut moment — same model segmentBoundaries uses). Inside a
// card, the audible audio part (L-cut tail / J-cut head) is resolved too —
// "at 1:23" during a card often means the dialogue trailing under it.
export function locateOutputTime(scenes, t) {
  const timeline = assemblyTimeline(scenes);
  if (!timeline.length) return null;
  const total = timeline[timeline.length - 1].outEnd;
  if (t < 0 || t > total + 0.05) return { beyond: true, total };
  const covering = timeline.filter((s) => t >= s.outStart && t < s.outEnd);
  let seg;
  if (covering.length > 1) {
    const incoming = covering[covering.length - 1];
    const d = incoming.transitionIn?.duration ?? 0;
    seg = t >= incoming.outStart + d / 2 ? incoming : covering[0];
  } else {
    seg = covering[0] ?? timeline[timeline.length - 1];
  }
  const into = round3(t - seg.outStart);
  let audio = null;
  if (seg.kind === "card") {
    const part = (seg.audio ?? []).find((a) => t >= a.outStart && t < a.outEnd);
    if (part && part.kind !== "silence") {
      audio = {
        kind: part.kind,
        source: part.source,
        sourceTime: round3(part.sourceStart + (t - part.outStart)),
      };
    }
  }
  return {
    segment: seg,
    into,
    sourceTime: seg.kind === "body" ? round3(seg.sourceStart + into) : null,
    audio,
    total,
  };
}

// Scene (+ optional source time) → output time range / instant. A source
// moment living in a J-cut head or L-cut tail is audible under a card, not
// in the body — those map through the card's audio parts.
export function locateScene(scenes, slug, sourceTime) {
  const timeline = assemblyTimeline(scenes);
  const seg = timeline.find((s) => s.kind === "body" && s.slug === slug);
  if (!seg) return null;
  if (sourceTime === undefined) return { segment: seg };
  if (sourceTime >= seg.sourceStart - 0.05 && sourceTime <= seg.sourceEnd + 0.05) {
    return { segment: seg, outputTime: round3(seg.outStart + (sourceTime - seg.sourceStart)) };
  }
  for (const card of timeline.filter((s) => s.kind === "card")) {
    const part = (card.audio ?? []).find(
      (a) => a.kind !== "silence" && a.source === seg.source &&
        sourceTime >= a.sourceStart - 0.05 && sourceTime <= a.sourceEnd + 0.05
    );
    if (part) {
      return {
        segment: seg,
        outputTime: round3(part.outStart + (sourceTime - part.sourceStart)),
        audioKind: part.kind,
        underCard: card.slug,
      };
    }
  }
  return { segment: seg, outsideBounds: true };
}

export async function main(argv) {
  const args = parseArgs(argv, { scene: "string", "source-time": "number" });
  // Positionals: a time (number or mm:ss) and/or a manifest path.
  let time = null;
  let manifestPath = "edit.json";
  for (const arg of args._) {
    const t = parseTimecode(arg);
    if (t !== null) time = t;
    else manifestPath = arg;
  }
  if (time === null && !args.scene) {
    fail("Usage: ripple locate <output-time e.g. 83.5 or 1:23> [edit.json]\n" +
      "       ripple locate --scene <slug> [--source-time T] [edit.json]   (reverse: source → output)", 2);
  }
  if (!existsSync(manifestPath)) fail(`Manifest not found: ${manifestPath}`, 2);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const scenes = manifest.scenes ?? [];
  if (!scenes.length) fail("Manifest has no scenes", 2);

  if (args.scene) {
    const res = locateScene(scenes, args.scene, args["source-time"]);
    if (!res) fail(`Scene not found in manifest: ${args.scene}`, 2);
    output({
      ok: true,
      scene: args.scene,
      outputRange: { start: res.segment.outStart, end: res.segment.outEnd },
      sourceRange: { start: res.segment.sourceStart, end: res.segment.sourceEnd },
      ...(args["source-time"] !== undefined
        ? res.outsideBounds
          ? { note: `source time ${args["source-time"]} is outside this scene's audible ranges (body + card audio parts)` }
          : {
              outputTime: res.outputTime,
              ...(res.audioKind ? { audioKind: res.audioKind, underCard: res.underCard, note: `audible as a ${res.audioKind} under the "${res.underCard}" card` } : {}),
            }
        : {}),
    });
    return;
  }

  const res = locateOutputTime(scenes, time);
  if (res.beyond) {
    fail(`${time}s is past the end of the assembly (${res.total}s total)`, 2);
  }
  const seg = res.segment;
  const cardInfo = res.audio
    ? {
        note: `this moment is a title card, but the AUDIO here is a ${res.audio.kind === "lcut" ? "trailing L-cut" : "leading J-cut"} — the words come from the source, not the card`,
        audio: res.audio,
      }
    : { note: "this moment is a title card (silence) — the complaint is about the card or the scene it introduces" };
  output({
    ok: true,
    outputTime: round3(time),
    scene: seg.slug,
    within: seg.kind,
    ...(seg.kind === "body"
      ? {
          source: seg.source,
          sourceTime: res.sourceTime,
          sceneSourceRange: { start: seg.sourceStart, end: seg.sourceEnd },
        }
      : cardInfo),
    intoSegment: res.into,
    assemblyDuration: res.total,
    hints: [
      seg.kind === "body"
        ? `Look at the source: ripple timeline-sheet ${seg.source} --around ${res.sourceTime} --span 12`
        : res.audio
          ? `The audible words map to ${res.audio.source} @ ${res.audio.sourceTime}s — repair THAT scene's bounds, not the card.`
          : `The card belongs to scene "${seg.slug}" — check its text/duration in the manifest.`,
      "Repairs edit SOURCE bounds in edit.json; never reason in output time past this point.",
    ],
  });
}
