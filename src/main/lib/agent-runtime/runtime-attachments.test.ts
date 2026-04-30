import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  getAgentRuntimeAttachmentSize,
  MAX_AGENT_RUNTIME_ATTACHMENT_BYTES,
  validateAgentRuntimeAttachments,
} from "../../../shared/agent-runtime-attachments"
import { prepareRuntimeAttachments } from "./runtime-attachments"

describe("prepareRuntimeAttachments", () => {
  test("writes attachments under a hidden run folder and prepares native provider blocks", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "ripple-runtime-attachments-"))
    try {
      const prepared = await prepareRuntimeAttachments({
        runId: "run-1",
        cwd,
        attachments: [
          {
            type: "image",
            base64Data: Buffer.from("image bytes").toString("base64"),
            mediaType: "image/png",
            filename: "../frame.png",
          },
          {
            type: "file",
            base64Data: Buffer.from("file bytes").toString("base64"),
            mediaType: "text/plain",
            filename: "notes.txt",
          },
          {
            type: "file",
            base64Data: Buffer.from("pdf bytes").toString("base64"),
            mediaType: "application/pdf",
            filename: "brief.pdf",
          },
        ],
      })

      expect(prepared.promptSuffix).toContain(".ripple/tmp/agent-attachments/run-1/frame.png")
      expect(prepared.promptSuffix).toContain(".ripple/tmp/agent-attachments/run-1/notes.txt")
      expect(prepared.promptSuffix).toContain(".ripple/tmp/agent-attachments/run-1/brief.pdf")
      expect(prepared.savedAttachments.map((attachment) => ({
        type: attachment.type,
        path: attachment.displayPath,
      }))).toEqual([
        { type: "image", path: ".ripple/tmp/agent-attachments/run-1/frame.png" },
        { type: "file", path: ".ripple/tmp/agent-attachments/run-1/notes.txt" },
        { type: "file", path: ".ripple/tmp/agent-attachments/run-1/brief.pdf" },
      ])
      expect(prepared.imageContentBlocks).toEqual([
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: Buffer.from("image bytes").toString("base64"),
          },
        },
      ])
      expect(prepared.documentContentBlocks).toEqual([
        {
          type: "document",
          source: {
            type: "text",
            media_type: "text/plain",
            data: "file bytes",
          },
          title: "notes.txt",
        },
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: Buffer.from("pdf bytes").toString("base64"),
          },
          title: "brief.pdf",
        },
      ])
      expect(
        await readFile(join(cwd, ".ripple", "tmp", "agent-attachments", "run-1", "frame.png"), "utf8"),
      ).toBe("image bytes")
      expect(
        await readFile(join(cwd, ".ripple", "tmp", "agent-attachments", "run-1", "notes.txt"), "utf8"),
      ).toBe("file bytes")
      expect(
        await readFile(join(cwd, ".ripple", "tmp", "agent-attachments", "run-1", "brief.pdf"), "utf8"),
      ).toBe("pdf bytes")
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test("keeps unsupported Claude image types as saved files only", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "ripple-runtime-attachments-"))
    try {
      const prepared = await prepareRuntimeAttachments({
        runId: "run-2",
        cwd,
        attachments: [
          {
            type: "image",
            base64Data: Buffer.from("bitmap bytes").toString("base64"),
            mediaType: "image/bmp",
            filename: "reference.bmp",
          },
        ],
      })

      expect(prepared.promptSuffix).toContain(".ripple/tmp/agent-attachments/run-2/reference.bmp")
      expect(prepared.imageContentBlocks).toEqual([])
      expect(prepared.documentContentBlocks).toEqual([])
      expect(
        await readFile(join(cwd, ".ripple", "tmp", "agent-attachments", "run-2", "reference.bmp"), "utf8"),
      ).toBe("bitmap bytes")
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test("rejects oversized attachments before writing provider files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "ripple-runtime-attachments-"))
    try {
      await expect(
        prepareRuntimeAttachments({
          runId: "run-3",
          cwd,
          attachments: [
            {
              type: "image",
              base64Data: Buffer.from("too large").toString("base64"),
              mediaType: "image/png",
              filename: "large-frame.png",
              size: MAX_AGENT_RUNTIME_ATTACHMENT_BYTES + 1,
            },
          ],
        }),
      ).rejects.toThrow("large-frame.png is larger than 10 MB.")
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test("uses decoded payload sizes instead of client-reported attachment sizes", () => {
    const decodedEightMb = 8 * 1024 * 1024
    const base64Data = "A".repeat(Math.ceil(decodedEightMb * 4 / 3))
    const attachment = {
      type: "file" as const,
      base64Data,
      filename: "underreported.bin",
      size: 1,
    }

    expect(getAgentRuntimeAttachmentSize(attachment)).toBe(decodedEightMb)
    expect(validateAgentRuntimeAttachments([
      attachment,
      { ...attachment, filename: "underreported-2.bin" },
      { ...attachment, filename: "underreported-3.bin" },
    ])).toBe("Attachments are larger than 20 MB total.")
  })
})
