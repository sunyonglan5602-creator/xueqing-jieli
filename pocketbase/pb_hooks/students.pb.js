// 学生建档：年级、班级、疑似重复、复式班不匹配可填原因，导入出错指出行号，合并只追加。

onRecordCreateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (!auth) return e.next()
  lib.prepareStudent(auth, e.record)
  return e.next()
}, "students")

onRecordUpdateRequest((e) => {
  const original = e.record.original()
  e.record.set("merged_into", original.get("merged_into"))
  e.record.set("confirm_duplicate", false)
  return e.next()
}, "students")

routerAdd("POST", "/api/xueqing/students", (e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  if (lib.rankOf(auth) !== "school_admin") throw new NotFoundError("不存在")
  const body = e.requestInfo().body || {}
  const name = String(body.displayName || "").trim()
  if (!name || name.length > 40) throw new BadRequestError("请填写姓名或代称")
  const students = $app.findCollectionByNameOrId("students")
  const record = new Record(students, {
    display_name: name,
    grade: body.grade || "",
    school: auth.get("school"),
    org: auth.get("org"),
    current_class: body.classId || "",
    mismatch_reason: body.mismatchReason || "",
    confirm_duplicate: body.confirmDuplicate === true,
    active_parent_ids: "",
    uid: lib.uuidv7(),
  })
  lib.prepareStudent(auth, record)
  $app.save(record)
  const memberships = $app.findCollectionByNameOrId("class_memberships")
  const membership = new Record(memberships, {
    student: record.id,
    class: record.get("current_class"),
    org: auth.get("org"),
    started_on: new Date().toISOString(),
  })
  $app.save(membership)
  return e.json(200, { id: record.id, uid: record.get("uid"), grade: record.get("grade") })
})

routerAdd("POST", "/api/xueqing/student-imports", (e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  if (lib.rankOf(auth) !== "school_admin") throw new NotFoundError("不存在")
  const body = e.requestInfo().body || {}
  const ids = lib.importStudents(auth, String(body.classId || ""), String(body.csv || ""))
  return e.json(200, { ids })
})

routerAdd("POST", "/api/xueqing/student-merges", (e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  if (lib.rankOf(auth) !== "school_admin") throw new NotFoundError("不存在")
  const body = e.requestInfo().body || {}
  const id = lib.mergeStudents(auth, String(body.sourceId || ""), String(body.targetId || ""))
  return e.json(200, { id })
})

routerAdd("GET", "/api/xueqing/student-history", (e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  if (lib.rankOf(auth) !== "school_admin") throw new NotFoundError("不存在")
  return e.json(200, lib.studentHistory(auth, lib.readQuery(e, "studentId")))
})
