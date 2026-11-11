function seedDictionary(app) {
  const data = require(__hooks + "/dictionary_data.js")
  const current = findOne("dict_meta", "id != ''", {})
  if (current && Number(current.get("version") || 0) >= data.version) return
  app.runInTransaction((tx) => {
    for (const grade of data.grades) {
      if (findOneOn(tx, "dict_grades", "name = {:name}", { name: grade.name })) continue
      const record = new Record(tx.findCollectionByNameOrId("dict_grades"))
      record.set("name", grade.name)
      record.set("sort_order", grade.sort)
      record.set("band", grade.band)
      record.set("active", true)
      tx.save(record)
    }
    for (const subject of data.subjects) {
      if (findOneOn(tx, "dict_subjects", "code = {:code}", { code: subject.code })) continue
      tx.save(subjectRecord(tx, subject))
    }
    for (const term of data.terms) {
      if (findOneOn(tx, "dict_terms", "code = {:code}", { code: term.code })) continue
      const record = new Record(tx.findCollectionByNameOrId("dict_terms"))
      record.set("code", term.code)
      record.set("subject_code", term.subject_code)
      record.set("name", term.name)
      record.set("grades", term.grades)
      record.set("entry_kind", term.entry_kind)
      record.set("allows_error", term.allows_error === true)
      record.set("scope", "platform")
      record.set("definition", "")
      record.set("active", true)
      tx.save(record)
    }
    for (const item of data.error_types) {
      if (findOneOn(tx, "dict_error_types", "code = {:code}", { code: item.code })) continue
      const record = new Record(tx.findCollectionByNameOrId("dict_error_types"))
      record.set("code", item.code)
      record.set("label", item.label)
      record.set("definition", item.definition)
      record.set("applies", item.applies)
      record.set("conditions", item.conditions)
      record.set("avoid", item.avoid)
      record.set("grades", [])
      record.set("scope", "platform")
      record.set("active", true)
      tx.save(record)
    }
    for (const item of data.forbidden) {
      if (findOneOn(tx, "dict_forbidden", "phrase = {:phrase}", { phrase: item.phrase })) continue
      const record = new Record(tx.findCollectionByNameOrId("dict_forbidden"))
      record.set("category", item.category)
      record.set("phrase", item.phrase)
      record.set("alternative", item.alternative)
      record.set("ignores", item.ignores || [])
      tx.save(record)
    }
    for (const item of data.textbooks) {
      if (findOneOn(tx, "dict_textbooks", "name = {:name}", { name: item.name })) continue
      const record = new Record(tx.findCollectionByNameOrId("dict_textbooks"))
      record.set("name", item.name)
      record.set("custom", item.custom === true)
      tx.save(record)
    }
    for (const item of data.status_marks) {
      if (findOneOn(tx, "dict_status_marks", "code = {:code}", { code: item.code })) continue
      const record = new Record(tx.findCollectionByNameOrId("dict_status_marks"))
      record.set("code", item.code)
      record.set("label", item.label)
      record.set("counts_toward_weakness", item.counts_toward_weakness === true)
      record.set("expires", item.expires === true)
      tx.save(record)
    }
    const meta = current || new Record(tx.findCollectionByNameOrId("dict_meta"))
    meta.set("version", data.version)
    tx.save(meta)
  })
}

function flagValue(bodyValue, current, field) {
  if (bodyValue === true) return true
  if (bodyValue === false) return false
  if (current) return current.get(field) === true
  return false
}

function subjectRecord(app, subject) {
  const record = new Record(app.findCollectionByNameOrId("dict_subjects"))
  record.set("code", subject.code)
  record.set("name", subject.name)
  record.set("grades", subject.grades)
  record.set("record_type", subject.record_type)
  record.set("error_entry", subject.error_entry === true)
  record.set("per_term_error", subject.per_term_error === true)
  record.set("note", subject.note || "")
  record.set("active", subject.active !== false)
  return record
}

function saveSubject(lib, body, current) {
  const code = String((current && current.get("code")) || body.code || "").trim()
  const name = String(body.name || (current && current.get("name")) || "").trim()
  if (!/^[A-Z]{1,4}$/.test(code)) throw new BadRequestError("请填写学科编号")
  if (!name || name.length > 20) throw new BadRequestError("请填写学科名称")
  const grades = lib.knownGradeSelection(body.grades || (current && current.get("grades")))
  if (!grades.length) throw new BadRequestError("请填写开设年级")
  const recordType = String(body.recordType || (current && current.get("record_type")) || "").trim()
  if (!recordType || recordType.length > 80) throw new BadRequestError("请填写记录类型")
  if (!current && findOne("dict_subjects", "code = {:code}", { code })) throw new BadRequestError("这个学科编号已经有了")
  if (findOne("dict_subjects", "name = {:name} && code != {:code}", { name, code })) throw new BadRequestError("这个学科名称已经有了")
  const record = current || new Record($app.findCollectionByNameOrId("dict_subjects"))
  record.set("code", code)
  record.set("name", name)
  record.set("grades", grades)
  record.set("record_type", recordType)
  record.set("error_entry", flagValue(body.errorEntry, current, "error_entry"))
  record.set("per_term_error", flagValue(body.perTermError, current, "per_term_error"))
  record.set("note", String(body.note || (current && current.get("note")) || ""))
  record.set("active", body.active === false ? false : body.active === true ? true : (!current || current.get("active") === true))
  $app.save(record)
  return subjectJson(record)
}

function saveTerm(lib, auth, body) {
  const rules = require(__hooks + "/dict_rules.js")
  const rank = lib.rankOf(auth)
  const subject = findOne("dict_subjects", "code = {:code} && active = true", { code: String(body.subjectCode || "") })
  if (!subject) throw new BadRequestError("请从学科字典里选择")
  const name = String(body.name || "").trim()
  const definition = String(body.definition || "").trim()
  if (!name || name.length > 200) throw new BadRequestError("请填写标签名称")
  rejectForbidden(rules, name + "\n" + definition)
  const grades = lib.knownGradeSelection(body.grades)
  if (!grades.length) throw new BadRequestError("请填写年级")
  const entryKind = String(body.entryKind || "performance")
  if (entryKind !== "paper" && entryKind !== "concept" && entryKind !== "performance") throw new BadRequestError("请填写记录方式")
  const record = new Record($app.findCollectionByNameOrId("dict_terms"))
  record.set("code", "EXT-" + $security.randomStringWithAlphabet(8, "0123456789abcdef"))
  record.set("subject_code", subject.get("code"))
  record.set("name", name)
  record.set("grades", grades)
  record.set("entry_kind", entryKind)
  record.set("allows_error", entryKind !== "performance")
  record.set("definition", definition)
  record.set("active", true)
  if (rank === "platform_admin") {
    record.set("scope", "platform")
  } else {
    record.set("scope", "school")
    record.set("school", auth.get("school"))
  }
  $app.save(record)
  lib.writeAudit(auth.id, "dict_term_created", record.id, { org: auth.get("org") || "", code: record.get("code") })
  return termJson(record)
}

function saveErrorType(lib, auth, body) {
  const rules = require(__hooks + "/dict_rules.js")
  const label = String(body.label || "").trim()
  const definition = String(body.definition || "").trim()
  const applies = String(body.applies || "").trim()
  const conditions = String(body.conditions || "").trim()
  if (!label || !definition || !applies || !conditions) throw new BadRequestError("请填写推荐写法、定义、适用学科和年级、使用条件")
  rejectForbidden(rules, [label, definition, applies, conditions].join("\n"))
  const grades = lib.knownGradeSelection(body.grades)
  if (!grades.length) throw new BadRequestError("请填写年级")
  const record = new Record($app.findCollectionByNameOrId("dict_error_types"))
  record.set("code", "EXT-" + $security.randomStringWithAlphabet(8, "0123456789abcdef"))
  record.set("label", label)
  record.set("definition", definition)
  record.set("applies", applies)
  record.set("conditions", conditions)
  record.set("avoid", "")
  record.set("grades", grades)
  record.set("scope", "school")
  record.set("school", auth.get("school"))
  record.set("active", true)
  $app.save(record)
  return errorJson(record)
}

function rejectForbidden(rules, text) {
  const rows = $app.findRecordsByFilter("dict_forbidden", "id != ''", "", 0, 0)
  const items = []
  for (const row of rows) {
    items.push({ phrase: row.get("phrase"), alternative: row.get("alternative"), category: row.get("category"), ignores: row.get("ignores") })
  }
  const hit = rules.forbiddenHit(text, items)
  if (hit) throw new BadRequestError(rules.forbiddenMessage(hit))
}

function entryCatalog(lib, auth) {
  const rules = require(__hooks + "/dict_rules.js")
  const assignments = $app.findRecordsByFilter("teaching_assignments", "teacher = {:teacher} && org = {:org}", "", 0, 0, {
    teacher: auth.id,
    org: auth.get("org") || "",
  })
  const byName = {}
  for (const row of assignments) {
    if (!lib.assignmentActive(row)) continue
    const name = row.get("subject")
    if (!byName[name]) byName[name] = []
    const classId = row.get("class")
    let klass = null
    try {
      klass = $app.findRecordById("classes", classId)
    } catch (err) {
      klass = null
    }
    if (!klass) continue
    let seen = false
    for (const item of byName[name]) if (item.id === klass.id) seen = true
    if (!seen) byName[name].push({ id: klass.id, name: klass.get("name"), grades: rules.asList(klass.get("grades")) })
  }
  const subjects = []
  for (const name of Object.keys(byName)) {
    const subject = findOne("dict_subjects", "name = {:name} && active = true", { name })
    if (!subject) continue
    const subjectCode = subject.get("code")
    const terms = $app.findRecordsByFilter("dict_terms", visibleFilter(auth) + " && subject_code = {:subject} && active = true", "code", 0, 0, {
      school: auth.get("school") || "",
      subject: subjectCode,
    })
    const termItems = []
    for (const term of terms) termItems.push(termJson(term))
    let errorTypes = []
    if (subject.get("error_entry") === true) {
      const rows = $app.findRecordsByFilter("dict_error_types", visibleFilter(auth) + " && active = true", "code", 0, 0, { school: auth.get("school") || "" })
      for (const row of rows) errorTypes.push(errorJson(row))
    }
    subjects.push({
      code: subjectCode,
      name: subject.get("name"),
      record_type: subject.get("record_type"),
      error_entry: subject.get("error_entry") === true,
      per_term_error: subject.get("per_term_error") === true,
      grades: rules.asList(subject.get("grades")),
      classes: byName[name],
      terms: termItems,
      error_types: errorTypes,
    })
  }
  return subjects
}

function visibleFilter(auth) {
  if (!auth.get("school")) return "scope = 'platform'"
  return "(scope = 'platform' || school = {:school})"
}

function termVisible(auth, record) {
  if (record.get("scope") === "platform") return true
  return Boolean(auth.get("school")) && record.get("school") === auth.get("school")
}

function canManageTerm(lib, auth, record) {
  const rank = lib.rankOf(auth)
  if (rank === "platform_admin") return record.get("scope") === "platform"
  if (rank !== "school_admin") return false
  return record.get("scope") === "school" && record.get("school") === auth.get("school")
}

function subjectRows(activeOnly) {
  const filter = activeOnly ? "active = true" : "id != ''"
  const rows = $app.findRecordsByFilter("dict_subjects", filter, "code", 0, 0)
  const items = []
  for (const row of rows) items.push(subjectJson(row))
  return items
}

function gradeJson(record) {
  return { id: record.id, name: record.get("name"), sort: record.get("sort_order"), band: record.get("band") }
}

function subjectJson(record) {
  const rules = require(__hooks + "/dict_rules.js")
  return {
    id: record.id,
    code: record.get("code"),
    name: record.get("name"),
    grades: rules.asList(record.get("grades")),
    record_type: record.get("record_type"),
    error_entry: record.get("error_entry") === true,
    per_term_error: record.get("per_term_error") === true,
    note: record.get("note") || "",
    active: record.get("active") === true,
  }
}

function termJson(record) {
  const rules = require(__hooks + "/dict_rules.js")
  return {
    id: record.id,
    code: record.get("code"),
    subject_code: record.get("subject_code"),
    name: record.get("name"),
    grades: rules.asList(record.get("grades")),
    entry_kind: record.get("entry_kind"),
    allows_error: record.get("allows_error") === true,
    scope: record.get("scope"),
    school: record.get("school") || "",
    active: record.get("active") === true,
    definition: record.get("definition") || "",
  }
}

function errorJson(record) {
  const rules = require(__hooks + "/dict_rules.js")
  return {
    id: record.id,
    code: record.get("code"),
    label: record.get("label"),
    grades: rules.asList(record.get("grades")),
    scope: record.get("scope"),
    school: record.get("school") || "",
    active: record.get("active") === true,
  }
}

function findOne(collection, filter, params) {
  return findOneOn($app, collection, filter, params)
}

function findOneOn(app, collection, filter, params) {
  let rows = []
  try {
    rows = app.findRecordsByFilter(collection, filter, "", 1, 0, params || {})
  } catch (err) {
    rows = []
  }
  return rows.length ? rows[0] : null
}

function nextSort() {
  const rows = $app.findRecordsByFilter("dict_grades", "id != ''", "-sort_order", 1, 0)
  if (!rows.length) return 1
  return Number(rows[0].get("sort_order") || 0) + 1
}

function listGrades(e) {
  const lib = require(__hooks + "/lib.js")
  lib.requireReadyUser(e)
  const rows = $app.findRecordsByFilter("dict_grades", "active = true", "sort_order", 0, 0)
  const items = []
  for (const row of rows) items.push(gradeJson(row))
  return e.json(200, { items })
}

function createGrade(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  if (lib.rankOf(auth) !== "platform_admin") throw new NotFoundError("不存在")
  const body = e.requestInfo().body || {}
  const name = String(body.name || "").trim()
  if (!name || name.length > 20) throw new BadRequestError("请填写年级")
  if (findOne("dict_grades", "name = {:name}", { name })) throw new BadRequestError("这个年级已经有了")
  const record = new Record($app.findCollectionByNameOrId("dict_grades"))
  record.set("name", name)
  record.set("sort_order", Number(body.sort || 0) || nextSort())
  record.set("band", String(body.band || "初中"))
  record.set("active", true)
  $app.save(record)
  return e.json(200, gradeJson(record))
}

function listSubjects(e) {
  const lib = require(__hooks + "/lib.js")
  lib.requireReadyUser(e)
  return e.json(200, { items: subjectRows(true) })
}

function createSubject(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  if (lib.rankOf(auth) !== "platform_admin") throw new NotFoundError("不存在")
  const body = e.requestInfo().body || {}
  return e.json(200, saveSubject(lib, body, null))
}

function updateSubject(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  if (lib.rankOf(auth) !== "platform_admin") throw new NotFoundError("不存在")
  const body = e.requestInfo().body || {}
  const current = findOne("dict_subjects", "code = {:code}", { code: String(body.code || "") })
  if (!current) throw new NotFoundError("不存在")
  return e.json(200, saveSubject(lib, body, current))
}

function listTerms(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const subjectCode = lib.readQuery(e, "subject")
  const includeInactive = lib.readQuery(e, "includeInactive") === "1"
  const code = lib.readQuery(e, "code")
  let filter = visibleFilter(auth)
  const params = { school: auth.get("school") || "" }
  if (subjectCode) {
    filter += " && subject_code = {:subject}"
    params.subject = subjectCode
  }
  if (code) {
    filter += " && code = {:code}"
    params.code = code
  }
  if (!includeInactive) filter += " && active = true"
  const rows = $app.findRecordsByFilter("dict_terms", filter, "code", 0, 0, params)
  const items = []
  for (const row of rows) items.push(termJson(row))
  return e.json(200, { items })
}

function createTerm(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const rank = lib.rankOf(auth)
  if (rank !== "platform_admin" && rank !== "school_admin") throw new NotFoundError("不存在")
  const body = e.requestInfo().body || {}
  return e.json(200, saveTerm(lib, auth, body))
}

function disableTerm(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const body = e.requestInfo().body || {}
  const record = findOne("dict_terms", "code = {:code}", { code: String(body.code || "") })
  if (!record || !canManageTerm(lib, auth, record)) throw new NotFoundError("不存在")
  record.set("active", false)
  $app.save(record)
  lib.writeAudit(auth.id, "dict_term_disabled", record.id, { org: auth.get("org") || "", code: record.get("code") })
  return e.json(200, termJson(record))
}

function createErrorType(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  if (lib.rankOf(auth) !== "school_admin") throw new NotFoundError("不存在")
  const body = e.requestInfo().body || {}
  return e.json(200, saveErrorType(lib, auth, body))
}

function listErrorTypes(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const rows = $app.findRecordsByFilter("dict_error_types", visibleFilter(auth) + " && active = true", "code", 0, 0, { school: auth.get("school") || "" })
  const items = []
  for (const row of rows) items.push(errorJson(row))
  return e.json(200, { items })
}

function listTextbooks(e) {
  const lib = require(__hooks + "/lib.js")
  lib.requireReadyUser(e)
  const rows = $app.findRecordsByFilter("dict_textbooks", "id != ''", "name", 0, 0)
  const items = []
  for (const row of rows) items.push({ name: row.get("name"), custom: row.get("custom") === true })
  return e.json(200, { items })
}

function entryCatalogRoute(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  return e.json(200, { subjects: entryCatalog(lib, auth) })
}

function checkAttach(e) {
  const lib = require(__hooks + "/lib.js")
  const rules = require(__hooks + "/dict_rules.js")
  const auth = lib.requireReadyUser(e)
  const body = e.requestInfo().body || {}
  let student = null
  try {
    student = $app.findRecordById("students", String(body.studentId || ""))
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (!lib.canRead(auth, student)) throw new NotFoundError("不存在")
  const term = findOne("dict_terms", "code = {:code}", { code: String(body.termCode || "") })
  if (!term || !termVisible(auth, term)) throw new NotFoundError("不存在")
  if (term.get("active") !== true) throw new BadRequestError("这条标签已停用")
  const reason = String(body.reason || "").trim()
  if (!rules.gradeFits(student.get("grade"), term.get("grades"))) {
    if (!reason) throw new BadRequestError(rules.mismatchMessage(term.get("grades"), student.get("display_name")))
    if (reason.length > 80) throw new BadRequestError("原因请写在 80 字以内")
    return e.json(200, { ok: true, mismatch: true, term: termJson(term) })
  }
  return e.json(200, { ok: true, mismatch: false, term: termJson(term) })
}

module.exports = {
  seed: seedDictionary,
  listGrades,
  createGrade,
  listSubjects,
  createSubject,
  updateSubject,
  listTerms,
  createTerm,
  disableTerm,
  createErrorType,
  listErrorTypes,
  listTextbooks,
  entryCatalogRoute,
  checkAttach,
}
