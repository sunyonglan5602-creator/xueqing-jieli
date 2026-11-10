import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { api, login, startPocketBase } from "./pb.mjs"

const PASSWORD = "Demo-Pass-0000"
const MATTERS = ["收集目的", "方式", "范围", "存储地点", "期限", "到期处理", "安全措施", "拒绝的后果", "投诉渠道", "更正删除方式", "拒绝选项", "离校满 3 年"]
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

test("P0-05 未同意不能记学情，撤回后停止录入并解除绑定", async () => {
  const template = await fetch(pb.base + "/api/xueqing/consent-template")
  const text = await template.text()
  assert.equal(template.status, 200, text)
  for (const matter of MATTERS) assert.match(text, new RegExp(matter))
  const org = (await asSuper("/api/collections/organizations/records", { method: "POST", body: { name: "同意协会" } })).data
  const school = (await asSuper("/api/collections/schools/records", { method: "POST", body: { name: "同意小学", org: org.id } })).data
  const admin = (await asSuper("/api/collections/users/records", {
    method: "POST",
    body: {
      username: "consent-school",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "同意管理员",
      roles: ["school_admin", "teacher"],
      org: org.id,
      school: school.id,
      teacher_type: "长期支教",
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })).data
  const parent = (await asSuper("/api/collections/users/records", {
    method: "POST",
    body: {
      username: "consent-parent",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "同意家长",
      roles: ["parent"],
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })).data
  const token = (await login(pb.base, "consent-school", PASSWORD)).data.token
  const tokenParent = (await login(pb.base, "consent-parent", PASSWORD)).data.token
  const klass = (await api(pb.base, "/api/collections/classes/records", {
    token,
    method: "POST",
    body: { name: "同意班", school: school.id, org: org.id, grades: ["三年级"] },
  })).data
  const student = await api(pb.base, "/api/xueqing/students", {
    token,
    method: "POST",
    body: { displayName: "同意生", grade: "三年级", classId: klass.id },
  })
  assert.equal(student.status, 200, JSON.stringify(student.data))
  const blocked = await api(pb.base, "/api/collections/learning_records/records", {
    token,
    method: "POST",
    body: { student: student.data.id, body: "不该记下", org: org.id, version: 1, uid: "00000000-0000-7000-8000-000000000061" },
  })
  assert.equal(blocked.status, 400, JSON.stringify(blocked.data))
  assert.match(blocked.data.message, /未同意或未登记的学生不能记学情/)
  const agreed = await api(pb.base, "/api/xueqing/consents", {
    token,
    method: "POST",
    body: {
      studentId: student.data.id,
      status: "已同意",
      receiptNo: "演示回执061",
      consentedOn: "2026-01-02 00:00:00.000Z",
      explainMethod: "口头讲解 + 纸质回执",
      signerRole: "祖辈",
    },
  })
  assert.equal(agreed.status, 200, JSON.stringify(agreed.data))
  const binding = await api(pb.base, "/api/collections/parent_student_bindings/records", {
    token,
    method: "POST",
    body: { parent: parent.id, student: student.data.id, status: "已生效", relationship_type: "法定监护人", org: org.id },
  })
  assert.equal(binding.status, 200, JSON.stringify(binding.data))
  const parentSees = await api(pb.base, `/api/collections/students/records/${student.data.id}`, { token: tokenParent })
  assert.equal(parentSees.status, 200, JSON.stringify(parentSees.data))
  const saved = await api(pb.base, "/api/collections/learning_records/records", {
    token,
    method: "POST",
    body: { student: student.data.id, body: "已同意后的记录", org: org.id, version: 1, uid: "00000000-0000-7000-8000-000000000062" },
  })
  assert.equal(saved.status, 200, JSON.stringify(saved.data))
  const withdrawn = await api(pb.base, "/api/xueqing/consents", {
    token,
    method: "POST",
    body: { studentId: student.data.id, status: "已撤回" },
  })
  assert.equal(withdrawn.status, 200, JSON.stringify(withdrawn.data))
  assert.match(withdrawn.data.message, /7\.3/)
  const again = await api(pb.base, "/api/collections/learning_records/records", {
    token,
    method: "POST",
    body: { student: student.data.id, body: "撤回后不该记下", org: org.id, version: 1, uid: "00000000-0000-7000-8000-000000000063" },
  })
  assert.equal(again.status, 400, JSON.stringify(again.data))
  assert.match(again.data.message, /未同意或未登记/)
  const parentAfter = await api(pb.base, `/api/collections/students/records/${student.data.id}`, { token: tokenParent })
  assert.equal(parentAfter.status, 404)
  const unbound = await api(pb.base, `/api/collections/parent_student_bindings/records/${binding.data.id}`, { token })
  assert.equal(unbound.data.status, "已解绑")
  const audits = await api(pb.base, "/api/xueqing/audits?student=" + student.data.id, { token })
  assert.ok(audits.data.items.some((item) => item.action === "consent_changed"))
  const roster = await api(pb.base, "/api/xueqing/record-students", { token })
  assert.equal(roster.status, 200, JSON.stringify(roster.data))
  assert.equal(roster.data.items.find((item) => item.id === student.data.id).recordable, false)
  assert.ok(admin.id)
})
