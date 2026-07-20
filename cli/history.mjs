import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { assemblyDuration } from "./cut.mjs";
import { ensureDir, fail, output, parseArgs, readJsonOrNull, round3, writeJsonAtomic } from "./util.mjs";

// The agent's undo stack. Editors experiment BECAUSE undo is free; an agent
// without history is timid for the same reason. Every snapshot is a full
// manifest copy in .ripple/history — try the punchier cut, diff it against
// the last good version, keep or revert with evidence instead of vibes.

const HISTORY_DIR = () => join(process.cwd(), ".ripple", "history");

export function manifestHash(manifest) {
  return createHash("sha1").update(JSON.stringify(manifest)).digest("hex").slice(0, 12);
}

export function listSnapshots(dir = HISTORY_DIR()) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const snap = readJsonOrNull(join(dir, f));
      if (!snap?.manifest) return null;
      return {
        file: join(dir, f),
        savedAt: snap.savedAt,
        label: snap.label ?? null,
        hash: snap.hash,
        scenes: snap.manifest.scenes?.length ?? 0,
        duration: assemblyDuration(snap.manifest.scenes ?? []),
      };
    })
    .filter(Boolean);
}

// Save a snapshot unless the manifest is identical to the newest one.
// Returns { path, existing } — existing=true means nothing new was written.
export function saveSnapshot(manifest, { label = null, dir = HISTORY_DIR() } = {}) {
  ensureDir(dir);
  const hash = manifestHash(manifest);
  const existing = listSnapshots(dir);
  const latest = existing[existing.length - 1];
  if (latest && latest.hash === hash) return { path: latest.file, existing: true, hash };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").replace("Z", "");
  const slug = label ? `_${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}` : "";
  const path = join(dir, `${stamp}${slug}.json`);
  writeJsonAtomic(path, { savedAt: new Date().toISOString(), label, hash, manifest });
  return { path, existing: false, hash };
}

// Accepts a bare manifest or a snapshot file ({savedAt, label, manifest}).
function loadManifest(path) {
  if (!existsSync(path)) fail(`File not found: ${path}`, 2);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return parsed.manifest && parsed.savedAt ? { manifest: parsed.manifest, label: parsed.label } : { manifest: parsed };
}

const SCENE_FIELDS = [
  "id", "title", "source", "start", "end", "take", "candidates", "reasoning", "status", "expectEnding",
  "card", "cardFile", "cardDuration", "jcut", "lcut", "transition", "gainDb", "grade", "qa",
];
const TOP_FIELDS = ["music", "output", "color", "grade", "qa", "title", "audioMicroFades", "version"];

// Known schema fields keep their established, readable order. Including any
// extra keys makes history forward-compatible: a future manifest field must
// not change manifestHash while the human diff still says "identical."
function diffFields(a, b, known, excluded = []) {
  const seen = new Set([...known, ...excluded]);
  const extra = [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])]
    .filter((key) => !seen.has(key))
    .sort();
  return [...known, ...extra];
}

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
    for (const field of diffFields(sa, sb, SCENE_FIELDS, ["slug"])) {
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
  for (const key of diffFields(a, b, TOP_FIELDS, ["scenes"])) {
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
  const args = parseArgs(argv, { label: "string", list: "boolean", diff: "boolean" });

  if (args.diff) {
    const [pathA, pathB] = args._;
    if (!pathA || !pathB) {
      fail("Usage: ripple history --diff <a.json> <b.json>   (either can be a .ripple/history snapshot)", 2);
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
    return;
  }

  // History lives NEXT TO the manifest — a project's undo stack must not
  // depend on where the command happened to run from.
  const manifestPath = args._[0] ?? "edit.json";
  const historyDir = existsSync(manifestPath)
    ? join(dirname(resolve(manifestPath)), ".ripple", "history")
    : HISTORY_DIR();

  if (args.list) {
    const snapshots = listSnapshots(historyDir);
    output({
      ok: true,
      snapshots,
      count: snapshots.length,
      ...(snapshots.length
        ? { hint: "Compare any two: ripple history --diff <snapshot-file> edit.json — or restore by copying a snapshot's .manifest back into edit.json (save a snapshot first!)." }
        : { hint: "No snapshots yet — ripple history [edit.json] --label \"before tightening\" saves one; cut auto-snapshots before every render." }),
    });
    return;
  }

  if (!existsSync(manifestPath)) fail(`Manifest not found: ${manifestPath}`, 2);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const { path, existing, hash } = saveSnapshot(manifest, { label: args.label ?? null, dir: historyDir });
  output({
    ok: true,
    snapshot: path,
    hash,
    ...(existing ? { note: "identical to the newest snapshot — nothing new written" } : {}),
    scenes: manifest.scenes?.length ?? 0,
    duration: assemblyDuration(manifest.scenes ?? []),
    hint: "Review the stack: ripple history --list · measure a change: ripple history --diff <a> <b>.",
  });
}
