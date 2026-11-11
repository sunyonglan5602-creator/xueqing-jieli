import { describe, expect, it } from "vitest"
import { photoTooBig } from "../src/shared/photo.js"

describe("拍照大小", () => {
  it("默认上限是 300KB", () => {
    expect(photoTooBig(300 * 1024)).toBe(false)
    expect(photoTooBig(300 * 1024 + 1)).toBe(true)
  })
})
