import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { api, login, registerConsent, registerVolunteer, startPocketBase } from "./pb.mjs"

const PASSWORD = "Demo-Pass-0000"
let pb
let superToken

before(async () => {
  pb = await startPocketBase()
  const auth = await login(pb.base, pb.email, pb.password, "_superusers")
  superToken = auth.data.token
})

after(async () => {
  if (pb) await pb.stop()
})

async function asSuper(urlPath, options = {}) {
  return api(pb.base, urlPath, { ...options, token: superToken })
}

test("P0-07 录入带学科年级教材和知识点，批量 10 人，图片超过 300KB 被拒绝", async () => {
  const org = (await asSuper("/api/collections/organizations/records", { method: "POST", body: { name: "录入协会" } })).data
  const school = (await asSuper("/api/collections/schools/records", { method: "POST", body: { name: "录入小学", org: org.id } })).data
  const admin = (await asSuper("/api/collections/users/records", {
    method: "POST",
    body: {
      username: "entry-school",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "录入管理员",
      roles: ["school_admin"],
      org: org.id,
      school: school.id,
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })).data
  const adminToken = (await login(pb.base, "entry-school", PASSWORD)).data.token
  const opened = await api(pb.base, "/api/xueqing/accounts", {
    token: adminToken,
    method: "POST",
    body: { username: "entry-teacher", displayName: "录入老师", teacherType: "长期支教" },
  })
  const first = (await login(pb.base, "entry-teacher", opened.data.password)).data.token
  await api(pb.base, `/api/collections/users/records/${opened.data.user.id}`, {
    token: first,
    method: "PATCH",
    body: { oldPassword: opened.data.password, password: PASSWORD, passwordConfirm: PASSWORD },
  })
  const teacherToken = (await login(pb.base, "entry-teacher", PASSWORD)).data.token
  await registerVolunteer(pb.base, adminToken, opened.data.user.id)
  const klass = (await api(pb.base, "/api/collections/classes/records", {
    token: adminToken,
    method: "POST",
    body: { name: "录入班", school: school.id, org: org.id, grades: ["三年级"] },
  })).data
  const duty = await api(pb.base, "/api/collections/teaching_assignments/records", {
    token: adminToken,
    method: "POST",
    body: { class: klass.id, teacher: opened.data.user.id, subject: "语文", school: school.id, org: org.id },
  })
  assert.equal(duty.status, 200, JSON.stringify(duty.data))
  const pe = await api(pb.base, "/api/collections/teaching_assignments/records", {
    token: adminToken,
    method: "POST",
    body: { class: klass.id, teacher: opened.data.user.id, subject: "体育与健康", school: school.id, org: org.id },
  })
  assert.equal(pe.status, 200, JSON.stringify(pe.data))
  const ids = []
  for (let i = 1; i <= 10; i += 1) {
    const created = await api(pb.base, "/api/xueqing/students", {
      token: adminToken,
      method: "POST",
      body: { displayName: "录入生" + String(i).padStart(2, "0"), grade: "三年级", classId: klass.id },
    })
    assert.equal(created.status, 200, JSON.stringify(created.data))
    const consent = await registerConsent(pb.base, adminToken, created.data.id)
    assert.equal(consent.status, 200, JSON.stringify(consent.data))
    ids.push(created.data.id)
  }
  const started = Date.now()
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
      scene: "课堂",
      clientUid: "batch-10",
    },
  })
  const elapsed = Date.now() - started
  assert.equal(saved.status, 200, JSON.stringify(saved.data))
  assert.equal(saved.data.items.length, 10)
  assert.ok(elapsed < 45000, String(elapsed))
  for (const item of saved.data.items) {
    assert.equal(item.subject_code, "C")
    assert.equal(item.grade, "三年级")
    assert.equal(item.textbook, "人教版")
    assert.equal(item.knowledge_code, "C-3-001")
    assert.equal(item.error_code, "ET01")
    assert.equal(item.confirmed, true)
  }
  const again = await api(pb.base, "/api/xueqing/entries", {
    token: teacherToken,
    method: "POST",
    body: {
      classId: klass.id,
      subjectCode: "C",
      studentIds: [ids[0]],
      knowledgeCode: "C-3-001",
      errorCode: "ET01",
      textbook: "人教版",
      clientUid: "batch-10",
    },
  })
  assert.equal(again.status, 200, JSON.stringify(again.data))
  assert.equal(again.data.items[0].id, saved.data.items[0].id)
  const listed = await api(pb.base, "/api/collections/learning_records/records", { token: teacherToken })
  assert.equal(listed.data.items.length, 10)
  const wrongSubject = await api(pb.base, "/api/xueqing/entries", {
    token: teacherToken,
    method: "POST",
    body: {
      classId: klass.id,
      subjectCode: "M",
      studentIds: [ids[0]],
      knowledgeCode: "M-3-001",
      textbook: "人教版",
      clientUid: "math-denied",
    },
  })
  assert.equal(wrongSubject.status, 400)
  assert.match(wrongSubject.data.message, /任课学科/)
  const sport = await api(pb.base, "/api/xueqing/entries", {
    token: teacherToken,
    method: "POST",
    body: {
      classId: klass.id,
      subjectCode: "PE",
      studentIds: [ids[0]],
      knowledgeCode: "PE-3-001",
      errorCode: "ET01",
      textbook: "人教版",
      clientUid: "pe-error",
    },
  })
  assert.equal(sport.status, 400, JSON.stringify(sport.data))
  assert.match(sport.data.message, /不用错题/)
  const mismatch = await api(pb.base, "/api/xueqing/entries", {
    token: teacherToken,
    method: "POST",
    body: {
      classId: klass.id,
      subjectCode: "C",
      studentIds: [ids[0]],
      knowledgeCode: "C-1-001",
      textbook: "人教版",
      clientUid: "grade-mismatch",
    },
  })
  assert.equal(mismatch.status, 400)
  assert.match(mismatch.data.message, /一年级/)
  const huge = "a".repeat(410000)
  const photo = await api(pb.base, "/api/xueqing/entries", {
    token: teacherToken,
    method: "POST",
    body: {
      classId: klass.id,
      subjectCode: "C",
      studentIds: [ids[0]],
      knowledgeCode: "C-3-001",
      textbook: "人教版",
      photo: huge,
      clientUid: "big-photo",
    },
  })
  assert.equal(photo.status, 400)
  assert.match(photo.data.message, /300KB/)
  assert.equal(admin.id.length > 0, true)
})
