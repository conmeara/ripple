import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

function readSource(path: string) {
  return readFileSync(path, "utf-8")
}

function getCommentComposerSource() {
  const source = readSource(
    "src/renderer/features/comments/RippleCommentsPane.tsx",
  )
  return source.slice(source.indexOf("function CommentComposer"))
}

function getCommentsPaneSource() {
  return readSource("src/renderer/features/comments/RippleCommentsPane.tsx")
}

describe("comment composer", () => {
  test("matches the chat input shell instead of clipping the halo", () => {
    const commentComposerSource = getCommentComposerSource()
    const commentsPaneSource = getCommentsPaneSource()
    const chatInputSource = readSource(
      "src/renderer/features/agents/main/chat-input-area.tsx",
    )
    const chatBarClass = "pb-2 shadow-sm shadow-background relative z-10"
    const chatPromptBaseClass =
      "border bg-input-background relative z-10 p-2 rounded-xl transition-[border-color,box-shadow] duration-150"

    expect(chatInputSource).toContain(chatBarClass)
    expect(commentsPaneSource).toContain(`${chatBarClass} px-3`)
    expect(commentsPaneSource).not.toContain(
      "shrink-0 overflow-hidden px-3 pb-2 shadow-sm shadow-background",
    )
    expect(chatInputSource).toContain(chatPromptBaseClass)
    expect(commentComposerSource).toContain(chatPromptBaseClass)
    expect(commentComposerSource).toContain('className="relative w-full"')
    expect(commentComposerSource).toContain(
      'className="relative w-full cursor-text"',
    )
    expect(commentComposerSource).toContain(
      "onClick={() => textareaRef.current?.focus()}",
    )
    expect(commentComposerSource).toContain("ref={textareaRef}")
    expect(commentComposerSource).toContain(
      'isFocused && "ring-2 ring-primary/50"',
    )
    expect(commentComposerSource).toContain("onFocus={() => setIsFocused(true)}")
    expect(commentComposerSource).toContain("onBlur={() => setIsFocused(false)}")
    expect(commentComposerSource).not.toContain("focus-within:border-primary/45")
    expect(commentComposerSource).not.toContain("focus-within:ring-2")
  })
})
