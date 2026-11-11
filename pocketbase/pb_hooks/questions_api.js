function saveQuestion(e) {
  const lib = require(__hooks + "/lib.js")
  const rules = require(__hooks + "/dict_rules.js")
  const auth = lib.requireReadyUser(e)
  assertAuthor(lib, auth)
  const body = e.requestInfo().body || {}
  if (body.originalAuthorized !== true) throw new BadRequestError("未勾选「原创或已获授权」不能保存")
  const subject = findOne("dict_subjects", "code = {:code} && active = true", { code: String(body.subjectCode || "") })
  if (!subject) throw new BadRequestError("请填写学科")
  const grade = String(body.grade || "").trim()
  const gradeRow = findOne("dict_grades", "name = {:name}", { name: grade })
  if (!gradeRow || rules.asList(subject.get("grades")).indexOf(grade) < 0) throw new BadRequestError("请填写年级")
  const textbook = resolveTextbook(body.textbook, body.textbookCustom)
  const term = findOne("dict_terms", "code = {:code}", { code: String(body.knowledgeCode || "") })
  if (!term || term.get("active") !== true || term.get("subject_code") !== subject.get("code")) throw new BadRequestError("请填写知识点")
  if (!termVisible(auth, term)) throw new NotFoundError("不存在")
  const stem = String(body.stem || "").trim()
  if (!stem) throw new BadRequestError("题目至少要有文字")
  if (stem.length > 2000) throw new BadRequestError("题目过长")
  const images = imageList(body)
  if (images.length > 1) throw new BadRequestError("图片最多一张")
  const image = images.length ? photoWithinLimit(images[0]) : ""
  let errorCode = ""
  if (body.errorCode) {
    const errorType = findOne("dict_error_types", "code = {:code} && active = true", { code: String(body.errorCode) })
    if (!errorType || !termVisible(auth, errorType)) throw new BadRequestError("请选择错误类型")
    errorCode = errorType.get("code")
  }
  const difficulty = String(body.difficulty || "").trim()
  if (difficulty.length > 20) throw new BadRequestError("难度过长")
  const record = new Record($app.findCollectionByNameOrId("teacher_questions"))
  record.set("org", auth.get("org"))
  record.set("school", auth.get("school"))
  record.set("author", auth.id)
  record.set("subject_code", subject.get("code"))
  record.set("grade", grade)
  record.set("textbook", textbook.name)
  record.set("textbook_custom", textbook.custom)
  record.set("knowledge_code", term.get("code"))
  record.set("stem", stem)
  record.set("answer", String(body.answer || "").trim())
  record.set("explanation", String(body.explanation || "").trim())
  record.set("error_code", errorCode)
  record.set("difficulty", difficulty)
  record.set("image_jpeg", image)
  record.set("visibility", body.shareToOrg === true ? "本组织" : "本校")
  record.set("original_authorized", true)
  record.set("status", "在用")
  record.set("resource_type", "习题")
  record.set("source", "老师自建")
  $app.save(record)
  lib.writeAudit(auth.id, "question_save", record.id, { org: auth.get("org") })
  return e.json(200, present(record))
}

function listQuestions(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  assertReader(lib, auth)
  let rows = []
  try {
    rows = $app.findRecordsByFilter("teacher_questions", "org = {:org}", "-id", 0, 0, { org: auth.get("org") })
  } catch (err) {
    rows = []
  }
  const items = []
  for (let i = 0; i < rows.length; i += 1) {
    if (!canSee(lib, auth, rows[i])) continue
    items.push(present(rows[i]))
  }
  return e.json(200, { items })
}

function readQuestion(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  assertReader(lib, auth)
  const record = loadQuestion(lib.readQuery(e, "id"))
  if (!canSee(lib, auth, record)) throw new NotFoundError("不存在")
  return e.json(200, present(record))
}

function unpublishQuestion(e) {
  return changeStatus(e, "已下架", "question_unpublish")
}

function revokeQuestion(e) {
  return changeStatus(e, "已撤销", "question_revoke")
}

function changeStatus(e, status, action) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  assertAuthor(lib, auth)
  const body = e.requestInfo().body || {}
  const record = loadQuestion(String(body.id || ""))
  if (!canManage(lib, auth, record)) throw new NotFoundError("不存在")
  if (record.get("status") !== status) {
    record.set("status", status)
    record.set("original_authorized", true)
    $app.save(record)
    lib.writeAudit(auth.id, action, record.id, { org: record.get("org") })
  }
  return e.json(200, present(record))
}

function assertAuthor(lib, auth) {
  const rank = lib.rankOf(auth)
  if (rank !== "teacher" && rank !== "school_admin") throw new NotFoundError("不存在")
  if (rank === "teacher") lib.assertVolunteer(auth.id)
  if (!auth.get("school") || !auth.get("org")) throw new NotFoundError("不存在")
}

function assertReader(lib, auth) {
  const rank = lib.rankOf(auth)
  if (rank !== "teacher" && rank !== "school_admin" && rank !== "org_admin") throw new NotFoundError("不存在")
  if (rank === "teacher") lib.assertVolunteer(auth.id)
}

function canManage(lib, auth, record) {
  if ((record.get("org") || "") !== (auth.get("org") || "")) return false
  if (record.get("author") === auth.id) return true
  return lib.rankOf(auth) === "school_admin" && record.get("school") === auth.get("school")
}

function canSee(lib, auth, record) {
  const rank = lib.rankOf(auth)
  if (!auth || rank === "platform_admin" || rank === "parent" || rank === "education_bureau_viewer") return false
  if ((record.get("org") || "") !== (auth.get("org") || "")) return false
  if (rank !== "teacher" && rank !== "school_admin" && rank !== "org_admin") return false
  const staff = canManage(lib, auth, record)
  if (record.get("status") !== "在用" && !staff) return false
  if (record.get("visibility") === "本组织") return rank === "teacher" || rank === "school_admin" || rank === "org_admin"
  return record.get("school") === auth.get("school") && rank !== "org_admin"
}

function imageList(body) {
  const items = []
  if (body.image) items.push(String(body.image))
  if (body.images && typeof body.images.length === "number") {
    for (let i = 0; i < body.images.length; i += 1) {
      if (body.images[i]) items.push(String(body.images[i]))
    }
  }
  return items
}

function photoWithinLimit(value) {
  const text = String(value || "")
  if (!text) return ""
  if (text.indexOf("http://") === 0 || text.indexOf("https://") === 0) throw new BadRequestError("图片只存在本系统")
  const payload = text.indexOf(",") >= 0 ? text.split(",").pop() : text
  const bytes = Math.floor(String(payload).length * 3 / 4)
  if (bytes > 300 * 1024) throw new BadRequestError("单张图片不能超过 300KB")
  return text
}

function resolveTextbook(name, custom) {
  const textbook = String(name || "").trim()
  const row = findOne("dict_textbooks", "name = {:name}", { name: textbook })
  if (!row) throw new BadRequestError("请填写教材版本")
  if (row.get("custom") === true) {
    const text = String(custom || "").trim()
    if (!text) throw new BadRequestError("请填写教材版本")
    return { name: textbook, custom: text }
  }
  return { name: textbook, custom: "" }
}

function termVisible(auth, record) {
  if ((record.get("scope") || "platform") === "platform") return true
  return record.get("school") === auth.get("school")
}

function loadQuestion(id) {
  try {
    return $app.findRecordById("teacher_questions", String(id || ""))
  } catch (err) {
    throw new NotFoundError("不存在")
  }
}

function present(record) {
  return {
    id: record.id,
    subjectCode: record.get("subject_code"),
    grade: record.get("grade"),
    textbook: record.get("textbook"),
    textbookCustom: record.get("textbook_custom") || "",
    knowledgeCode: record.get("knowledge_code"),
    stem: record.get("stem") || "",
    answer: record.get("answer") || "",
    explanation: record.get("explanation") || "",
    errorCode: record.get("error_code") || "",
    difficulty: record.get("difficulty") || "",
    image: record.get("image_jpeg") || "",
    visibility: record.get("visibility"),
    originalAuthorized: record.get("original_authorized") === true,
    status: record.get("status"),
    resourceType: record.get("resource_type"),
    source: record.get("source"),
    school: record.get("school"),
    org: record.get("org"),
    author: record.get("author"),
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

module.exports = { saveQuestion, listQuestions, readQuestion, unpublishQuestion, revokeQuestion, canSee }
