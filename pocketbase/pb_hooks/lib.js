const TEACHER_TYPES = ["短期支教", "长期支教", "在编或特岗教师"]
const LOCK_AFTER = 5
const LOCK_MS = 15 * 60 * 1000
const RANK = ["platform_admin", "org_admin", "school_admin", "teacher", "parent", "education_bureau_viewer"]
const NEXT_RANK = {
  platform_admin: "org_admin",
  org_admin: "school_admin",
  school_admin: "teacher",
}

function rolesOf(record) {
  const value = record.get("roles")
  if (!value) return []
  if (typeof value === "string") return [value]
  const list = []
  if (typeof value.length === "number") {
    for (let i = 0; i < value.length; i += 1) list.push(value[i])
  }
  return list
}

function rankOf(record) {
  const roles = rolesOf(record)
  for (const role of RANK) {
    if (roles.indexOf(role) >= 0) return role
  }
  return ""
}

function lockedUntil(record) {
  const raw = record.get("locked_until")
  if (!raw) return 0
  const text = toString(raw)
  if (!text || text.indexOf("0001") === 0) return 0
  const ms = new Date(text).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

function requestPath(e) {
  const url = e.request && e.request.url
  if (!url || typeof url.path !== "string") return ""
  return url.path.split("?")[0]
}

function currentUser(e) {
  const auth = e.auth
  if (!auth || !auth.collection) return null
  const collection = auth.collection()
  if (!collection || collection.name !== "users") return null
  return auth
}

function requireReadyUser(e) {
  const auth = currentUser(e)
  if (!auth) throw new UnauthorizedError("请先登录")
  if (auth.get("must_change_password")) throw new ForbiddenError("请先修改初始口令")
  return auth
}

function publicUser(record) {
  return {
    id: record.id,
    username: record.get("username"),
    display_name: record.get("display_name"),
    roles: rolesOf(record),
    org: record.get("org") || "",
    school: record.get("school") || "",
    teacher_type: record.get("teacher_type") || "",
    must_change_password: record.get("must_change_password") === true,
  }
}

function readQuery(e, key) {
  const info = e.requestInfo()
  const query = info.query || {}
  if (typeof query.get === "function") return String(query.get(key) || "")
  return String(query[key] || "")
}

function matchedSchools(auth, township, area) {
  const rank = rankOf(auth)
  let rows = []
  if (rank === "org_admin") {
    rows = $app.findRecordsByFilter("schools", "org = {:org}", "name", 0, 0, { org: auth.get("org") })
  } else if (rank === "school_admin") {
    rows = [$app.findRecordById("schools", auth.get("school"))]
  } else {
    throw new NotFoundError("不存在")
  }
  const items = []
  for (const row of rows) {
    if (township && (row.get("township") || "") !== township) continue
    if (area && (row.get("area") || "") !== area) continue
    items.push({
      id: row.id,
      name: row.get("name"),
      division_code: row.get("division_code") || "",
      township: row.get("township") || "",
      area: row.get("area") || "",
    })
  }
  return items
}

function csvCell(value) {
  const text = String(value || "")
  if (text.indexOf(",") >= 0 || text.indexOf("\"") >= 0 || text.indexOf("\n") >= 0) {
    return "\"" + text.split("\"").join("\"\"") + "\""
  }
  return text
}

function writeAudit(actorId, action, targetId, detail) {
  const collection = $app.findCollectionByNameOrId("audit_logs")
  const data = {
    action,
    target_id: targetId || "",
    detail: detail || {},
  }
  if (actorId) data.actor = actorId
  if (detail && detail.org) data.org = detail.org
  if (detail && detail.student) data.student_ref = detail.student
  $app.save(new Record(collection, data))
}

function stableJson(value) {
  if (value === null || value === undefined || value === "") return ""
  let parsed = value
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed)
    } catch (err) {
      return parsed
    }
  }
  const sortValue = (input) => {
    if (Array.isArray(input)) return input.map(sortValue)
    if (!input || typeof input !== "object") return input
    const keys = Object.keys(input).sort()
    const sorted = {}
    for (const key of keys) sorted[key] = sortValue(input[key])
    return sorted
  }
  return JSON.stringify(sortValue(parsed))
}

function auditPayload(record) {
  return [
    record.id || "",
    record.get("action") || "",
    record.get("actor") || "",
    record.get("target_id") || "",
    record.get("student_ref") || "",
    record.get("org") || "",
    stableJson(record.get("detail")),
    String(record.get("chain_seq") || 0),
    record.get("prev_hash") || "",
  ].join("\n")
}

function stampAudit(record) {
  const previous = $app.findRecordsByFilter("audit_logs", "chain_seq > 0", "-chain_seq", 1, 0)
  const prior = previous.length ? previous[0] : null
  record.set("chain_seq", prior ? Number(prior.get("chain_seq") || 0) + 1 : 1)
  record.set("prev_hash", prior ? prior.get("record_hash") || "" : "")
  record.set("record_hash", $security.sha256(auditPayload(record)))
}

function verifyAuditChain() {
  const rows = $app.findRecordsByFilter("audit_logs", "chain_seq > 0", "chain_seq", 0, 0)
  let prev = ""
  for (const row of rows) {
    const prior = row.get("prev_hash") || ""
    if (prior !== prev) return { ok: false, id: row.id }
    if ((row.get("record_hash") || "") !== $security.sha256(auditPayload(row))) return { ok: false, id: row.id }
    prev = row.get("record_hash") || ""
  }
  return { ok: true, id: "" }
}

function orgStatus(auth) {
  const orgId = auth.get("org")
  if (!orgId) return "已开通"
  let org = null
  try {
    org = $app.findRecordById("organizations", orgId)
  } catch (err) {
    return "缺失"
  }
  return org.get("status") || "已开通"
}

function recordEntries(record) {
  const raw = record.get("authorization_record")
  if (!raw) return []
  try {
    const parsed = JSON.parse(toString(raw))
    return parsed && parsed.entries ? parsed.entries : []
  } catch (err) {
    return []
  }
}

function rememberAuthorization(auth, record) {
  let original = null
  try {
    original = record.original()
  } catch (err) {
    original = null
  }
  const before = original ? original.get("authorization_registered") === true : false
  const after = record.get("authorization_registered") === true
  if (before === after) return ""
  const entries = recordEntries(record)
  const action = after ? "register" : "revoke"
  entries.push({ action, by: auth.id, at: new Date().toISOString() })
  record.set("authorization_record", { entries, pending_action: action, pending_by: auth.id })
  return action
}

function accountsInScope(auth) {
  const actorRank = rankOf(auth)
  if (actorRank === "platform_admin") {
    return $app.findRecordsByFilter("users", "roles ~ {:role}", "", 0, 0, { role: "org_admin" })
  }
  if (actorRank === "org_admin") {
    return $app.findRecordsByFilter("users", "org = {:org} && roles ~ {:role}", "", 0, 0, {
      org: auth.get("org"),
      role: "school_admin",
    })
  }
  return $app.findRecordsByFilter("users", "school = {:school} && roles ~ {:role}", "", 0, 0, {
    school: auth.get("school"),
    role: "teacher",
  }).filter((record) => rankOf(record) === "teacher")
}

function accountScope(auth, body, role) {
  if (role === "org_admin") {
    const org = String(body.orgId || "")
    try {
      $app.findRecordById("organizations", org)
    } catch (err) {
      throw new BadRequestError("请选择协会")
    }
    return { org, school: "" }
  }
  if (role === "school_admin") {
    const schoolId = String(body.schoolId || "")
    let school = null
    try {
      school = $app.findRecordById("schools", schoolId)
    } catch (err) {
      throw new BadRequestError("请选择学校")
    }
    if (school.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
    return { org: auth.get("org"), school: schoolId }
  }
  return { org: auth.get("org"), school: auth.get("school") }
}

function targetInScope(auth, target) {
  const actorRank = rankOf(auth)
  if (actorRank === "platform_admin") return true
  if (target.get("org") !== auth.get("org")) return false
  if (actorRank === "school_admin") return target.get("school") === auth.get("school")
  return true
}

function noteFailure(user) {
  const count = Number(user.get("failed_login_count") || 0) + 1
  user.set("failed_login_count", count)
  const locked = count >= LOCK_AFTER
  if (locked) user.set("locked_until", new Date(Date.now() + LOCK_MS).toISOString())
  $app.save(user)
  if (locked) writeAudit(user.id, "login_locked", user.id, { failed_login_count: count })
  return locked
}

function uuidv7() {
  let time = Date.now().toString(16)
  while (time.length < 12) time = "0" + time
  time = time.slice(-12)
  const rest = $security.randomStringWithAlphabet(20, "0123456789abcdef")
  const chars = (time + rest).slice(0, 32).split("")
  chars[12] = "7"
  chars[16] = "8"
  const hex = chars.join("")
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20)
}

function sameOrg(auth, record) {
  const org = record.collection().name === "organizations" ? record.id : record.get("org")
  return Boolean(org) && org === auth.get("org")
}

function timeOf(value) {
  if (!value) return 0
  const text = toString(value)
  if (!text || text.indexOf("0001") === 0) return 0
  const ms = new Date(text).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

function stillActive(record) {
  const ms = timeOf(record.get("valid_until"))
  return ms === 0 || ms > Date.now()
}

function hasRole(record, role) {
  return rolesOf(record).indexOf(role) >= 0
}

function teacherAssigned(auth, classId) {
  if (!classId) return false
  const rows = $app.findRecordsByFilter("teaching_assignments", "class = {:class} && teacher = {:teacher} && org = {:org}", "", 0, 0, {
    class: classId,
    teacher: auth.id,
    org: auth.get("org"),
  })
  for (const row of rows) if (stillActive(row)) return true
  return false
}

function grantCovers(auth, schoolId) {
  const rows = $app.findRecordsByFilter("detail_grants", "school = {:school} && org = {:org}", "", 0, 0, {
    school: schoolId,
    org: auth.get("org"),
  })
  for (const row of rows) if (stillActive(row)) return true
  return false
}

function anyGrant(auth) {
  const rows = $app.findRecordsByFilter("detail_grants", "org = {:org}", "", 0, 0, { org: auth.get("org") })
  for (const row of rows) if (stillActive(row)) return true
  return false
}

function subjectVisible(auth, record) {
  const student = $app.findRecordById("students", record.get("student"))
  const school = $app.findRecordById("schools", student.get("school"))
  if ((school.get("cross_subject_view") || "打开") !== "关闭") return true
  const subject = String(record.get("subject") || "")
  if (!subject) return false
  const rows = $app.findRecordsByFilter("teaching_assignments", "class = {:class} && teacher = {:teacher}", "", 0, 0, {
    class: record.get("class"),
    teacher: auth.id,
  })
  for (const row of rows) if (stillActive(row) && row.get("subject") === subject) return true
  return false
}

function canReadStudentPiece(auth, record) {
  const rank = rankOf(auth)
  const name = record.collection().name
  let schoolId = ""
  let classId = ""
  if (name === "students") {
    schoolId = record.get("school")
    classId = record.get("current_class")
  } else if (name === "class_memberships") {
    const klass = $app.findRecordById("classes", record.get("class"))
    schoolId = klass.get("school")
    classId = record.get("class")
  } else {
    const student = $app.findRecordById("students", record.get("student"))
    schoolId = student.get("school")
    classId = record.get("class") || student.get("current_class")
    if (name === "learning_records" && record.get("class") && rank === "school_admin") {
      const klass = $app.findRecordById("classes", record.get("class"))
      if (klass.get("org") === auth.get("org") && klass.get("school") === auth.get("school")) return true
    }
  }
  if (name === "students" && rank === "school_admin" && record.get("org") === auth.get("org") && String(record.get("school_ids") || "").indexOf(auth.get("school")) >= 0) {
    return true
  }
  if (rank === "org_admin") return grantCovers(auth, schoolId)
  if (schoolId !== auth.get("school")) return false
  if (rank === "school_admin") return true
  if (rank !== "teacher" || !teacherAssigned(auth, classId)) return false
  if (name === "learning_records") return subjectVisible(auth, record)
  return true
}

function canRead(auth, record) {
  if (!auth || auth.get("must_change_password")) return false
  const name = record.collection().name
  const rank = rankOf(auth)
  if (name === "wuyu_records") return false
  if (rank === "platform_admin") return name === "organizations" || name === "schools"
  if (rank === "education_bureau_viewer") return false
  if (rank === "parent") {
    if (name === "parent_student_bindings") return record.get("parent") === auth.id
    if (name === "students") return String(record.get("active_parent_ids") || "").indexOf(auth.id) >= 0
    return false
  }
  if (!sameOrg(auth, record)) return false
  if (name === "organizations") return rank === "org_admin" || rank === "school_admin" || rank === "teacher"
  if (name === "schools") {
    if (rank === "org_admin") return true
    return record.id === auth.get("school")
  }
  if (name === "classes") {
    if (rank === "org_admin") return true
    if (rank === "school_admin") return record.get("school") === auth.get("school")
    return teacherAssigned(auth, record.id)
  }
  if (name === "teaching_assignments") {
    if (rank === "org_admin") return true
    if (rank === "school_admin") return record.get("school") === auth.get("school")
    return record.get("teacher") === auth.id
  }
  if (name === "detail_grants") {
    if (rank === "org_admin") return true
    return rank === "school_admin" && record.get("school") === auth.get("school")
  }
  if (name === "teacher_profiles") {
    if (!sameOrg(auth, record)) return false
    if (rank === "org_admin") return true
    return rank === "school_admin" && record.get("school") === auth.get("school")
  }
  if (name === "students" || name === "class_memberships" || name === "learning_records") return canReadStudentPiece(auth, record)
  if (name === "parent_student_bindings") {
    const student = $app.findRecordById("students", record.get("student"))
    if (rank === "org_admin") return grantCovers(auth, student.get("school"))
    if (student.get("school") !== auth.get("school")) return false
    if (rank === "school_admin") return true
    return rank === "teacher" && teacherAssigned(auth, student.get("current_class"))
  }
  if (name === "handover_packages" || name === "handover_reviews") {
    return rank === "org_admin" || rank === "school_admin" || rank === "teacher"
  }
  return false
}

function canReadClassHistory(auth, klass) {
  const rank = rankOf(auth)
  if (!sameOrg(auth, klass)) return false
  if (rank === "school_admin") return klass.get("school") === auth.get("school")
  if (rank === "teacher") return teacherAssigned(auth, klass.id)
  if (rank === "org_admin") return grantCovers(auth, klass.get("school"))
  return false
}

function bindingMayBeActive(record) {
  if (record.get("status") !== "已生效") return true
  if (record.get("relationship_type") !== "其他照料人") return true
  return record.get("authorization_registered") === true
}

function bindGuard(e) {
  const auth = currentUser(e)
  if (!auth) return e.next()
  if (auth.get("must_change_password")) throw new ForbiddenError("请先修改初始口令")
  if (rankOf(auth) !== "school_admin") throw new NotFoundError("不存在")
  let student = null
  try {
    student = $app.findRecordById("students", e.record.get("student"))
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (student.get("org") !== auth.get("org") || student.get("school") !== auth.get("school")) {
    throw new NotFoundError("不存在")
  }
  e.record.set("org", student.get("org"))
  const action = rememberAuthorization(auth, e.record)
  if (!bindingMayBeActive(e.record)) throw new BadRequestError("其他照料人未登记监护人授权书，绑定不能生效")
  if (action && e.record.id) {
    writeAudit(auth.id, action === "revoke" ? "authorization_revoke" : "authorization_register", e.record.id, {
      student: e.record.get("student"),
      org: e.record.get("org"),
    })
  }
  return e.next()
}

function missingVolunteerItems(profile) {
  const missing = []
  if (!profile || !String(profile.get("crime_check_no") || "").trim() || timeOf(profile.get("crime_check_date")) === 0) {
    missing.push("违法犯罪记录查询回执")
  }
  if (!profile || !String(profile.get("training_note") || "").trim()) missing.push("岗前培训或见习记录")
  if (!profile || profile.get("confidentiality_accepted") !== true) missing.push("保密承诺")
  const duty = profile ? profile.get("duty") : ""
  if (duty !== "独立任课" && duty !== "辅助教学") missing.push("任课安排")
  return missing
}

function prepareVolunteerProfile(auth, record) {
  if (rankOf(auth) !== "school_admin") throw new NotFoundError("不存在")
  let teacher = null
  try {
    teacher = $app.findRecordById("users", record.get("user"))
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (teacher.get("school") !== auth.get("school") || teacher.get("org") !== auth.get("org") || rolesOf(teacher).indexOf("teacher") < 0) {
    throw new NotFoundError("不存在")
  }
  record.set("user", teacher.id)
  record.set("org", teacher.get("org"))
  record.set("school", teacher.get("school"))
}

function assertVolunteer(userId) {
  let rows = []
  try {
    rows = $app.findRecordsByFilter("teacher_profiles", "user = {:user}", "", 1, 0, { user: userId })
  } catch (err) {
    rows = []
  }
  const missing = missingVolunteerItems(rows.length ? rows[0] : null)
  if (missing.length) throw new BadRequestError("不能授予学情权限，缺少：" + missing.join("、"))
}

function prepareLearningRecord(auth, record) {
  const rank = rankOf(auth)
  if (rank !== "teacher" && rank !== "school_admin") throw new ForbiddenError("不能记学情")
  if (rank === "teacher") assertVolunteer(auth.id)
  const previous = String(record.get("previous_uid") || "")
  if (previous) {
    let old = null
    try {
      old = $app.findFirstRecordByFilter("learning_records", "uid = {:uid}", { uid: previous })
    } catch (err) {
      throw new NotFoundError("不存在")
    }
    if (old.get("org") !== auth.get("org") || !canReadStudentPiece(auth, old)) throw new NotFoundError("不存在")
    if (old.get("author") !== auth.id) throw new BadRequestError("不能修改别人记的记录")
    record.set("student", old.get("student"))
    if (old.get("class")) record.set("class", old.get("class"))
    record.set("subject", old.get("subject") || "")
    record.set("version", Number(old.get("version") || 1) + 1)
    record.set("previous_uid", old.get("uid"))
  } else {
    let student = null
    try {
      student = $app.findRecordById("students", record.get("student"))
    } catch (err) {
      throw new NotFoundError("不存在")
    }
    if (student.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
    if (rank === "school_admin" && student.get("school") !== auth.get("school")) throw new NotFoundError("不存在")
    const classId = student.get("current_class") || ""
    if (rank === "teacher" && !teacherAssigned(auth, classId)) throw new NotFoundError("不存在")
    const subject = String(record.get("subject") || "")
    record.set("subject", subject)
    if (classId) record.set("class", classId)
    if (rank === "teacher" && !subjectVisible(auth, record)) throw new BadRequestError("只能记自己任课学科")
    record.set("version", 1)
    record.set("previous_uid", "")
  }
  assertConsent(record.get("student"))
  record.set("org", auth.get("org"))
  record.set("author", auth.id)
  record.set("uid", uuidv7())
}

const CONSENT_TEMPLATE = [
  "监护人告知书模板",
  "本模板列出告知必须写明的事项。正式全文以内容支持文档为准。",
  "收集目的：用于学情记录、交接和家长知情，不用于排名或收费。",
  "方式：由学校登记纸质回执，可书面填写，也可当面口头讲解后保留纸质回执。",
  "范围：姓名或代称、年级、班级和学情记录。不采集身份证号、住址、医疗信息。",
  "存储地点：保存在本校所属协会的系统中，不向其他协会开放。",
  "期限：默认学生离校满 3 年。",
  "到期处理：到期后按学校配置删除或匿名化，并留下处理记录。",
  "安全措施：按学校隔离，查看和导出留审计。",
  "拒绝的后果：拒绝或未登记时，不为该生记学情。",
  "投诉渠道：向本校学校管理员或协会负责人提出。",
  "更正删除方式：监护人可向学校要求查阅、更正或删除。",
  "拒绝选项：监护人可以选择不同意。",
  "保存期限：默认离校满 3 年。",
].join("\n")

function assertConsent(studentId) {
  let rows = []
  try {
    rows = $app.findRecordsByFilter("consents", "student = {:student}", "", 1, 0, { student: studentId })
  } catch (err) {
    rows = []
  }
  if (!rows.length || rows[0].get("status") !== "已同意") throw new BadRequestError("未同意或未登记的学生不能记学情")
}

function releaseConsentBindings(studentId) {
  const bindings = $app.findRecordsByFilter("parent_student_bindings", "student = {:student} && status = '已生效'", "", 0, 0, { student: studentId })
  for (const binding of bindings) {
    binding.set("status", "已解绑")
    $app.save(binding)
  }
  if (bindings.length) refreshActiveParents(studentId)
}

function saveConsent(auth, body) {
  if (rankOf(auth) !== "school_admin") throw new NotFoundError("不存在")
  let student = null
  try {
    student = $app.findRecordById("students", String(body.studentId || ""))
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (student.get("school") !== auth.get("school") || student.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
  const status = String(body.status || "")
  if (status !== "已同意" && status !== "已拒绝" && status !== "已撤回") throw new BadRequestError("请选择同意状态")
  const explainMethod = String(body.explainMethod || "")
  const signerRole = String(body.signerRole || "")
  const receiptNo = String(body.receiptNo || "").trim()
  if (status === "已同意") {
    if (!receiptNo) throw new BadRequestError("请填写回执编号")
    if (timeOf(body.consentedOn) === 0) throw new BadRequestError("请填写日期")
    if (explainMethod !== "书面" && explainMethod !== "口头讲解 + 纸质回执") throw new BadRequestError("请选择讲解方式")
    if (signerRole !== "父母" && signerRole !== "祖辈" && signerRole !== "其他照料人") throw new BadRequestError("请选择签字人身份")
  }
  let rows = []
  try {
    rows = $app.findRecordsByFilter("consents", "student = {:student}", "", 1, 0, { student: student.id })
  } catch (err) {
    rows = []
  }
  const previous = rows.length ? rows[0].get("status") : "未登记"
  const record = rows.length ? rows[0] : new Record($app.findCollectionByNameOrId("consents"), { student: student.id })
  record.set("student", student.id)
  record.set("org", student.get("org"))
  record.set("school", student.get("school"))
  record.set("status", status)
  record.set("receipt_no", receiptNo)
  record.set("consented_on", body.consentedOn || "")
  record.set("explain_method", explainMethod)
  record.set("signer_role", signerRole)
  record.set("oral_explained", body.oralExplained === true)
  record.set("operator", auth.id)
  $app.save(record)
  if (status !== "已同意") releaseConsentBindings(student.id)
  writeAudit(auth.id, "consent_changed", record.id, {
    org: student.get("org"),
    student: student.id,
    from: previous,
    to: status,
  })
  return {
    id: record.id,
    status,
    message: status === "已撤回" ? "已停止新录入，请学校按 7.3 处理已有数据" : "",
  }
}

function saveConsentBatch(auth, body) {
  if (rankOf(auth) !== "school_admin") throw new NotFoundError("不存在")
  let klass = null
  try {
    klass = $app.findRecordById("classes", String(body.classId || ""))
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (klass.get("school") !== auth.get("school") || klass.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
  const rows = body.rows
  if (!rows || typeof rows.length !== "number" || rows.length < 1) throw new BadRequestError("请填写本班回执")
  const saved = []
  const errors = []
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || {}
    const rowNumber = i + 1
    const signer = String(row.signerRole || "")
    const problems = []
    if (signer !== "父母" && signer !== "祖辈" && signer !== "其他照料人") problems.push("请填写谁签的")
    if (row.oralExplained !== true && row.oralExplained !== false) problems.push("请注明有没有当面口头讲解")
    if (!String(row.receiptNo || "").trim()) problems.push("请填写回执编号")
    if (timeOf(row.consentedOn) === 0) problems.push("请填写日期")
    let student = null
    try {
      student = $app.findRecordById("students", String(row.studentId || ""))
    } catch (err) {
      student = null
    }
    if (!student || student.get("current_class") !== klass.id || student.get("school") !== auth.get("school")) problems.push("学生不在这个班")
    if (problems.length) {
      errors.push({ row: rowNumber, message: problems.join("、") })
      continue
    }
    try {
      const result = saveConsent(auth, {
        studentId: student.id,
        status: "已同意",
        receiptNo: row.receiptNo,
        consentedOn: row.consentedOn,
        explainMethod: row.oralExplained === true ? "口头讲解 + 纸质回执" : "书面",
        signerRole: signer,
        oralExplained: row.oralExplained === true,
      })
      saved.push({ row: rowNumber, id: result.id, studentId: student.id })
    } catch (err) {
      errors.push({ row: rowNumber, message: String(err) })
    }
  }
  return { saved, errors }
}

function recordStudents(auth) {
  const rank = rankOf(auth)
  if (rank !== "teacher" && rank !== "school_admin") throw new NotFoundError("不存在")
  let students = []
  if (rank === "school_admin") {
    students = $app.findRecordsByFilter("students", "school = {:school}", "display_name", 0, 0, { school: auth.get("school") })
  } else {
    const duties = $app.findRecordsByFilter("teaching_assignments", "teacher = {:teacher}", "", 0, 0, { teacher: auth.id })
    const seen = {}
    for (const duty of duties) {
      if (!stillActive(duty) || seen[duty.get("class")]) continue
      seen[duty.get("class")] = true
      const rows = $app.findRecordsByFilter("students", "current_class = {:class}", "display_name", 0, 0, { class: duty.get("class") })
      for (const row of rows) students.push(row)
    }
  }
  const items = []
  for (const student of students) {
    let rows = []
    try {
      rows = $app.findRecordsByFilter("consents", "student = {:student}", "", 1, 0, { student: student.id })
    } catch (err) {
      rows = []
    }
    const consentStatus = rows.length ? rows[0].get("status") : "未登记"
    items.push({
      id: student.id,
      display_name: student.get("display_name"),
      consent_status: consentStatus,
      recordable: consentStatus === "已同意",
    })
  }
  return items
}

function prepareMembership(auth, record) {
  const rank = rankOf(auth)
  if (rank !== "school_admin" && rank !== "org_admin") throw new NotFoundError("不存在")
  let klass = null
  try {
    klass = $app.findRecordById("classes", record.get("class"))
  } catch (err) {
    throw new BadRequestError("请选择班级")
  }
  if (klass.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
  if (rank === "school_admin" && klass.get("school") !== auth.get("school")) throw new NotFoundError("不存在")
  let student = null
  try {
    student = $app.findRecordById("students", record.get("student"))
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (student.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
  if (rank === "school_admin" && student.get("school") !== auth.get("school")) throw new NotFoundError("不存在")
  if (rank === "org_admin" && !record.get("previous_id")) throw new NotFoundError("不存在")
  const existing = $app.findRecordsByFilter("class_memberships", "student = {:student}", "", 0, 0, { student: student.id })
  const superseded = {}
  for (const row of existing) if (row.get("previous_id")) superseded[row.get("previous_id")] = true
  const current = []
  for (const row of existing) if (!superseded[row.id]) current.push(row)
  const previousId = String(record.get("previous_id") || "")
  if (current.length && !previousId) throw new BadRequestError("学生同一时间只能在一个班")
  if (previousId) {
    let found = false
    for (const row of current) if (row.id === previousId) found = true
    if (!found) throw new BadRequestError("学生同一时间只能在一个班")
  }
  if (!record.get("started_on")) record.set("started_on", new Date().toISOString())
  record.set("org", auth.get("org"))
}

function prepareAssignment(auth, record) {
  if (rankOf(auth) !== "school_admin") throw new NotFoundError("不存在")
  let klass = null
  try {
    klass = $app.findRecordById("classes", record.get("class"))
  } catch (err) {
    throw new BadRequestError("请选择班级")
  }
  if (klass.get("school") !== auth.get("school") || klass.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
  let teacher = null
  try {
    teacher = $app.findRecordById("users", record.get("teacher"))
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (teacher.get("school") !== auth.get("school") || !hasRole(teacher, "teacher")) throw new NotFoundError("不存在")
  const subject = String(record.get("subject") || "").trim()
  if (!subject || subject.length > 20) throw new BadRequestError("请填写任课学科")
  assertKnownSubject(subject)
  record.set("subject", subject)
  record.set("org", klass.get("org"))
  record.set("school", klass.get("school"))
  assertVolunteer(teacher.id)
}

function prepareGrant(auth, record) {
  if (rankOf(auth) !== "school_admin") throw new NotFoundError("不存在")
  const schoolId = String(record.get("school") || auth.get("school") || "")
  let school = null
  try {
    school = $app.findRecordById("schools", schoolId)
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (school.id !== auth.get("school") || school.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
  if (timeOf(record.get("valid_until")) === 0) throw new BadRequestError("请填写到期时间")
  record.set("school", school.id)
  record.set("org", school.get("org"))
  record.set("granted_by", auth.id)
}

function refreshClassTeachers(classId) {
  if (!classId) return
  const klass = $app.findRecordById("classes", classId)
  const assignments = $app.findRecordsByFilter("teaching_assignments", "class = {:class}", "", 0, 0, { class: classId })
  const teacherIds = []
  for (const row of assignments) {
    if (!stillActive(row)) continue
    const teacherId = row.get("teacher")
    if (teacherIds.indexOf(teacherId) < 0) teacherIds.push(teacherId)
  }
  klass.set("teacher_ids", teacherIds.length ? "," + teacherIds.join(",") + "," : "")
  $app.save(klass)
  const memberships = $app.findRecordsByFilter("class_memberships", "class = {:class}", "", 0, 0, { class: classId })
  for (const row of memberships) {
    const student = $app.findRecordById("students", row.get("student"))
    if (student.get("current_class") !== classId) continue
    student.set("class_teacher_ids", klass.get("teacher_ids"))
    $app.save(student)
  }
}

function refreshRoster(studentId) {
  const student = $app.findRecordById("students", studentId)
  const memberships = $app.findRecordsByFilter("class_memberships", "student = {:student}", "", 0, 0, { student: studentId })
  const superseded = {}
  for (const row of memberships) if (row.get("previous_id")) superseded[row.get("previous_id")] = true
  let currentClass = ""
  const seen = {}
  for (const row of memberships) {
    seen[row.get("class")] = true
    if (!superseded[row.id]) currentClass = row.get("class")
  }
  student.set("current_class", currentClass)
  $app.save(student)
  for (const classId of Object.keys(seen)) refreshClassTeachers(classId)
}

function refreshDetailUntil(schoolId) {
  const grants = $app.findRecordsByFilter("detail_grants", "school = {:school}", "", 0, 0, { school: schoolId })
  let best = ""
  let bestMs = 0
  for (const row of grants) {
    const ms = timeOf(row.get("valid_until"))
    if (ms >= bestMs) {
      bestMs = ms
      best = toString(row.get("valid_until"))
    }
  }
  const students = $app.findRecordsByFilter("students", "school = {:school}", "", 0, 0, { school: schoolId })
  for (const student of students) {
    student.set("detail_until", bestMs ? best : "")
    $app.save(student)
  }
}

function classRecordVisible(record, onText) {
  const onMs = timeOf(onText.length === 10 ? onText + " 00:00:00.000Z" : onText)
  if (!onMs) return false
  const created = timeOf(record.get("created"))
  if (!created || created >= onMs + 24 * 60 * 60 * 1000) return false
  const all = $app.findRecordsByFilter("class_memberships", "student = {:student}", "", 0, 0, { student: record.get("student") })
  for (const row of all) {
    if (row.get("class") !== record.get("class")) continue
    const start = timeOf(row.get("started_on"))
    let end = 0
    for (const other of all) {
      if (other.get("previous_id") === row.id) end = timeOf(other.get("started_on"))
    }
    const inside = onMs >= start && (end === 0 || onMs < end)
    const writtenHere = created >= start && (end === 0 || created < end)
    if (inside && writtenHere) return true
  }
  return false
}

function toList(value) {
  return require(__hooks + "/dict_rules.js").asList(value)
}

function gradeNames() {
  let rows = []
  try {
    rows = $app.findRecordsByFilter("dict_grades", "active = true", "sort_order", 0, 0)
  } catch (err) {
    rows = []
  }
  const names = []
  for (const row of rows) names.push(row.get("name"))
  return names
}

function assertKnownGrade(grade) {
  if (gradeNames().indexOf(grade) < 0) throw new BadRequestError("请填写年级")
}

function assertGradeList(value) {
  const grades = toList(value)
  const known = gradeNames()
  for (let i = 0; i < grades.length; i += 1) {
    if (known.indexOf(grades[i]) < 0) throw new BadRequestError("请填写年级")
  }
}

function knownGradeSelection(value) {
  const grades = toList(value)
  const known = gradeNames()
  const picked = []
  for (let i = 0; i < grades.length; i += 1) {
    if (known.indexOf(grades[i]) < 0) throw new BadRequestError("请填写年级")
    if (picked.indexOf(grades[i]) < 0) picked.push(grades[i])
  }
  return picked
}

function assertKnownSubject(name) {
  let rows = []
  try {
    rows = $app.findRecordsByFilter("dict_subjects", "name = {:name} && active = true", "", 1, 0, { name: name })
  } catch (err) {
    rows = []
  }
  if (!rows.length) throw new BadRequestError("请从学科字典里选择")
  return rows[0]
}

function prepareStudent(auth, record) {
  const grade = record.get("grade") || ""
  assertKnownGrade(grade)
  const classId = record.get("current_class") || ""
  if (!classId) throw new BadRequestError("请选择班级")
  let klass = null
  try {
    klass = $app.findRecordById("classes", classId)
  } catch (err) {
    throw new BadRequestError("请选择班级")
  }
  if (klass.get("school") !== auth.get("school") || klass.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
  const grades = toList(klass.get("grades"))
  if (!grades.length) throw new BadRequestError("请先填写班级年级")
  const reason = String(record.get("mismatch_reason") || "").trim()
  if (grades.indexOf(grade) < 0) {
    if (!reason) throw new BadRequestError("年级与班级不匹配")
    record.set("mismatch_reason", reason)
  } else {
    record.set("mismatch_reason", "")
  }
  const same = $app.findRecordsByFilter("students", "school = {:school} && display_name = {:name} && grade = {:grade} && merged_into = ''", "", 2, 0, {
    school: auth.get("school"),
    name: record.get("display_name"),
    grade,
  })
  let duplicated = false
  for (const row of same) if (row.id !== record.id) duplicated = true
  if (duplicated && record.get("confirm_duplicate") !== true) throw new BadRequestError("疑似重复")
  record.set("confirm_duplicate", false)
}

function importStudents(auth, classId, csv) {
  const text = String(csv || "").trim()
  const lines = text.split(/\r?\n/)
  if (lines.length < 2) throw new BadRequestError("请提供表头和至少一行学生")
  const header = lines[0].split(",").map((item) => item.trim())
  if (header[0] !== "姓名" || header[1] !== "年级") throw new BadRequestError("表头必须是姓名,年级")
  let klass = null
  try {
    klass = $app.findRecordById("classes", classId)
  } catch (err) {
    throw new BadRequestError("请选择班级")
  }
  if (klass.get("school") !== auth.get("school") || klass.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
  const classGrades = toList(klass.get("grades"))
  const errors = []
  const pending = []
  const seen = {}
  for (let i = 1; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue
    const rowNumber = i + 1
    const cells = lines[i].split(",")
    const name = String(cells[0] || "").trim()
    const grade = String(cells[1] || "").trim()
    if (!name) {
      errors.push("第" + rowNumber + "行：请填写姓名")
      continue
    }
    if (gradeNames().indexOf(grade) < 0) {
      errors.push("第" + rowNumber + "行：请填写年级")
      continue
    }
    if (classGrades.indexOf(grade) < 0) {
      errors.push("第" + rowNumber + "行：年级与班级不匹配")
      continue
    }
    const key = name + "|" + grade
    if (seen[key]) {
      errors.push("第" + rowNumber + "行：疑似重复")
      continue
    }
    seen[key] = true
    const existing = $app.findRecordsByFilter("students", "school = {:school} && display_name = {:name} && grade = {:grade} && merged_into = ''", "", 1, 0, {
      school: auth.get("school"),
      name,
      grade,
    })
    if (existing.length) {
      errors.push("第" + rowNumber + "行：疑似重复")
      continue
    }
    pending.push({ name, grade })
  }
  if (errors.length) throw new BadRequestError(errors.join("；"))
  const students = $app.findCollectionByNameOrId("students")
  const memberships = $app.findCollectionByNameOrId("class_memberships")
  const ids = []
  for (const item of pending) {
    const student = new Record(students, {
      display_name: item.name,
      grade: item.grade,
      school: auth.get("school"),
      org: auth.get("org"),
      current_class: classId,
      mismatch_reason: "",
      confirm_duplicate: false,
      active_parent_ids: "",
      uid: uuidv7(),
    })
    $app.save(student)
    const membership = new Record(memberships, {
      student: student.id,
      class: classId,
      org: auth.get("org"),
      started_on: new Date().toISOString(),
    })
    $app.save(membership)
    ids.push(student.id)
  }
  return ids
}

function mergeStudents(auth, sourceId, targetId) {
  if (!sourceId || sourceId === targetId) throw new BadRequestError("请选择两名不同的学生")
  let source = null
  let target = null
  try {
    source = $app.findRecordById("students", sourceId)
    target = $app.findRecordById("students", targetId)
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (source.get("school") !== auth.get("school") || target.get("school") !== auth.get("school")) throw new NotFoundError("不存在")
  if (source.get("org") !== auth.get("org") || target.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
  if (source.get("merged_into")) throw new BadRequestError("该学生已经合并")
  const collection = $app.findCollectionByNameOrId("student_merges")
  const merge = new Record(collection, {
    source: source.id,
    target: target.id,
    org: auth.get("org"),
    school: auth.get("school"),
    merged_by: auth.id,
  })
  $app.save(merge)
  source.set("merged_into", target.id)
  $app.save(source)
  writeAudit(auth.id, "student_merged", merge.id, { org: auth.get("org"), student: target.id, source: source.id })
  return merge.id
}

function studentHistory(auth, studentId) {
  let student = null
  try {
    student = $app.findRecordById("students", studentId)
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (student.get("school") !== auth.get("school") || student.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
  const sources = $app.findRecordsByFilter("students", "merged_into = {:id}", "", 0, 0, { id: studentId })
  const ids = [studentId]
  for (const source of sources) ids.push(source.id)
  const records = []
  const memberships = []
  for (const id of ids) {
    const learned = $app.findRecordsByFilter("learning_records", "student = {:id}", "created", 0, 0, { id })
    for (const row of learned) {
      records.push({
        id: row.id,
        uid: row.get("uid"),
        student: row.get("student"),
        source_student: row.get("student"),
        body: row.get("body"),
      })
    }
    const joined = $app.findRecordsByFilter("class_memberships", "student = {:id}", "", 0, 0, { id })
    for (const row of joined) {
      memberships.push({ id: row.id, student: row.get("student"), source_student: row.get("student"), class: row.get("class") })
    }
  }
  return { student: studentId, records, memberships }
}

function currentMembership(studentId) {
  const rows = $app.findRecordsByFilter("class_memberships", "student = {:student}", "", 0, 0, { student: studentId })
  const superseded = {}
  for (const row of rows) if (row.get("previous_id")) superseded[row.get("previous_id")] = true
  for (const row of rows) if (!superseded[row.id]) return row
  return null
}

function moveStudent(auth, body) {
  const kind = String(body.kind || "")
  if (kind !== "转班" && kind !== "升级" && kind !== "转校") throw new BadRequestError("请选择转班、升级或转校")
  const rank = rankOf(auth)
  let student = null
  let klass = null
  try {
    student = $app.findRecordById("students", String(body.studentId || ""))
    klass = $app.findRecordById("classes", String(body.classId || ""))
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (student.get("org") !== auth.get("org") || klass.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
  if (kind === "转校") {
    if (rank !== "org_admin") throw new NotFoundError("不存在")
    if (klass.get("school") === student.get("school")) throw new BadRequestError("转校请选择另一所学校的班级")
  } else if (rank !== "school_admin" || student.get("school") !== auth.get("school") || klass.get("school") !== auth.get("school")) {
    throw new NotFoundError("不存在")
  }
  const grade = kind === "升级" ? String(body.grade || "") : (student.get("grade") || "")
  if (kind === "升级" && (gradeNames().indexOf(grade) < 0 || grade === (student.get("grade") || ""))) {
    throw new BadRequestError("升级请选择新的年级")
  }
  if (kind === "转班" && klass.id === student.get("current_class")) throw new BadRequestError("请选择另一个班")
  const grades = toList(klass.get("grades"))
  const reason = String(body.mismatchReason || "").trim()
  if (grades.indexOf(grade) < 0 && !reason) throw new BadRequestError("年级与班级不匹配")
  const current = currentMembership(student.id)
  if (!current) throw new BadRequestError("学生还没有在班记录")
  const uid = student.get("uid")
  const memberships = $app.findCollectionByNameOrId("class_memberships")
  const membership = new Record(memberships, {
    student: student.id,
    class: klass.id,
    org: student.get("org"),
    previous_id: current.id,
    change_kind: kind,
    started_on: body.startedOn || new Date().toISOString(),
  })
  $app.save(membership)
  student = $app.findRecordById("students", student.id)
  let schoolIds = String(student.get("school_ids") || "")
  if (schoolIds.indexOf("," + student.get("school") + ",") < 0) schoolIds += student.get("school") + ","
  if (!schoolIds) schoolIds = ","
  if (schoolIds.indexOf("," + klass.get("school") + ",") < 0) schoolIds += klass.get("school") + ","
  student.set("school", klass.get("school"))
  student.set("school_ids", schoolIds)
  student.set("grade", grade)
  student.set("current_class", klass.id)
  student.set("mismatch_reason", grades.indexOf(grade) < 0 ? reason : "")
  student.set("uid", uid)
  $app.save(student)
  const saved = $app.findRecordById("students", student.id)
  if (saved.get("uid") !== uid) throw new BadRequestError("学生编号不能修改")
  writeAudit(auth.id, "enrollment_" + kind, membership.id, { org: student.get("org"), student: student.id, class: klass.id })
  return { id: membership.id, uid: saved.get("uid"), school: saved.get("school"), grade: saved.get("grade") }
}

function refreshActiveParents(studentId) {
  const student = $app.findRecordById("students", studentId)
  const bindings = $app.findRecordsByFilter("parent_student_bindings", "student = {:id}", "", 0, 0, { id: studentId })
  const ids = []
  for (const binding of bindings) {
    if (binding.get("status") !== "已生效") continue
    const kind = binding.get("relationship_type")
    const allowed = kind === "法定监护人" || (kind === "其他照料人" && binding.get("authorization_registered") === true)
    if (allowed) ids.push(binding.get("parent"))
  }
  student.set("active_parent_ids", ids.length ? "," + ids.join(",") + "," : "")
  $app.save(student)
}

module.exports = {
  TEACHER_TYPES,
  gradeNames,
  assertKnownGrade,
  assertGradeList,
  knownGradeSelection,
  assertKnownSubject,
  assignmentActive: stillActive,
  prepareStudent,
  importStudents,
  mergeStudents,
  studentHistory,
  moveStudent,
  NEXT_RANK,
  PROTECTED_FIELDS: [
    "email",
    "verified",
    "username",
    "roles",
    "org",
    "school",
    "failed_login_count",
    "locked_until",
    "teacher_type",
  ],
  rolesOf,
  rankOf,
  lockedUntil,
  requestPath,
  currentUser,
  requireReadyUser,
  publicUser,
  readQuery,
  matchedSchools,
  csvCell,
  writeAudit,
  stampAudit,
  verifyAuditChain,
  orgStatus,
  accountsInScope,
  accountScope,
  targetInScope,
  noteFailure,
  uuidv7,
  canRead,
  canReadClassHistory,
  anyGrant,
  classRecordVisible,
  bindingMayBeActive,
  refreshActiveParents,
  bindGuard,
  prepareLearningRecord,
  prepareMembership,
  prepareAssignment,
  assertVolunteer,
  CONSENT_TEMPLATE,
  saveConsent,
  saveConsentBatch,
  recordStudents,
  prepareVolunteerProfile,
  prepareGrant,
  refreshRoster,
  refreshClassTeachers,
  refreshDetailUntil,
}
