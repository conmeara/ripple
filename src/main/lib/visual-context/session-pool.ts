export interface VisualContextRequestQueueOptions {
  maxActive: number
}

export class VisualContextRequestQueue {
  private active = 0
  private readonly waiters: Array<() => void> = []
  private readonly keyChains = new Map<string, Promise<void>>()

  constructor(private readonly options: VisualContextRequestQueueOptions) {
    if (!Number.isInteger(options.maxActive) || options.maxActive < 1) {
      throw new Error("Visual context queue requires at least one active slot.")
    }
  }

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.keyChains.get(key) ?? Promise.resolve()
    let releaseKey!: () => void
    const current = previous.catch(() => undefined).then(() =>
      new Promise<void>((resolve) => {
        releaseKey = resolve
      })
    )
    this.keyChains.set(key, current)

    await previous.catch(() => undefined)
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
      releaseKey()
      if (this.keyChains.get(key) === current) {
        this.keyChains.delete(key)
      }
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < this.options.maxActive) {
      this.active += 1
      return
    }

    await new Promise<void>((resolve) => {
      this.waiters.push(resolve)
    })
    this.active += 1
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1)
    const next = this.waiters.shift()
    if (next) next()
  }
}
