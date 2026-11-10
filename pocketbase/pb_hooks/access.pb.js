// 租户隔离、家长只能读已生效绑定的孩子、教学纪实只追加。

const READ_GUARDS = ["organizations", "schools", "classes", "students", "class_memberships", "learning_records", "parent_student_bindings"]
const APPEND_ONLY = ["class_memberships", "learning_records"]

routerUse((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  const lib = require(__hooks + "/lib.js")
  const method = e.request.method
  if (method !== "GET" && method !== "PATCH" && method !== "DELETE") return e.next()
  const parts = lib.requestPath(e).split("/")
  if ((parts.length !== 5 && parts.length !== 6) || parts[1] !== "api" || parts[2] !== "collections" || parts[4] !== "records") return e.next()
  const name = parts[3]
  if (name === "wuyu_records") throw new NotFoundError("不存在")
  if (parts.length !== 6) return e.next()
  const guarded = ["organizations", "schools", "classes", "students", "class_memberships", "learning_records", "parent_student_bindings", "handover_packages", "handover_reviews", "teaching_assignments", "detail_grants", "teacher_profiles"]
  if (guarded.indexOf(name) < 0) return e.next()
  let record = null
  try {
    record = $app.findRecordById(name, parts[5])
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (!lib.canRead(lib.currentUser(e), record)) throw new NotFoundError("不存在")
  return e.next()
})

for (const collection of READ_GUARDS) {
  onRecordUpdateRequest(handler(`
    const lib = require(__hooks + "/lib.js")
    if (!e.record || !lib.canRead(lib.currentUser(e), e.record)) throw new NotFoundError("不存在")
    if (${APPEND_ONLY.indexOf(collection) >= 0}) throw new BadRequestError("只能追加修订，不能覆盖或删除")
    return e.next()
  `), collection)

  onRecordDeleteRequest(handler(`
    const lib = require(__hooks + "/lib.js")
    if (!e.record || !lib.canRead(lib.currentUser(e), e.record)) throw new NotFoundError("不存在")
    if (${APPEND_ONLY.indexOf(collection) >= 0 || collection === "students"}) throw new BadRequestError("只能追加修订，不能覆盖或删除")
    throw new BadRequestError("不能删除")
  `), collection)
}

function handler(body) {
  return (0, eval)("(e) => {" + body + "}")
}

onRecordCreateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (!auth) return e.next()
  if (lib.rankOf(auth) !== "school_admin") throw new ForbiddenError("不能建立学生")
  let school = null
  try {
    school = $app.findRecordById("schools", e.record.get("school"))
  } catch (err) {
    throw new BadRequestError("请选择本校")
  }
  if (school.id !== auth.get("school") || school.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
  e.record.set("org", auth.get("org"))
  e.record.set("uid", lib.uuidv7())
  e.record.set("active_parent_ids", "")
  return e.next()
}, "students")

onRecordUpdateRequest((e) => {
  const original = e.record.original()
  e.record.set("uid", original.get("uid"))
  e.record.set("org", original.get("org"))
  e.record.set("school", original.get("school"))
  e.record.set("active_parent_ids", original.get("active_parent_ids"))
  e.record.set("current_class", original.get("current_class"))
  e.record.set("class_teacher_ids", original.get("class_teacher_ids"))
  e.record.set("detail_until", original.get("detail_until"))
  return e.next()
}, "students")

onRecordUpdate((e) => {
  const original = e.record.original()
  if (!original) return e.next()
  e.record.set("uid", original.get("uid"))
  e.record.set("org", original.get("org"))
  return e.next()
}, "students")

onRecordCreateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (!auth) return e.next()
  let school = null
  try {
    school = $app.findRecordById("schools", e.record.get("school"))
  } catch (err) {
    throw new BadRequestError("请选择学校")
  }
  if (school.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
  if (lib.rankOf(auth) === "school_admin" && school.id !== auth.get("school")) throw new NotFoundError("不存在")
  e.record.set("org", school.get("org"))
  return e.next()
}, "classes")

onRecordCreateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (!auth) return e.next()
  lib.prepareLearningRecord(auth, e.record)
  return e.next()
}, "learning_records")

onRecordUpdate(() => {
  throw new BadRequestError("只能追加修订，不能覆盖或删除")
}, "learning_records")

onRecordDelete(() => {
  throw new BadRequestError("只能追加修订，不能覆盖或删除")
}, "learning_records")

onRecordUpdate(() => {
  throw new BadRequestError("只能追加修订，不能覆盖或删除")
}, "class_memberships")

onRecordDelete(() => {
  throw new BadRequestError("只能追加修订，不能覆盖或删除")
}, "class_memberships")

onRecordCreateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (!auth) return e.next()
  let school = null
  try {
    school = $app.findRecordById("classes", e.record.get("class"))
  } catch (err) {
    throw new BadRequestError("请选择班级")
  }
  if (school.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
  e.record.set("org", auth.get("org"))
  return e.next()
}, "class_memberships")

onRecordCreateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  return lib.bindGuard(e)
}, "parent_student_bindings")

onRecordUpdateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  return lib.bindGuard(e)
}, "parent_student_bindings")

onRecordAfterCreateSuccess((e) => {
  const lib = require(__hooks + "/lib.js")
  lib.refreshActiveParents(e.record.get("student"))
}, "parent_student_bindings")

onRecordAfterUpdateSuccess((e) => {
  const lib = require(__hooks + "/lib.js")
  lib.refreshActiveParents(e.record.get("student"))
}, "parent_student_bindings")

onRecordEnrich((e) => {
  const lib = require(__hooks + "/lib.js")
  const info = e.requestInfo
  const auth = info && info.auth
  let allowed = false
  if (auth && auth.collection && auth.collection().name === "users" && lib.rankOf(auth) === "school_admin") {
    try {
      const student = $app.findRecordById("students", e.record.get("student"))
      allowed = student.get("school") === auth.get("school") && student.get("org") === auth.get("org")
    } catch (err) {
      allowed = false
    }
  }
  if (!allowed) {
    e.record.hide("authorization_registered")
    e.record.hide("authorization_record")
    return e.next()
  }
  lib.writeAudit(auth.id, "sensitive_read", e.record.id, {
    student: e.record.get("student"),
    org: e.record.get("org"),
    fields: "authorization_registered,authorization_record",
  })
  return e.next()
}, "parent_student_bindings")
