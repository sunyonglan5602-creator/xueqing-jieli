import { describe, expect, it } from "vitest"
import { gradeNotice, groupByGrade, polishComment } from "../src/shared/comment-draft.js"

describe("阶段评语草稿", () => {
  it("复式班分成两组，不合成全班评语，润色不接通", () => {
    const grouped = groupByGrade([
      { grade: "三年级", body: "甲" },
      { grade: "四年级", body: "乙" },
    ])
    expect(grouped.combinedClassComment).toBe(false)
    expect(grouped.groups.map((item) => item.grade)).toEqual(["三年级", "四年级"])
    expect(gradeNotice("三年级", 2)).toBe("当前是三年级的评语。本班其他年级请切换后查看。")
    expect(JSON.stringify(grouped).includes("全班")).toBe(false)
    expect(polishComment()).toEqual({ connected: false, phase: "一期不接通", text: "" })
  })
})
