import { mkdir, writeFile } from "node:fs/promises"
import { basename, extname, relative, resolve } from "node:path"
import {
  type AgentRuntimeAttachment,
  type AgentRuntimeImageAttachment,
  validateAgentRuntimeAttachments,
} from "../../../shared/agent-runtime-attachments"
import { isPathInsideDirectory } from "../ripple-projects/paths"

export interface PreparedRuntimeAttachment {
  type: AgentRuntimeAttachment["type"]
  originalName: string
  fileName: string
  path: string
  displayPath: string
  mediaType?: string
}

export interface PreparedRuntimeAttachments {
  promptSuffix: string
  savedAttachments: PreparedRuntimeAttachment[]
  imageContentBlocks: ClaudeImageContentBlock[]
  documentContentBlocks: ClaudeDocumentContentBlock[]
}

type ClaudeImageMediaType =
  | "image/gif"
  | "image/jpeg"
  | "image/png"
  | "image/webp"

type ClaudeImageContentBlock = {
  type: "image"
  source: {
    type: "base64"
    media_type: ClaudeImageMediaType
    data: string
  }
}

type ClaudeDocumentContentBlock = {
  type: "document"
  source:
    | {
        type: "base64"
        media_type: "application/pdf"
        data: string
      }
    | {
        type: "text"
        media_type: "text/plain"
        data: string
      }
  title?: string
}

const EMPTY_PREPARED_ATTACHMENTS: PreparedRuntimeAttachments = {
  promptSuffix: "",
  savedAttachments: [],
  imageContentBlocks: [],
  documentContentBlocks: [],
}

const MEDIA_TYPE_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/bmp": ".bmp",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
}

function normalizeMediaType(value: string | undefined): string | undefined {
  return value?.split(";")[0]?.trim().toLowerCase() || undefined
}

function getAttachmentMediaType(
  attachment: AgentRuntimeAttachment,
): string | undefined {
  return normalizeMediaType(
    "mediaType" in attachment ? attachment.mediaType : undefined,
  )
}

function normalizeClaudeImageMediaType(
  value: string,
): ClaudeImageMediaType | null {
  const mediaType = normalizeMediaType(value)
  if (mediaType === "image/jpg") return "image/jpeg"
  if (
    mediaType === "image/gif" ||
    mediaType === "image/jpeg" ||
    mediaType === "image/png" ||
    mediaType === "image/webp"
  ) {
    return mediaType
  }
  return null
}

function getAttachmentDisplayName(
  attachment: AgentRuntimeAttachment,
  fileName: string,
): string {
  return attachment.filename || fileName
}

function sanitizeAttachmentFileName(
  attachment: AgentRuntimeAttachment,
  index: number,
): string {
  const mediaType = getAttachmentMediaType(attachment)
  const fallback = attachment.type === "image"
    ? `image-${index + 1}${MEDIA_TYPE_EXTENSIONS[mediaType ?? ""] ?? ".png"}`
    : `file-${index + 1}`
  const rawName = attachment.filename?.trim() || fallback
  const name = basename(rawName)
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
  const safeName = name || fallback
  const currentExtension = extname(safeName)
  const mediaExtension = mediaType ? MEDIA_TYPE_EXTENSIONS[mediaType] : undefined

  if (!currentExtension && mediaExtension) {
    return `${safeName}${mediaExtension}`
  }
  return safeName
}

function uniqueName(
  usedNames: Set<string>,
  name: string,
): string {
  if (!usedNames.has(name)) {
    usedNames.add(name)
    return name
  }

  const extension = extname(name)
  const stem = extension ? name.slice(0, -extension.length) : name
  let suffix = 2
  for (;;) {
    const candidate = `${stem}-${suffix}${extension}`
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate)
      return candidate
    }
    suffix += 1
  }
}

function toImageContentBlock(
  attachment: AgentRuntimeImageAttachment,
): ClaudeImageContentBlock | null {
  const mediaType = normalizeClaudeImageMediaType(attachment.mediaType)
  if (!mediaType) return null
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mediaType,
      data: attachment.base64Data,
    },
  }
}

function toDocumentContentBlock(
  attachment: AgentRuntimeAttachment,
  fileName: string,
): ClaudeDocumentContentBlock | null {
  const mediaType = getAttachmentMediaType(attachment)
  if (attachment.type === "file" && mediaType === "application/pdf") {
    return {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: attachment.base64Data,
      },
      title: getAttachmentDisplayName(attachment, fileName),
    }
  }
  if (attachment.type === "file" && mediaType === "text/plain") {
    return {
      type: "document",
      source: {
        type: "text",
        media_type: "text/plain",
        data: Buffer.from(attachment.base64Data, "base64").toString("utf8"),
      },
      title: getAttachmentDisplayName(attachment, fileName),
    }
  }
  return null
}

export async function prepareRuntimeAttachments(input: {
  runId: string
  cwd: string
  attachments?: AgentRuntimeAttachment[] | null
}): Promise<PreparedRuntimeAttachments> {
  const attachments = input.attachments?.filter((attachment) =>
    attachment.base64Data && (
      attachment.type === "image" ||
      attachment.type === "file"
    ),
  ) ?? []

  if (attachments.length === 0) {
    return EMPTY_PREPARED_ATTACHMENTS
  }
  const validationMessage = validateAgentRuntimeAttachments(attachments)
  if (validationMessage) {
    throw new Error(validationMessage)
  }

  const cwd = resolve(input.cwd)
  const attachmentRoot = resolve(
    cwd,
    ".ripple",
    "tmp",
    "agent-attachments",
    input.runId,
  )
  if (!isPathInsideDirectory(cwd, attachmentRoot)) {
    throw new Error("Ripple could not prepare attachments for this run.")
  }

  await mkdir(attachmentRoot, { recursive: true })
  const usedNames = new Set<string>()
  const lines: string[] = []
  const savedAttachments: PreparedRuntimeAttachments["savedAttachments"] = []
  const imageContentBlocks: PreparedRuntimeAttachments["imageContentBlocks"] = []
  const documentContentBlocks: PreparedRuntimeAttachments["documentContentBlocks"] = []

  for (const [index, attachment] of attachments.entries()) {
    const fileName = uniqueName(
      usedNames,
      sanitizeAttachmentFileName(attachment, index),
    )
    const destination = resolve(attachmentRoot, fileName)
    if (!isPathInsideDirectory(attachmentRoot, destination)) {
      throw new Error("Ripple could not prepare attachments for this run.")
    }

    await writeFile(destination, Buffer.from(attachment.base64Data, "base64"))
    const displayPath = relative(cwd, destination)
    const originalName = getAttachmentDisplayName(attachment, fileName)
    const mediaType = getAttachmentMediaType(attachment)
    lines.push(`- ${originalName}: ${displayPath}`)
    savedAttachments.push({
      type: attachment.type,
      originalName,
      fileName,
      path: destination,
      displayPath,
      mediaType,
    })

    if (attachment.type === "image") {
      const imageContentBlock = toImageContentBlock(attachment)
      if (imageContentBlock) {
        imageContentBlocks.push(imageContentBlock)
      }
    }

    const documentContentBlock = toDocumentContentBlock(attachment, fileName)
    if (documentContentBlock) {
      documentContentBlocks.push(documentContentBlock)
    }
  }

  const promptSuffix = [
    "Attached files for this request were saved inside the Ripple project:",
    ...lines,
    "Use these attachments as references for the user's request. Do not modify them unless the user explicitly asks.",
  ].join("\n")

  return {
    promptSuffix,
    savedAttachments,
    imageContentBlocks,
    documentContentBlocks,
  }
}
