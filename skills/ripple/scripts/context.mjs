#!/usr/bin/env node
// Ripple context gate. Run at the start of every ripple command.
// Prints the project's standing direction (VIDEO.md) and edit manifest state,
// and emits imperative directives the agent must obey.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function findProjectRoot(startDir) {
  let dir = resolve(startDir);
  for (let i = 0; i < 12; i++) {
    if (
      existsSync(join(dir, "VIDEO.md")) ||
      existsSync(join(dir, "edit.json")) ||
      existsSync(join(dir, ".ripple"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(startDir);
}

const root = findProjectRoot(process.cwd());
const videoPath = join(root, "VIDEO.md");
const manifestPath = existsSync(join(root, "edit.json"))
  ? join(root, "edit.json")
  : join(root, "work", "edit.json");

if (existsSync(videoPath)) {
  console.log("=== VIDEO.md (standing direction — honor this) ===");
  console.log(readFileSync(videoPath, "utf8").trim());
  console.log("=== end VIDEO.md ===\n");
} else {
  console.log(
    "NO_VIDEO_MD: This project has no VIDEO.md yet. Stop the current task, " +
      "read reference/init.md, and interview the user to create VIDEO.md " +
      "before resuming. If the user explicitly declines, proceed with " +
      "conservative defaults (preserve source color, 0.2s pre-roll, tight " +
      "tails) and note that direction is unset."
  );
}

let manifestSummary = null;
if (existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const scenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
    manifestSummary = {
      path: manifestPath,
      scenes: scenes.length,
      colorPolicy: manifest.color?.policy ?? "unset",
      statuses: scenes.reduce((acc, s) => {
        const k = s.status ?? "unknown";
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
    };
    console.log("=== edit.json summary ===");
    console.log(JSON.stringify(manifestSummary, null, 2));
    console.log("=== end edit.json summary ===\n");
  } catch (err) {
    console.log(`MANIFEST_UNREADABLE: ${manifestPath} exists but failed to parse (${err.message}). Fix or regenerate it before editing.`);
  }
}

console.log(
  "RESOLVED_CONTEXT: " +
    JSON.stringify({
      projectRoot: root,
      videoMd: existsSync(videoPath) ? videoPath : null,
      manifest: manifestSummary ? manifestPath : null,
    })
);
