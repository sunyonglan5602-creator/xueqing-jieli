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
    must_change_password: record.get("must_change_password") === true,
  }
}

function writeAudit(actorId, action, targetId, detail) {
  const collection = $app.findCollectionByNameOrId("audit_logs")
  const record = new Record(collection, {
    actor: actorId,
    action,
    target_id: targetId || "",
    detail: detail || {},
  })
  $app.save(record)
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

module.exports = {
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
  ],
  rolesOf,
  rankOf,
  lockedUntil,
  requestPath,
  currentUser,
  requireReadyUser,
  publicUser,
  writeAudit,
  accountsInScope,
  accountScope,
  targetInScope,
  noteFailure,
}
