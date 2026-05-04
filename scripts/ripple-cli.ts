#!/usr/bin/env bun
import { resolve } from "node:path"
import { runRippleCli } from "../src/cli/ripple"

const result = await runRippleCli(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  repoRoot: resolve(import.meta.dir, ".."),
})

if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
process.exitCode = result.exitCode
