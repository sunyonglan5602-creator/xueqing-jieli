import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { after, before, test } from "node:test"
import { api, login, registerConsent, registerVolunteer, startPocketBase } from "./pb.mjs"

const require = createRequire(import.meta.url)
const wuyu = require("../pocketbase/pb_hooks/dictionary_wuyu.js")
const PASSWORD = "Demo-Pass-0000"
let pb

before(async () => {
  pb = await startPocketBase()
})

after(async () => {
  if (pb) await pb.stop()
})

test("P0-11 五育关键词数量、低高年级写法和一键保存", async () => {
  const counts = {}
  for (const item of wuyu.keywords) counts[item.dimension] = (counts[item.dimension] || 0) + 1
  assert.deepEqual(counts, { de: 8, zhi: 8, ti: 7, mei: 7, lao: 7 })
  assert.equal(wuyu.dimensions.length, 5)
  assert.deepEqual(wuyu.dimensions.map((item) => item.icon), ["小红花", "小黄星", "小绿叶", "小调色盘", "小苗"])

  const superToken = (await login(pb.base, pb.email, pb.password, "_superusers")).data.token
  const org = (await api(pb.base, "/api/collections/organizations/records", { token: superToken, method: "POST", body: { name: "五育协会" } })).data
  const school = (await api(pb.base, "/api/collections/schools/records", { token: superToken, method: "POST", body: { name: "五育小学", org: org.id } })).data
  const adminToken = (await login(pb.base, (await api(pb.base, "/api/collections/users/records", {
    token: superToken,
    method: "POST",
    body: {
      username: "wuyu-school",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "五育管理员",
      roles: ["school_admin"],
      org: org.id,
      school: school.id,
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })).data.username, PASSWORD)).data.token
  const opened = await api(pb.base, "/api/xueqing/accounts", {
    token: adminToken,
    method: "POST",
    body: { username: "wuyu-teacher", displayName: "五育老师", teacherType: "长期支教" },
  })
  const first = (await login(pb.base, "wuyu-teacher", opened.data.password)).data.token
  await api(pb.base, `/api/collections/users/records/${opened.data.user.id}`, {
    token: first,
    method: "PATCH",
    body: { oldPassword: opened.data.password, password: PASSWORD, passwordConfirm: PASSWORD },
  })
  const teacherToken = (await login(pb.base, "wuyu-teacher", PASSWORD)).data.token
  await registerVolunteer(pb.base, adminToken, opened.data.user.id)
  const klass = (await api(pb.base, "/api/collections/classes/records", {
    token: adminToken,
    method: "POST",
    body: { name: "五育班", school: school.id, org: org.id, grades: ["三年级", "四年级"] },
  })).data
  await api(pb.base, "/api/collections/teaching_assignments/records", {
    token: adminToken,
    method: "POST",
    body: { class: klass.id, teacher: opened.data.user.id, subject: "语文", school: school.id, org: org.id },
  })
  const low = (await api(pb.base, "/api/xueqing/students", {
    token: adminToken,
    method: "POST",
    body: { displayName: "低年级生", grade: "三年级", classId: klass.id },
  })).data
  const high = (await api(pb.base, "/api/xueqing/students", {
    token: adminToken,
    method: "POST",
    body: { displayName: "高年级生", grade: "四年级", classId: klass.id },
  })).data
  await registerConsent(pb.base, adminToken, low.id)
  await registerConsent(pb.base, adminToken, high.id)
  const listed = await api(pb.base, "/api/xueqing/wuyu/keywords", { token: teacherToken })
  assert.equal(listed.status, 200, JSON.stringify(listed.data))
  assert.equal(listed.data.keywords.filter((item) => item.dimension === "de").length, 8)
  assert.equal(JSON.stringify(listed.data).includes("心理"), false)
  const keyword = listed.data.keywords.find((item) => item.keyword === "遵守约定")
  const started = Date.now()
  const saved = await api(pb.base, "/api/xueqing/wuyu", {
    token: teacherToken,
    method: "POST",
    body: { studentIds: [low.id, high.id], keywordCode: keyword.code, clientUid: "wuyu-batch" },
  })
  assert.equal(saved.status, 200, JSON.stringify(saved.data))
  assert.ok(Date.now() - started < 5000)
  assert.equal(saved.data.items.length, 2)
  assert.equal(saved.data.items.find((item) => item.student === low.id).wording, keyword.low_text)
  assert.equal(saved.data.items.find((item) => item.student === high.id).wording, keyword.high_text)
  assert.equal(saved.data.items.every((item) => item.fact === ""), true)
  const withFact = await api(pb.base, "/api/xueqing/wuyu", {
    token: teacherToken,
    method: "POST",
    body: { studentIds: [low.id], keywordCode: keyword.code, fact: "今天分组时把椅子搬回原处", clientUid: "wuyu-fact" },
  })
  assert.equal(withFact.status, 200, JSON.stringify(withFact.data))
  assert.equal(withFact.data.items[0].fact, "今天分组时把椅子搬回原处")
  const history = await api(pb.base, "/api/xueqing/wuyu?studentId=" + low.id, { token: teacherToken })
  assert.equal(history.data.items.some((item) => item.fact === "今天分组时把椅子搬回原处"), true)
  const blocked = await api(pb.base, "/api/collections/wuyu_records/records", {
    token: teacherToken,
    method: "POST",
    body: { body: "不该直接写", org: org.id },
  })
  assert.equal(blocked.status, 404)
  const text = JSON.stringify(saved.data) + JSON.stringify(listed.data)
  assert.equal(/总分|排名|朵/.test(text), false)
})
