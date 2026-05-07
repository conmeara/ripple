import { describe, expect, test } from "bun:test"
import { VisualContextLifecycle } from "./lifecycle"

describe("Visual Context lifecycle", () => {
  test("runs registered disposers once in reverse order", async () => {
    const lifecycle = new VisualContextLifecycle()
    const calls: string[] = []

    lifecycle.register(() => {
      calls.push("first")
    })
    lifecycle.register(async () => {
      calls.push("second")
    })

    await lifecycle.shutdown()
    await lifecycle.shutdown()

    expect(calls).toEqual(["second", "first"])
  })

  test("disposes immediately when registering after shutdown", async () => {
    const lifecycle = new VisualContextLifecycle()
    const calls: string[] = []

    await lifecycle.shutdown()
    lifecycle.register(() => {
      calls.push("late")
    })
    await Promise.resolve()

    expect(calls).toEqual(["late"])
  })
})
