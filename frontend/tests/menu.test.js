import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { ROLE_LABELS, phaseEntries, showsStudentDetail } from "../src/shared/menu.js"

describe("二期和三期入口", () => {
  it("按角色显示占位，平台管理员没有学生明细", () => {
    expect(phaseEntries({ roles: ["teacher"] })).toEqual([{ id: "m9", label: "练习组卷", phase: "二期开放" }])
    expect(phaseEntries({ roles: ["org_admin"] })).toEqual([
      { id: "m10", label: "区域教研", phase: "二期开放" },
      { id: "m11", label: "物资", phase: "三期开放" },
    ])
    expect(phaseEntries({ roles: ["school_admin"] })).toEqual([{ id: "m11", label: "物资", phase: "三期开放" }])
    expect(phaseEntries({ roles: ["education_bureau_viewer"] })).toEqual([
      { id: "m10", label: "区域教研", phase: "二期开放" },
    ])
    expect(phaseEntries({ roles: ["platform_admin"] })).toEqual([])
    expect(phaseEntries({ roles: ["parent"] })).toEqual([])
    expect(showsStudentDetail({ roles: ["platform_admin"] })).toBe(false)
    expect(showsStudentDetail({ roles: ["education_bureau_viewer"] })).toBe(false)
    expect(showsStudentDetail({ roles: ["org_admin"] })).toBe(true)
    expect(ROLE_LABELS.education_bureau_viewer).toBe("教育局查看者")
  })

  it("一期界面不出现按乡镇或片区下钻", () => {
    const files = ["AdminShell.vue", "MobileShell.vue", "HomeView.vue", "ApplyView.vue"]
    for (const file of files) {
      const source = readFileSync(resolve(import.meta.dirname, "../src/views", file), "utf8")
      expect(source.includes("按乡镇/片区下钻")).toBe(false)
    }
  })
})
