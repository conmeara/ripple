import { describe, expect, test } from "bun:test"
import { clampResizableSidebarOpenWidth } from "./resizable-sidebar"

describe("ResizableSidebar width helpers", () => {
  test("clamps open panel width to configured bounds", () => {
    expect(
      clampResizableSidebarOpenWidth({
        width: 180,
        minWidth: 260,
        maxWidth: 380,
      }),
    ).toBe(260)

    expect(
      clampResizableSidebarOpenWidth({
        width: 320,
        minWidth: 260,
        maxWidth: 380,
      }),
    ).toBe(320)

    expect(
      clampResizableSidebarOpenWidth({
        width: 420,
        minWidth: 260,
        maxWidth: 380,
      }),
    ).toBe(380)
  })
})
