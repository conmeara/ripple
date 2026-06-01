#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const DEFAULT_REPOSITORY = "https://github.com/heygen-com/hyperframes.git"
const DEFAULT_REPOSITORY_WEB = "https://github.com/heygen-com/hyperframes"
const DEFAULT_REF = "main"
const REQUIRED_SKILLS = [
  "hyperframes",
  "hyperframes-cli",
  "hyperframes-media",
]

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const officialRoot = join(repoRoot, "resources", "hyperframes-official")
const skillsRoot = join(officialRoot, "skills")

function printUsage() {
  console.log(`Refresh bundled official HyperFrames skills.

Usage:
  node scripts/update-hyperframes-skills.mjs [--ref <git-ref>] [--repository <url>] [--dry-run]

Options:
  --ref <git-ref>        HyperFrames git ref to fetch. Defaults to ${DEFAULT_REF}.
  --repository <url>     HyperFrames git repository. Defaults to ${DEFAULT_REPOSITORY}.
  --dry-run              Fetch and validate without writing resources.
  --help                 Show this help.
`)
}

function parseArgs(argv) {
  const options = {
    repository: DEFAULT_REPOSITORY,
    ref: DEFAULT_REF,
    dryRun: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--help" || arg === "-h") {
      options.help = true
    } else if (arg === "--dry-run") {
      options.dryRun = true
    } else if (arg === "--ref" || arg === "--repository") {
      const value = argv[index + 1]
      if (!value) throw new Error(`${arg} requires a value`)
      if (arg === "--ref") options.ref = value
      if (arg === "--repository") options.repository = value
      index += 1
    } else if (arg.startsWith("--ref=")) {
      options.ref = arg.slice("--ref=".length)
    } else if (arg.startsWith("--repository=")) {
      options.repository = arg.slice("--repository=".length)
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

function run(command, args, options = {}) {
  const output = execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    cwd: options.cwd,
  })
  return typeof output === "string" ? output.trim() : ""
}

async function listSkillNames(root) {
  const entries = await readdir(root, { withFileTypes: true })
  const names = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.includes("/") || entry.name.includes("\\") || entry.name.includes("..")) continue
    if (existsSync(join(root, entry.name, "SKILL.md"))) names.push(entry.name)
  }
  return names.sort()
}

function repositoryWebUrl(repository) {
  if (repository === DEFAULT_REPOSITORY) return DEFAULT_REPOSITORY_WEB
  return repository.replace(/\.git$/, "")
}

function renderSourceMarkdown(source) {
  return `# Official HyperFrames Skills

Ripple bundles the official HyperFrames agent skills from:

${repositoryWebUrl(source.repository)}/tree/${source.commit}/${source.skillsPath}

These skill bodies are upstream HyperFrames content. Ripple only adds packaging
metadata so Codex and Claude can discover them as app-managed skills.

Refresh for a release with:

\`\`\`bash
bun run hyperframes:skills:update
\`\`\`

The update script refreshes \`skills/\`, records the pinned upstream commit in
\`source.json\`, and keeps the Codex and Claude plugin manifests in place.
`
}

function codexPluginManifest(repository) {
  return {
    name: "ripple-hyperframes",
    version: "0.1.0",
    description: "Official HyperFrames agent skills bundled by Ripple for motion projects, media assets, transparent overlays, animation guidance, previews, and exports.",
    author: {
      name: "HeyGen HyperFrames",
    },
    repository,
    skills: "./skills/",
    interface: {
      displayName: "HyperFrames",
      shortDescription: "Official HyperFrames skills for Ripple motion projects.",
      longDescription: "Official HyperFrames skills bundled with Ripple so agents can create, inspect, and verify motion compositions and reusable media assets.",
      developerName: "HeyGen",
      category: "Creative",
      capabilities: ["Read", "Write", "Bash"],
    },
  }
}

function claudePluginManifest() {
  return {
    name: "ripple-hyperframes",
    description: "Official HyperFrames skills bundled by Ripple for motion projects, media assets, transparent overlays, animation guidance, previews, and exports.",
    version: "0.1.0",
    author: {
      name: "HeyGen HyperFrames",
    },
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function writePackagingMetadata(source) {
  await writeFile(join(officialRoot, "SOURCE.md"), renderSourceMarkdown(source), "utf8")
  await writeJson(join(officialRoot, "source.json"), source)
  await writeJson(join(officialRoot, ".codex-plugin", "plugin.json"), codexPluginManifest(source.repository))
  await writeJson(join(officialRoot, ".claude-plugin", "plugin.json"), claudePluginManifest())
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printUsage()
    return
  }

  const tempRoot = await mkdtemp(join(tmpdir(), "ripple-hyperframes-skills-"))
  const checkoutPath = join(tempRoot, "hyperframes")
  try {
    await mkdir(checkoutPath, { recursive: true })
    run("git", ["init", "-q"], { cwd: checkoutPath })
    run("git", ["remote", "add", "origin", options.repository], { cwd: checkoutPath })
    run("git", ["fetch", "--depth=1", "origin", options.ref], { cwd: checkoutPath })
    const commit = run("git", ["rev-parse", "FETCH_HEAD"], {
      cwd: checkoutPath,
      capture: true,
    })
    run("git", ["checkout", "-q", "--detach", "FETCH_HEAD"], {
      cwd: checkoutPath,
    })

    const fetchedSkillsRoot = join(checkoutPath, "skills")
    const skillNames = await listSkillNames(fetchedSkillsRoot)
    const missing = REQUIRED_SKILLS.filter((skill) => !skillNames.includes(skill))
    if (missing.length > 0) {
      throw new Error(`Fetched HyperFrames skills are missing required skills: ${missing.join(", ")}`)
    }

    const source = {
      repository: repositoryWebUrl(options.repository),
      ref: options.ref,
      commit,
      skillsPath: "skills",
      skillNames,
    }

    if (options.dryRun) {
      console.log(`[hyperframes-skills] Dry run OK: ${skillNames.length} skills at ${commit}`)
      return
    }

    await mkdir(officialRoot, { recursive: true })
    await rm(skillsRoot, { recursive: true, force: true })
    await cp(fetchedSkillsRoot, skillsRoot, { recursive: true })
    await writePackagingMetadata(source)
    console.log(`[hyperframes-skills] Updated ${skillNames.length} skills from ${source.repository}@${commit}`)
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`[hyperframes-skills] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
