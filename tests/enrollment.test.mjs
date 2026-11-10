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

async function asSuper(urlPath, options = {}) {
  return api(pb.base, urlPath, { ...options, token: superToken })
}

test("P0-31 转班、升级、转校只追加，编号不变，旧记录仍可查", async () => {
  const org = (await asSuper("/api/collections/organizations/records", { method: "POST", body: { name: "在班协会" } })).data
  const schoolA = (await asSuper("/api/collections/schools/records", { method: "POST", body: { name: "在班小学甲", org: org.id } })).data
  const schoolB = (await asSuper("/api/collections/schools/records", { method: "POST", body: { name: "在班小学乙", org: org.id } })).data
  await asSuper("/api/collections/users/records", {
    method: "POST",
    body: {
      username: "enroll-org",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "在班协会负责人",
      roles: ["org_admin"],
      org: org.id,
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })
  await asSuper("/api/collections/users/records", {
    method: "POST",
    body: {
      username: "enroll-school-a",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "在班小学甲管理员",
      roles: ["school_admin"],
      org: org.id,
      school: schoolA.id,
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })
  await asSuper("/api/collections/users/records", {
    method: "POST",
    body: {
      username: "enroll-school-b",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "在班小学乙管理员",
      roles: ["school_admin"],
      org: org.id,
      school: schoolB.id,
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })
  const tokenOrg = (await login(pb.base, "enroll-org", PASSWORD)).data.token
  const tokenA = (await login(pb.base, "enroll-school-a", PASSWORD)).data.token
  const tokenB = (await login(pb.base, "enroll-school-b", PASSWORD)).data.token
  const classA1 = (await api(pb.base, "/api/collections/classes/records", {
    token: tokenA,
    method: "POST",
    body: { name: "三年级1班", school: schoolA.id, org: org.id, grades: ["三年级", "四年级"] },
  })).data
  const classA2 = (await api(pb.base, "/api/collections/classes/records", {
    token: tokenA,
    method: "POST",
    body: { name: "三年级2班", school: schoolA.id, org: org.id, grades: ["三年级", "四年级"] },
  })).data
  const classB = (await api(pb.base, "/api/collections/classes/records", {
    token: tokenB,
    method: "POST",
    body: { name: "乙校四年级", school: schoolB.id, org: org.id, grades: ["四年级"] },
  })).data
  const created = await api(pb.base, "/api/xueqing/students", {
    token: tokenA,
    method: "POST",
    body: { displayName: "在班生", grade: "三年级", classId: classA1.id },
  })
  assert.equal(created.status, 200, JSON.stringify(created.data))
  const uid = created.data.uid
  const learned = await api(pb.base, "/api/collections/learning_records/records", {
    token: tokenA,
    method: "POST",
    body: { student: created.data.id, subject: "语文", body: "转班前的记录", org: org.id, version: 1, uid: "00000000-0000-7000-8000-000000000051" },
  })
  assert.equal(learned.status, 200, JSON.stringify(learned.data))
  const duplicated = await api(pb.base, "/api/collections/class_memberships/records", {
    token: tokenA,
    method: "POST",
    body: { student: created.data.id, class: classA2.id, org: org.id },
  })
  assert.equal(duplicated.status, 400, JSON.stringify(duplicated.data))
  assert.match(duplicated.data.message, /学生同一时间只能在一个班/)
  const transferred = await api(pb.base, "/api/xueqing/enrollments", {
    token: tokenA,
    method: "POST",
    body: { studentId: created.data.id, classId: classA2.id, kind: "转班" },
  })
  assert.equal(transferred.status, 200, JSON.stringify(transferred.data))
  assert.equal(transferred.data.uid, uid)
  const promoted = await api(pb.base, "/api/xueqing/enrollments", {
    token: tokenA,
    method: "POST",
    body: { studentId: created.data.id, classId: classA2.id, kind: "升级", grade: "四年级" },
  })
  assert.equal(promoted.status, 200, JSON.stringify(promoted.data))
  assert.equal(promoted.data.uid, uid)
  assert.equal(promoted.data.grade, "四年级")
  const schoolMove = await api(pb.base, "/api/xueqing/enrollments", {
    token: tokenA,
    method: "POST",
    body: { studentId: created.data.id, classId: classB.id, kind: "转校" },
  })
  assert.equal(schoolMove.status, 404)
  const moved = await api(pb.base, "/api/xueqing/enrollments", {
    token: tokenOrg,
    method: "POST",
    body: { studentId: created.data.id, classId: classB.id, kind: "转校" },
  })
  assert.equal(moved.status, 200, JSON.stringify(moved.data))
  assert.equal(moved.data.uid, uid)
  assert.equal(moved.data.school, schoolB.id)
  const oldStill = await api(pb.base, `/api/collections/learning_records/records/${learned.data.id}`, { token: tokenA })
  assert.equal(oldStill.status, 200, JSON.stringify(oldStill.data))
  assert.equal(oldStill.data.body, "转班前的记录")
  const arrived = await api(pb.base, `/api/collections/students/records/${created.data.id}`, { token: tokenB })
  assert.equal(arrived.status, 200, JSON.stringify(arrived.data))
  assert.equal(arrived.data.uid, uid)
  const renamed = await api(pb.base, `/api/collections/students/records/${created.data.id}`, {
    token: tokenB,
    method: "PATCH",
    body: { uid: "00000000-0000-7000-8000-000000000099" },
  })
  assert.equal(renamed.status, 200, JSON.stringify(renamed.data))
  assert.equal(renamed.data.uid, uid)
  const rows = await asSuper("/api/collections/class_memberships/records?filter=" + encodeURIComponent(`student='${created.data.id}'`))
  assert.ok(rows.data.items.length >= 4, JSON.stringify(rows.data))
  assert.equal(rows.data.items.some((item) => item.change_kind === "转校"), true)
})
