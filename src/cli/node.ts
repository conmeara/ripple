import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { runRippleCli } from "./ripple"

function resolveRepoRoot(): string | undefined {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (typeof resourcesPath === "string") return undefined

  return resolve(dirname(fileURLToPath(import.meta.url)), "../..")
}

async function main(): Promise<void> {
  const result = await runRippleCli(process.argv.slice(2), {
    cwd: process.cwd(),
    env: process.env,
    repoRoot: resolveRepoRoot(),
  })

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  process.exitCode = result.exitCode
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
