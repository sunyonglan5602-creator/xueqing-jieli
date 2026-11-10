import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { api, login, registerConsent, startPocketBase } from "./pb.mjs"

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

test("P0-04 同名提示、复式班、导入行号和合并保留来源", async () => {
  const collection = await asSuper("/api/collections/students")
  const names = collection.data.fields.map((field) => field.name).join(",")
  assert.equal(/身份证|住址|地址|医疗|id_card|address|medical/i.test(names), false)
  const org = (await asSuper("/api/collections/organizations/records", { method: "POST", body: { name: "建档协会" } })).data
  const school = (await asSuper("/api/collections/schools/records", { method: "POST", body: { name: "建档小学", org: org.id } })).data
  const admin = (await asSuper("/api/collections/users/records", {
    method: "POST",
    body: {
      username: "archive-school",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "建档管理员",
      roles: ["school_admin"],
      org: org.id,
      school: school.id,
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })).data
  const token = (await login(pb.base, "archive-school", PASSWORD)).data.token
  const mixed = (await api(pb.base, "/api/collections/classes/records", {
    token,
    method: "POST",
    body: { name: "复式班", school: school.id, org: org.id, grades: ["三年级", "四年级"] },
  })).data
  const fourth = (await api(pb.base, "/api/collections/classes/records", {
    token,
    method: "POST",
    body: { name: "四年级班", school: school.id, org: org.id, grades: ["四年级"] },
  })).data
  const first = await api(pb.base, "/api/xueqing/students", {
    token,
    method: "POST",
    body: { displayName: "演示生01", grade: "三年级", classId: mixed.id },
  })
  assert.equal(first.status, 200, JSON.stringify(first.data))
  const duplicate = await api(pb.base, "/api/xueqing/students", {
    token,
    method: "POST",
    body: { displayName: "演示生01", grade: "三年级", classId: mixed.id },
  })
  assert.equal(duplicate.status, 400, JSON.stringify(duplicate.data))
  assert.match(duplicate.data.message, /疑似重复/)
  const confirmed = await api(pb.base, "/api/xueqing/students", {
    token,
    method: "POST",
    body: { displayName: "演示生01", grade: "三年级", classId: fourth.id, confirmDuplicate: true },
  })
  assert.equal(confirmed.status, 400, JSON.stringify(confirmed.data))
  assert.match(confirmed.data.message, /年级与班级不匹配/)
  const forced = await api(pb.base, "/api/xueqing/students", {
    token,
    method: "POST",
    body: { displayName: "演示生01", grade: "三年级", classId: fourth.id, confirmDuplicate: true, mismatchReason: "复式走读，先跟四年级班" },
  })
  assert.equal(forced.status, 200, JSON.stringify(forced.data))
  const fourthStudent = await api(pb.base, "/api/xueqing/students", {
    token,
    method: "POST",
    body: { displayName: "演示生04", grade: "四年级", classId: mixed.id },
  })
  assert.equal(fourthStudent.status, 200, JSON.stringify(fourthStudent.data))
  const consent = await registerConsent(pb.base, token, first.data.id)
  assert.equal(consent.status, 200, JSON.stringify(consent.data))
  const learned = await api(pb.base, "/api/collections/learning_records/records", {
    token,
    method: "POST",
    body: { student: first.data.id, body: "合并前的记录", org: org.id, version: 1, uid: "00000000-0000-7000-8000-000000000041" },
  })
  assert.equal(learned.status, 200, JSON.stringify(learned.data))
  const merged = await api(pb.base, "/api/xueqing/student-merges", {
    token,
    method: "POST",
    body: { sourceId: first.data.id, targetId: fourthStudent.data.id },
  })
  assert.equal(merged.status, 200, JSON.stringify(merged.data))
  const source = await api(pb.base, `/api/collections/students/records/${first.data.id}`, { token })
  assert.equal(source.status, 200, JSON.stringify(source.data))
  assert.equal(source.data.merged_into, fourthStudent.data.id)
  assert.equal(source.data.uid, first.data.uid)
  const history = await api(pb.base, "/api/xueqing/student-history?studentId=" + fourthStudent.data.id, { token })
  assert.equal(history.status, 200, JSON.stringify(history.data))
  assert.equal(history.data.records.some((item) => item.id === learned.data.id && item.source_student === first.data.id), true)
  const imported = await api(pb.base, "/api/xueqing/student-imports", {
    token,
    method: "POST",
    body: { classId: mixed.id, csv: "姓名,年级\n演示生05,三年级\n,四年级\n演示生06,三年级" },
  })
  assert.equal(imported.status, 400, JSON.stringify(imported.data))
  assert.match(imported.data.message, /第3行/)
  const left = await api(pb.base, "/api/collections/students/records?filter=" + encodeURIComponent("display_name='演示生05'"), { token })
  assert.equal(left.data.items.length, 0)
  const saved = await api(pb.base, "/api/xueqing/student-imports", {
    token,
    method: "POST",
    body: { classId: mixed.id, csv: "姓名,年级\n演示生05,三年级\n演示生06,四年级" },
  })
  assert.equal(saved.status, 200, JSON.stringify(saved.data))
  assert.equal(saved.data.ids.length, 2)
  assert.ok(admin.id && school.id)
})
