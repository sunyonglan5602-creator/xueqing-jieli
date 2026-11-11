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

test("E5 写入修改率，禁用词先提醒，确认后仍可保存", async () => {
  const org = (await api(pb.base, "/api/collections/organizations/records", {
    token: superToken,
    method: "POST",
    body: { name: "修改率协会" },
  })).data
  const school = (await api(pb.base, "/api/collections/schools/records", {
    token: superToken,
    method: "POST",
    body: { name: "修改率小学", org: org.id },
  })).data
  await api(pb.base, "/api/collections/users/records", {
    token: superToken,
    method: "POST",
    body: {
      username: "e5-school",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "修改率管理员",
      roles: ["school_admin"],
      org: org.id,
      school: school.id,
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })
  const adminToken = (await login(pb.base, "e5-school", PASSWORD)).data.token
  const opened = await api(pb.base, "/api/xueqing/accounts", {
    token: adminToken,
    method: "POST",
    body: { username: "e5-teacher", displayName: "修改率老师", teacherType: "长期支教" },
  })
  const first = (await login(pb.base, "e5-teacher", opened.data.password)).data.token
  await api(pb.base, `/api/collections/users/records/${opened.data.user.id}`, {
    token: first,
    method: "PATCH",
    body: { oldPassword: opened.data.password, password: PASSWORD, passwordConfirm: PASSWORD },
  })
  const teacherToken = (await login(pb.base, "e5-teacher", PASSWORD)).data.token
  await registerVolunteer(pb.base, adminToken, opened.data.user.id)
  const klass = (await api(pb.base, "/api/collections/classes/records", {
    token: adminToken,
    method: "POST",
    body: { name: "修改率班", school: school.id, org: org.id, grades: ["三年级", "四年级"] },
  })).data
  await api(pb.base, "/api/collections/teaching_assignments/records", {
    token: adminToken,
    method: "POST",
    body: { class: klass.id, teacher: opened.data.user.id, subject: "语文", school: school.id, org: org.id },
  })
  const low = (await api(pb.base, "/api/xueqing/students", {
    token: adminToken,
    method: "POST",
    body: { displayName: "修改率三年生", grade: "三年级", classId: klass.id },
  })).data
  const high = (await api(pb.base, "/api/xueqing/students", {
    token: adminToken,
    method: "POST",
    body: { displayName: "修改率四年生", grade: "四年级", classId: klass.id },
  })).data
  await registerConsent(pb.base, adminToken, low.id)
  await registerConsent(pb.base, adminToken, high.id)
  for (const [student, code, note, key] of [
    [low, "C-3-001", "朗读课文更流畅了", "e5-low"],
    [high, "C-4-001", "能把段落按顺序说下来", "e5-high"],
  ]) {
    const saved = await api(pb.base, "/api/xueqing/entries", {
      token: teacherToken,
      method: "POST",
      body: {
        classId: klass.id,
        subjectCode: "C",
        studentIds: [student.id],
        knowledgeCode: code,
        textbook: "人教版",
        note,
        clientUid: key,
      },
    })
    assert.equal(saved.status, 200, JSON.stringify(saved.data))
  }
  const grade4 = await api(pb.base, "/api/xueqing/comments/drafts", {
    token: teacherToken,
    method: "POST",
    body: { classId: klass.id, period: "本阶段", grade: "四年级" },
  })
  assert.equal(grade4.status, 200, JSON.stringify(grade4.data))
  const clean = await api(pb.base, "/api/xueqing/comments/confirm", {
    token: teacherToken,
    method: "POST",
    body: {
      classId: klass.id,
      studentId: high.id,
      grade: "四年级",
      period: "本阶段",
      body: grade4.data.items[0].body,
      startedAt: String(Date.now() - 5000),
      clientUid: "e5-clean",
    },
  })
  assert.equal(clean.status, 200, JSON.stringify(clean.data))
  const grade3 = await api(pb.base, "/api/xueqing/comments/drafts", {
    token: teacherToken,
    method: "POST",
    body: { classId: klass.id, period: "本阶段", grade: "三年级" },
  })
  const edited = grade3.data.items[0].body + "差生"
  const blocked = await api(pb.base, "/api/xueqing/comments/confirm", {
    token: teacherToken,
    method: "POST",
    body: {
      classId: klass.id,
      studentId: low.id,
      grade: "三年级",
      period: "本阶段",
      body: edited,
      clientUid: "e5-blocked",
    },
  })
  assert.equal(blocked.status, 400, JSON.stringify(blocked.data))
  assert.match(blocked.data.message, /差生/)
  assert.match(blocked.data.message, /仍要这样写，请确认后再保存/)
  const allowed = await api(pb.base, "/api/xueqing/comments/confirm", {
    token: teacherToken,
    method: "POST",
    body: {
      classId: klass.id,
      studentId: low.id,
      grade: "三年级",
      period: "本阶段",
      body: edited,
      confirmWords: true,
      startedAt: String(Date.now() - 5000),
      clientUid: "e5-allowed",
    },
  })
  assert.equal(allowed.status, 200, JSON.stringify(allowed.data))
  assert.equal(allowed.data.status, "已确认")
  assert.equal(allowed.data.body.includes("差生"), true)
  const hidden = await api(pb.base, "/api/xueqing/metrics?table=e5", { token: teacherToken })
  assert.equal(hidden.status, 404)
  const metrics = await api(pb.base, "/api/xueqing/metrics?table=e5", { token: adminToken })
  assert.equal(metrics.status, 200, JSON.stringify(metrics.data))
  assert.equal(metrics.data.教师修改率.已确认评语数, 2)
  assert.equal(metrics.data.教师修改率.修改过的评语数, 1)
  assert.equal(metrics.data.教师修改率.比率, 0.5)
  const changed = metrics.data.items.find((item) => item.是否修改 === true)
  const same = metrics.data.items.find((item) => item.是否修改 === false)
  assert.equal(changed.编辑距离 > 0, true)
  assert.equal(same.编辑距离, 0)
  assert.equal(same.模板生成字数, same.最终字数)
  assert.equal(typeof changed.教师序号, "number")
  assert.equal(changed.教师序号, same.教师序号)
  assert.equal(changed.耗时秒数 >= 4, true)
  assert.equal(Boolean(changed.确认时间), true)
  const text = JSON.stringify(metrics.data)
  assert.equal(text.includes("修改率三年生"), false)
  assert.equal(text.includes("修改率老师"), false)
  assert.equal(text.includes("差生"), false)
})
