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

test("P0-26 学期结束次日未延长的标签变为历史，延长要理由且最多连续一次", async () => {
  const org = (await api(pb.base, "/api/collections/organizations/records", { token: superToken, method: "POST", body: { name: "有效期协会" } })).data
  const school = (await api(pb.base, "/api/collections/schools/records", { token: superToken, method: "POST", body: { name: "有效期小学", org: org.id } })).data
  const admin = (await api(pb.base, "/api/collections/users/records", {
    token: superToken,
    method: "POST",
    body: {
      username: "valid-school",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "有效期管理员",
      roles: ["school_admin"],
      org: org.id,
      school: school.id,
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })).data
  const adminToken = (await login(pb.base, "valid-school", PASSWORD)).data.token
  const opened = await api(pb.base, "/api/xueqing/accounts", {
    token: adminToken,
    method: "POST",
    body: { username: "valid-teacher", displayName: "有效期老师", teacherType: "长期支教" },
  })
  const first = (await login(pb.base, "valid-teacher", opened.data.password)).data.token
  await api(pb.base, `/api/collections/users/records/${opened.data.user.id}`, {
    token: first,
    method: "PATCH",
    body: { oldPassword: opened.data.password, password: PASSWORD, passwordConfirm: PASSWORD },
  })
  const teacherToken = (await login(pb.base, "valid-teacher", PASSWORD)).data.token
  await registerVolunteer(pb.base, adminToken, opened.data.user.id)
  const klass = (await api(pb.base, "/api/collections/classes/records", {
    token: adminToken,
    method: "POST",
    body: { name: "有效期班", school: school.id, org: org.id, grades: ["三年级"] },
  })).data
  await api(pb.base, "/api/collections/teaching_assignments/records", {
    token: adminToken,
    method: "POST",
    body: { class: klass.id, teacher: opened.data.user.id, subject: "语文", school: school.id, org: org.id },
  })
  const student = (await api(pb.base, "/api/xueqing/students", {
    token: adminToken,
    method: "POST",
    body: { displayName: "有效期生", grade: "三年级", classId: klass.id },
  })).data
  await registerConsent(pb.base, adminToken, student.id)
  async function entry(note, clientUid) {
    const saved = await api(pb.base, "/api/xueqing/entries", {
      token: teacherToken,
      method: "POST",
      body: {
        classId: klass.id,
        subjectCode: "C",
        studentIds: [student.id],
        knowledgeCode: "C-3-001",
        errorCode: "ET01",
        statusMark: "尚需观察",
        textbook: "人教版",
        note,
        clientUid,
      },
    })
    assert.equal(saved.status, 200, JSON.stringify(saved.data))
    return (await api(pb.base, "/api/collections/learning_records/records/" + saved.data.items[0].id, { token: teacherToken })).data
  }
  const watch = await entry("还要再看", "valid-watch")
  const kept = await entry("已经延长", "valid-kept")
  const semester = await api(pb.base, "/api/xueqing/semesters", { token: adminToken, method: "POST", body: { endOn: "2026-01-31" } })
  assert.equal(semester.status, 200, JSON.stringify(semester.data))
  const missing = await api(pb.base, "/api/xueqing/validity/extend", { token: teacherToken, method: "POST", body: { recordUid: kept.uid, reason: "" } })
  assert.equal(missing.status, 400)
  const extended = await api(pb.base, "/api/xueqing/validity/extend", { token: teacherToken, method: "POST", body: { recordUid: kept.uid, reason: "下学期还要看这一类题" } })
  assert.equal(extended.status, 200, JSON.stringify(extended.data))
  const again = await api(pb.base, "/api/xueqing/validity/extend", { token: teacherToken, method: "POST", body: { recordUid: kept.uid, reason: "还想再延" } })
  assert.equal(again.status, 400)
  assert.match(again.data.message, /学校管理员/)
  const byAdmin = await api(pb.base, "/api/xueqing/validity/extend", { token: adminToken, method: "POST", body: { recordUid: kept.uid, reason: "学校同意再看一个学期" } })
  assert.equal(byAdmin.status, 200, JSON.stringify(byAdmin.data))
  const applied = await api(pb.base, "/api/xueqing/validity/apply", { token: adminToken, method: "POST", body: { now: "2026-02-01" } })
  assert.equal(applied.status, 200, JSON.stringify(applied.data))
  assert.equal(applied.data.changed.includes(watch.uid), true)
  assert.equal(applied.data.changed.includes(kept.uid), false)
  const status = await api(pb.base, "/api/xueqing/validity/status?recordUid=" + watch.uid, { token: teacherToken })
  assert.equal(status.data.status, "历史")
  assert.equal(status.data.counts_toward_weakness, false)
  assert.equal(status.data.original_status, "尚需观察")
  assert.equal(status.data.original_body, "还要再看")
})
