import { existsSync } from "node:fs";
import { lintManifest } from "./rules.mjs";
import { fail, output, parseArgs } from "./util.mjs";

// The pre-render gate: every lock rule, across every scene, from cached
// perception only. Exists because flags caught at lock time kept re-breaking
// later — a scene re-scoped by hand after candidates ran carried a fresh
// DEAD_AIR_TAIL nobody re-checked, and the render shipped it. lint re-judges
// the WHOLE manifest in milliseconds, so a file-write hook can run it on
// every edit.json save: no ffmpeg, no whisper, no writes, ever.
export async function main(argv) {
  const args = parseArgs(argv, {
    scene: "string", "analysis-dir": "string", "video-md": "string",
    "max-tail": "number", "max-lead": "number",
  });
  const manifestPath = args._[0] ?? "edit.json";
  if (!existsSync(manifestPath)) fail(`Manifest not found: ${manifestPath}. Run /ripple plan first.`, 2);
  // An explicit --video-md that doesn't exist is a usage error like every
  // other explicit path — silently treating a typo as "no project rules"
  // once dropped a standing waiver and flipped the render gate.
  if (args["video-md"] && !existsSync(args["video-md"])) fail(`VIDEO.md not found: ${args["video-md"]}`, 2);

  let result;
  try {
    result = lintManifest(manifestPath, {
      scene: args.scene,
      analysisDir: args["analysis-dir"],
      videoMd: args["video-md"],
      // Explicit flags only: an unset flag lets the VIDEO.md project retune
      // (or the default) apply; a set flag outranks the retune.
      maxTail: args["max-tail"],
      maxLead: args["max-lead"],
    });
  } catch (e) {
    fail(`Manifest unreadable: ${e.message}`, 2);
  }
  if (args.scene && result.scenes.length === 0) fail(`--scene matched nothing (${args.scene})`, 2);

  const { findings, overrides, scenes } = result;
  const blocked = findings.filter((f) => f.severity === "block" && !f.waived);
  const warns = findings.filter((f) => f.severity === "warn" && !f.waived);
  const waived = findings.filter((f) => f.waived);

  output({
    ok: blocked.length === 0,
    manifest: manifestPath,
    scenes,
    ...(overrides.length ? { overrides } : {}),
    findings,
    summary: { block: blocked.length, warn: warns.length, waived: waived.length },
    ...(blocked.length
      ? {
          hint: "Block findings stop the render: re-scope the cut (ripple candidates), or waive with a written reason — scenes[].waivers in edit.json, or VIDEO.md front-matter rules. Registry: reference/rules.md.",
        }
      : {}),
  });
  if (blocked.length) process.exit(1);
}
