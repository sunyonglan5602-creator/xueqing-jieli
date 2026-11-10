// 五级可见范围、任课授权到期、协会查看学生明细须学校同意。

onRecordCreate((e) => {
  if (!e.record.get("cross_subject_view")) e.record.set("cross_subject_view", "打开")
  return e.next()
}, "schools")

onRecordUpdateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  const original = e.record.original()
  if (!auth || lib.rankOf(auth) !== "school_admin" || auth.get("school") !== e.record.id) {
    e.record.set("cross_subject_view", original.get("cross_subject_view") || "打开")
  }
  if (!e.record.get("cross_subject_view")) e.record.set("cross_subject_view", "打开")
  return e.next()
}, "schools")

onRecordCreateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (!auth) return e.next()
  lib.prepareMembership(auth, e.record)
  return e.next()
}, "class_memberships")

onRecordAfterCreateSuccess((e) => {
  const lib = require(__hooks + "/lib.js")
  lib.refreshRoster(e.record.get("student"))
}, "class_memberships")

onRecordCreateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (!auth) return e.next()
  lib.prepareAssignment(auth, e.record)
  return e.next()
}, "teaching_assignments")

onRecordUpdateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (!auth) return e.next()
  const original = e.record.original()
  e.record.set("org", original.get("org"))
  e.record.set("school", original.get("school"))
  lib.prepareAssignment(auth, e.record)
  return e.next()
}, "teaching_assignments")

onRecordAfterCreateSuccess((e) => {
  const lib = require(__hooks + "/lib.js")
  lib.refreshClassTeachers(e.record.get("class"))
}, "teaching_assignments")

onRecordAfterUpdateSuccess((e) => {
  const lib = require(__hooks + "/lib.js")
  lib.refreshClassTeachers(e.record.get("class"))
  try {
    const previous = e.record.original().get("class")
    if (previous && previous !== e.record.get("class")) lib.refreshClassTeachers(previous)
  } catch (err) {
    return e.next()
  }
  return e.next()
}, "teaching_assignments")

onRecordCreateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (!auth) return e.next()
  lib.prepareGrant(auth, e.record)
  return e.next()
}, "detail_grants")

onRecordUpdateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (!auth) return e.next()
  const original = e.record.original()
  e.record.set("org", original.get("org"))
  e.record.set("school", original.get("school"))
  e.record.set("granted_by", original.get("granted_by"))
  lib.prepareGrant(auth, e.record)
  return e.next()
}, "detail_grants")

onRecordAfterCreateSuccess((e) => {
  const lib = require(__hooks + "/lib.js")
  lib.refreshDetailUntil(e.record.get("school"))
}, "detail_grants")

onRecordAfterUpdateSuccess((e) => {
  const lib = require(__hooks + "/lib.js")
  lib.refreshDetailUntil(e.record.get("school"))
}, "detail_grants")

onRecordAfterCreateSuccess((e) => {
  const lib = require(__hooks + "/lib.js")
  lib.refreshDetailUntil(e.record.get("school"))
}, "students")

onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  throw new NotFoundError("不存在")
}, "wuyu_records")

function listed(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (auth && lib.rankOf(auth) === "org_admin" && !lib.anyGrant(auth)) throw new NotFoundError("不存在")
  const source = e.result && e.result.items ? e.result.items : []
  const items = []
  for (let i = 0; i < source.length; i += 1) {
    const record = source[i]
    if (auth && !lib.canRead(auth, record)) continue
    items.push(record)
  }
  if (e.result) {
    e.result.items = items
    e.result.totalItems = items.length
  }
  if (auth && lib.rankOf(auth) === "org_admin") {
    for (const record of items) {
      const name = record.collection().name
      if (name !== "students" && name !== "learning_records") continue
      const studentId = name === "students" ? record.id : record.get("student")
      lib.writeAudit(auth.id, "student_detail_view", record.id, { student: studentId, org: auth.get("org") })
    }
  }
  return e.next()
}

onRecordsListRequest(listed, "students")
onRecordsListRequest(listed, "learning_records")
onRecordsListRequest(listed, "class_memberships")

function auditDetailView(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (auth && lib.rankOf(auth) === "org_admin") {
    const name = e.record.collection().name
    const studentId = name === "students" ? e.record.id : e.record.get("student")
    lib.writeAudit(auth.id, "student_detail_view", e.record.id, {
      student: studentId,
      org: e.record.get("org"),
    })
  }
  return e.next()
}

onRecordViewRequest(auditDetailView, "students")
onRecordViewRequest(auditDetailView, "learning_records")

routerAdd("GET", "/api/xueqing/class-records", (e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const info = e.requestInfo()
  const query = info.query || {}
  const readQuery = (key) => {
    if (typeof query.get === "function") return String(query.get(key) || "")
    return String(query[key] || "")
  }
  let klass = null
  try {
    klass = $app.findRecordById("classes", readQuery("classId"))
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (!lib.canReadClassHistory(auth, klass)) throw new NotFoundError("不存在")
  const on = readQuery("on")
  if (!on) throw new BadRequestError("请填写日期")
  const rows = $app.findRecordsByFilter("learning_records", "class = {:class} && org = {:org}", "created", 0, 0, {
    class: klass.id,
    org: klass.get("org"),
  })
  const items = []
  for (const row of rows) {
    if (!lib.classRecordVisible(row, on)) continue
    items.push({
      id: row.id,
      uid: row.get("uid"),
      student: row.get("student"),
      class: row.get("class"),
      subject: row.get("subject") || "",
      body: row.get("body"),
      created: toString(row.get("created")),
    })
  }
  return e.json(200, { items })
})
