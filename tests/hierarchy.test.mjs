import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { api, login, registerConsent, registerVolunteer, startPocketBase } from "./pb.mjs"

const PASSWORD = "Demo-Pass-0000"
let pb
let superToken

before(async () => {
  pb = await startPocketBase()
  const auth = await login(pb.base, pb.email, pb.password, "_superusers")
  assert.equal(auth.status, 200, JSON.stringify(auth.data))
  superToken = auth.data.token
})

after(async () => {
  if (pb) await pb.stop()
})

async function asSuper(urlPath, options = {}) {
  return api(pb.base, urlPath, { ...options, token: superToken })
}

async function createUser(fields) {
  const response = await asSuper("/api/collections/users/records", {
    method: "POST",
    body: {
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
      ...fields,
    },
  })
  assert.equal(response.status, 200, JSON.stringify(response.data))
  return response.data
}

test("P0-30 同协会内学校和班级互相隔离，P0-03 授权到期并审计协会查看", async () => {
  const bindingCollection = await asSuper("/api/collections/parent_student_bindings")
  const statusField = bindingCollection.data.fields.find((field) => field.name === "status")
  assert.deepEqual(statusField.values, ["待核实", "已生效", "已撤回", "已解绑"])

  const orgA = (await asSuper("/api/collections/organizations/records", { method: "POST", body: { name: "层级协会甲" } })).data
  const orgB = (await asSuper("/api/collections/organizations/records", { method: "POST", body: { name: "层级协会乙" } })).data
  const schools = {}
  for (const [org, prefix] of [[orgA, "a"], [orgB, "b"]]) {
    for (const index of [1, 2]) {
      const school = (await asSuper("/api/collections/schools/records", {
        method: "POST",
        body: { name: `层级${prefix}校${index}`, org: org.id },
      })).data
      assert.equal(school.cross_subject_view, "打开")
      schools[`${prefix}${index}`] = school
    }
  }
  const orgAdminA = await createUser({ username: "hier-org-a", display_name: "层级协会甲负责人", roles: ["org_admin"], org: orgA.id })
  const tokenOrgA = (await login(pb.base, "hier-org-a", PASSWORD)).data.token
  const platform = await createUser({ username: "hier-platform", display_name: "层级平台", roles: ["platform_admin"] })
  const tokenPlatform = (await login(pb.base, "hier-platform", PASSWORD)).data.token
  const edu = await createUser({ username: "hier-edu", display_name: "层级教育局查看者", roles: ["education_bureau_viewer"] })
  const tokenEdu = (await login(pb.base, "hier-edu", PASSWORD)).data.token

  const admins = {}
  const teachers = {}
  const classes = {}
  const students = {}
  for (const key of Object.keys(schools)) {
    const school = schools[key]
    const org = key.startsWith("a") ? orgA.id : orgB.id
    admins[key] = await createUser({
      username: `hier-school-${key}`,
      display_name: `${key}管理员`,
      roles: ["school_admin"],
      org,
      school: school.id,
    })
    const token = (await login(pb.base, `hier-school-${key}`, PASSWORD)).data.token
    admins[key].token = token
    for (const classNo of [1, 2]) {
      const classKey = `${key}-${classNo}`
      const created = await api(pb.base, "/api/collections/classes/records", {
        token,
        method: "POST",
        body: { name: `层级${classKey}班`, school: school.id, org, grades: ["三年级"] },
      })
      assert.equal(created.status, 200, JSON.stringify(created.data))
      classes[classKey] = created.data
      teachers[classKey] = await createUser({
        username: `hier-teacher-${classKey}`,
        display_name: `${classKey}老师`,
        roles: ["teacher"],
        org,
        school: school.id,
      })
      const student = await api(pb.base, "/api/collections/students/records", {
        token,
        method: "POST",
        body: { display_name: `层级生${classKey}`, grade: "三年级", current_class: created.data.id, school: school.id, org, uid: "00000000-0000-7000-8000-000000000099" },
      })
      assert.equal(student.status, 200, JSON.stringify(student.data))
      students[classKey] = student.data
      const membership = await api(pb.base, "/api/collections/class_memberships/records", {
        token,
        method: "POST",
        body: { student: student.data.id, class: created.data.id, org, started_on: "2020-01-01 00:00:00.000Z" },
      })
      assert.equal(membership.status, 200, JSON.stringify(membership.data))
      const volunteer = await registerVolunteer(pb.base, token, teachers[classKey].id)
      assert.equal(volunteer.status, 200, classKey + JSON.stringify(volunteer.data))
      const duty = await api(pb.base, "/api/collections/teaching_assignments/records", {
        token,
        method: "POST",
        body: { class: created.data.id, teacher: teachers[classKey].id, subject: "语文", school: school.id, org },
      })
      assert.equal(duty.status, 200, JSON.stringify(duty.data))
      teachers[classKey].token = (await login(pb.base, `hier-teacher-${classKey}`, PASSWORD)).data.token
      teachers[classKey].duty = duty.data.id
    }
  }

  const tokenA11 = teachers["a1-1"].token
  const foreign = [students["a1-2"], students["a2-1"], students["b1-1"], students["b2-2"]]
  for (const student of foreign) {
    const read = await api(pb.base, `/api/collections/students/records/${student.id}`, { token: tokenA11 })
    assert.equal(read.status, 404, JSON.stringify(read.data))
    assert.match(read.data.message, /^不存在/)
  }
  const ownList = await api(pb.base, "/api/collections/students/records", { token: tokenA11 })
  assert.equal(ownList.status, 200, JSON.stringify(ownList.data))
  assert.deepEqual(ownList.data.items.map((item) => item.id), [students["a1-1"].id])
  const otherSchool = await api(pb.base, `/api/collections/students/records/${students["a2-1"].id}`, { token: admins["a1"].token })
  assert.equal(otherSchool.status, 404)
  assert.match(otherSchool.data.message, /^不存在/)
  const schoolList = await api(pb.base, "/api/collections/students/records", { token: admins["a1"].token })
  assert.equal(schoolList.data.items.some((item) => item.id === students["a2-1"].id), false)
  assert.equal(schoolList.data.items.some((item) => item.id === students["a1-1"].id), true)
  const otherClass = await api(pb.base, `/api/collections/schools/records/${schools["a2"].id}`, { token: tokenA11 })
  assert.equal(otherClass.status, 404)

  const noGrant = await api(pb.base, "/api/collections/students/records", { token: tokenOrgA })
  assert.equal(noGrant.status, 404, JSON.stringify(noGrant.data))
  assert.match(noGrant.data.message, /^不存在/)
  const noGrantOne = await api(pb.base, `/api/collections/students/records/${students["a1-1"].id}`, { token: tokenOrgA })
  assert.equal(noGrantOne.status, 404)
  assert.match(noGrantOne.data.message, /^不存在/)

  const grant = await api(pb.base, "/api/collections/detail_grants/records", {
    token: admins["a1"].token,
    method: "POST",
    body: { school: schools["a1"].id, valid_until: "2099-01-01 00:00:00.000Z" },
  })
  assert.equal(grant.status, 200, JSON.stringify(grant.data))
  const allowed = await api(pb.base, `/api/collections/students/records/${students["a1-1"].id}`, { token: tokenOrgA })
  assert.equal(allowed.status, 200, JSON.stringify(allowed.data))
  const stillHidden = await api(pb.base, `/api/collections/students/records/${students["a2-1"].id}`, { token: tokenOrgA })
  assert.equal(stillHidden.status, 404)
  const again = await api(pb.base, `/api/collections/students/records/${students["a1-1"].id}`, { token: tokenOrgA })
  assert.equal(again.status, 200)
  const views = await api(pb.base, "/api/xueqing/audits?student=" + students["a1-1"].id, { token: tokenOrgA })
  const detailViews = views.data.items.filter((item) => item.action === "student_detail_view" && item.actor === orgAdminA.id)
  assert.ok(detailViews.length >= 2, JSON.stringify(views.data))

  const expired = await api(pb.base, `/api/collections/detail_grants/records/${grant.data.id}`, {
    token: admins["a1"].token,
    method: "PATCH",
    body: { valid_until: "2000-01-01 00:00:00.000Z" },
  })
  assert.equal(expired.status, 200, JSON.stringify(expired.data))
  const afterExpiry = await api(pb.base, `/api/collections/students/records/${students["a1-1"].id}`, { token: tokenOrgA })
  assert.equal(afterExpiry.status, 404)
  assert.match(afterExpiry.data.message, /^不存在/)

  const renewed = await api(pb.base, `/api/collections/detail_grants/records/${grant.data.id}`, {
    token: admins["a1"].token,
    method: "PATCH",
    body: { valid_until: "2099-01-01 00:00:00.000Z" },
  })
  assert.equal(renewed.status, 200, JSON.stringify(renewed.data))

  const math = await createUser({
    username: "hier-math",
    display_name: "数学老师",
    roles: ["teacher"],
    org: orgA.id,
    school: schools["a1"].id,
  })
  const mathVolunteer = await registerVolunteer(pb.base, admins["a1"].token, math.id)
  assert.equal(mathVolunteer.status, 200, JSON.stringify(mathVolunteer.data))
  const mathDuty = await api(pb.base, "/api/collections/teaching_assignments/records", {
    token: admins["a1"].token,
    method: "POST",
    body: { class: classes["a1-1"].id, teacher: math.id, subject: "数学", school: schools["a1"].id, org: orgA.id },
  })
  assert.equal(mathDuty.status, 200, JSON.stringify(mathDuty.data))
  const tokenMath = (await login(pb.base, "hier-math", PASSWORD)).data.token
  const closed = await api(pb.base, `/api/collections/schools/records/${schools["a1"].id}`, {
    token: admins["a1"].token,
    method: "PATCH",
    body: { cross_subject_view: "关闭" },
  })
  assert.equal(closed.status, 200, JSON.stringify(closed.data))
  assert.equal(closed.data.cross_subject_view, "关闭")
  const consent = await registerConsent(pb.base, admins["a1"].token, students["a1-1"].id)
  assert.equal(consent.status, 200, JSON.stringify(consent.data))
  const chinese = await api(pb.base, "/api/collections/learning_records/records", {
    token: tokenA11,
    method: "POST",
    body: { student: students["a1-1"].id, subject: "语文", body: "语文记录", org: orgB.id, version: 9, uid: "00000000-0000-7000-8000-000000000099" },
  })
  assert.equal(chinese.status, 200, JSON.stringify(chinese.data))
  assert.equal(chinese.data.class, classes["a1-1"].id)
  assert.equal(chinese.data.subject, "语文")
  const mathSees = await api(pb.base, `/api/collections/learning_records/records/${chinese.data.id}`, { token: tokenMath })
  assert.equal(mathSees.status, 404, JSON.stringify(mathSees.data))
  assert.match(mathSees.data.message, /^不存在/)
  const opened = await api(pb.base, `/api/collections/schools/records/${schools["a1"].id}`, {
    token: admins["a1"].token,
    method: "PATCH",
    body: { cross_subject_view: "打开" },
  })
  assert.equal(opened.status, 200, JSON.stringify(opened.data))
  const mathSeesNow = await api(pb.base, `/api/collections/learning_records/records/${chinese.data.id}`, { token: tokenMath })
  assert.equal(mathSeesNow.status, 200, JSON.stringify(mathSeesNow.data))
  const rewritten = await api(pb.base, "/api/collections/learning_records/records", {
    token: tokenMath,
    method: "POST",
    body: { previous_uid: chinese.data.uid, body: "数学老师改语文", student: students["b1-1"].id, org: orgA.id, version: 1, uid: "00000000-0000-7000-8000-000000000098" },
  })
  assert.equal(rewritten.status, 400, JSON.stringify(rewritten.data))
  assert.match(rewritten.data.message, /不能修改别人记的记录/)

  const stale = await api(pb.base, `/api/collections/teaching_assignments/records/${teachers["a1-1"].duty}`, {
    token: admins["a1"].token,
    method: "PATCH",
    body: { valid_until: "2000-01-01 00:00:00.000Z", subject: "语文", class: classes["a1-1"].id, teacher: teachers["a1-1"].id },
  })
  assert.equal(stale.status, 200, JSON.stringify(stale.data))
  const lost = await api(pb.base, `/api/collections/students/records/${students["a1-1"].id}`, { token: tokenA11 })
  assert.equal(lost.status, 404, JSON.stringify(lost.data))
  const restored = await api(pb.base, `/api/collections/teaching_assignments/records/${teachers["a1-1"].duty}`, {
    token: admins["a1"].token,
    method: "PATCH",
    body: { valid_until: "2099-01-01 00:00:00.000Z", subject: "语文", class: classes["a1-1"].id, teacher: teachers["a1-1"].id },
  })
  assert.equal(restored.status, 200, JSON.stringify(restored.data))
  const back = await api(pb.base, `/api/collections/students/records/${students["a1-1"].id}`, { token: tokenA11 })
  assert.equal(back.status, 200, JSON.stringify(back.data))

  const duplicate = await api(pb.base, "/api/collections/class_memberships/records", {
    token: admins["a1"].token,
    method: "POST",
    body: { student: students["a1-1"].id, class: classes["a1-2"].id, org: orgA.id },
  })
  assert.equal(duplicate.status, 400, JSON.stringify(duplicate.data))
  assert.match(duplicate.data.message, /学生同一时间只能在一个班/)
  const current = await api(pb.base, "/api/collections/class_memberships/records?filter=" + encodeURIComponent(`student='${students["a1-1"].id}'`), {
    token: admins["a1"].token,
  })
  assert.equal(current.data.items.length, 1, JSON.stringify(current.data))
  const uidBefore = students["a1-1"].uid
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace("T", " ").replace("Z", "Z")
  const moved = await api(pb.base, "/api/collections/class_memberships/records", {
    token: admins["a1"].token,
    method: "POST",
    body: {
      student: students["a1-1"].id,
      class: classes["a1-2"].id,
      org: orgA.id,
      previous_id: current.data.items[0].id,
      started_on: tomorrow,
    },
  })
  assert.equal(moved.status, 200, JSON.stringify(moved.data))
  const oldRow = await api(pb.base, `/api/collections/class_memberships/records/${current.data.items[0].id}`, { token: admins["a1"].token })
  assert.equal(oldRow.status, 200)
  const studentNow = await api(pb.base, `/api/collections/students/records/${students["a1-1"].id}`, { token: admins["a1"].token })
  assert.equal(studentNow.data.uid, uidBefore)
  const today = new Date().toISOString().slice(0, 10)
  const oldRecords = await api(pb.base, `/api/xueqing/class-records?classId=${classes["a1-1"].id}&on=${today}`, { token: admins["a1"].token })
  assert.equal(oldRecords.status, 200, JSON.stringify(oldRecords.data))
  assert.equal(oldRecords.data.items.some((item) => item.id === chinese.data.id), true)
  const newRecords = await api(pb.base, `/api/xueqing/class-records?classId=${classes["a1-2"].id}&on=${today}`, { token: admins["a1"].token })
  assert.equal(newRecords.data.items.some((item) => item.id === chinese.data.id), false)

  for (const path of [
    `/api/collections/students/records/${students["a1-1"].id}`,
    `/api/collections/learning_records/records/${chinese.data.id}`,
    "/api/collections/wuyu_records/records",
    "/api/collections/wuyu_records/records/000000000000000",
  ]) {
    const denied = await api(pb.base, path, { token: tokenPlatform })
    assert.equal(denied.status, 404, path + JSON.stringify(denied.data))
    assert.match(denied.data.message, /^不存在/)
  }
  const wuyuWrite = await api(pb.base, "/api/collections/wuyu_records/records", {
    token: tokenPlatform,
    method: "POST",
    body: { body: "不该写入", org: orgA.id },
  })
  assert.equal(wuyuWrite.status, 404)
  assert.match(wuyuWrite.data.message, /^不存在/)
  const handover = await api(pb.base, "/api/collections/handover_packages/records", {
    token: admins["a1"].token,
    method: "POST",
    body: { title: "层级交接" },
  })
  assert.equal(handover.status, 200, JSON.stringify(handover.data))
  const platformHandover = await api(pb.base, `/api/collections/handover_packages/records/${handover.data.id}`, { token: tokenPlatform })
  assert.equal(platformHandover.status, 404)
  assert.match(platformHandover.data.message, /^不存在/)
  const eduStudent = await api(pb.base, `/api/collections/students/records/${students["a1-1"].id}`, { token: tokenEdu })
  assert.equal(eduStudent.status, 404)
  assert.match(eduStudent.data.message, /^不存在/)
  assert.ok(platform.id && edu.id && orgAdminA.id)
})
