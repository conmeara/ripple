import { createHash } from "node:crypto"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

export const RIPPLE_AGENT_NOTE_FILENAMES = [
  "AGENTS.md",
  "CLAUDE.md",
] as const

export type RippleAgentNoteFileName =
  (typeof RIPPLE_AGENT_NOTE_FILENAMES)[number]

export type RippleAgentNoteStatus =
  | "created"
  | "present"
  | "missing"
  | "user-modified"
  | "managed-old-version"

export interface RippleAgentNoteFileStatus {
  fileName: RippleAgentNoteFileName
  path: string
  status: RippleAgentNoteStatus
  templateVersion: number
}

export interface RippleAgentNotesResult {
  files: RippleAgentNoteFileStatus[]
  metadataPath: string
}

interface AgentNotesMetadata {
  version: number
  files: Partial<Record<RippleAgentNoteFileName, {
    templateVersion: number
    templateHash: string
    updatedAt: string
  }>>
}

const AGENT_NOTES_TEMPLATE_VERSION = 1
const AGENT_NOTES_METADATA_FILE = join(".ripple", "agent-notes.json")

function providerLabel(fileName: RippleAgentNoteFileName): string {
  return fileName === "AGENTS.md" ? "Codex" : "Claude"
}

export function renderRippleProjectAgentNote(
  fileName: RippleAgentNoteFileName,
): string {
  const provider = providerLabel(fileName)
  return `# Ripple Project Notes For ${provider}

This file is for project-specific guidance that your team wants ${provider} to
remember while working in this Ripple project.

Ripple supplies app-level motion-editing policy, HyperFrames guidance, active
composition/frame/comment context, and revision boundaries at run time. Keep
this file focused on durable project preferences such as brand voice, visual
style, naming conventions, asset rules, and project-specific commands.

Add project notes below.
`
}

function normalizeNoteText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim()
}

function hashNote(value: string): string {
  return createHash("sha256").update(normalizeNoteText(value)).digest("hex")
}

function metadataPath(projectPath: string): string {
  return join(projectPath, AGENT_NOTES_METADATA_FILE)
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

async function readMetadata(projectPath: string): Promise<AgentNotesMetadata | null> {
  try {
    const parsed = JSON.parse(await readFile(metadataPath(projectPath), "utf8"))
    if (!parsed || typeof parsed !== "object") return null
    return {
      version: typeof parsed.version === "number" ? parsed.version : 1,
      files: parsed.files && typeof parsed.files === "object" ? parsed.files : {},
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    return null
  }
}

async function writeMetadata(
  projectPath: string,
  metadata: AgentNotesMetadata,
): Promise<void> {
  const target = metadataPath(projectPath)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, `${JSON.stringify(metadata, null, 2)}\n`, "utf8")
}

function isLegacyManagedInstruction(value: string): boolean {
  return (
    value.includes("Ripple Project Instructions For") &&
    value.includes("Treat compositions as plain HyperFrames HTML/CSS/GSAP files")
  )
}

async function readNoteStatus(input: {
  projectPath: string
  fileName: RippleAgentNoteFileName
  metadata: AgentNotesMetadata | null
}): Promise<RippleAgentNoteFileStatus> {
  const filePath = join(input.projectPath, input.fileName)
  if (!(await pathExists(filePath))) {
    return {
      fileName: input.fileName,
      path: filePath,
      status: "missing",
      templateVersion: AGENT_NOTES_TEMPLATE_VERSION,
    }
  }

  const existing = await readFile(filePath, "utf8")
  const expected = renderRippleProjectAgentNote(input.fileName)
  const expectedHash = hashNote(expected)
  const metadataEntry = input.metadata?.files?.[input.fileName]
  const existingHash = hashNote(existing)
  const status =
    existingHash === expectedHash ||
      metadataEntry?.templateHash === existingHash
      ? "present"
      : isLegacyManagedInstruction(existing)
        ? "managed-old-version"
        : "user-modified"

  return {
    fileName: input.fileName,
    path: filePath,
    status,
    templateVersion: metadataEntry?.templateVersion ?? AGENT_NOTES_TEMPLATE_VERSION,
  }
}

export async function checkRippleProjectAgentNotes(
  projectPath: string,
): Promise<RippleAgentNotesResult> {
  const metadata = await readMetadata(projectPath)
  const files = await Promise.all(
    RIPPLE_AGENT_NOTE_FILENAMES.map((fileName) =>
      readNoteStatus({ projectPath, fileName, metadata }),
    ),
  )
  return { files, metadataPath: metadataPath(projectPath) }
}

export async function ensureRippleProjectAgentNotes(
  projectPath: string,
): Promise<RippleAgentNotesResult> {
  const metadata = await readMetadata(projectPath) ?? { version: 1, files: {} }
  const files: RippleAgentNoteFileStatus[] = []
  let metadataChanged = false

  for (const fileName of RIPPLE_AGENT_NOTE_FILENAMES) {
    const status = await readNoteStatus({ projectPath, fileName, metadata })
    if (status.status !== "missing") {
      files.push(status)
      continue
    }

    const content = renderRippleProjectAgentNote(fileName)
    await mkdir(dirname(status.path), { recursive: true })
    await writeFile(status.path, content, { encoding: "utf8", flag: "wx" })
    metadata.files[fileName] = {
      templateVersion: AGENT_NOTES_TEMPLATE_VERSION,
      templateHash: hashNote(content),
      updatedAt: new Date().toISOString(),
    }
    metadataChanged = true
    files.push({
      ...status,
      status: "created",
    })
  }

  if (metadataChanged) {
    await writeMetadata(projectPath, metadata)
  }

  return { files, metadataPath: metadataPath(projectPath) }
}

export async function refreshRippleProjectAgentNotes(
  projectPath: string,
): Promise<RippleAgentNotesResult> {
  const metadata: AgentNotesMetadata = { version: 1, files: {} }
  const files: RippleAgentNoteFileStatus[] = []

  for (const fileName of RIPPLE_AGENT_NOTE_FILENAMES) {
    const filePath = join(projectPath, fileName)
    const content = renderRippleProjectAgentNote(fileName)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, content, "utf8")
    metadata.files[fileName] = {
      templateVersion: AGENT_NOTES_TEMPLATE_VERSION,
      templateHash: hashNote(content),
      updatedAt: new Date().toISOString(),
    }
    files.push({
      fileName,
      path: filePath,
      status: "created",
      templateVersion: AGENT_NOTES_TEMPLATE_VERSION,
    })
  }

  await writeMetadata(projectPath, metadata)
  return { files, metadataPath: metadataPath(projectPath) }
}

export async function readRippleProjectAgentNote(input: {
  projectPath: string
  fileName: RippleAgentNoteFileName
}): Promise<{ content: string | null; status: RippleAgentNoteStatus }> {
  const checked = await checkRippleProjectAgentNotes(input.projectPath)
  const status = checked.files.find((file) => file.fileName === input.fileName)
  if (!status || status.status === "missing") {
    return { content: null, status: "missing" }
  }

  try {
    const content = await readFile(status.path, "utf8")
    return {
      content: content.trim() ? content : null,
      status: status.status,
    }
  } catch {
    return { content: null, status: "missing" }
  }
}

