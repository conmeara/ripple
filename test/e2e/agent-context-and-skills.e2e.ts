import { expect, test } from "@playwright/test"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

test.describe("Ripple agent context and skills workflow", () => {
  test("passes the deterministic prompt, project-context, and HyperFrames skill eval", async () => {
    const result = await execFileAsync(
      "bun",
      ["test", "./test/e2e/agent-context-and-skills.workflow.ts"],
      {
        cwd: process.cwd(),
        env: process.env,
        maxBuffer: 10 * 1024 * 1024,
      },
    ).catch((error: Error & { stdout?: string; stderr?: string }) => {
      throw new Error([
        error.message,
        error.stdout,
        error.stderr,
      ].filter(Boolean).join("\n"))
    })

    expect(`${result.stdout}\n${result.stderr}`).toContain("1 pass")
  })
})
