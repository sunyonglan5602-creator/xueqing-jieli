import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const rules = require("../pocketbase/pb_hooks/dict_rules.js")
const catalog = require("../pocketbase/pb_hooks/dictionary_data.js")

test("禁用词按短语匹配，不拦差、慢和垃圾分类", () => {
  const rows = catalog.forbidden
  assert.equal(rules.forbiddenHit("差不多", rows), null)
  assert.equal(rules.forbiddenHit("请写慢一点", rows), null)
  assert.equal(rules.forbiddenHit("能参与垃圾分类", rows), null)
  assert.equal(rules.forbiddenHit("笨", rows).phrase, "笨")
  assert.equal(rules.forbiddenHit("这个孩子基础差", rows).phrase, "基础差")
  assert.match(rules.forbiddenMessage(rules.forbiddenHit("差生", rows)), /差生/)
})

test("错题入口由学科和词条上的数据决定", () => {
  const paper = { error_entry: true, per_term_error: false }
  const mixed = { error_entry: true, per_term_error: true }
  const performance = { error_entry: false, per_term_error: false }
  assert.equal(rules.showsErrorEntry(performance, { allows_error: true }), false)
  assert.equal(rules.showsErrorEntry(mixed, { allows_error: false }), false)
  assert.equal(rules.showsErrorEntry(mixed, { allows_error: true }), true)
  assert.equal(rules.showsErrorEntry(paper, null), true)
  assert.equal(rules.gradeFits("三年级", ["一年级", "二年级"]), false)
  assert.match(rules.mismatchMessage(["一年级"], "演示生"), /一年级/)
})

test("预置学科和词表数量与内容清单一致", () => {
  assert.deepEqual(catalog.grades.map((item) => item.name), ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级", "七年级", "八年级", "九年级"])
  assert.deepEqual(catalog.subjects.map((item) => item.name), [
    "道德与法治", "语文", "数学", "英语", "科学", "信息科技", "体育与健康", "艺术（音乐）", "艺术（美术）", "劳动", "综合实践活动",
  ])
  assert.equal(catalog.terms.length, 255)
  assert.equal(catalog.error_types.length, 6)
  assert.equal(catalog.subjects.find((item) => item.name === "英语").grades[0], "三年级")
  assert.equal(catalog.subjects.find((item) => item.name === "体育与健康").error_entry, false)
  assert.equal(catalog.terms.find((item) => item.code === "SC-1-008").allows_error, false)
  assert.equal(catalog.terms.find((item) => item.code === "SC-1-001").allows_error, true)
})
