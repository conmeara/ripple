import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { assemblyDuration } from "./cut.mjs";
import { ensureDir, fail, output, parseArgs, readJsonOrNull, writeJsonAtomic } from "./util.mjs";

// The agent's undo stack. Editors experiment BECAUSE undo is free; an agent
// without history is timid for the same reason. Every snapshot is a full
// manifest copy in .ripple/history — try the punchier cut, compare, revert.

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

export async function main(argv) {
  const args = parseArgs(argv, { label: "string", list: "boolean" });
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
        ? { hint: "Compare any two: ripple compare <snapshot-file> edit.json — or restore by copying a snapshot's .manifest back into edit.json (snapshot first!)." }
        : { hint: "No snapshots yet — ripple snapshot [edit.json] --label \"before tightening\" saves one; cut auto-snapshots before every render." }),
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
  });
}
