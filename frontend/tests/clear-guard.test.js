import { describe, expect, it } from "vitest"
import { planClear } from "../src/shared/clear-guard.js"

describe("清除前保护", () => {
  it("没网时退出被拦住，锁定后队列还在", () => {
    const plan = planClear({ pending: 20, online: false, reason: "退出" })
    expect(plan.action).toBe("lock")
    expect(plan.kept).toBe(20)
    expect(plan.balanced).toBe(true)
  })

  it("联网但上传失败时不清除", () => {
    const plan = planClear({ pending: 4, online: true, failed: true, uploaded: 0, reason: "退出" })
    expect(plan.action).toBe("block")
    expect(plan.kept).toBe(4)
  })

  it("30 天未联网也不删队列", () => {
    const plan = planClear({ pending: 3, online: false, reason: "30 天未联网" })
    expect(plan.action).toBe("lock")
    expect(plan.kept).toBe(3)
  })

  it("只有输入放弃才丢掉队列", () => {
    expect(planClear({ pending: 2, online: false, abandonText: "放", reason: "组织删除" }).action).toBe("lock")
    const plan = planClear({ pending: 2, online: false, abandonText: "放弃", reason: "组织删除" })
    expect(plan.action).toBe("abandon")
    expect(plan.abandoned).toBe(2)
    expect(plan.balanced).toBe(true)
  })
})
