export type ChatClaimResult = { ok: true } | { ok: false; ownerStableId: string }

export class ChatOwnershipRegistry {
  private readonly owners = new Map<string, number>()

  claim(
    chatId: string,
    electronId: number,
    options: {
      isOwnerActive: (electronId: number) => boolean
      getOwnerStableId: (electronId: number) => string
    },
  ): ChatClaimResult {
    const existingOwner = this.owners.get(chatId)

    if (existingOwner === electronId) {
      return { ok: true }
    }

    if (existingOwner !== undefined) {
      if (options.isOwnerActive(existingOwner)) {
        return {
          ok: false,
          ownerStableId: options.getOwnerStableId(existingOwner),
        }
      }

      this.owners.delete(chatId)
    }

    this.owners.set(chatId, electronId)
    return { ok: true }
  }

  releaseChat(chatId: string, electronId: number): void {
    if (this.owners.get(chatId) === electronId) {
      this.owners.delete(chatId)
    }
  }

  releaseAllChats(electronId: number): void {
    for (const [chatId, owner] of this.owners.entries()) {
      if (owner === electronId) {
        this.owners.delete(chatId)
      }
    }
  }

  clearOwner(chatId: string): void {
    this.owners.delete(chatId)
  }

  getOwner(chatId: string): number | undefined {
    return this.owners.get(chatId)
  }
}
