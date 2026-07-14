import { existsSync, readFileSync } from "node:fs";
import { assemblyDuration } from "./cut.mjs";
import { fail, output, parseArgs, round3 } from "./util.mjs";

// Cut-list diff: what actually changed between two versions of the edit.
// Pairs with snapshot — try a change, measure it against the last good
// version, keep or revert with evidence instead of vibes.

// Accepts a bare manifest or a snapshot file ({savedAt, label, manifest}).
function loadManifest(path) {
  if (!existsSync(path)) fail(`File not found: ${path}`, 2);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return parsed.manifest && parsed.savedAt ? { manifest: parsed.manifest, label: parsed.label } : { manifest: parsed };
}

const SCENE_FIELDS = ["source", "start", "end", "card", "cardFile", "cardDuration", "jcut", "lcut", "transition", "gainDb"];

export function diffManifests(a, b) {
  const aScenes = new Map((a.scenes ?? []).map((s) => [s.slug, s]));
  const bScenes = new Map((b.scenes ?? []).map((s) => [s.slug, s]));

  const added = [...bScenes.keys()].filter((slug) => !aScenes.has(slug));
  const removed = [...aScenes.keys()].filter((slug) => !bScenes.has(slug));
  const changed = [];
  for (const [slug, sa] of aScenes) {
    const sb = bScenes.get(slug);
    if (!sb) continue;
    const changes = {};
    for (const field of SCENE_FIELDS) {
      if (JSON.stringify(sa[field]) !== JSON.stringify(sb[field])) {
        changes[field] = { from: sa[field] ?? null, to: sb[field] ?? null };
      }
    }
    if (changes.start || changes.end) {
      changes.durationDelta = round3((sb.end - sb.start) - (sa.end - sa.start));
    }
    if (Object.keys(changes).length) changed.push({ slug, changes });
  }
  const aOrder = (a.scenes ?? []).filter((s) => bScenes.has(s.slug)).map((s) => s.slug);
  const bOrder = (b.scenes ?? []).filter((s) => aScenes.has(s.slug)).map((s) => s.slug);
  const reordered = JSON.stringify(aOrder) !== JSON.stringify(bOrder);

  const top = {};
  for (const key of ["music", "output", "color", "grade", "qa", "title"]) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      top[key] = { from: a[key] ?? null, to: b[key] ?? null };
    }
  }

  const durA = assemblyDuration(a.scenes ?? []);
  const durB = assemblyDuration(b.scenes ?? []);
  return {
    added,
    removed,
    changed,
    reordered,
    top,
    duration: { from: durA, to: durB, delta: round3(durB - durA) },
    identical: !added.length && !removed.length && !changed.length && !reordered && !Object.keys(top).length,
  };
}

export async function main(argv) {
  const args = parseArgs(argv, {});
  const [pathA, pathB] = args._;
  if (!pathA || !pathB) {
    fail("Usage: ripple compare <a.json> <b.json>   (either can be a .ripple/history snapshot)", 2);
  }
  const a = loadManifest(pathA);
  const b = loadManifest(pathB);
  const diff = diffManifests(a.manifest, b.manifest);
  output({
    ok: true,
    a: { path: pathA, ...(a.label ? { label: a.label } : {}) },
    b: { path: pathB, ...(b.label ? { label: b.label } : {}) },
    ...diff,
    hints: diff.identical
      ? ["The cuts are identical."]
      : [
          "durationDelta per scene is the felt change: negative = tighter, positive = more air.",
          "To render a snapshot's cut: extract it first (node -e 'console.log(JSON.stringify(require(\"./.ripple/history/<snap>.json\").manifest))' > candidate.json), then ripple cut candidate.json --scene <slugs>.",
        ],
  });
}
