const SALT = "demo-metric-salt"

function recordLearning(auth, input) {
  const teacherSeq = aliasSeq(auth.get("org") || "", "teacher", auth.id)
  const schoolSeq = aliasSeq(auth.get("org") || "", "school", auth.get("school") || auth.id)
  const groupSeq = aliasSeq(auth.get("org") || "", "group", input.groupId || auth.get("school") || auth.id)
  const now = new Date().toISOString()
  const e1 = new Record($app.findCollectionByNameOrId("metric_e1"))
  e1.set("org", auth.get("org") || "")
  e1.set("event_id", newId())
  e1.set("school_seq", schoolSeq)
  e1.set("group_seq", groupSeq)
  e1.set("teacher_seq", teacherSeq)
  e1.set("teacher_type", auth.get("teacher_type") || "")
  e1.set("kind", input.kind)
  e1.set("student_count", input.studentCount)
  e1.set("tag_count", input.tagCount || 0)
  e1.set("click_count", input.clickCount || 0)
  e1.set("elapsed_seconds", input.elapsedSeconds || 0)
  e1.set("interrupted", input.interrupted === true)
  e1.set("origin", input.origin || "在线")
  e1.set("client_created_at", now)
  e1.set("natural_week", naturalWeek(new Date()))
  $app.save(e1)
  const records = input.records || []
  for (let i = 0; i < records.length; i += 1) {
    writeE2(auth, teacherSeq, records[i].uid, input.origin === "离线" ? "离线直接暂存" : "在线成功", input.origin === "离线" ? "待补传" : "成功", false)
  }
}

function recordSubmission(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const body = e.requestInfo().body || {}
  const first = String(body.firstResult || "")
  if (first !== "超时转暂存" && first !== "在线失败转暂存" && first !== "离线直接暂存") throw new BadRequestError("请填写第一次提交结果")
  writeE2(auth, aliasSeq(auth.get("org") || "", "teacher", auth.id), String(body.clientUid || newId()), first, "待补传", false)
  return e.json(200, { ok: true })
}

function listMetrics(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  if (lib.rankOf(auth) !== "school_admin" && lib.rankOf(auth) !== "org_admin") throw new NotFoundError("不存在")
  const table = lib.readQuery(e, "table")
  if (table === "e6") return e.json(200, { items: listE6(auth) })
  if (table === "e5") return e.json(200, listE5(auth))
  if (table === "e2") return e.json(200, { items: listE2(auth) })
  if (table !== "e1") throw new NotFoundError("不存在")
  const rows = $app.findRecordsByFilter("metric_e1", "org = {:org}", "-client_created_at", 0, 0, { org: auth.get("org") })
  const items = []
  for (const row of rows) {
    items.push({
      事件ID: row.get("event_id"),
      学校序号: row.get("school_seq"),
      教学组序号: row.get("group_seq"),
      教师序号: row.get("teacher_seq"),
      老师类型: row.get("teacher_type") || "",
      类型: row.get("kind"),
      本次选中学生数: row.get("student_count"),
      标签数: row.get("tag_count") || 0,
      点击次数: row.get("click_count") || 0,
      耗时秒数: row.get("elapsed_seconds") || 0,
      是否中断: row.get("interrupted") === true,
      产生方式: row.get("origin"),
      本机产生时间: row.get("client_created_at"),
      自然周: row.get("natural_week"),
    })
  }
  return e.json(200, { items })
}

function listE2(auth) {
  const rows = $app.findRecordsByFilter("metric_e2", "org = {:org}", "", 0, 0, { org: auth.get("org") })
  const items = []
  for (const row of rows) {
    items.push({
      提交ID: row.get("submit_id"),
      教师序号: row.get("teacher_seq"),
      第一次提交时间: row.get("first_at"),
      第一次提交结果: row.get("first_result"),
      重试次数: row.get("attempts") || 0,
      服务器收到时间: row.get("received_at") || "",
      最终状态: row.get("final_status"),
      是否冲突: row.get("conflict") === true,
    })
  }
  return items
}

function listE6(auth) {
  const rows = $app.findRecordsByFilter("metric_e6", "org = {:org}", "", 0, 0, { org: auth.get("org") })
  const items = []
  for (const row of rows) {
    items.push({
      教师序号: row.get("teacher_seq"),
      触发原因: row.get("reason"),
      清除前待补传数: row.get("pending_before"),
      已补传数: row.get("uploaded"),
      加密保留数: row.get("kept"),
      本人放弃数: row.get("abandoned"),
      时间: row.get("at"),
    })
  }
  return items
}

function recordComment(auth, input) {
  const teacherSeq = aliasSeq(auth.get("org") || "", "teacher", auth.id)
  const row = new Record($app.findCollectionByNameOrId("metric_e5"))
  if (auth.get("org")) row.set("org", auth.get("org"))
  row.set("teacher_seq", teacherSeq)
  row.set("generated_chars", input.generatedChars)
  row.set("final_chars", input.finalChars)
  row.set("edit_distance", input.editDistance)
  row.set("modified", input.modified === true)
  row.set("elapsed_seconds", elapsedSeconds(input.startedAt, input.confirmedAt))
  row.set("confirmed_at", input.confirmedAt)
  $app.save(row)
}

function listE5(auth) {
  const rows = $app.findRecordsByFilter("metric_e5", "org = {:org}", "confirmed_at", 0, 0, { org: auth.get("org") })
  const items = []
  let modified = 0
  for (let i = 0; i < rows.length; i += 1) {
    const changed = rows[i].get("modified") === true
    if (changed) modified += 1
    items.push({
      教师序号: rows[i].get("teacher_seq"),
      模板生成字数: rows[i].get("generated_chars"),
      最终字数: rows[i].get("final_chars"),
      编辑距离: rows[i].get("edit_distance"),
      是否修改: changed,
      耗时秒数: rows[i].get("elapsed_seconds") || 0,
      确认时间: rows[i].get("confirmed_at") || "",
    })
  }
  return {
    items,
    教师修改率: {
      修改过的评语数: modified,
      已确认评语数: items.length,
      比率: items.length ? modified / items.length : 0,
    },
  }
}

function elapsedSeconds(startedAt, confirmedAt) {
  const start = Number(startedAt)
  const end = Date.parse(String(confirmedAt || ""))
  if (!start || Number.isNaN(end)) return 0
  const seconds = Math.round((end - start) / 1000)
  if (seconds < 0) return 0
  if (seconds > 86400) return 86400
  return seconds
}

function writeE2(auth, teacherSeq, sourceId, firstResult, finalStatus, conflict) {
  const row = new Record($app.findCollectionByNameOrId("metric_e2"))
  if (auth.get("org")) row.set("org", auth.get("org"))
  row.set("submit_id", $security.sha256(String(sourceId) + SALT))
  row.set("teacher_seq", teacherSeq)
  row.set("first_at", new Date().toISOString())
  row.set("first_result", firstResult)
  row.set("attempts", firstResult === "在线成功" ? 0 : 1)
  row.set("received_at", finalStatus === "成功" ? new Date().toISOString() : "")
  row.set("final_status", finalStatus)
  row.set("conflict", conflict === true)
  $app.save(row)
}

function aliasSeq(org, kind, target) {
  const rows = $app.findRecordsByFilter("metric_aliases", "kind = {:kind} && target = {:target}", "", 1, 0, { kind, target })
  if (rows.length) return Number(rows[0].get("seq"))
  const all = $app.findRecordsByFilter("metric_aliases", "kind = {:kind} && org = {:org}", "-seq", 1, 0, { kind, org })
  const seq = all.length ? Number(all[0].get("seq")) + 1 : 1
  const row = new Record($app.findCollectionByNameOrId("metric_aliases"))
  if (org) row.set("org", org)
  row.set("kind", kind)
  row.set("target", target)
  row.set("seq", seq)
  $app.save(row)
  return seq
}

function naturalWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return d.getUTCFullYear() + "-W" + (week < 10 ? "0" + week : String(week))
}

function newId() {
  let time = Date.now().toString(16)
  while (time.length < 12) time = "0" + time
  return time.slice(-12) + $security.randomStringWithAlphabet(24, "0123456789abcdef")
}

module.exports = { recordLearning, recordSubmission, recordComment, listMetrics }
