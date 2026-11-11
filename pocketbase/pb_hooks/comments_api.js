function sources(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  assertCommenter(lib, auth)
  const klass = resolveClass(lib, auth, lib.readQuery(e, "classId"))
  return e.json(200, packSources(lib, auth, klass))
}

function drafts(e) {
  const lib = require(__hooks + "/lib.js")
  const templates = require(__hooks + "/comment_templates.js")
  const auth = lib.requireReadyUser(e)
  assertCommenter(lib, auth)
  const body = e.requestInfo().body || {}
  const klass = resolveClass(lib, auth, String(body.classId || ""))
  const packed = packSources(lib, auth, klass)
  const grade = pickGrade(templates, packed.grades, String(body.grade || ""))
  const period = cleanPeriod(body.period)
  const items = []
  for (let i = 0; i < packed.students.length; i += 1) {
    const student = packed.students[i]
    if (student.grade !== grade || student.recordable !== true) continue
    const draft = templates.buildStudentDraft({
      student: { id: student.id, name: student.name, grade: student.grade },
      period,
      learning: forStudent(packed.learning, student.id),
      wuyu: forStudent(packed.wuyu, student.id),
    })
    items.push(saveDraft(auth, klass, student, draft, ""))
  }
  return e.json(200, {
    grade,
    grades: packed.grades,
    notice: templates.gradeNotice(grade, packed.grades.length),
    combinedClassComment: false,
    items,
  })
}

function confirm(e) {
  const lib = require(__hooks + "/lib.js")
  const templates = require(__hooks + "/comment_templates.js")
  const auth = lib.requireReadyUser(e)
  assertCommenter(lib, auth)
  const body = e.requestInfo().body || {}
  const clientKey = String(body.clientUid || "")
  if (clientKey) {
    const existing = findOne("stage_comments", "client_key = {:key}", { key: clientKey })
    if (existing) return e.json(200, present(existing))
  }
  const text = String(body.body || "")
  if (text.length > 8000) throw new BadRequestError("评语过长")
  const student = loadStudent(String(body.studentId || ""))
  if (!student || !lib.canRead(auth, student)) throw new NotFoundError("不存在")
  if ((student.get("current_class") || "") !== String(body.classId || "")) throw new NotFoundError("不存在")
  const klass = resolveClass(lib, auth, student.get("current_class"))
  const grade = String(body.grade || student.get("grade") || "")
  if (grade !== (student.get("grade") || "")) throw new BadRequestError("请按这个学生的年级确认")
  const period = cleanPeriod(body.period)
  const already = findOne("stage_comments", "student = {:student} && period = {:period} && status = '已确认'", {
    student: student.id,
    period,
  })
  if (already) throw new BadRequestError("这个阶段的评语已经确认")
  const open = findOne("stage_comments", "student = {:student} && period = {:period} && status = '草稿'", {
    student: student.id,
    period,
  })
  const stored = open ? readSentences(open) : []
  const provided = normalizeSentences(body.sentences)
  const baseline = stored.length ? stored : provided
  const cited = templates.parseMarkers(text)
  const required = baseline.length ? baseline : cited
  if (!required.length) throw new BadRequestError("没有已确认的记录，不能确认评语")
  if (templates.missingMarkers(text, required).length) throw new BadRequestError("不能删掉来源标记")
  for (let i = 0; i < cited.length; i += 1) {
    if (!includesSentence(required, cited[i])) throw new NotFoundError("不存在")
  }
  const learning = []
  const wuyu = []
  const seen = {}
  for (let i = 0; i < required.length; i += 1) {
    const item = required[i]
    const key = item.sourceKind + ":" + item.sourceId
    if (seen[key]) continue
    seen[key] = true
    const loaded = loadCited(lib, auth, student, item)
    if (item.sourceKind === "learning") learning.push(loaded)
    else wuyu.push(loaded)
  }
  const draft = templates.buildStudentDraft({
    student: { id: student.id, name: student.get("display_name"), grade },
    period,
    learning,
    wuyu,
  })
  if (!draft.sentences.length || templates.missingMarkers(text, draft.sentences).length) {
    throw new BadRequestError("不能删掉来源标记")
  }
  if (body.confirmWords !== true) {
    const rules = require(__hooks + "/dict_rules.js")
    const hit = rules.forbiddenHit(text, forbiddenRows(rules))
    if (hit) throw new BadRequestError(rules.forbiddenMessage(hit) + "仍要这样写，请确认后再保存。")
  }
  const confirmedAt = new Date().toISOString()
  const record = open || new Record($app.findCollectionByNameOrId("stage_comments"))
  writeRecord(record, auth, klass, student, {
    grade,
    period,
    status: "已确认",
    generatedBody: draft.generatedBody,
    body: text,
    sentences: draft.sentences,
    clientKey,
    startedAt: String(body.startedAt || ""),
    confirmedAt,
  })
  $app.save(record)
  require(__hooks + "/metrics_api.js").recordComment(auth, {
    generatedChars: String(draft.generatedBody || "").length,
    finalChars: text.length,
    editDistance: templates.editDistance(draft.generatedBody, text),
    modified: draft.generatedBody !== text,
    startedAt: String(body.startedAt || ""),
    confirmedAt,
  })
  return e.json(200, present(record))
}

function listComments(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  assertCommenter(lib, auth)
  const klass = resolveClass(lib, auth, lib.readQuery(e, "classId"))
  const grade = lib.readQuery(e, "grade")
  const rows = $app.findRecordsByFilter("stage_comments", "class = {:class}", "-confirmed_at", 0, 0, { class: klass.id })
  const items = []
  for (let i = 0; i < rows.length; i += 1) {
    if (grade && rows[i].get("grade") !== grade) continue
    if (!lib.canRead(auth, $app.findRecordById("students", rows[i].get("student")))) continue
    items.push(present(rows[i]))
  }
  return e.json(200, { grade: grade || "", items, combinedClassComment: false })
}

function assertCommenter(lib, auth) {
  const rank = lib.rankOf(auth)
  if (rank !== "teacher" && rank !== "school_admin") throw new NotFoundError("不存在")
  if (rank === "teacher") lib.assertVolunteer(auth.id)
}

function resolveClass(lib, auth, classId) {
  let id = String(classId || "")
  if (!id) {
    const ids = classIds(lib, auth)
    if (ids.length !== 1) throw new BadRequestError("请选择班级")
    id = ids[0]
  }
  let klass = null
  try {
    klass = $app.findRecordById("classes", id)
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (!lib.canRead(auth, klass)) throw new NotFoundError("不存在")
  return klass
}

function classIds(lib, auth) {
  if (lib.rankOf(auth) === "school_admin") {
    const rows = $app.findRecordsByFilter("classes", "school = {:school}", "name", 0, 0, { school: auth.get("school") })
    const ids = []
    for (let i = 0; i < rows.length; i += 1) ids.push(rows[i].id)
    return ids
  }
  const rows = $app.findRecordsByFilter("teaching_assignments", "teacher = {:teacher}", "", 0, 0, { teacher: auth.id })
  const ids = []
  for (let i = 0; i < rows.length; i += 1) {
    if (!lib.assignmentActive(rows[i])) continue
    const id = rows[i].get("class")
    if (ids.indexOf(id) < 0) ids.push(id)
  }
  return ids
}

function packSources(lib, auth, klass) {
  const rules = require(__hooks + "/dict_rules.js")
  const students = []
  const rows = $app.findRecordsByFilter("students", "current_class = {:class}", "display_name", 0, 0, { class: klass.id })
  for (let i = 0; i < rows.length; i += 1) {
    if (!lib.canRead(auth, rows[i])) continue
    students.push({
      id: rows[i].id,
      name: rows[i].get("display_name"),
      grade: rows[i].get("grade") || "",
      recordable: consented(rows[i].id),
    })
  }
  const learning = []
  const wuyu = []
  for (let i = 0; i < students.length; i += 1) {
    if (students[i].recordable !== true) continue
    const learned = $app.findRecordsByFilter("learning_records", "student = {:student}", "id", 0, 0, { student: students[i].id })
    for (let j = 0; j < learned.length; j += 1) {
      const row = learned[j]
      if (row.get("confirmed") !== true) continue
      if (!lib.canRead(auth, row)) continue
      const status = effectiveStatus(row)
      if (status === "历史" || status === "已改善") continue
      learning.push({
        id: row.id,
        studentId: students[i].id,
        subject: row.get("subject") || "",
        knowledge: knowledgeName(row.get("knowledge_code")),
        fact: row.get("body") || "",
        errorCode: row.get("error_code") || "",
        status,
        confirmed: true,
      })
    }
    const noted = $app.findRecordsByFilter("wuyu_records", "student = {:student}", "id", 0, 0, { student: students[i].id })
    for (let j = 0; j < noted.length; j += 1) {
      const row = noted[j]
      if (row.get("confirmed") !== true) continue
      if ((row.get("org") || "") !== (klass.get("org") || "")) continue
      const keyword = keywordName(row.get("keyword_code"))
      if (!keyword) continue
      wuyu.push({
        id: row.id,
        studentId: students[i].id,
        keyword,
        fact: row.get("body") || "",
        confirmed: true,
      })
    }
  }
  return {
    classId: klass.id,
    className: klass.get("name"),
    grades: gradeList(rules, klass, students),
    students,
    learning,
    wuyu,
    forbidden: forbiddenRows(rules),
  }
}

function forbiddenRows(rules) {
  const rows = $app.findRecordsByFilter("dict_forbidden", "id != ''", "", 0, 0)
  const items = []
  for (let i = 0; i < rows.length; i += 1) {
    items.push({
      phrase: rows[i].get("phrase"),
      alternative: rows[i].get("alternative") || "",
      ignores: rules.asList(rows[i].get("ignores")),
    })
  }
  return items
}

function gradeList(rules, klass, students) {
  const listed = rules.asList(klass.get("grades"))
  const grades = []
  for (let i = 0; i < listed.length; i += 1) {
    if (listed[i] && grades.indexOf(listed[i]) < 0) grades.push(listed[i])
  }
  for (let i = 0; i < students.length; i += 1) {
    if (students[i].grade && grades.indexOf(students[i].grade) < 0) grades.push(students[i].grade)
  }
  return grades
}

function pickGrade(templates, grades, requested) {
  if (!requested) {
    if (grades.length !== 1) throw new BadRequestError("请按年级分开生成，不能合成全班评语")
    return grades[0]
  }
  if (grades.indexOf(requested) < 0) throw new BadRequestError("这个班没有这个年级")
  return requested
}

function cleanPeriod(value) {
  const period = String(value || "").trim()
  if (!period) throw new BadRequestError("请填写时间范围")
  if (period.length > 40) throw new BadRequestError("时间范围过长")
  return period
}

function forStudent(rows, studentId) {
  const items = []
  for (let i = 0; i < rows.length; i += 1) if (rows[i].studentId === studentId) items.push(rows[i])
  return items
}

function saveDraft(auth, klass, student, draft, clientKey) {
  if (!draft.sentences.length) {
    return {
      id: "",
      studentId: student.id,
      studentName: student.name,
      grade: student.grade,
      period: draft.period,
      status: "无记录",
      published: false,
      body: "",
      generatedBody: "",
      sentences: [],
    }
  }
  const already = findOne("stage_comments", "student = {:student} && period = {:period} && status = '已确认'", {
    student: student.id,
    period: draft.period,
  })
  if (already) return present(already)
  const open = findOne("stage_comments", "student = {:student} && period = {:period} && status = '草稿'", {
    student: student.id,
    period: draft.period,
  })
  const record = open || new Record($app.findCollectionByNameOrId("stage_comments"))
  const studentRecord = $app.findRecordById("students", student.id)
  writeRecord(record, auth, klass, studentRecord, {
    grade: student.grade,
    period: draft.period,
    status: "草稿",
    generatedBody: draft.generatedBody,
    body: draft.body,
    sentences: draft.sentences,
    clientKey,
    startedAt: "",
    confirmedAt: "",
  })
  $app.save(record)
  return present(record)
}

function writeRecord(record, auth, klass, student, input) {
  record.set("org", student.get("org"))
  record.set("school", student.get("school"))
  record.set("class", klass.id)
  record.set("student", student.id)
  record.set("teacher", auth.id)
  record.set("grade", input.grade)
  record.set("period", input.period)
  record.set("status", input.status)
  record.set("published", false)
  record.set("generated_body", input.generatedBody)
  record.set("body", input.body)
  record.set("sentences_json", JSON.stringify(input.sentences || []))
  if (input.clientKey) record.set("client_key", input.clientKey)
  if (input.startedAt) record.set("started_at", input.startedAt)
  if (input.confirmedAt) record.set("confirmed_at", input.confirmedAt)
}

function loadCited(lib, auth, student, item) {
  let record = null
  try {
    record = $app.findRecordById(item.sourceKind === "learning" ? "learning_records" : "wuyu_records", item.sourceId)
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if ((record.get("student") || "") !== student.id) throw new NotFoundError("不存在")
  if ((record.get("org") || "") !== (student.get("org") || "")) throw new NotFoundError("不存在")
  if (record.get("confirmed") !== true) throw new BadRequestError("只引用已确认的记录")
  if (item.sourceKind === "learning") {
    if (!lib.canRead(auth, record)) throw new NotFoundError("不存在")
    const status = effectiveStatus(record)
    if (status === "历史" || status === "已改善") throw new BadRequestError("已转为历史的记录不写进评语")
    return {
      id: record.id,
      subject: record.get("subject") || "",
      knowledge: knowledgeName(record.get("knowledge_code")),
      fact: record.get("body") || "",
      errorCode: record.get("error_code") || "",
      status,
      confirmed: true,
    }
  }
  const keyword = keywordName(record.get("keyword_code"))
  if (!keyword) throw new BadRequestError("只引用已确认的记录")
  return {
    id: record.id,
    keyword,
    fact: record.get("body") || "",
    confirmed: true,
  }
}

function effectiveStatus(record) {
  const mark = record.get("status_mark") || ""
  if (!record.get("uid")) return mark
  let rows = []
  try {
    rows = $app.findRecordsByFilter("label_status_events", "record_uid = {:uid}", "-at", 1, 0, { uid: record.get("uid") })
  } catch (err) {
    rows = []
  }
  if (!rows.length) return mark
  return rows[0].get("status") || mark
}

function consented(studentId) {
  let rows = []
  try {
    rows = $app.findRecordsByFilter("consents", "student = {:student}", "", 1, 0, { student: studentId })
  } catch (err) {
    rows = []
  }
  return rows.length > 0 && rows[0].get("status") === "已同意"
}

function knowledgeName(code) {
  const row = findOne("dict_terms", "code = {:code}", { code: String(code || "") })
  return row ? row.get("name") : (code || "已确认的学习内容")
}

function keywordName(code) {
  const row = findOne("dict_wuyu_keywords", "code = {:code}", { code: String(code || "") })
  return row ? row.get("keyword") : ""
}

function loadStudent(id) {
  try {
    return $app.findRecordById("students", id)
  } catch (err) {
    return null
  }
}

function readSentences(record) {
  try {
    const parsed = JSON.parse(record.get("sentences_json") || "[]")
    return normalizeSentences(parsed)
  } catch (err) {
    return []
  }
}

function normalizeSentences(value) {
  if (!value) return []
  let list = value
  if (typeof value === "string") {
    try {
      list = JSON.parse(value)
    } catch (err) {
      return []
    }
  }
  if (typeof list.length !== "number") return []
  const items = []
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i]
    if (!row) continue
    const kind = row.sourceKind || ""
    const id = row.sourceId || ""
    if ((kind === "learning" || kind === "wuyu") && id) items.push({ sourceKind: kind, sourceId: id })
  }
  return items
}

function includesSentence(list, item) {
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].sourceKind === item.sourceKind && list[i].sourceId === item.sourceId) return true
  }
  return false
}

function present(record) {
  let sentences = []
  try {
    sentences = JSON.parse(record.get("sentences_json") || "[]")
  } catch (err) {
    sentences = []
  }
  return {
    id: record.id,
    studentId: record.get("student"),
    grade: record.get("grade"),
    period: record.get("period"),
    status: record.get("status"),
    published: false,
    body: record.get("body") || "",
    generatedBody: record.get("generated_body") || "",
    sentences,
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

module.exports = { sources, drafts, confirm, listComments }
