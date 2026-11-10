// 登录、开通、重置口令、不能审核自己发起的交接。
// 钩子函数会在另一份运行时里执行，共用逻辑放在 lib.js。

routerUse((e) => {
  const lib = require(__hooks + "/lib.js")
  const path = lib.requestPath(e)
  if (!path.startsWith("/api/")) return e.next()
  if (path.endsWith("/request-password-reset") || path.endsWith("/confirm-password-reset") || path.endsWith("/request-otp")) {
    throw new BadRequestError("请联系上一级管理员重置口令")
  }
  const auth = lib.currentUser(e)
  if (!auth) return e.next()
  const method = e.request.method
  const own = "/api/collections/users/records/" + auth.id
  const selfService = (method === "GET" || method === "PATCH") && path === own
  const authCall = path.indexOf("/auth-with-password") >= 0 || path.indexOf("/auth-refresh") >= 0
  if (auth.get("must_change_password")) {
    if (authCall || selfService) return e.next()
    throw new ForbiddenError("请先修改初始口令")
  }
  if (authCall || selfService) return e.next()
  const status = lib.orgStatus(auth)
  if (status === "待审核") throw new ForbiddenError("未审核的协会不能进入业务页")
  if (status === "已停用") throw new ForbiddenError("协会已停用")
  if (status === "缺失") throw new ForbiddenError("协会不存在")
  return e.next()
})

onRecordAuthWithPasswordRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  let user = null
  try {
    user = $app.findFirstRecordByFilter("users", "username = {:name}", { name: e.identity })
  } catch (err) {
    user = null
  }
  if (user && lib.lockedUntil(user) > Date.now()) {
    throw new BadRequestError("连续失败次数过多，账号已锁定 15 分钟")
  }
  if (user && lib.lockedUntil(user) > 0) {
    user.set("failed_login_count", 0)
    user.set("locked_until", "")
    $app.save(user)
  }
  try {
    e.next()
  } catch (err) {
    if (!user) throw new BadRequestError("账号或口令不正确")
    if (lib.noteFailure(user)) throw new BadRequestError("连续失败次数过多，账号已锁定 15 分钟")
    throw new BadRequestError("账号或口令不正确")
  }
  if (user) {
    user.set("failed_login_count", 0)
    user.set("locked_until", "")
    $app.save(user)
  }
}, "users")

onRecordUpdateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  if (e.hasSuperuserAuth()) return e.next()
  const original = e.record.original()
  for (const field of lib.PROTECTED_FIELDS) e.record.set(field, original.get(field))
  const passwordChanged = original.get("password") !== e.record.get("password")
  if (passwordChanged && e.auth && e.auth.id === e.record.id) {
    e.record.set("must_change_password", false)
    e.record.set("failed_login_count", 0)
    e.record.set("locked_until", "")
  } else {
    e.record.set("must_change_password", original.get("must_change_password"))
  }
  return e.next()
}, "users")

onRecordCreateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (!auth) return e.next()
  if (!auth.get("org")) throw new BadRequestError("当前账号没有协会")
  try {
    e.record.set("initiator", auth.id)
    e.record.set("org", auth.get("org"))
    if (!e.record.get("school")) e.record.set("school", auth.get("school") || "")
  } catch (err) {
    throw new BadRequestError("交接字段写入失败：" + err)
  }
  return e.next()
}, "handover_packages")

onRecordCreateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (!auth) return e.next()
  let pkg = null
  try {
    pkg = $app.findRecordById("handover_packages", e.record.get("package"))
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (pkg.get("org") !== auth.get("org")) throw new NotFoundError("不存在")
  if (pkg.get("initiator") === auth.id) throw new BadRequestError("不能审核自己发起的交接")
  e.record.set("reviewer", auth.id)
  e.record.set("org", pkg.get("org"))
  return e.next()
}, "handover_reviews")

routerAdd("GET", "/api/xueqing/accounts", (e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const expected = lib.NEXT_RANK[lib.rankOf(auth)]
  if (!expected) throw new ForbiddenError("不能查看下一级账号")
  const items = lib.accountsInScope(auth).filter((record) => lib.rankOf(record) === expected)
  return e.json(200, { items: items.map(lib.publicUser) })
})

routerAdd("POST", "/api/xueqing/accounts", (e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const body = e.requestInfo().body || {}
  const role = lib.NEXT_RANK[lib.rankOf(auth)]
  if (!role) throw new ForbiddenError("不能开通账号")
  const username = String(body.username || "").trim()
  const displayName = String(body.displayName || "").trim()
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(username)) throw new BadRequestError("账号只能用小写字母、数字和短横线")
  if (!displayName || displayName.length > 40) throw new BadRequestError("请填写名称")
  const scope = lib.accountScope(auth, body, role)
  const roles = [role]
  if (role === "school_admin" && body.alsoTeacher === true) roles.push("teacher")
  const teacherType = String(body.teacherType || "").trim()
  if (roles.indexOf("teacher") >= 0 && lib.TEACHER_TYPES.indexOf(teacherType) < 0) {
    throw new BadRequestError("请选择老师类型")
  }
  const password = $security.randomString(12)
  const users = $app.findCollectionByNameOrId("users")
  const data = {
    username,
    display_name: displayName,
    roles,
    org: scope.org,
    school: scope.school,
    must_change_password: true,
    failed_login_count: 0,
    emailVisibility: false,
  }
  if (roles.indexOf("teacher") >= 0) data.teacher_type = teacherType
  const record = new Record(users, data)
  record.setPassword(password)
  try {
    $app.save(record)
  } catch (err) {
    throw new BadRequestError("账号未能开通，请换一个账号名")
  }
  lib.writeAudit(auth.id, "account_opened", record.id, { username, roles })
  return e.json(200, { user: lib.publicUser(record), password })
})

routerAdd("POST", "/api/xueqing/password-resets", (e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const body = e.requestInfo().body || {}
  const expected = lib.NEXT_RANK[lib.rankOf(auth)]
  if (!expected) throw new ForbiddenError("只能重置下一级的口令")
  let target = null
  try {
    target = $app.findRecordById("users", String(body.userId || ""))
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (!lib.targetInScope(auth, target) || lib.rankOf(target) !== expected) throw new NotFoundError("不存在")
  const password = $security.randomString(12)
  target.setPassword(password)
  target.refreshTokenKey()
  target.set("must_change_password", true)
  target.set("failed_login_count", 0)
  target.set("locked_until", "")
  $app.save(target)
  lib.writeAudit(auth.id, "password_reset", target.id, { username: target.get("username") })
  return e.json(200, { userId: target.id, password })
})
