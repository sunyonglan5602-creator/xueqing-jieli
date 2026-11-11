import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { after, before, test } from "node:test"
import { api, login, registerVolunteer, startPocketBase } from "./pb.mjs"

const require = createRequire(import.meta.url)
const catalog = require("../pocketbase/pb_hooks/dictionary_data.js")
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

async function user(username, fields) {
  const response = await asSuper("/api/collections/users/records", {
    method: "POST",
    body: {
      username,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: username,
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
      ...fields,
    },
  })
  assert.equal(response.status, 200, JSON.stringify(response.data))
  const auth = await login(pb.base, username, PASSWORD)
  assert.equal(auth.status, 200, JSON.stringify(auth.data))
  return { record: response.data, token: auth.data.token }
}

test("P0-06 学科和标签字典是数据，年级与学生档案对齐", async () => {
  const org = (await asSuper("/api/collections/organizations/records", { method: "POST", body: { name: "字典协会" } })).data
  const schoolA = (await asSuper("/api/collections/schools/records", { method: "POST", body: { name: "字典小学甲", org: org.id } })).data
  const schoolB = (await asSuper("/api/collections/schools/records", { method: "POST", body: { name: "字典小学乙", org: org.id } })).data
  const platform = await user("dict-platform", { roles: ["platform_admin"] })
  const adminA = await user("dict-school-a", { roles: ["school_admin"], org: org.id, school: schoolA.id })
  const adminB = await user("dict-school-b", { roles: ["school_admin"], org: org.id, school: schoolB.id })
  const teacher = await user("dict-teacher", {
    roles: ["teacher"],
    teacher_type: "长期支教",
    org: org.id,
    school: schoolA.id,
  })
  await registerVolunteer(pb.base, adminA.token, teacher.record.id)

  const grades = await api(pb.base, "/api/xueqing/dictionary/grades", { token: adminA.token })
  assert.deepEqual(grades.data.items.map((item) => item.name), catalog.grades.map((item) => item.name))
  const seventh = await api(pb.base, "/api/collections/classes/records", {
    token: adminA.token,
    method: "POST",
    body: { name: "七年级班", school: schoolA.id, org: org.id, grades: ["七年级"] },
  })
  assert.equal(seventh.status, 200, JSON.stringify(seventh.data))
  const junior = await api(pb.base, "/api/xueqing/students", {
    token: adminA.token,
    method: "POST",
    body: { displayName: "七年级生", grade: "七年级", classId: seventh.data.id },
  })
  assert.equal(junior.status, 200, JSON.stringify(junior.data))
  const unknownGrade = await api(pb.base, "/api/collections/classes/records", {
    token: adminA.token,
    method: "POST",
    body: { name: "十年级班", school: schoolA.id, org: org.id, grades: ["十年级"] },
  })
  assert.equal(unknownGrade.status, 400)
  assert.match(unknownGrade.data.message, /年级/)

  const subjects = await api(pb.base, "/api/xueqing/dictionary/subjects", { token: teacher.token })
  assert.deepEqual(
    subjects.data.items.map((item) => item.code + ":" + item.name + ":" + item.error_entry).sort(),
    catalog.subjects.map((item) => item.code + ":" + item.name + ":" + item.error_entry).sort(),
  )
  const pe = subjects.data.items.find((item) => item.name === "体育与健康")
  assert.equal(pe.error_entry, false)
  const chinese = subjects.data.items.find((item) => item.name === "语文")
  assert.equal(chinese.error_entry, true)
  const madeUp = await api(pb.base, "/api/collections/teaching_assignments/records", {
    token: adminA.token,
    method: "POST",
    body: { class: seventh.data.id, teacher: teacher.record.id, subject: "自造学科", school: schoolA.id, org: org.id },
  })
  assert.equal(madeUp.status, 400, JSON.stringify(madeUp.data))
  assert.match(madeUp.data.message, /学科字典/)

  const added = await api(pb.base, "/api/xueqing/dictionary/subjects", {
    token: platform.token,
    method: "POST",
    body: { code: "XR", name: "校本阅读", grades: ["三年级"], recordType: "表现标签，不用错题", errorEntry: false, perTermError: false },
  })
  assert.equal(added.status, 200, JSON.stringify(added.data))
  const class3 = await api(pb.base, "/api/collections/classes/records", {
    token: adminA.token,
    method: "POST",
    body: { name: "字典三年级", school: schoolA.id, org: org.id, grades: ["三年级", "四年级"] },
  })
  assert.equal(class3.status, 200, JSON.stringify(class3.data))
  const assigned = await api(pb.base, "/api/collections/teaching_assignments/records", {
    token: adminA.token,
    method: "POST",
    body: { class: class3.data.id, teacher: teacher.record.id, subject: "校本阅读", school: schoolA.id, org: org.id },
  })
  assert.equal(assigned.status, 200, JSON.stringify(assigned.data))
  const chineseDuty = await api(pb.base, "/api/collections/teaching_assignments/records", {
    token: adminA.token,
    method: "POST",
    body: { class: class3.data.id, teacher: teacher.record.id, subject: "语文", school: schoolA.id, org: org.id },
  })
  assert.equal(chineseDuty.status, 200, JSON.stringify(chineseDuty.data))
  const peDuty = await api(pb.base, "/api/collections/teaching_assignments/records", {
    token: adminA.token,
    method: "POST",
    body: { class: class3.data.id, teacher: teacher.record.id, subject: "体育与健康", school: schoolA.id, org: org.id },
  })
  assert.equal(peDuty.status, 200, JSON.stringify(peDuty.data))
  const scienceDuty = await api(pb.base, "/api/collections/teaching_assignments/records", {
    token: adminA.token,
    method: "POST",
    body: { class: class3.data.id, teacher: teacher.record.id, subject: "科学", school: schoolA.id, org: org.id },
  })
  assert.equal(scienceDuty.status, 200, JSON.stringify(scienceDuty.data))

  const schoolDenied = await api(pb.base, "/api/xueqing/dictionary/subjects", {
    token: adminA.token,
    method: "POST",
    body: { code: "XX", name: "学校自造", grades: ["三年级"], recordType: "纸笔错题", errorEntry: true },
  })
  assert.equal(schoolDenied.status, 404)

  const term = await api(pb.base, "/api/xueqing/dictionary/terms", {
    token: adminA.token,
    method: "POST",
    body: { subjectCode: "C", name: "校本：把一件事写清楚", grades: ["三年级"], entryKind: "paper" },
  })
  assert.equal(term.status, 200, JSON.stringify(term.data))
  assert.equal(term.data.scope, "school")
  const banned = await api(pb.base, "/api/xueqing/dictionary/terms", {
    token: adminA.token,
    method: "POST",
    body: { subjectCode: "C", name: "差生", grades: ["三年级"], entryKind: "paper", confirm: true },
  })
  assert.equal(banned.status, 400, JSON.stringify(banned.data))
  assert.match(banned.data.message, /差生/)
  const sorting = await api(pb.base, "/api/xueqing/dictionary/terms", {
    token: adminA.token,
    method: "POST",
    body: { subjectCode: "LA", name: "能参与垃圾分类", grades: ["三年级"], entryKind: "performance" },
  })
  assert.equal(sorting.status, 200, JSON.stringify(sorting.data))
  const seenByB = await api(pb.base, "/api/xueqing/dictionary/terms?includeInactive=1&code=" + term.data.code, { token: adminB.token })
  assert.equal(seenByB.data.items.length, 0)
  const direct = await api(pb.base, `/api/collections/dict_terms/records/${term.data.id}`, { token: adminB.token })
  assert.equal(direct.status, 404)

  const disabled = await api(pb.base, "/api/xueqing/dictionary/terms/disable", {
    token: adminA.token,
    method: "POST",
    body: { code: term.data.code },
  })
  assert.equal(disabled.status, 200, JSON.stringify(disabled.data))
  assert.equal(disabled.data.active, false)
  const history = await api(pb.base, "/api/xueqing/dictionary/terms?includeInactive=1&code=" + term.data.code, { token: adminA.token })
  assert.equal(history.data.items[0].name, "校本：把一件事写清楚")

  const student = await api(pb.base, "/api/xueqing/students", {
    token: adminA.token,
    method: "POST",
    body: { displayName: "字典生", grade: "三年级", classId: class3.data.id },
  })
  assert.equal(student.status, 200, JSON.stringify(student.data))
  const mismatch = await api(pb.base, "/api/xueqing/dictionary/check-attach", {
    token: adminA.token,
    method: "POST",
    body: { studentId: student.data.id, termCode: "M-1-001" },
  })
  assert.equal(mismatch.status, 400, JSON.stringify(mismatch.data))
  assert.match(mismatch.data.message, /一年级/)
  assert.match(mismatch.data.message, /字典生/)
  const withReason = await api(pb.base, "/api/xueqing/dictionary/check-attach", {
    token: adminA.token,
    method: "POST",
    body: { studentId: student.data.id, termCode: "M-1-001", reason: "复式班借读，先用一年级词" },
  })
  assert.equal(withReason.status, 200, JSON.stringify(withReason.data))
  assert.equal(withReason.data.mismatch, true)
  const stopped = await api(pb.base, "/api/xueqing/dictionary/check-attach", {
    token: adminA.token,
    method: "POST",
    body: { studentId: student.data.id, termCode: term.data.code, reason: "仍要看旧标签" },
  })
  assert.equal(stopped.status, 400)
  assert.match(stopped.data.message, /已停用/)

  const catalogResponse = await api(pb.base, "/api/xueqing/entry-catalog", { token: teacher.token })
  assert.equal(catalogResponse.status, 200, JSON.stringify(catalogResponse.data))
  const names = catalogResponse.data.subjects.map((item) => item.name).sort()
  assert.deepEqual(names, ["体育与健康", "科学", "校本阅读", "语文"].sort())
  const chineseEntry = catalogResponse.data.subjects.find((item) => item.name === "语文")
  assert.ok(chineseEntry.terms.some((item) => item.code === "C-3-001"))
  assert.equal(chineseEntry.terms.some((item) => item.code.startsWith("M-")), false)
  assert.ok(chineseEntry.error_types.length > 0)
  const peEntry = catalogResponse.data.subjects.find((item) => item.name === "体育与健康")
  assert.equal(peEntry.error_entry, false)
  assert.equal(peEntry.error_types.length, 0)
  const scienceEntry = catalogResponse.data.subjects.find((item) => item.name === "科学")
  assert.equal(scienceEntry.terms.find((item) => item.code === "SC-1-008").allows_error, false)
  assert.equal(scienceEntry.terms.find((item) => item.code === "SC-3-001").allows_error, true)

  const opened = await api(pb.base, "/api/xueqing/dictionary/subjects/update", {
    token: platform.token,
    method: "POST",
    body: { code: "XR", name: "校本阅读", grades: ["三年级"], recordType: "纸笔错题", errorEntry: true, perTermError: false },
  })
  assert.equal(opened.status, 200, JSON.stringify(opened.data))
  assert.equal(opened.data.error_entry, true)
  const again = await api(pb.base, "/api/xueqing/entry-catalog", { token: teacher.token })
  assert.equal(again.data.subjects.find((item) => item.name === "校本阅读").error_entry, true)

  const extraGrade = await api(pb.base, "/api/xueqing/dictionary/grades", {
    token: platform.token,
    method: "POST",
    body: { name: "测试年级", band: "初中" },
  })
  assert.equal(extraGrade.status, 200, JSON.stringify(extraGrade.data))
  const extraClass = await api(pb.base, "/api/collections/classes/records", {
    token: adminA.token,
    method: "POST",
    body: { name: "测试年级班", school: schoolA.id, org: org.id, grades: ["测试年级"] },
  })
  assert.equal(extraClass.status, 200, JSON.stringify(extraClass.data))
})
