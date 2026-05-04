import { runFrameSheetCommand } from "./frame-sheet"
import type { FrameSheetCliResult } from "./frame-sheet"

export function rippleHelpText(): string {
  return [
    "Usage: ripple <command> [options]",
    "",
    "Commands:",
    "  frame-sheet    Generate a project-local contact sheet from HyperFrames frames",
    "",
    "Run ripple <command> --help for command options.",
    "",
  ].join("\n")
}

export async function runRippleCli(
  args: string[],
  options: Parameters<typeof runFrameSheetCommand>[1] = {},
): Promise<FrameSheetCliResult> {
  const [command, ...rest] = args
  if (!command || command === "--help" || command === "-h") {
    return { exitCode: 0, stdout: rippleHelpText(), stderr: "" }
  }
  if (command === "frame-sheet" || command === "framesheet") {
    return runFrameSheetCommand(rest, options)
  }

  const wantsJson = rest.includes("--json") || args.includes("--json")
  const message = `Unknown ripple command: ${command}`
  if (wantsJson) {
    return {
      exitCode: 1,
      stdout: `${JSON.stringify({
        ok: false,
        error: {
          code: "UNKNOWN_COMMAND",
          message,
        },
      }, null, 2)}\n`,
      stderr: "",
    }
  }
  return {
    exitCode: 1,
    stdout: "",
    stderr: `${message}\n`,
  }
}
