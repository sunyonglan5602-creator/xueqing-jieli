function createSheet(e) {
  const lib = require(__hooks + "/lib.js")
  const questions = require(__hooks + "/questions_api.js")
  const auth = lib.requireReadyUser(e)
  assertTeacher(lib, auth)
  const body = e.requestInfo().body || {}
  if (body.auto === true || body.variant === true || body.mode === "错题推送" || body.mode === "变式") {
    throw new BadRequestError("一期不自动按错题推送，也不生成变式题")
  }
  const ids = idList(body.questionIds)
  if (!ids.length) throw new BadRequestError("请勾选题目")
  const items = []
  for (let i = 0; i < ids.length; i += 1) {
    const record = loadQuestion(ids[i])
    if (!questions.canSee(lib, auth, record) || record.get("status") !== "在用") throw new NotFoundError("不存在")
    items.push(record)
  }
  const sheet = new Record($app.findCollectionByNameOrId("practice_sheets"))
  sheet.set("org", auth.get("org"))
  sheet.set("school", auth.get("school"))
  sheet.set("teacher", auth.id)
  sheet.set("title", "练习单")
  sheet.set("question_ids_json", JSON.stringify(ids))
  $app.save(sheet)
  return e.json(200, present(sheet, items))
}

function readSheet(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  assertTeacher(lib, auth)
  const sheet = loadSheet(lib.readQuery(e, "id"))
  if (!canReadSheet(lib, auth, sheet)) throw new NotFoundError("不存在")
  const items = []
  const ids = idList(sheet.get("question_ids_json"))
  for (let i = 0; i < ids.length; i += 1) items.push(loadQuestion(ids[i]))
  return e.json(200, present(sheet, items))
}

function assertTeacher(lib, auth) {
  const rank = lib.rankOf(auth)
  if (rank !== "teacher" && rank !== "school_admin") throw new NotFoundError("不存在")
  if (rank === "teacher") lib.assertVolunteer(auth.id)
  if (!auth.get("school") || !auth.get("org")) throw new NotFoundError("不存在")
}

function canReadSheet(lib, auth, sheet) {
  if ((sheet.get("org") || "") !== (auth.get("org") || "")) return false
  if (sheet.get("teacher") === auth.id) return true
  return lib.rankOf(auth) === "school_admin" && sheet.get("school") === auth.get("school")
}

function idList(value) {
  let list = value
  if (typeof value === "string") {
    try {
      list = JSON.parse(value)
    } catch (err) {
      return []
    }
  }
  if (!list || typeof list.length !== "number") return []
  const ids = []
  for (let i = 0; i < list.length; i += 1) {
    if (list[i]) ids.push(String(list[i]))
  }
  return ids
}

function loadQuestion(id) {
  try {
    return $app.findRecordById("teacher_questions", String(id || ""))
  } catch (err) {
    throw new NotFoundError("不存在")
  }
}

function loadSheet(id) {
  try {
    return $app.findRecordById("practice_sheets", String(id || ""))
  } catch (err) {
    throw new NotFoundError("不存在")
  }
}

function present(sheet, records) {
  const items = []
  for (let i = 0; i < records.length; i += 1) {
    items.push({
      id: records[i].id,
      stem: records[i].get("stem") || "",
      image: records[i].get("image_jpeg") || "",
      subjectCode: records[i].get("subject_code") || "",
      grade: records[i].get("grade") || "",
      knowledgeCode: records[i].get("knowledge_code") || "",
    })
  }
  return {
    id: sheet.id,
    title: sheet.get("title") || "练习单",
    items,
  }
}

module.exports = { createSheet, readSheet }
