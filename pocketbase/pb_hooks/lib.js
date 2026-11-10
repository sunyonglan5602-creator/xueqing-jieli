const TEACHER_TYPES = ["短期支教", "长期支教", "在编或特岗教师"]
const GRADES = ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级"]
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

function prepareLearningRecord(auth, record) {
  const rank = rankOf(auth)
  if (rank !== "teacher" && rank !== "school_admin") throw new ForbiddenError("不能记学情")
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
  record.set("org", auth.get("org"))
  record.set("author", auth.id)
  record.set("uid", uuidv7())
}

function prepareMembership(auth, record) {
  if (rankOf(auth) !== "school_admin") throw new NotFoundError("不存在")
  let klass = null
  try {
    klass = $app.findRecordById("classes", record.get("class"))
  } catch (err) {
    throw new BadRequestError("请选择班级")
  }
  if (klass.get("org") !== auth.get("org") || klass.get("school") !== auth.get("school")) throw new NotFoundError("不存在")
  let student = null
  try {
    student = $app.findRecordById("students", record.get("student"))
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (student.get("school") !== auth.get("school") || student.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
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
  record.set("subject", subject)
  record.set("org", klass.get("org"))
  record.set("school", klass.get("school"))
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
  if (!value) return []
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed
    } catch (err) {
      return [value]
    }
    return value ? [value] : []
  }
  const list = []
  if (typeof value.length === "number") {
    for (let i = 0; i < value.length; i += 1) list.push(value[i])
  }
  return list
}

function prepareStudent(auth, record) {
  const grade = record.get("grade") || ""
  if (GRADES.indexOf(grade) < 0) throw new BadRequestError("请填写年级")
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
    if (GRADES.indexOf(grade) < 0) {
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
  GRADES,
  prepareStudent,
  importStudents,
  mergeStudents,
  studentHistory,
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
  prepareGrant,
  refreshRoster,
  refreshClassTeachers,
  refreshDetailUntil,
}
