import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { test } from "node:test"

const require = createRequire(import.meta.url)
const templates = require("../pocketbase/pb_hooks/comment_templates.js")
const rules = require("../pocketbase/pb_hooks/dict_rules.js")
const catalog = require("../pocketbase/pb_hooks/dictionary_data.js")

test("评语模板排除污名化词，五育用关键词句，复式班按年级分组", () => {
  const samples = []
  for (const row of templates.WUYU) {
    samples.push(templates.wuyuSentence(row[0], "", "本阶段", "小宇"))
    samples.push(templates.wuyuSentence(row[0], "把椅子搬回原处", "本阶段", "小宇"))
  }
  for (const subject of ["语文", "数学", "英语", "道德与法治"]) {
    samples.push(templates.learningSentence({
      period: "本阶段",
      name: "小宇",
      subject,
      knowledge: "理解关键词句",
      fact: "朗读课文更流畅了",
    }))
  }
  const banned = "该生基础较差，学习态度有待转变"
  for (const text of samples) {
    assert.equal(rules.forbiddenHit(text, catalog.forbidden), null, text)
    assert.equal(text.includes(banned), false)
    assert.equal(text.includes("全班"), false)
  }
  assert.equal(templates.wuyuSentence("遵守约定", "", "本阶段", "小宇"), "本阶段，小宇遵守了课堂上事先说明的约定。")
  assert.equal(
    templates.wuyuSentence("遵守约定", "把椅子搬回原处", "本阶段", "小宇"),
    "本阶段，小宇在把椅子搬回原处里按事先说好的约定做了。",
  )
  assert.equal(templates.learningSentence({
    period: "本阶段",
    name: "小宇",
    subject: "数学",
    knowledge: "小数乘法",
    fact: "连续两次同类题能够做对",
  }).includes("下一步可以"), true)
  assert.equal(templates.learningSentence({
    period: "本阶段",
    name: "小宇",
    subject: "道德与法治",
    knowledge: "说清楚一件事",
    fact: "",
  }).includes("下一步建议："), true)

  const draft = templates.buildStudentDraft({
    student: { id: "s1", name: "小宇", grade: "三年级" },
    period: "本阶段",
    learning: [
      { id: "l1", subject: "语文", knowledge: "理解关键词句", fact: "朗读课文更流畅了", confirmed: true, status: "" },
      { id: "l2", subject: "语文", knowledge: "理解关键词句", fact: "未确认", confirmed: false, status: "" },
      { id: "l3", subject: "语文", knowledge: "理解关键词句", fact: "历史样本", confirmed: true, status: "历史" },
      { id: "l4", subject: "语文", knowledge: "理解关键词句", fact: "已改善样本", confirmed: true, status: "已改善" },
    ],
    wuyu: [
      { id: "w1", keyword: "遵守约定", fact: "", confirmed: true },
      { id: "w2", keyword: "遵守约定", fact: "没确认", confirmed: false },
    ],
  })
  assert.equal(draft.published, false)
  assert.equal(draft.status, "草稿")
  assert.equal(draft.sentences.length, 2)
  assert.equal(draft.body.includes("朗读课文更流畅了"), true)
  assert.equal(draft.body.includes("未确认"), false)
  assert.equal(draft.body.includes("历史样本"), false)
  assert.equal(draft.body.includes("已改善样本"), false)
  assert.equal(draft.body.includes("没确认"), false)
  assert.equal(draft.body.includes(templates.sourceMarker("learning", "l1")), true)
  assert.equal(draft.body.includes(templates.sourceMarker("wuyu", "w1")), true)
  assert.equal(templates.missingMarkers(draft.body, draft.sentences).length, 0)
  assert.equal(templates.missingMarkers(draft.body.replace(templates.sourceMarker("wuyu", "w1"), ""), draft.sentences).length, 1)

  const grouped = templates.groupByGrade([
    { grade: "三年级", studentId: "a", body: "甲" },
    { grade: "四年级", studentId: "b", body: "乙" },
  ])
  assert.equal(grouped.combinedClassComment, false)
  assert.deepEqual(grouped.groups.map((item) => item.grade), ["三年级", "四年级"])
  assert.equal(grouped.groups[0].students.length, 1)
  assert.equal(grouped.groups[0].notice, "当前是三年级的评语。本班其他年级请切换后查看。")
  assert.equal(JSON.stringify(grouped).includes("全班"), false)
  assert.deepEqual(templates.polishComment(), { connected: false, phase: "一期不接通", text: "" })

  for (const file of ["pocketbase/pb_hooks/comment_templates.js", "pocketbase/pb_hooks/comments_api.js", "pocketbase/pb_hooks/comments.pb.js"]) {
    const source = readFileSync(new URL("../" + file, import.meta.url), "utf8")
    assert.equal(source.includes("fetch("), false, file)
    assert.equal(source.includes("http://"), false, file)
    assert.equal(source.includes("https://"), false, file)
  }
})
