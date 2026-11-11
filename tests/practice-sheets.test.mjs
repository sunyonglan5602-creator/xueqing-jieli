import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { api, login, registerVolunteer, startPocketBase } from "./pb.mjs"

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

async function teacherOf(adminToken, username) {
  const opened = await api(pb.base, "/api/xueqing/accounts", {
    token: adminToken,
    method: "POST",
    body: { username, displayName: username, teacherType: "长期支教" },
  })
  const first = (await login(pb.base, username, opened.data.password)).data.token
  await api(pb.base, `/api/collections/users/records/${opened.data.user.id}`, {
    token: first,
    method: "PATCH",
    body: { oldPassword: opened.data.password, password: PASSWORD, passwordConfirm: PASSWORD },
  })
  await registerVolunteer(pb.base, adminToken, opened.data.user.id)
  return (await login(pb.base, username, PASSWORD)).data.token
}

test("手工挑题生成练习单，不自动推送也不生成变式题", async () => {
  const org = (await api(pb.base, "/api/collections/organizations/records", {
    token: superToken,
    method: "POST",
    body: { name: "练习单协会" },
  })).data
  const school = (await api(pb.base, "/api/collections/schools/records", {
    token: superToken,
    method: "POST",
    body: { name: "练习单小学", org: org.id },
  })).data
  const orgB = (await api(pb.base, "/api/collections/organizations/records", {
    token: superToken,
    method: "POST",
    body: { name: "练习单协会乙" },
  })).data
  const schoolB = (await api(pb.base, "/api/collections/schools/records", {
    token: superToken,
    method: "POST",
    body: { name: "练习单小学乙", org: orgB.id },
  })).data
  const admin = await api(pb.base, "/api/collections/users/records", {
    token: superToken,
    method: "POST",
    body: {
      username: "sheet-school",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "练习单管理员",
      roles: ["school_admin"],
      org: org.id,
      school: school.id,
      teacher_type: "长期支教",
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })
  const adminB = await api(pb.base, "/api/collections/users/records", {
    token: superToken,
    method: "POST",
    body: {
      username: "sheet-school-b",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "练习单管理员乙",
      roles: ["school_admin"],
      org: orgB.id,
      school: schoolB.id,
      teacher_type: "长期支教",
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })
  assert.equal(admin.status, 200, JSON.stringify(admin.data))
  assert.equal(adminB.status, 200, JSON.stringify(adminB.data))
  const adminToken = (await login(pb.base, "sheet-school", PASSWORD)).data.token
  const adminBToken = (await login(pb.base, "sheet-school-b", PASSWORD)).data.token
  const teacherToken = await teacherOf(adminToken, "sheet-teacher")
  const otherToken = await teacherOf(adminToken, "sheet-teacher-b")
  const base = {
    subjectCode: "C",
    grade: "三年级",
    textbook: "人教版",
    knowledgeCode: "C-3-001",
    originalAuthorized: true,
    answer: "不印到练习单上的答案",
  }
  const first = await api(pb.base, "/api/xueqing/questions", {
    token: teacherToken,
    method: "POST",
    body: { ...base, stem: "第一题" },
  })
  const second = await api(pb.base, "/api/xueqing/questions", {
    token: teacherToken,
    method: "POST",
    body: { ...base, stem: "第二题" },
  })
  assert.equal(first.status, 200, JSON.stringify(first.data))
  assert.equal(second.status, 200, JSON.stringify(second.data))
  const empty = await api(pb.base, "/api/xueqing/practice-sheets", {
    token: teacherToken,
    method: "POST",
    body: { questionIds: [] },
  })
  assert.equal(empty.status, 400)
  assert.match(empty.data.message, /请勾选题目/)
  for (const extra of [{ auto: true }, { variant: true }, { mode: "错题推送" }, { mode: "变式" }]) {
    const rejected = await api(pb.base, "/api/xueqing/practice-sheets", {
      token: teacherToken,
      method: "POST",
      body: { questionIds: [first.data.id], ...extra },
    })
    assert.equal(rejected.status, 400, JSON.stringify(rejected.data))
    assert.match(rejected.data.message, /不自动按错题推送/)
  }
  const sheet = await api(pb.base, "/api/xueqing/practice-sheets", {
    token: teacherToken,
    method: "POST",
    body: { questionIds: [second.data.id, first.data.id] },
  })
  assert.equal(sheet.status, 200, JSON.stringify(sheet.data))
  assert.equal(sheet.data.title, "练习单")
  assert.deepEqual(sheet.data.items.map((item) => item.stem), ["第二题", "第一题"])
  assert.equal(JSON.stringify(sheet.data).includes("不印到练习单上的答案"), false)
  const again = await api(pb.base, "/api/xueqing/practice-sheets/one?id=" + sheet.data.id, { token: teacherToken })
  assert.equal(again.status, 200)
  assert.equal(again.data.items.length, 2)
  const other = await api(pb.base, "/api/xueqing/practice-sheets/one?id=" + sheet.data.id, { token: otherToken })
  assert.equal(other.status, 404)
  assert.match(other.data.message, /^不存在/)
  const outside = await api(pb.base, "/api/xueqing/practice-sheets/one?id=" + sheet.data.id, { token: adminBToken })
  assert.equal(outside.status, 404)
  assert.match(outside.data.message, /^不存在/)
  await api(pb.base, "/api/xueqing/questions/unpublish", {
    token: teacherToken,
    method: "POST",
    body: { id: first.data.id },
  })
  const hidden = await api(pb.base, "/api/xueqing/practice-sheets", {
    token: teacherToken,
    method: "POST",
    body: { questionIds: [first.data.id] },
  })
  assert.equal(hidden.status, 404)
  assert.match(hidden.data.message, /^不存在/)
  const direct = await api(pb.base, "/api/collections/practice_sheets/records", {
    token: teacherToken,
    method: "POST",
    body: { title: "直接写", org: org.id },
  })
  assert.equal(direct.status, 404)
})
