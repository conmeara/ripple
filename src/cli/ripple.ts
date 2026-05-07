import type { FrameSheetCliResult } from "./frame-sheet"
import { runVisualCommand, type VisualCommandOptions } from "./visual"

export function rippleHelpText(): string {
  return [
    "Usage: ripple <command> [options]",
    "",
    "Commands:",
    "  snapshot       Capture one visual frame at an explicit time",
    "  sheet          Create a compact frame sheet",
    "  context        Create a frame sheet plus manifest metadata",
    "",
    "Run ripple <command> --help for command options.",
    "",
  ].join("\n")
}

export async function runRippleCli(
  args: string[],
  options: VisualCommandOptions = {},
): Promise<FrameSheetCliResult> {
  const [command, ...rest] = args
  if (!command || command === "--help" || command === "-h") {
    return { exitCode: 0, stdout: rippleHelpText(), stderr: "" }
  }
  if (command === "snapshot" || command === "sheet" || command === "context") {
    return runVisualCommand([command, ...rest], options)
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
