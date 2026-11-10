import { describe, expect, it } from "vitest"
import { canRecord } from "../src/shared/consent.js"

describe("未同意学生", () => {
  it("只有已同意可以记学情", () => {
    expect(canRecord("已同意")).toBe(true)
    expect(canRecord("未登记")).toBe(false)
    expect(canRecord("已拒绝")).toBe(false)
    expect(canRecord("已撤回")).toBe(false)
  })
})
