import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"
import { commentForbidden, commentForbiddenMessage } from "../src/shared/forbidden-words.js"

const require = createRequire(import.meta.url)
const catalog = require("../../pocketbase/pb_hooks/dictionary_data.js")

describe("评语禁用词", () => {
  it("按短语提醒，不拦差不多和请写慢一点", () => {
    expect(commentForbidden("差不多", catalog.forbidden)).toBeNull()
    expect(commentForbidden("请写慢一点", catalog.forbidden)).toBeNull()
    const hit = commentForbidden("这个孩子是差生", catalog.forbidden)
    expect(hit.phrase).toBe("差生")
    expect(commentForbiddenMessage(hit)).toContain("这句话里有「差生」")
    expect(commentForbiddenMessage(hit)).toContain("仍要这样写，请确认后再保存。")
  })
})
