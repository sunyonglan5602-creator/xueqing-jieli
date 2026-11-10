import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { api, login, startPocketBase } from "./pb.mjs"

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

test("P0-17 审计不可删、可检索，敏感字段读写留痕，导出要审批", async () => {
  const orgA = (await asSuper("/api/collections/organizations/records", { method: "POST", body: { name: "演示协会甲" } })).data
  const orgB = (await asSuper("/api/collections/organizations/records", { method: "POST", body: { name: "演示协会乙" } })).data
  const schoolA = (await asSuper("/api/collections/schools/records", { method: "POST", body: { name: "演示小学甲", org: orgA.id } })).data
  const schoolB = (await asSuper("/api/collections/schools/records", { method: "POST", body: { name: "演示小学乙", org: orgB.id } })).data
  const adminA = await createUser({ username: "audit-school-a", display_name: "演示小学甲管理员", roles: ["school_admin"], org: orgA.id, school: schoolA.id })
  const orgAdmin = await createUser({ username: "audit-org-a", display_name: "演示协会甲负责人", roles: ["org_admin"], org: orgA.id })
  const teacher = await createUser({ username: "audit-teacher-a", display_name: "演示老师甲", roles: ["teacher"], org: orgA.id, school: schoolA.id })
  const adminB = await createUser({ username: "audit-school-b", display_name: "演示小学乙管理员", roles: ["school_admin"], org: orgB.id, school: schoolB.id })
  const platform = await createUser({ username: "audit-platform", display_name: "演示平台管理员", roles: ["platform_admin"] })
  const tokenA = (await login(pb.base, "audit-school-a", PASSWORD)).data.token
  const tokenOrg = (await login(pb.base, "audit-org-a", PASSWORD)).data.token
  const tokenTeacher = (await login(pb.base, "audit-teacher-a", PASSWORD)).data.token
  const tokenB = (await login(pb.base, "audit-school-b", PASSWORD)).data.token
  const tokenPlatform = (await login(pb.base, "audit-platform", PASSWORD)).data.token

  const student = (await api(pb.base, "/api/collections/students/records", {
    token: tokenA,
    method: "POST",
    body: { display_name: "演示生01", school: schoolA.id, org: orgA.id, uid: "00000000-0000-7000-8000-000000000010" },
  })).data
  const other = (await api(pb.base, "/api/collections/students/records", {
    token: tokenB,
    method: "POST",
    body: { display_name: "演示生乙", school: schoolB.id, org: orgB.id, uid: "00000000-0000-7000-8000-000000000011" },
  })).data
  const binding = (await api(pb.base, "/api/collections/parent_student_bindings/records", {
    token: tokenA,
    method: "POST",
    body: {
      parent: teacher.id,
      student: student.id,
      status: "待核实",
      relationship_type: "其他照料人",
      authorization_registered: false,
      org: orgA.id,
    },
  })).data

  const before = await api(pb.base, "/api/xueqing/audits?action=sensitive_read", { token: tokenA })
  const teacherView = await api(pb.base, `/api/collections/parent_student_bindings/records/${binding.id}`, { token: tokenTeacher })
  assert.equal(teacherView.status, 200)
  assert.equal(Object.hasOwn(teacherView.data, "authorization_record"), false)
  const afterTeacher = await api(pb.base, "/api/xueqing/audits", { token: tokenA })
  const teacherReads = (afterTeacher.data.items || []).filter((item) => item.action === "sensitive_read")
  assert.equal(teacherReads.length, (before.data.items || []).filter((item) => item.action === "sensitive_read").length)

  const adminView = await api(pb.base, `/api/collections/parent_student_bindings/records/${binding.id}`, { token: tokenA })
  assert.equal(adminView.status, 200, JSON.stringify(adminView.data))
  assert.equal(adminView.data.authorization_registered, false)
  const reads = await api(pb.base, "/api/xueqing/audits?actor=" + adminA.id, { token: tokenA })
  assert.equal(reads.status, 200, JSON.stringify(reads.data))
  assert.ok(reads.data.items.some((item) => item.action === "sensitive_read" && item.student_ref === student.id))

  const registered = await api(pb.base, `/api/collections/parent_student_bindings/records/${binding.id}`, {
    token: tokenA,
    method: "PATCH",
    body: { authorization_registered: true },
  })
  assert.equal(registered.status, 200, JSON.stringify(registered.data))
  const byStudent = await api(pb.base, "/api/xueqing/audits?student=" + student.id, { token: tokenOrg })
  assert.equal(byStudent.status, 200, JSON.stringify(byStudent.data))
  assert.ok(byStudent.data.items.some((item) => item.action === "authorization_register"))
  assert.ok(byStudent.data.items.some((item) => item.action === "sensitive_read"))

  const future = await api(pb.base, "/api/xueqing/audits?from=" + encodeURIComponent("2099-01-01 00:00:00.000Z"), { token: tokenA })
  assert.equal(future.status, 200, JSON.stringify(future.data))
  assert.equal(future.data.items.length, 0)
  const past = await api(pb.base, "/api/xueqing/audits?from=" + encodeURIComponent("2000-01-01 00:00:00.000Z") + "&to=" + encodeURIComponent("2099-01-01 00:00:00.000Z"), { token: tokenA })
  assert.ok(past.data.items.length >= 2)

  const otherOrg = await api(pb.base, "/api/xueqing/audits?student=" + student.id, { token: tokenB })
  assert.equal(otherOrg.status, 200)
  assert.equal(otherOrg.data.items.length, 0)
  const platformView = await api(pb.base, "/api/xueqing/audits?student=" + student.id, { token: tokenPlatform })
  assert.equal(platformView.data.items.length, 0)

  const auditId = reads.data.items[0].id
  for (const token of [tokenA, tokenOrg, tokenPlatform, superToken]) {
    const removed = await api(pb.base, `/api/collections/audit_logs/records/${auditId}`, { token, method: "DELETE" })
    assert.notEqual(removed.status, 200)
    assert.match(removed.data.message, /审计日志不能删除/)
  }
  const updated = await api(pb.base, `/api/collections/audit_logs/records/${auditId}`, {
    token: tokenA,
    method: "PATCH",
    body: { action: "tampered" },
  })
  assert.match(updated.data.message, /审计日志不能删除/)

  const requested = await api(pb.base, "/api/collections/export_requests/records", {
    token: tokenTeacher,
    method: "POST",
    body: { org: orgB.id, school: schoolB.id, status: "已批准" },
  })
  assert.equal(requested.status, 200, JSON.stringify(requested.data))
  assert.equal(requested.data.status, "待审批")
  assert.equal(requested.data.org, orgA.id)
  assert.equal(requested.data.school, schoolA.id)
  const tooSoon = await api(pb.base, "/api/xueqing/exports", {
    token: tokenTeacher,
    method: "POST",
    body: { requestId: requested.data.id },
  })
  assert.equal(tooSoon.status, 400)
  assert.match(tooSoon.data.message, /需要学校管理员审批/)
  const approved = await api(pb.base, `/api/collections/export_requests/records/${requested.data.id}`, {
    token: tokenA,
    method: "PATCH",
    body: { status: "已批准" },
  })
  assert.equal(approved.status, 200, JSON.stringify(approved.data))
  assert.equal(approved.data.approver, adminA.id)
  const exported = await api(pb.base, "/api/xueqing/exports", {
    token: tokenTeacher,
    method: "POST",
    body: { requestId: requested.data.id },
  })
  assert.equal(exported.status, 200, JSON.stringify(exported.data))
  assert.ok(exported.data.students.some((item) => item.uid === student.uid))
  assert.equal(JSON.stringify(exported.data).includes(other.uid), false)
  const exportAudit = await api(pb.base, "/api/xueqing/audits?actor=" + teacher.id, { token: tokenA })
  assert.ok(exportAudit.data.items.some((item) => item.action === "export"))

  assert.ok(platform.id && orgAdmin.id)
})
