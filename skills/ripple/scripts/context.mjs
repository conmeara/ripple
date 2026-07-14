#!/usr/bin/env node
// Ripple context gate. Run at the start of every ripple command.
// Prints the project's standing direction (VIDEO.md) and edit manifest state,
// and emits imperative directives the agent must obey. Every fact comes from
// cli/status.mjs's gatherStatus — the probes must never exist in two
// versions — but the directive lines here are a contract the skill parses:
// their shape changes only additively.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { gatherStatus } from "../../../cli/status.mjs";

function findProjectRoot(startDir) {
  const start = resolve(startDir);
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (
      existsSync(join(dir, "VIDEO.md")) ||
      existsSync(join(dir, "edit.json")) ||
      existsSync(join(dir, "work", "edit.json")) ||
      existsSync(join(dir, ".ripple", "history")) ||
      existsSync(join(dir, ".ripple", "qa"))
    ) {
      return dir;
    }
    // A repository root is a safe fallback for a new project. Do not keep
    // climbing and mistake the global ~/.ripple model cache for project state.
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const root = findProjectRoot(process.cwd());
const status = gatherStatus(root);
const videoPath = join(root, "VIDEO.md");

if (status.videoMd.present) {
  // gatherStatus never throws on project state; neither may the gate — an
  // unreadable VIDEO.md (permissions) degrades to a note, not a crash that
  // blocks every ripple command.
  let videoMdText = null;
  try {
    videoMdText = readFileSync(videoPath, "utf8").trim();
  } catch (e) {
    console.log(`VIDEO.md exists but could not be read (${e.message}) — standing direction unavailable this run.\n`);
  }
  if (videoMdText !== null) {
    console.log("=== VIDEO.md (standing direction — honor this) ===");
    console.log(videoMdText);
    console.log("=== end VIDEO.md ===\n");
  }
} else {
  console.log(
    "NO_VIDEO_MD: This project has no VIDEO.md yet. Stop the current task, " +
      "read the Ripple skill's reference/init.md, and interview the user to create VIDEO.md " +
      "before resuming. If the user explicitly declines, proceed with " +
      "conservative defaults (preserve source color, 0.2s pre-roll, tight " +
      "tails) and note that direction is unset."
  );
}

let manifestSummary = null;
if (status.manifestError) {
  console.log(`MANIFEST_UNREADABLE: ${status.manifestPath} exists but failed to parse (${status.manifestError}). Fix or regenerate it before editing.`);
} else if (status.manifest) {
  manifestSummary = {
    path: status.manifest.path,
    scenes: status.manifest.sceneCount,
    colorPolicy: status.manifest.colorPolicy,
    statuses: status.manifest.statuses,
  };
  console.log("=== edit.json summary ===");
  console.log(JSON.stringify(manifestSummary, null, 2));
  console.log("=== end edit.json summary ===\n");
}

console.log(`NEXT_STEP: ${status.verdict}`);

console.log(
  "RESOLVED_CONTEXT: " +
    JSON.stringify({
      projectRoot: root,
      videoMd: status.videoMd.present ? videoPath : null,
      manifest: manifestSummary ? status.manifestPath : null,
      next: status.next,
    })
);
