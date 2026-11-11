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

test("E1 E2 E6 按原文记字段，不带学生姓名和记录编号", async () => {
  const org = (await api(pb.base, "/api/collections/organizations/records", { token: superToken, method: "POST", body: { name: "埋点协会" } })).data
  const school = (await api(pb.base, "/api/collections/schools/records", { token: superToken, method: "POST", body: { name: "埋点小学", org: org.id } })).data
  const admin = (await api(pb.base, "/api/collections/users/records", {
    token: superToken,
    method: "POST",
    body: {
      username: "metric-school",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "埋点管理员",
      roles: ["school_admin"],
      org: org.id,
      school: school.id,
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })).data
  const adminToken = (await login(pb.base, "metric-school", PASSWORD)).data.token
  const opened = await api(pb.base, "/api/xueqing/accounts", {
    token: adminToken,
    method: "POST",
    body: { username: "metric-teacher", displayName: "埋点老师", teacherType: "长期支教" },
  })
  const first = (await login(pb.base, "metric-teacher", opened.data.password)).data.token
  await api(pb.base, `/api/collections/users/records/${opened.data.user.id}`, {
    token: first,
    method: "PATCH",
    body: { oldPassword: opened.data.password, password: PASSWORD, passwordConfirm: PASSWORD },
  })
  const teacherToken = (await login(pb.base, "metric-teacher", PASSWORD)).data.token
  await registerVolunteer(pb.base, adminToken, opened.data.user.id)
  const klass = (await api(pb.base, "/api/collections/classes/records", {
    token: adminToken,
    method: "POST",
    body: { name: "埋点班", school: school.id, org: org.id, grades: ["三年级"] },
  })).data
  await api(pb.base, "/api/collections/teaching_assignments/records", {
    token: adminToken,
    method: "POST",
    body: { class: klass.id, teacher: opened.data.user.id, subject: "语文", school: school.id, org: org.id },
  })
  const ids = []
  for (let i = 1; i <= 3; i += 1) {
    const student = (await api(pb.base, "/api/xueqing/students", {
      token: adminToken,
      method: "POST",
      body: { displayName: "埋点生0" + i, grade: "三年级", classId: klass.id },
    })).data
    await registerConsent(pb.base, adminToken, student.id)
    ids.push(student.id)
  }
  const saved = await api(pb.base, "/api/xueqing/entries", {
    token: teacherToken,
    method: "POST",
    body: {
      classId: klass.id,
      subjectCode: "C",
      studentIds: ids,
      knowledgeCode: "C-3-001",
      errorCode: "ET01",
      textbook: "人教版",
      note: "埋点生01的原话",
      clientUid: "metric-save",
      clickCount: 5,
      elapsedSeconds: 12,
    },
  })
  assert.equal(saved.status, 200, JSON.stringify(saved.data))
  const e1 = await api(pb.base, "/api/xueqing/metrics?table=e1", { token: adminToken })
  assert.equal(e1.status, 200, JSON.stringify(e1.data))
  assert.equal(e1.data.items.length, 1)
  const row = e1.data.items[0]
  assert.equal(row.本次选中学生数, 3)
  assert.equal(row.标签数, 2)
  assert.equal(row.点击次数, 5)
  assert.equal(row.耗时秒数, 12)
  assert.equal(row.老师类型, "长期支教")
  assert.equal(row.类型, "学情标签")
  const text = JSON.stringify(e1.data)
  assert.equal(text.includes("埋点生01"), false)
  assert.equal(text.includes(saved.data.items[0].uid), false)
  const e2 = await api(pb.base, "/api/xueqing/metrics?table=e2", { token: adminToken })
  assert.equal(e2.data.items.length, 3)
  assert.equal(e2.data.items.every((item) => item.第一次提交结果 === "在线成功" && item.最终状态 === "成功"), true)
  for (let i = 0; i < 5; i += 1) {
    const timeout = await api(pb.base, "/api/xueqing/metric-submissions", {
      token: teacherToken,
      method: "POST",
      body: { clientUid: "timeout-" + i, firstResult: "超时转暂存" },
    })
    assert.equal(timeout.status, 200, JSON.stringify(timeout.data))
  }
  const after = await api(pb.base, "/api/xueqing/metrics?table=e2", { token: adminToken })
  const timeouts = after.data.items.filter((item) => item.第一次提交结果 === "超时转暂存")
  assert.equal(timeouts.length, 5)
  const cleared = await api(pb.base, "/api/xueqing/clears", {
    token: teacherToken,
    method: "POST",
    body: { reason: "退出", pendingBefore: 1, uploaded: 1, kept: 0, abandoned: 0 },
  })
  assert.equal(cleared.status, 200, JSON.stringify(cleared.data))
  const e6 = await api(pb.base, "/api/xueqing/metrics?table=e6", { token: adminToken })
  assert.equal(e6.data.items.length, 1)
  const event = e6.data.items[0]
  assert.equal(event.清除前待补传数, event.已补传数 + event.加密保留数 + event.本人放弃数)
  assert.equal(JSON.stringify(e6.data).includes("埋点生"), false)
})
