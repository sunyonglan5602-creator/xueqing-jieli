// 审计不能改、不能删；可按人、时间、学生检索；导出要学校管理员批准。

onRecordUpdate(() => {
  throw new BadRequestError("审计日志不能删除")
}, "audit_logs")

onRecordDelete(() => {
  throw new BadRequestError("审计日志不能删除")
}, "audit_logs")

onRecordCreateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (!auth) return e.next()
  if (!auth.get("school")) throw new BadRequestError("请选择学校")
  e.record.set("requester", auth.id)
  e.record.set("org", auth.get("org"))
  e.record.set("school", auth.get("school"))
  e.record.set("status", "待审批")
  return e.next()
}, "export_requests")

onRecordUpdateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (!auth || lib.rankOf(auth) !== "school_admin") throw new NotFoundError("不存在")
  if (e.record.get("org") !== auth.get("org") || e.record.get("school") !== auth.get("school")) {
    throw new NotFoundError("不存在")
  }
  const original = e.record.original()
  e.record.set("requester", original.get("requester"))
  e.record.set("org", original.get("org"))
  e.record.set("school", original.get("school"))
  if (e.record.get("status") === "已批准" || e.record.get("status") === "已驳回") {
    e.record.set("approver", auth.id)
  }
  return e.next()
}, "export_requests")

routerAdd("GET", "/api/xueqing/audits", (e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const rank = lib.rankOf(auth)
  if (rank !== "school_admin" && rank !== "org_admin" && rank !== "platform_admin") {
    throw new ForbiddenError("不能查看审计")
  }
  const info = e.requestInfo()
  const query = info.query || {}
  const readQuery = (key) => {
    if (typeof query.get === "function") return String(query.get(key) || "")
    return String(query[key] || "")
  }
  const actor = readQuery("actor")
  const student = readQuery("student")
  const from = readQuery("from")
  const to = readQuery("to")
  let filter = "id != ''"
  const params = {}
  if (rank === "platform_admin") {
    filter += " && student_ref = ''"
  } else {
    filter += " && org = {:org}"
    params.org = auth.get("org")
  }
  if (actor) {
    filter += " && actor = {:actor}"
    params.actor = actor
  }
  if (student) {
    filter += " && student_ref = {:student}"
    params.student = student
  }
  if (from) {
    filter += " && created >= {:from}"
    params.from = from
  }
  if (to) {
    filter += " && created <= {:to}"
    params.to = to
  }
  const rows = $app.findRecordsByFilter("audit_logs", filter, "-created", 50, 0, params)
  const items = []
  for (const row of rows) {
    items.push({
      id: row.id,
      action: row.get("action"),
      actor: row.get("actor") || "",
      student_ref: row.get("student_ref") || "",
      org: row.get("org") || "",
      created: toString(row.get("created")),
      target_id: row.get("target_id") || "",
    })
  }
  return e.json(200, { items })
})

routerAdd("POST", "/api/xueqing/exports", (e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const body = e.requestInfo().body || {}
  let request = null
  try {
    request = $app.findRecordById("export_requests", String(body.requestId || ""))
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (request.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
  if (request.get("requester") !== auth.id && request.get("approver") !== auth.id) throw new NotFoundError("不存在")
  if (request.get("status") !== "已批准") throw new BadRequestError("导出操作需要学校管理员审批")
  const students = $app.findRecordsByFilter("students", "school = {:school} && org = {:org}", "", 0, 0, {
    school: request.get("school"),
    org: request.get("org"),
  })
  const items = []
  for (const student of students) {
    items.push({
      id: student.id,
      uid: student.get("uid"),
      display_name: student.get("display_name"),
      school: student.get("school"),
    })
  }
  lib.writeAudit(auth.id, "export", request.id, { org: request.get("org"), count: items.length })
  return e.json(200, { students: items })
})
