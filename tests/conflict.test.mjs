import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { api, login, registerConsent, registerVolunteer, startPocketBase } from "./pb.mjs"

const PASSWORD = "Demo-Pass-0000"
let pb
let superToken

before(async () => {
  pb = await startPocketBase()
  superToken = (await login(pb.base, pb.email, pb.password, "_superusers")).data.token
})

after(async () => {
  if (pb) await pb.stop()
})

test("P0-09 两端离线修改后两个版本都保留，并出现冲突提示", async () => {
  const org = (await api(pb.base, "/api/collections/organizations/records", { token: superToken, method: "POST", body: { name: "冲突协会" } })).data
  const school = (await api(pb.base, "/api/collections/schools/records", { token: superToken, method: "POST", body: { name: "冲突小学", org: org.id } })).data
  const admin = (await api(pb.base, "/api/collections/users/records", {
    token: superToken,
    method: "POST",
    body: {
      username: "conflict-school",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "冲突管理员",
      roles: ["school_admin"],
      org: org.id,
      school: school.id,
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })).data
  const adminToken = (await login(pb.base, "conflict-school", PASSWORD)).data.token
  const opened = await api(pb.base, "/api/xueqing/accounts", {
    token: adminToken,
    method: "POST",
    body: { username: "conflict-teacher", displayName: "冲突老师", teacherType: "长期支教" },
  })
  const first = (await login(pb.base, "conflict-teacher", opened.data.password)).data.token
  await api(pb.base, `/api/collections/users/records/${opened.data.user.id}`, {
    token: first,
    method: "PATCH",
    body: { oldPassword: opened.data.password, password: PASSWORD, passwordConfirm: PASSWORD },
  })
  const teacherToken = (await login(pb.base, "conflict-teacher", PASSWORD)).data.token
  await registerVolunteer(pb.base, adminToken, opened.data.user.id)
  const klass = (await api(pb.base, "/api/collections/classes/records", {
    token: adminToken,
    method: "POST",
    body: { name: "冲突班", school: school.id, org: org.id, grades: ["三年级"] },
  })).data
  await api(pb.base, "/api/collections/teaching_assignments/records", {
    token: adminToken,
    method: "POST",
    body: { class: klass.id, teacher: opened.data.user.id, subject: "语文", school: school.id, org: org.id },
  })
  const student = (await api(pb.base, "/api/xueqing/students", {
    token: adminToken,
    method: "POST",
    body: { displayName: "冲突生", grade: "三年级", classId: klass.id },
  })).data
  await registerConsent(pb.base, adminToken, student.id)
  const saved = await api(pb.base, "/api/xueqing/entries", {
    token: teacherToken,
    method: "POST",
    body: {
      classId: klass.id,
      subjectCode: "C",
      studentIds: [student.id],
      knowledgeCode: "C-3-001",
      textbook: "人教版",
      note: "原始内容",
      clientUid: "origin",
    },
  })
  assert.equal(saved.status, 200, JSON.stringify(saved.data))
  const original = await api(pb.base, "/api/collections/learning_records/records/" + saved.data.items[0].id, { token: teacherToken })
  const groupUid = original.data.group_uid
  const firstEdit = await api(pb.base, "/api/xueqing/sync-edits", {
    token: teacherToken,
    method: "POST",
    body: { groupUid, baseVersion: 1, body: "甲端修订", clientUid: "edit-a" },
  })
  assert.equal(firstEdit.status, 200, JSON.stringify(firstEdit.data))
  assert.equal(firstEdit.data.conflict, false)
  const secondEdit = await api(pb.base, "/api/xueqing/sync-edits", {
    token: teacherToken,
    method: "POST",
    body: { groupUid, baseVersion: 1, body: "乙端修订", clientUid: "edit-b" },
  })
  assert.equal(secondEdit.status, 200, JSON.stringify(secondEdit.data))
  assert.equal(secondEdit.data.conflict, true)
  assert.equal(secondEdit.data.originalBody, "原始内容")
  const conflicts = await api(pb.base, "/api/xueqing/conflicts", { token: teacherToken })
  assert.equal(conflicts.data.items.length, 1)
  const left = await api(pb.base, "/api/collections/learning_records/records?filter=" + encodeURIComponent(`group_uid='${groupUid}'`), { token: teacherToken })
  assert.ok(left.data.items.length >= 3)
  assert.ok(left.data.items.some((item) => item.body === "原始内容"))
  assert.ok(left.data.items.some((item) => item.body === "甲端修订"))
  assert.ok(left.data.items.some((item) => item.body === "乙端修订"))
  const overwritten = await api(pb.base, "/api/collections/learning_records/records/" + saved.data.items[0].id, {
    token: teacherToken,
    method: "PATCH",
    body: { body: "静默覆盖" },
  })
  assert.equal(overwritten.status, 400)
})
