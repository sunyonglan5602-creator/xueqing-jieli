// 转班、升级、转校只追加在班记录。学生编号生成后不能改。

onRecordCreate((e) => {
  const schoolId = e.record.get("school")
  if (schoolId && !e.record.get("school_ids")) e.record.set("school_ids", "," + schoolId + ",")
  return e.next()
}, "students")

routerAdd("POST", "/api/xueqing/enrollments", (e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const body = e.requestInfo().body || {}
  return e.json(200, lib.moveStudent(auth, body))
})
