import { readdir, readFile, mkdir, writeFile, stat } from "node:fs/promises"
import { createRequire } from "node:module"
import { join } from "node:path"
import type { ScaffoldMetadata, ScaffoldResult } from "./types"

const require = createRequire(import.meta.url)

const TOP_LEVEL_ENTRIES = new Set([
  ".git",
  ".gitignore",
  ".ripple",
  "index.html",
  "compositions",
  "assets",
  "exports",
  "hyperframes.json",
  "meta.json",
])

export class RippleScaffoldError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RippleScaffoldError"
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

async function assertSafeDestination(projectPath: string): Promise<void> {
  if (!(await pathExists(projectPath))) return

  const entries = await readdir(projectPath)
  const unrelated = entries.filter((entry) => !TOP_LEVEL_ENTRIES.has(entry))

  if (unrelated.length > 0) {
    throw new RippleScaffoldError(
      `Project folder already contains unrelated files: ${unrelated.join(", ")}`,
    )
  }
}

async function writeGeneratedFile(filePath: string, content: string | Buffer): Promise<void> {
  if (await pathExists(filePath)) {
    const existing = await readFile(filePath)
    const next = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8")
    if (!existing.equals(next)) {
      throw new RippleScaffoldError(
        `Refusing to overwrite an existing generated file: ${filePath}`,
      )
    }
    return
  }

  await writeFile(filePath, content)
}

async function readBundledGsapRuntime(): Promise<Buffer> {
  try {
    const gsapPath = require.resolve("gsap/dist/gsap.min.js")
    return await readFile(gsapPath)
  } catch (error) {
    throw new RippleScaffoldError(
      `Ripple could not prepare the bundled animation runtime: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

function getIndexHtml(metadata: ScaffoldMetadata): string {
  const projectName = escapeHtml(metadata.projectName)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="data:," />
    <title>${projectName}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #050505;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: #050505;
      }

      .stage {
        position: relative;
        width: ${metadata.width}px;
        height: ${metadata.height}px;
        overflow: hidden;
        background:
          radial-gradient(circle at 50% 42%, rgba(255, 255, 255, 0.11), transparent 34%),
          linear-gradient(135deg, #111 0%, #050505 48%, #171717 100%);
        color: white;
      }

      .title-card {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        text-align: center;
      }

      .eyebrow {
        margin: 0 0 28px;
        font-size: 28px;
        letter-spacing: 0;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.64);
      }

      .title {
        margin: 0;
        max-width: 74%;
        font-size: 112px;
        line-height: 0.96;
        font-weight: 760;
        letter-spacing: 0;
      }

    </style>
  </head>
  <body>
    <main
      id="main"
      class="stage"
      data-composition-id="main"
      data-start="0"
      data-width="${metadata.width}"
      data-height="${metadata.height}"
      data-duration="6"
    >
      <section class="clip title-card" data-start="0" data-duration="6" data-track-index="1">
        <div>
          <p class="clip eyebrow" data-start="0" data-duration="3" data-track-index="2">Ripple starter</p>
          <h1 class="clip title" data-start="0" data-duration="5" data-track-index="3">${projectName}</h1>
        </div>
      </section>
    </main>

    <script src="./assets/vendor/gsap.min.js"></script>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = window.gsap.timeline({ paused: true });
      tl
        .set("#main", { opacity: 1 }, 0)
        .fromTo(".eyebrow", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5 }, 0.1)
        .fromTo(".title", { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.72 }, 0.24)
        .to(".title", { opacity: 0.94, duration: 0.2 }, 4.8)
        .set("#main", { duration: 6 }, 0);
      window.__timelines.main = tl;
    </script>
  </body>
</html>
`
}

function getHyperframesJson(metadata: ScaffoldMetadata): string {
  return `${JSON.stringify(
    {
      name: metadata.projectName,
      entry: "index.html",
      width: metadata.width,
      height: metadata.height,
      fps: metadata.fps,
      duration: 6,
      compositions: ["index.html"],
    },
    null,
    2,
  )}
`
}

function getMetaJson(metadata: ScaffoldMetadata): string {
  return `${JSON.stringify(
    {
      app: "Ripple",
      projectName: metadata.projectName,
      slug: metadata.slug,
      aspectRatioPreset: metadata.aspectRatioPreset,
      templateId: metadata.templateId,
      width: metadata.width,
      height: metadata.height,
      fps: metadata.fps,
      createdWith: "ripple-phase-2",
      localFirst: true,
    },
    null,
    2,
  )}
`
}

function getGitIgnore(): string {
  return `# Ripple generated output
exports/
snapshots/
.ripple/snapshots/
.ripple/tmp/
.ripple/agent-attachments/
node_modules/
.DS_Store
`
}

export function getScaffoldFileContents(metadata: ScaffoldMetadata): Record<string, string> {
  return {
    ".gitignore": getGitIgnore(),
    "index.html": getIndexHtml(metadata),
    "hyperframes.json": getHyperframesJson(metadata),
    "meta.json": getMetaJson(metadata),
  }
}

export async function writeRippleProjectScaffold(
  projectPath: string,
  metadata: ScaffoldMetadata,
): Promise<ScaffoldResult> {
  await assertSafeDestination(projectPath)

  await mkdir(join(projectPath, "compositions"), { recursive: true })
  await mkdir(join(projectPath, "assets", "vendor"), { recursive: true })
  await mkdir(join(projectPath, "exports"), { recursive: true })

  const files = getScaffoldFileContents(metadata)
  for (const [relativePath, content] of Object.entries(files)) {
    await writeGeneratedFile(join(projectPath, relativePath), content)
  }
  await writeGeneratedFile(
    join(projectPath, "assets", "vendor", "gsap.min.js"),
    await readBundledGsapRuntime(),
  )

  return {
    projectPath,
    compositions: [
      {
        name: "Main",
        filePath: "index.html",
        dataCompositionId: "main",
        width: metadata.width,
        height: metadata.height,
        kind: "root",
      },
    ],
  }
}
