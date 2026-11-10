import { describe, expect, it } from "vitest"
import { watermarkText } from "../src/shared/demo.js"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

describe("演示标记", () => {
  it("页面水印固定为「演示数据」", () => {
    expect(watermarkText()).toBe("演示数据")
  })
})

describe("PocketBase 版本锁", () => {
  it("锁定 v0.40.6", () => {
    const version = readFileSync(resolve(import.meta.dirname, "../../pocketbase/VERSION"), "utf8").trim()
    expect(version).toBe("0.40.6")
  })
})
