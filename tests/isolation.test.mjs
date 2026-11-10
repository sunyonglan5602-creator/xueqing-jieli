import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { api, login, startPocketBase } from "./pb.mjs"

const PASSWORD = "Demo-Pass-0000"
const UID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
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

async function asSuper(path, options = {}) {
  return api(pb.base, path, { ...options, token: superToken })
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

test("P0-02 跨租户不可读，家长只读已生效的孩子，其他照料人未登记授权书不能生效", async () => {
  const orgA = (await asSuper("/api/collections/organizations/records", { method: "POST", body: { name: "演示协会甲" } })).data
  const orgB = (await asSuper("/api/collections/organizations/records", { method: "POST", body: { name: "演示协会乙" } })).data
  const schoolA = (await asSuper("/api/collections/schools/records", {
    method: "POST",
    body: { name: "演示小学甲", org: orgA.id, division_code: "000000", township: "演示乡", area: "演示片区" },
  })).data
  assert.equal(schoolA.division_code, "000000")
  assert.equal(schoolA.township, "演示乡")
  assert.equal(schoolA.area, "演示片区")
  const schoolEmpty = (await asSuper("/api/collections/schools/records", {
    method: "POST",
    body: { name: "演示小学甲二", org: orgA.id },
  })).data
  assert.equal(schoolEmpty.division_code, "")
  const schoolB = (await asSuper("/api/collections/schools/records", {
    method: "POST",
    body: { name: "演示小学乙", org: orgB.id },
  })).data

  const adminA = await createUser({
    username: "school-a",
    display_name: "演示小学甲管理员",
    roles: ["school_admin"],
    org: orgA.id,
    school: schoolA.id,
  })
  const teacherA = await createUser({
    username: "teacher-a",
    display_name: "演示老师甲",
    roles: ["teacher"],
    org: orgA.id,
    school: schoolA.id,
  })
  const adminB = await createUser({
    username: "school-b",
    display_name: "演示小学乙管理员",
    roles: ["school_admin"],
    org: orgB.id,
    school: schoolB.id,
  })
  const platform = await createUser({
    username: "platform-a",
    display_name: "演示平台管理员",
    roles: ["platform_admin"],
  })
  const parentA = await createUser({ username: "parent-a", display_name: "演示家长甲", roles: ["parent"] })
  const parentB = await createUser({ username: "parent-b", display_name: "演示家长乙", roles: ["parent"] })
  const parentC = await createUser({ username: "parent-c", display_name: "演示家长丙", roles: ["parent"] })
  const edu = await createUser({ username: "edu-a", display_name: "演示教育局查看者", roles: ["education_bureau_viewer"] })

  const tokenA = (await login(pb.base, "school-a", PASSWORD)).data.token
  const tokenTeacher = (await login(pb.base, "teacher-a", PASSWORD)).data.token
  const tokenB = (await login(pb.base, "school-b", PASSWORD)).data.token
  const tokenPlatform = (await login(pb.base, "platform-a", PASSWORD)).data.token
  const tokenParentA = (await login(pb.base, "parent-a", PASSWORD)).data.token
  const tokenParentB = (await login(pb.base, "parent-b", PASSWORD)).data.token
  const tokenParentC = (await login(pb.base, "parent-c", PASSWORD)).data.token
  const tokenEdu = (await login(pb.base, "edu-a", PASSWORD)).data.token

  const classA = await api(pb.base, "/api/collections/classes/records", {
    token: tokenA,
    method: "POST",
    body: { name: "演示一班", school: schoolA.id, org: orgB.id, grades: ["三年级"] },
  })
  assert.equal(classA.status, 200, JSON.stringify(classA.data))
  assert.equal(classA.data.org, orgA.id)
  const classA2 = (await api(pb.base, "/api/collections/classes/records", {
    token: tokenA,
    method: "POST",
    body: { name: "演示二班", school: schoolA.id, org: orgA.id, grades: ["三年级"] },
  })).data
  const classB = (await api(pb.base, "/api/collections/classes/records", {
    token: tokenB,
    method: "POST",
    body: { name: "演示乙班", school: schoolB.id, org: orgB.id, grades: ["三年级"] },
  })).data
  const forged = await api(pb.base, "/api/collections/students/records", {
    token: tokenA,
    method: "POST",
    body: {
      display_name: "演示生01",
      grade: "三年级",
      current_class: classA.data.id,
      school: schoolA.id,
      org: orgB.id,
      uid: "00000000-0000-7000-8000-000000000000",
    },
  })
  assert.equal(forged.status, 200, JSON.stringify(forged.data))
  assert.equal(forged.data.org, orgA.id)
  assert.notEqual(forged.data.uid, "00000000-0000-7000-8000-000000000000")
  assert.match(forged.data.uid, UID_PATTERN)
  const studentA = forged.data
  const studentA2 = (await api(pb.base, "/api/collections/students/records", {
    token: tokenA,
    method: "POST",
    body: { display_name: "演示生02", grade: "三年级", current_class: classA2.id, school: schoolA.id, org: orgA.id, uid: "00000000-0000-7000-8000-000000000001" },
  })).data
  const studentB = (await api(pb.base, "/api/collections/students/records", {
    token: tokenB,
    method: "POST",
    body: { display_name: "演示生01", grade: "三年级", current_class: classB.id, school: schoolB.id, org: orgB.id, uid: "00000000-0000-7000-8000-000000000002" },
  })).data
  assert.notEqual(studentA.uid, studentB.uid)
  const enrolled = await api(pb.base, "/api/collections/class_memberships/records", {
    token: tokenA,
    method: "POST",
    body: { student: studentA.id, class: classA.data.id, org: orgA.id },
  })
  assert.equal(enrolled.status, 200, JSON.stringify(enrolled.data))
  const duty = await api(pb.base, "/api/collections/teaching_assignments/records", {
    token: tokenA,
    method: "POST",
    body: { class: classA.data.id, teacher: teacherA.id, subject: "语文", school: schoolA.id, org: orgA.id },
  })
  assert.equal(duty.status, 200, JSON.stringify(duty.data))

  for (const path of [
    `/api/collections/students/records/${studentA.id}`,
    `/api/collections/schools/records/${schoolA.id}`,
    `/api/collections/classes/records/${classA.data.id}`,
    `/api/collections/organizations/records/${orgA.id}`,
  ]) {
    const read = await api(pb.base, path, { token: tokenB })
    assert.equal(read.status, 404, path + JSON.stringify(read.data))
    assert.match(read.data.message, /^不存在/)
    const update = await api(pb.base, path, { token: tokenB, method: "PATCH", body: { name: "被改掉", display_name: "被改掉" } })
    assert.equal(update.status, 404, path)
    assert.match(update.data.message, /^不存在/)
    const remove = await api(pb.base, path, { token: tokenB, method: "DELETE" })
    assert.equal(remove.status, 404, path)
    assert.match(remove.data.message, /^不存在/)
  }
  const listed = await api(pb.base, "/api/collections/students/records", { token: tokenB })
  assert.equal(listed.data.items.some((item) => item.id === studentA.id), false)
  const searched = await api(pb.base, "/api/collections/students/records?filter=" + encodeURIComponent("display_name='演示生01'"), { token: tokenB })
  assert.equal(searched.data.items.length, 1)
  assert.equal(searched.data.items[0].id, studentB.id)
  const platformStudents = await api(pb.base, "/api/collections/students/records", { token: tokenPlatform })
  assert.equal(platformStudents.data.items.length, 0)
  const platformOne = await api(pb.base, `/api/collections/students/records/${studentA.id}`, { token: tokenPlatform })
  assert.equal(platformOne.status, 404)
  assert.match(platformOne.data.message, /^不存在/)
  const eduStudents = await api(pb.base, `/api/collections/students/records/${studentA.id}`, { token: tokenEdu })
  assert.equal(eduStudents.status, 404)

  const legal = await api(pb.base, "/api/collections/parent_student_bindings/records", {
    token: tokenA,
    method: "POST",
    body: { parent: parentA.id, student: studentA.id, status: "已生效", relationship_type: "法定监护人", org: orgB.id },
  })
  assert.equal(legal.status, 200, JSON.stringify(legal.data))
  assert.equal(legal.data.org, orgA.id)
  const secondGuardian = await api(pb.base, "/api/collections/parent_student_bindings/records", {
    token: tokenA,
    method: "POST",
    body: { parent: parentC.id, student: studentA.id, status: "待核实", relationship_type: "法定监护人", org: orgA.id },
  })
  assert.equal(secondGuardian.status, 200, JSON.stringify(secondGuardian.data))
  const pending = await api(pb.base, "/api/collections/parent_student_bindings/records", {
    token: tokenA,
    method: "POST",
    body: { parent: parentA.id, student: studentA2.id, status: "待核实", relationship_type: "法定监护人", org: orgA.id },
  })
  assert.equal(pending.status, 200, JSON.stringify(pending.data))

  const blocked = await api(pb.base, "/api/collections/parent_student_bindings/records", {
    token: tokenA,
    method: "POST",
    body: { parent: parentB.id, student: studentA2.id, status: "已生效", relationship_type: "其他照料人", org: orgA.id },
  })
  assert.equal(blocked.status, 400, JSON.stringify(blocked.data))
  assert.match(blocked.data.message, /未登记监护人授权书/)
  const caregiver = await api(pb.base, "/api/collections/parent_student_bindings/records", {
    token: tokenA,
    method: "POST",
    body: {
      parent: parentB.id,
      student: studentA2.id,
      status: "待核实",
      relationship_type: "其他照料人",
      authorization_registered: false,
      org: orgA.id,
    },
  })
  assert.equal(caregiver.status, 200, JSON.stringify(caregiver.data))
  const stillBlocked = await api(pb.base, `/api/collections/parent_student_bindings/records/${caregiver.data.id}`, {
    token: tokenA,
    method: "PATCH",
    body: { status: "已生效" },
  })
  assert.equal(stillBlocked.status, 400)
  assert.match(stillBlocked.data.message, /未登记监护人授权书/)
  const registered = await api(pb.base, `/api/collections/parent_student_bindings/records/${caregiver.data.id}`, {
    token: tokenA,
    method: "PATCH",
    body: { authorization_registered: true },
  })
  assert.equal(registered.status, 200, JSON.stringify(registered.data))
  const activated = await api(pb.base, `/api/collections/parent_student_bindings/records/${caregiver.data.id}`, {
    token: tokenA,
    method: "PATCH",
    body: { status: "已生效" },
  })
  assert.equal(activated.status, 200, JSON.stringify(activated.data))
  const registerAudit = await api(pb.base, "/api/collections/audit_logs/records?filter=" + encodeURIComponent("action='authorization_register'"), {
    token: tokenA,
  })
  assert.ok(registerAudit.data.items.length >= 1, JSON.stringify(registerAudit.data))

  const hidden = await api(pb.base, `/api/collections/parent_student_bindings/records/${legal.data.id}`, { token: tokenTeacher })
  assert.equal(hidden.status, 200, JSON.stringify(hidden.data))
  assert.equal(Object.hasOwn(hidden.data, "authorization_record"), false)
  assert.equal(Object.hasOwn(hidden.data, "authorization_registered"), false)
  const visible = await api(pb.base, `/api/collections/parent_student_bindings/records/${caregiver.data.id}`, { token: tokenA })
  assert.equal(visible.data.authorization_registered, true)
  assert.ok(visible.data.authorization_record)

  const parentSees = await api(pb.base, `/api/collections/students/records/${studentA.id}`, { token: tokenParentA })
  assert.equal(parentSees.status, 200, JSON.stringify(parentSees.data))
  const parentPending = await api(pb.base, `/api/collections/students/records/${studentA2.id}`, { token: tokenParentA })
  assert.equal(parentPending.status, 404)
  assert.match(parentPending.data.message, /^不存在/)
  const parentOther = await api(pb.base, `/api/collections/students/records/${studentA.id}`, { token: tokenParentB })
  assert.equal(parentOther.status, 404)
  const parentWaiting = await api(pb.base, `/api/collections/students/records/${studentA.id}`, { token: tokenParentC })
  assert.equal(parentWaiting.status, 404)
  const parentCross = await api(pb.base, `/api/collections/students/records/${studentB.id}`, { token: tokenParentA })
  assert.equal(parentCross.status, 404)

  const revoked = await api(pb.base, `/api/collections/parent_student_bindings/records/${caregiver.data.id}`, {
    token: tokenA,
    method: "PATCH",
    body: { authorization_registered: false },
  })
  assert.equal(revoked.status, 400)
  const unbound = await api(pb.base, `/api/collections/parent_student_bindings/records/${caregiver.data.id}`, {
    token: tokenA,
    method: "PATCH",
    body: { status: "已解绑", authorization_registered: false },
  })
  assert.equal(unbound.status, 200, JSON.stringify(unbound.data))
  const revokeAudit = await api(pb.base, "/api/collections/audit_logs/records?filter=" + encodeURIComponent("action='authorization_revoke'"), {
    token: tokenA,
  })
  assert.equal(revokeAudit.data.items.length, 1, JSON.stringify(revokeAudit.data))
  const afterUnbind = await api(pb.base, `/api/collections/students/records/${studentA2.id}`, { token: tokenParentB })
  assert.equal(afterUnbind.status, 404)

  const created = await api(pb.base, "/api/collections/learning_records/records", {
    token: tokenTeacher,
    method: "POST",
      body: { student: studentA.id, body: "演示记录第一版", org: orgB.id, version: 9, uid: "00000000-0000-7000-8000-000000000099" },
  })
  assert.equal(created.status, 200, JSON.stringify(created.data))
  assert.equal(created.data.org, orgA.id)
  assert.equal(created.data.version, 1)
  assert.match(created.data.uid, UID_PATTERN)
  assert.equal(created.data.author, teacherA.id)
  const overwritten = await api(pb.base, `/api/collections/learning_records/records/${created.data.id}`, {
    token: tokenTeacher,
    method: "PATCH",
    body: { body: "被静默覆盖" },
  })
  assert.equal(overwritten.status, 400)
  assert.match(overwritten.data.message, /只能追加修订/)
  const revised = await api(pb.base, "/api/collections/learning_records/records", {
    token: tokenTeacher,
    method: "POST",
    body: { student: studentB.id, body: "演示记录修订", previous_uid: created.data.uid, org: orgA.id, version: 1, uid: "00000000-0000-7000-8000-000000000099" },
  })
  assert.equal(revised.status, 200, JSON.stringify(revised.data))
  assert.equal(revised.data.version, 2)
  assert.equal(revised.data.student, studentA.id)
  assert.notEqual(revised.data.uid, created.data.uid)
  const original = await api(pb.base, `/api/collections/learning_records/records/${created.data.id}`, { token: tokenTeacher })
  assert.equal(original.data.body, "演示记录第一版")
  const crossRevise = await api(pb.base, "/api/collections/learning_records/records", {
    token: tokenB,
    method: "POST",
    body: { body: "越权修订", previous_uid: created.data.uid, student: studentB.id, org: orgB.id, version: 1, uid: "00000000-0000-7000-8000-000000000098" },
  })
  assert.equal(crossRevise.status, 404)
  assert.match(crossRevise.data.message, /^不存在/)

  assert.ok(adminA.id && adminB.id && edu.id && schoolEmpty.id)
})
