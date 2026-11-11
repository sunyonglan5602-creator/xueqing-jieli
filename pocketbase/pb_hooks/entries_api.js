function saveEntries(e) {
  const lib = require(__hooks + "/lib.js")
  const rules = require(__hooks + "/dict_rules.js")
  const auth = lib.requireReadyUser(e)
  const body = e.requestInfo().body || {}
  const studentIds = rules.asList(body.studentIds)
  if (!studentIds.length) throw new BadRequestError("请选择学生")
  const subject = findOne("dict_subjects", "code = {:code} && active = true", { code: String(body.subjectCode || "") })
  if (!subject) throw new BadRequestError("请从学科字典里选择")
  const term = findOne("dict_terms", "code = {:code}", { code: String(body.knowledgeCode || "") })
  if (!term || term.get("active") !== true || term.get("subject_code") !== subject.get("code")) throw new BadRequestError("请选择该科的知识点")
  if (!termVisible(auth, term)) throw new NotFoundError("不存在")
  let errorType = null
  const errorCode = String(body.errorCode || "")
  if (errorCode) {
    if (subject.get("error_entry") !== true) throw new BadRequestError("这个学科不用错题")
    if (subject.get("per_term_error") === true && term.get("allows_error") !== true) throw new BadRequestError("这个学科不用错题")
    errorType = findOne("dict_error_types", "code = {:code} && active = true", { code: errorCode })
    if (!errorType || !termVisible(auth, errorType)) throw new BadRequestError("请选择错误类型")
  }
  const textbook = resolveTextbook(body.textbook, body.textbookCustom)
  const statusMark = String(body.statusMark || "")
  if (statusMark && statusMark !== "偶发错误" && statusMark !== "尚需观察") throw new BadRequestError("请选择偶发错误或尚需观察")
  const scene = String(body.scene || "课堂")
  if (scene !== "课堂" && scene !== "作业") throw new BadRequestError("请选择作业或课堂")
  const photo = photoWithinLimit(body.photo)
  const clientUid = String(body.clientUid || "")
  const saved = []
  for (let i = 0; i < studentIds.length; i += 1) {
    const student = loadStudent(studentIds[i])
    if (!lib.canRead(auth, student)) throw new NotFoundError("不存在")
    if ((student.get("current_class") || "") !== String(body.classId || "")) throw new BadRequestError("请选择这个班的学生")
    assertTeaching(lib, auth, body.classId, subject.get("name"))
    const reason = String(body.gradeMismatchReason || "").trim()
    if (!rules.gradeFits(student.get("grade"), term.get("grades"))) {
      if (!reason) throw new BadRequestError(rules.mismatchMessage(term.get("grades"), student.get("display_name")))
    }
    const clientKey = clientUid ? clientUid + ":" + student.id : ""
    const existing = clientKey ? findOne("learning_records", "client_key = {:key}", { key: clientKey }) : null
    if (existing) {
      saved.push(summary(existing))
      continue
    }
    const note = String(body.note || "").trim()
    const line = subject.get("name") + " " + student.get("grade") + " " + term.get("code") + " " + term.get("name")
    const record = new Record($app.findCollectionByNameOrId("learning_records"))
    record.set("student", student.id)
    record.set("subject", subject.get("name"))
    record.set("body", note || line)
    record.set("version", 1)
    record.set("org", auth.get("org"))
    lib.prepareLearningRecord(auth, record)
    record.set("subject", subject.get("name"))
    record.set("subject_code", subject.get("code"))
    record.set("grade", student.get("grade"))
    record.set("textbook", textbook.name)
    record.set("textbook_custom", textbook.custom)
    record.set("knowledge_code", term.get("code"))
    record.set("error_code", errorType ? errorType.get("code") : "")
    record.set("status_mark", statusMark)
    record.set("scene", scene)
    record.set("scene_date", String(body.sceneDate || today()))
    record.set("assignment_name", String(body.assignmentName || "").slice(0, 40))
    record.set("client_key", clientKey)
    record.set("source", body.source === "离线" ? "离线" : "在线")
    record.set("grade_mismatch_reason", rules.gradeFits(student.get("grade"), term.get("grades")) ? "" : reason)
    record.set("photo_jpeg", photo)
    record.set("group_uid", record.get("uid"))
    record.set("confirmed", true)
    $app.save(record)
    saved.push(summary(record))
  }
  require(__hooks + "/metrics_api.js").recordLearning(auth, {
    kind: "学情标签",
    studentCount: saved.length,
    tagCount: (body.knowledgeCode ? 1 : 0) + (body.errorCode ? 1 : 0),
    clickCount: Number(body.clickCount || 0),
    elapsedSeconds: Number(body.elapsedSeconds || 0),
    interrupted: body.interrupted === true,
    origin: body.source === "离线" ? "离线" : "在线",
    groupId: String(body.classId || ""),
    records: saved,
  })
  return e.json(200, { items: saved })
}

function assertTeaching(lib, auth, classId, subjectName) {
  const rows = $app.findRecordsByFilter("teaching_assignments", "class = {:class} && teacher = {:teacher} && subject = {:subject}", "", 0, 0, {
    class: classId,
    teacher: auth.id,
    subject: subjectName,
  })
  for (const row of rows) if (lib.assignmentActive(row)) return
  throw new BadRequestError("只能记自己任课学科")
}

function resolveTextbook(name, custom) {
  const textbook = String(name || "").trim()
  const row = findOne("dict_textbooks", "name = {:name}", { name: textbook })
  if (!row) throw new BadRequestError("请选择教材版本")
  if (row.get("custom") === true) {
    const text = String(custom || "").trim()
    if (!text) throw new BadRequestError("请填写教材版本")
    return { name: textbook, custom: text }
  }
  return { name: textbook, custom: "" }
}

function photoWithinLimit(value) {
  const text = String(value || "")
  if (!text) return ""
  const payload = text.indexOf(",") >= 0 ? text.split(",").pop() : text
  const bytes = Math.floor(String(payload).length * 3 / 4)
  if (bytes > 300 * 1024) throw new BadRequestError("单张图片不能超过 300KB")
  return text
}

function termVisible(auth, record) {
  if ((record.get("scope") || "platform") === "platform") return true
  return record.get("school") === auth.get("school")
}

function loadStudent(id) {
  try {
    return $app.findRecordById("students", String(id || ""))
  } catch (err) {
    throw new NotFoundError("不存在")
  }
}

function summary(record) {
  return {
    id: record.id,
    uid: record.get("uid"),
    student: record.get("student"),
    subject_code: record.get("subject_code"),
    grade: record.get("grade"),
    textbook: record.get("textbook"),
    knowledge_code: record.get("knowledge_code"),
    error_code: record.get("error_code") || "",
    confirmed: record.get("confirmed") === true,
  }
}

function today() {
  return new Date().toISOString().slice(0, 10)
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

module.exports = { saveEntries }
