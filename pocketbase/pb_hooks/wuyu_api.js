function keywords(e) {
  const lib = require(__hooks + "/lib.js")
  lib.requireReadyUser(e)
  const dimensions = $app.findRecordsByFilter("dict_wuyu_dimensions", "id != ''", "code", 0, 0)
  const rows = $app.findRecordsByFilter("dict_wuyu_keywords", "id != ''", "sort", 0, 0)
  const dimensionItems = []
  for (const row of dimensions) dimensionItems.push({ code: row.get("code"), name: row.get("name"), icon: row.get("icon"), color: row.get("color") })
  const keywordItems = []
  for (const row of rows) {
    keywordItems.push({
      code: row.get("code"),
      dimension: row.get("dimension"),
      keyword: row.get("keyword"),
      low_text: row.get("low_text"),
      high_text: row.get("high_text"),
    })
  }
  return e.json(200, { dimensions: dimensionItems, keywords: keywordItems })
}

function saveWuyu(e) {
  const lib = require(__hooks + "/lib.js")
  const rules = require(__hooks + "/dict_rules.js")
  const auth = lib.requireReadyUser(e)
  if (lib.rankOf(auth) !== "teacher" && lib.rankOf(auth) !== "school_admin") throw new NotFoundError("不存在")
  const body = e.requestInfo().body || {}
  const keyword = findKeyword(String(body.keywordCode || ""))
  if (!keyword) throw new BadRequestError("请选择关键词")
  const fact = String(body.fact || "").trim()
  if (fact) {
    const forbidden = forbiddenHit(rules, fact)
    if (forbidden && body.confirmFact !== true) throw new BadRequestError(rules.forbiddenMessage(forbidden) + "仍要这样写，请确认后再保存。")
  }
  const studentIds = rules.asList(body.studentIds)
  if (!studentIds.length) throw new BadRequestError("请选择学生")
  const clientUid = String(body.clientUid || "")
  const saved = []
  const metricRecords = []
  for (let i = 0; i < studentIds.length; i += 1) {
    let student = null
    try {
      student = $app.findRecordById("students", String(studentIds[i]))
    } catch (err) {
      throw new NotFoundError("不存在")
    }
    if (!lib.canRead(auth, student)) throw new NotFoundError("不存在")
    const band = bandOf(student.get("grade"))
    if (band !== "低年级" && band !== "高年级") throw new BadRequestError("这个年级没有对应的五育写法")
    lib.assertConsent(student.id)
    const classId = student.get("current_class") || ""
    if (lib.rankOf(auth) === "teacher" && !teacherOwnsClass(lib, auth, classId)) throw new NotFoundError("不存在")
    const clientKey = clientUid ? clientUid + ":" + student.id : ""
    const existing = clientKey ? findOne("wuyu_records", "client_key = {:key}", { key: clientKey }) : null
    if (existing) {
      saved.push(summary(existing))
      continue
    }
    const record = new Record($app.findCollectionByNameOrId("wuyu_records"))
    record.set("student", student.id)
    record.set("org", student.get("org"))
    record.set("school", student.get("school"))
    record.set("class", classId)
    record.set("teacher", auth.id)
    record.set("keyword_code", keyword.get("code"))
    record.set("dimension", keyword.get("dimension"))
    record.set("wording", band === "低年级" ? keyword.get("low_text") : keyword.get("high_text"))
    record.set("grade", student.get("grade"))
    record.set("body", fact)
    record.set("client_key", clientKey)
    record.set("confirmed", true)
    $app.save(record)
    saved.push(summary(record))
    metricRecords.push({ uid: record.id })
  }
  require(__hooks + "/metrics_api.js").recordLearning(auth, {
    kind: "五育事例",
    studentCount: saved.length,
    tagCount: 1,
    clickCount: Number(body.clickCount || 0),
    elapsedSeconds: Number(body.elapsedSeconds || 0),
    interrupted: false,
    origin: "在线",
    groupId: auth.get("school") || auth.id,
    records: metricRecords,
  })
  return e.json(200, { items: saved })
}

function listWuyu(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const studentId = lib.readQuery(e, "studentId")
  if (!studentId) throw new BadRequestError("请选择学生")
  let student = null
  try {
    student = $app.findRecordById("students", studentId)
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (!lib.canRead(auth, student)) throw new NotFoundError("不存在")
  const rows = $app.findRecordsByFilter("wuyu_records", "student = {:student}", "-id", 0, 0, { student: studentId })
  const items = []
  for (const row of rows) items.push(summary(row))
  return e.json(200, { items })
}

function teacherOwnsClass(lib, auth, classId) {
  const rows = $app.findRecordsByFilter("teaching_assignments", "class = {:class} && teacher = {:teacher}", "", 0, 0, {
    class: classId,
    teacher: auth.id,
  })
  for (const row of rows) if (lib.assignmentActive(row)) return true
  return false
}

function bandOf(grade) {
  const row = findOne("dict_grades", "name = {:name}", { name: grade })
  return row ? row.get("band") : ""
}

function findKeyword(code) {
  return findOne("dict_wuyu_keywords", "code = {:code}", { code })
}

function forbiddenHit(rules, text) {
  const rows = $app.findRecordsByFilter("dict_forbidden", "id != ''", "", 0, 0)
  const items = []
  for (const row of rows) items.push({ phrase: row.get("phrase"), alternative: row.get("alternative"), ignores: row.get("ignores") })
  return rules.forbiddenHit(text, items)
}

function summary(record) {
  return {
    id: record.id,
    student: record.get("student"),
    keyword_code: record.get("keyword_code"),
    dimension: record.get("dimension"),
    wording: record.get("wording"),
    grade: record.get("grade"),
    fact: record.get("body") || "",
    confirmed: record.get("confirmed") === true,
  }
}

function findOne(collection, filter, params) {
  let rows = []
  try {
    rows = $app.findRecordsByFilter(collection, filter, "", 1, 0, params || {})
  } catch (err) {
    rows = []
  }
  return rows.length ? rows[0] : null
}

module.exports = { keywords, saveWuyu, listWuyu }
