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

test("P0-10 修订只追加，历史可查，不能静默覆盖", async () => {
  const org = (await api(pb.base, "/api/collections/organizations/records", { token: superToken, method: "POST", body: { name: "修订协会" } })).data
  const school = (await api(pb.base, "/api/collections/schools/records", { token: superToken, method: "POST", body: { name: "修订小学", org: org.id } })).data
  const admin = (await api(pb.base, "/api/collections/users/records", {
    token: superToken,
    method: "POST",
    body: {
      username: "revise-school",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "修订管理员",
      roles: ["school_admin"],
      org: org.id,
      school: school.id,
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })).data
  const adminToken = (await login(pb.base, "revise-school", PASSWORD)).data.token
  const opened = await api(pb.base, "/api/xueqing/accounts", {
    token: adminToken,
    method: "POST",
    body: { username: "revise-teacher", displayName: "修订老师", teacherType: "长期支教" },
  })
  const first = (await login(pb.base, "revise-teacher", opened.data.password)).data.token
  await api(pb.base, `/api/collections/users/records/${opened.data.user.id}`, {
    token: first,
    method: "PATCH",
    body: { oldPassword: opened.data.password, password: PASSWORD, passwordConfirm: PASSWORD },
  })
  const teacherToken = (await login(pb.base, "revise-teacher", PASSWORD)).data.token
  await registerVolunteer(pb.base, adminToken, opened.data.user.id)
  const klass = (await api(pb.base, "/api/collections/classes/records", {
    token: adminToken,
    method: "POST",
    body: { name: "修订班", school: school.id, org: org.id, grades: ["三年级"] },
  })).data
  await api(pb.base, "/api/collections/teaching_assignments/records", {
    token: adminToken,
    method: "POST",
    body: { class: klass.id, teacher: opened.data.user.id, subject: "语文", school: school.id, org: org.id },
  })
  const student = (await api(pb.base, "/api/xueqing/students", {
    token: adminToken,
    method: "POST",
    body: { displayName: "修订生", grade: "三年级", classId: klass.id },
  })).data
  await registerConsent(pb.base, adminToken, student.id)
  const saved = await api(pb.base, "/api/xueqing/entries", {
    token: teacherToken,
    method: "POST",
    body: { classId: klass.id, subjectCode: "C", studentIds: [student.id], knowledgeCode: "C-3-001", textbook: "人教版", note: "第一版", clientUid: "rev-1" },
  })
  assert.equal(saved.status, 200, JSON.stringify(saved.data))
  const original = await api(pb.base, "/api/collections/learning_records/records/" + saved.data.items[0].id, { token: teacherToken })
  const patched = await api(pb.base, "/api/collections/learning_records/records/" + original.data.id, {
    token: teacherToken,
    method: "PATCH",
    body: { body: "覆盖" },
  })
  assert.equal(patched.status, 400)
  const revised = await api(pb.base, "/api/xueqing/revisions", {
    token: teacherToken,
    method: "POST",
    body: { groupUid: original.data.group_uid, body: "第二版", statusMark: "已改善" },
  })
  assert.equal(revised.status, 200, JSON.stringify(revised.data))
  assert.equal(revised.data.version, 2)
  assert.equal(revised.data.previousBody, "第一版")
  const history = await api(pb.base, "/api/xueqing/record-history?groupUid=" + original.data.group_uid, { token: teacherToken })
  assert.equal(history.status, 200, JSON.stringify(history.data))
  assert.equal(history.data.items.length, 2)
  assert.equal(history.data.items[1].status_mark, "已改善")
  assert.equal(history.data.items[0].body, "第一版")
})
