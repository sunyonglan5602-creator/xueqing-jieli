// 老师类型只用于筛选和分组；学校区划、乡镇、片区可空，可查询可导出。

routerAdd("POST", "/api/xueqing/teacher-types", (e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const rank = lib.rankOf(auth)
  if (rank !== "school_admin" && rank !== "org_admin") throw new NotFoundError("不存在")
  const body = e.requestInfo().body || {}
  const teacherType = String(body.teacherType || "").trim()
  if (lib.TEACHER_TYPES.indexOf(teacherType) < 0) throw new BadRequestError("请选择老师类型")
  let target = null
  try {
    target = $app.findRecordById("users", String(body.userId || ""))
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (target.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
  if (rank === "school_admin" && target.get("school") !== auth.get("school")) throw new NotFoundError("不存在")
  if (lib.rolesOf(target).indexOf("teacher") < 0) throw new BadRequestError("只有老师需要选择类型")
  const previous = target.get("teacher_type") || ""
  if (previous === teacherType) throw new BadRequestError("类型没有变化")
  target.set("teacher_type", teacherType)
  $app.save(target)
  lib.writeAudit(auth.id, "teacher_type_changed", target.id, {
    org: target.get("org"),
    from: previous,
    to: teacherType,
  })
  return e.json(200, { user: lib.publicUser(target) })
})

routerAdd("GET", "/api/xueqing/teacher-types", (e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const rank = lib.rankOf(auth)
  if (rank !== "school_admin" && rank !== "org_admin") throw new NotFoundError("不存在")
  let filter = "roles ~ {:role} && org = {:org}"
  const params = { role: "teacher", org: auth.get("org") }
  if (rank === "school_admin") {
    filter += " && school = {:school}"
    params.school = auth.get("school")
  }
  const teachers = $app.findRecordsByFilter("users", filter, "username", 0, 0, params)
  const type = lib.readQuery(e, "type")
  const groups = []
  for (const name of lib.TEACHER_TYPES) {
    let count = 0
    for (const teacher of teachers) if ((teacher.get("teacher_type") || "") === name) count += 1
    groups.push({ type: name, count })
  }
  const items = []
  for (const teacher of teachers) {
    if (type && (teacher.get("teacher_type") || "") !== type) continue
    items.push(lib.publicUser(teacher))
  }
  return e.json(200, { items, groups })
})

routerAdd("GET", "/api/xueqing/school-query", (e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  return e.json(200, { items: lib.matchedSchools(auth, lib.readQuery(e, "township"), lib.readQuery(e, "area")) })
})

routerAdd("GET", "/api/xueqing/school-export", (e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const township = lib.readQuery(e, "township")
  const area = lib.readQuery(e, "area")
  const items = lib.matchedSchools(auth, township, area)
  const lines = ["学校名称,行政区划代码,所属乡镇,所属片区"]
  for (const item of items) {
    lines.push([item.name, item.division_code, item.township, item.area].map(lib.csvCell).join(","))
  }
  lib.writeAudit(auth.id, "school_export", auth.get("org") || "", {
    org: auth.get("org") || "",
    township,
    area,
    count: items.length,
  })
  e.response.header().set("Content-Type", "text/csv; charset=utf-8")
  return e.string(200, "\uFEFF" + lines.join("\n"))
})
