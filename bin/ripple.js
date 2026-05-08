#!/usr/bin/env node
"use strict"

const { spawnSync } = require("node:child_process")
const { existsSync, realpathSync } = require("node:fs")
const { dirname, join, resolve } = require("node:path")

const scriptPath = realpathSync(__filename)
const repoRoot = resolve(dirname(scriptPath), "..")
const args = process.argv.slice(2)

function run(command, commandArgs, env = process.env) {
  const result = spawnSync(command, commandArgs, {
    env,
    stdio: "inherit",
    windowsHide: true,
  })
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`)
    process.exitCode = 1
    return
  }
  process.exitCode = typeof result.status === "number" ? result.status : 1
}

function commandExists(command) {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
    windowsHide: true,
  })
  return !result.error
}

const builtCli = join(repoRoot, "out", "main", "ripple-cli.js")
if (existsSync(builtCli)) {
  run(process.execPath, [builtCli, ...args])
  return
}

const sourceCli = join(repoRoot, "scripts", "ripple-cli.ts")
if (existsSync(sourceCli) && commandExists("bun")) {
  run("bun", [sourceCli, ...args])
  return
}

process.stderr.write("Ripple CLI is not available. Run `bun install` and `bun run build`, then try again.\n")
process.exitCode = 1
