// 志愿者档案未登记完，不能授予查看或录入学情的权限。系统不做资格认定。

onRecordCreateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (!auth) return e.next()
  lib.prepareVolunteerProfile(auth, e.record)
  return e.next()
}, "teacher_profiles")

onRecordUpdateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (!auth) return e.next()
  const original = e.record.original()
  e.record.set("user", original.get("user"))
  lib.prepareVolunteerProfile(auth, e.record)
  return e.next()
}, "teacher_profiles")

onRecordViewRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (auth && (lib.rankOf(auth) === "school_admin" || lib.rankOf(auth) === "org_admin")) {
    lib.writeAudit(auth.id, "volunteer_view", e.record.id, { org: e.record.get("org"), user: e.record.get("user") })
  }
  return e.next()
}, "teacher_profiles")

onRecordsListRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (auth && e.result && e.result.items && (lib.rankOf(auth) === "school_admin" || lib.rankOf(auth) === "org_admin")) {
    for (let i = 0; i < e.result.items.length; i += 1) {
      const record = e.result.items[i]
      lib.writeAudit(auth.id, "volunteer_view", record.id, { org: auth.get("org"), user: record.get("user") })
    }
  }
  return e.next()
}, "teacher_profiles")
