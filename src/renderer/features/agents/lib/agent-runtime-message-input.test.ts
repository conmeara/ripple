import { describe, expect, test } from "bun:test"
import { buildAgentRuntimeMessageInput } from "./agent-runtime-message-input"

describe("buildAgentRuntimeMessageInput", () => {
  test("keeps image and file attachments for the Phase 11 runtime", () => {
    const input = buildAgentRuntimeMessageInput({
      parts: [
        {
          type: "data-image",
          data: {
            base64Data: "aW1hZ2U=",
            mediaType: "image/png",
            filename: "frame.png",
          },
        },
        {
          type: "data-file",
          data: {
            base64Data: "ZmlsZQ==",
            mediaType: "application/pdf",
            filename: "brief.pdf",
            size: 12,
          },
        },
        { type: "text", text: "Use these references." },
        {
          type: "file-content",
          filePath: "notes.txt",
          content: "Text file contents.",
        },
      ],
    })

    expect(input.prompt).toContain("Use these references.")
    expect(input.prompt).toContain("--- notes.txt ---")
    expect(input.prompt).toContain("[Attached image: frame.png]")
    expect(input.prompt).toContain("[Attached file: brief.pdf]")
    expect(input.attachments).toEqual([
      {
        type: "image",
        base64Data: "aW1hZ2U=",
        mediaType: "image/png",
        filename: "frame.png",
      },
      {
        type: "file",
        base64Data: "ZmlsZQ==",
        mediaType: "application/pdf",
        filename: "brief.pdf",
        size: 12,
      },
    ])
  })

  test("keeps attachment-only chat sends meaningful for providers", () => {
    const input = buildAgentRuntimeMessageInput({
      parts: [
        {
          type: "data-image",
          data: {
            base64Data: "aW1hZ2U=",
            mediaType: "image/png",
            filename: "reference.png",
          },
        },
      ],
    })

    expect(input.prompt).toBe("\n[Attached image: reference.png]")
    expect(input.attachments).toEqual([
      {
        type: "image",
        base64Data: "aW1hZ2U=",
        mediaType: "image/png",
        filename: "reference.png",
      },
    ])
  })

  test("does not pass malformed attachment bytes to the runtime", () => {
    const input = buildAgentRuntimeMessageInput({
      parts: [
        { type: "text", text: "Use the visible note." },
        {
          type: "data-image",
          data: {
            filename: "missing-bytes.png",
            mediaType: "image/png",
          },
        },
        {
          type: "data-file",
          data: {
            filename: "missing-bytes.pdf",
            mediaType: "application/pdf",
          },
        },
      ],
    })

    expect(input.prompt).toContain("Use the visible note.")
    expect(input.prompt).toContain("[Attached image: missing-bytes.png]")
    expect(input.prompt).toContain("[Attached file: missing-bytes.pdf]")
    expect(input.attachments).toEqual([])
  })
})
