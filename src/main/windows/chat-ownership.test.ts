import { describe, expect, test } from "bun:test"
import { ChatOwnershipRegistry } from "./chat-ownership"

describe("chat ownership registry", () => {
  test("allows the same window to claim a chat idempotently", () => {
    const ownership = new ChatOwnershipRegistry()

    expect(
      ownership.claim("chat-1", 1, {
        isOwnerActive: () => true,
        getOwnerStableId: () => "main",
      }),
    ).toEqual({ ok: true })
    expect(
      ownership.claim("chat-1", 1, {
        isOwnerActive: () => true,
        getOwnerStableId: () => "main",
      }),
    ).toEqual({ ok: true })
    expect(ownership.getOwner("chat-1")).toBe(1)
  })

  test("blocks another active window from claiming the same chat", () => {
    const ownership = new ChatOwnershipRegistry()

    ownership.claim("chat-1", 1, {
      isOwnerActive: () => true,
      getOwnerStableId: () => "main",
    })

    expect(
      ownership.claim("chat-1", 2, {
        isOwnerActive: (ownerId) => ownerId === 1,
        getOwnerStableId: () => "main",
      }),
    ).toEqual({ ok: false, ownerStableId: "main" })
    expect(ownership.getOwner("chat-1")).toBe(1)
  })

  test("reclaims stale ownership from closed windows", () => {
    const ownership = new ChatOwnershipRegistry()

    ownership.claim("chat-1", 1, {
      isOwnerActive: () => true,
      getOwnerStableId: () => "main",
    })

    expect(
      ownership.claim("chat-1", 2, {
        isOwnerActive: () => false,
        getOwnerStableId: () => "main",
      }),
    ).toEqual({ ok: true })
    expect(ownership.getOwner("chat-1")).toBe(2)
  })

  test("releases all chats owned by a closing window", () => {
    const ownership = new ChatOwnershipRegistry()
    const options = {
      isOwnerActive: () => true,
      getOwnerStableId: () => "main",
    }

    ownership.claim("chat-1", 1, options)
    ownership.claim("chat-2", 1, options)
    ownership.claim("chat-3", 2, options)
    ownership.releaseAllChats(1)

    expect(ownership.getOwner("chat-1")).toBeUndefined()
    expect(ownership.getOwner("chat-2")).toBeUndefined()
    expect(ownership.getOwner("chat-3")).toBe(2)
  })
})
