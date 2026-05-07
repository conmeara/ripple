export type VisualContextDispose = () => void | Promise<void>

export class VisualContextLifecycle {
  private readonly disposers: VisualContextDispose[] = []
  private closed = false

  register(dispose: VisualContextDispose): void {
    if (this.closed) {
      void dispose()
      return
    }
    this.disposers.push(dispose)
  }

  async shutdown(): Promise<void> {
    if (this.closed) return
    this.closed = true
    const disposers = [...this.disposers].reverse()
    this.disposers.length = 0
    await Promise.all(disposers.map((dispose) =>
      Promise.resolve(dispose()).catch(() => undefined)
    ))
  }
}
