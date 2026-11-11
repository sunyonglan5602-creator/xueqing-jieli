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

async function user(username, fields) {
  const created = await api(pb.base, "/api/collections/users/records", {
    token: superToken,
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
  assert.equal(created.status, 200, JSON.stringify(created.data))
  return created.data
}

async function teacherOf(adminToken, username) {
  const opened = await api(pb.base, "/api/xueqing/accounts", {
    token: adminToken,
    method: "POST",
    body: { username, displayName: username, teacherType: "长期支教" },
  })
  assert.equal(opened.status, 200, JSON.stringify(opened.data))
  const first = (await login(pb.base, username, opened.data.password)).data.token
  await api(pb.base, `/api/collections/users/records/${opened.data.user.id}`, {
    token: first,
    method: "PATCH",
    body: { oldPassword: opened.data.password, password: PASSWORD, passwordConfirm: PASSWORD },
  })
  await registerVolunteer(pb.base, adminToken, opened.data.user.id)
  return (await login(pb.base, username, PASSWORD)).data.token
}

test("P0-47 自建题必填、授权、可见范围和审计", async () => {
  const org = (await api(pb.base, "/api/collections/organizations/records", {
    token: superToken,
    method: "POST",
    body: { name: "题目协会" },
  })).data
  const school = (await api(pb.base, "/api/collections/schools/records", {
    token: superToken,
    method: "POST",
    body: { name: "题目小学", org: org.id },
  })).data
  const schoolB = (await api(pb.base, "/api/collections/schools/records", {
    token: superToken,
    method: "POST",
    body: { name: "题目小学乙", org: org.id },
  })).data
  const orgB = (await api(pb.base, "/api/collections/organizations/records", {
    token: superToken,
    method: "POST",
    body: { name: "题目协会乙" },
  })).data
  const schoolC = (await api(pb.base, "/api/collections/schools/records", {
    token: superToken,
    method: "POST",
    body: { name: "题目小学丙", org: orgB.id },
  })).data
  await user("q-school", { display_name: "题目管理员", roles: ["school_admin"], org: org.id, school: school.id, teacher_type: "长期支教" })
  await user("q-school-b", { display_name: "题目管理员乙", roles: ["school_admin"], org: org.id, school: schoolB.id, teacher_type: "长期支教" })
  await user("q-school-c", { display_name: "题目管理员丙", roles: ["school_admin"], org: orgB.id, school: schoolC.id, teacher_type: "长期支教" })
  await user("q-org", { display_name: "题目协会负责人", roles: ["org_admin"], org: org.id })
  const adminToken = (await login(pb.base, "q-school", PASSWORD)).data.token
  const adminBToken = (await login(pb.base, "q-school-b", PASSWORD)).data.token
  const adminCToken = (await login(pb.base, "q-school-c", PASSWORD)).data.token
  const orgToken = (await login(pb.base, "q-org", PASSWORD)).data.token
  const teacherToken = await teacherOf(adminToken, "q-teacher")
  const otherToken = await teacherOf(adminBToken, "q-teacher-b")
  const body = {
    subjectCode: "C",
    grade: "三年级",
    textbook: "人教版",
    knowledgeCode: "C-3-001",
    stem: "把看到的句子抄写一遍",
    answer: "抄写完整",
    explanation: "先读再写",
    errorCode: "ET01",
    difficulty: "基础",
    originalAuthorized: true,
  }
  const missing = await api(pb.base, "/api/xueqing/questions", {
    token: teacherToken,
    method: "POST",
    body: { ...body, subjectCode: "" },
  })
  assert.equal(missing.status, 400, JSON.stringify(missing.data))
  assert.match(missing.data.message, /学科/)
  for (const [key, message] of [["grade", "年级"], ["textbook", "教材"], ["knowledgeCode", "知识点"], ["stem", "文字"]]) {
    const next = { ...body }
    next[key] = ""
    const rejected = await api(pb.base, "/api/xueqing/questions", { token: teacherToken, method: "POST", body: next })
    assert.equal(rejected.status, 400, JSON.stringify(rejected.data))
    assert.match(rejected.data.message, new RegExp(message))
  }
  const unauthorized = await api(pb.base, "/api/xueqing/questions", {
    token: teacherToken,
    method: "POST",
    body: { ...body, originalAuthorized: false },
  })
  assert.equal(unauthorized.status, 400, JSON.stringify(unauthorized.data))
  assert.match(unauthorized.data.message, /原创或已获授权/)
  const tooMany = await api(pb.base, "/api/xueqing/questions", {
    token: teacherToken,
    method: "POST",
    body: { ...body, images: ["YQ==", "Yg=="] },
  })
  assert.equal(tooMany.status, 400)
  assert.match(tooMany.data.message, /最多一张/)
  const remote = await api(pb.base, "/api/xueqing/questions", {
    token: teacherToken,
    method: "POST",
    body: { ...body, image: "https://example.invalid/a.jpg" },
  })
  assert.equal(remote.status, 400)
  assert.match(remote.data.message, /只存在本系统/)
  const big = await api(pb.base, "/api/xueqing/questions", {
    token: teacherToken,
    method: "POST",
    body: { ...body, image: "A".repeat(410000) },
  })
  assert.equal(big.status, 400)
  assert.match(big.data.message, /300KB/)
  const before = await api(pb.base, "/api/xueqing/audits", { token: adminToken })
  assert.equal(before.data.items.some((item) => item.action === "question_save"), false)
  const saved = await api(pb.base, "/api/xueqing/questions", { token: teacherToken, method: "POST", body })
  assert.equal(saved.status, 200, JSON.stringify(saved.data))
  assert.equal(saved.data.visibility, "本校")
  assert.equal(saved.data.originalAuthorized, true)
  assert.equal(saved.data.answer, "抄写完整")
  assert.equal(saved.data.explanation, "先读再写")
  assert.equal(saved.data.errorCode, "ET01")
  assert.equal(saved.data.difficulty, "基础")
  assert.equal(saved.data.status, "在用")
  assert.equal(saved.data.image, "")
  const shared = await api(pb.base, "/api/xueqing/questions", {
    token: teacherToken,
    method: "POST",
    body: { ...body, stem: "共享到组织的题", shareToOrg: true, answer: "", explanation: "", errorCode: "", difficulty: "" },
  })
  assert.equal(shared.status, 200, JSON.stringify(shared.data))
  assert.equal(shared.data.visibility, "本组织")
  const hidden = await api(pb.base, "/api/xueqing/questions/one?id=" + saved.data.id, { token: otherToken })
  assert.equal(hidden.status, 404, JSON.stringify(hidden.data))
  assert.match(hidden.data.message, /^不存在/)
  const seen = await api(pb.base, "/api/xueqing/questions/one?id=" + shared.data.id, { token: otherToken })
  assert.equal(seen.status, 200, JSON.stringify(seen.data))
  const otherList = await api(pb.base, "/api/xueqing/questions", { token: otherToken })
  assert.equal(otherList.data.items.some((item) => item.id === saved.data.id), false)
  assert.equal(otherList.data.items.some((item) => item.id === shared.data.id), true)
  const orgList = await api(pb.base, "/api/xueqing/questions", { token: orgToken })
  assert.equal(orgList.data.items.some((item) => item.id === saved.data.id), false)
  assert.equal(orgList.data.items.some((item) => item.id === shared.data.id), true)
  const outside = await api(pb.base, "/api/xueqing/questions/one?id=" + saved.data.id, { token: adminCToken })
  assert.equal(outside.status, 404)
  assert.match(outside.data.message, /^不存在/)
  const outsideShared = await api(pb.base, "/api/xueqing/questions/one?id=" + shared.data.id, { token: adminCToken })
  assert.equal(outsideShared.status, 404)
  const direct = await api(pb.base, "/api/collections/teacher_questions/records", {
    token: teacherToken,
    method: "POST",
    body: { stem: "直接写", org: org.id },
  })
  assert.equal(direct.status, 404)
  const pushed = await api(pb.base, "/api/xueqing/questions/push", {
    token: teacherToken,
    method: "POST",
    body: { id: saved.data.id },
  })
  assert.equal(pushed.status, 404)
  const removed = await api(pb.base, "/api/xueqing/questions/unpublish", {
    token: teacherToken,
    method: "POST",
    body: { id: shared.data.id },
  })
  assert.equal(removed.status, 200, JSON.stringify(removed.data))
  assert.equal(removed.data.status, "已下架")
  const afterHide = await api(pb.base, "/api/xueqing/questions/one?id=" + shared.data.id, { token: otherToken })
  assert.equal(afterHide.status, 404)
  const authorStill = await api(pb.base, "/api/xueqing/questions/one?id=" + shared.data.id, { token: teacherToken })
  assert.equal(authorStill.status, 200)
  const revoked = await api(pb.base, "/api/xueqing/questions/revoke", {
    token: teacherToken,
    method: "POST",
    body: { id: saved.data.id },
  })
  assert.equal(revoked.status, 200, JSON.stringify(revoked.data))
  assert.equal(revoked.data.status, "已撤销")
  const audits = await api(pb.base, "/api/xueqing/audits", { token: adminToken })
  const actions = audits.data.items.map((item) => item.action)
  assert.equal(actions.filter((item) => item === "question_save").length, 2)
  assert.equal(actions.includes("question_unpublish"), true)
  assert.equal(actions.includes("question_revoke"), true)
})
