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

test("P0-27 档案缺项不能授权，只有本校和协会能看并写审计", async () => {
  const org = (await asSuper("/api/collections/organizations/records", { method: "POST", body: { name: "档案协会" } })).data
  const school = (await asSuper("/api/collections/schools/records", { method: "POST", body: { name: "档案小学", org: org.id } })).data
  const admin = (await asSuper("/api/collections/users/records", {
    method: "POST",
    body: {
      username: "volunteer-school",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "档案管理员",
      roles: ["school_admin"],
      org: org.id,
      school: school.id,
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })).data
  const orgAdmin = (await asSuper("/api/collections/users/records", {
    method: "POST",
    body: {
      username: "volunteer-org",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "档案协会负责人",
      roles: ["org_admin"],
      org: org.id,
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })).data
  const token = (await login(pb.base, "volunteer-school", PASSWORD)).data.token
  const tokenOrg = (await login(pb.base, "volunteer-org", PASSWORD)).data.token
  const opened = await api(pb.base, "/api/xueqing/accounts", {
    token,
    method: "POST",
    body: { username: "volunteer-teacher", displayName: "档案老师", teacherType: "长期支教" },
  })
  assert.equal(opened.status, 200, JSON.stringify(opened.data))
  const firstLogin = (await login(pb.base, "volunteer-teacher", opened.data.password)).data.token
  await api(pb.base, `/api/collections/users/records/${opened.data.user.id}`, {
    token: firstLogin,
    method: "PATCH",
    body: { oldPassword: opened.data.password, password: PASSWORD, passwordConfirm: PASSWORD },
  })
  const teacherToken = (await login(pb.base, "volunteer-teacher", PASSWORD)).data.token
  const klass = (await api(pb.base, "/api/collections/classes/records", {
    token,
    method: "POST",
    body: { name: "档案班", school: school.id, org: org.id, grades: ["三年级"] },
  })).data
  const blocked = await api(pb.base, "/api/collections/teaching_assignments/records", {
    token,
    method: "POST",
    body: { class: klass.id, teacher: opened.data.user.id, subject: "语文", school: school.id, org: org.id },
  })
  assert.equal(blocked.status, 400, JSON.stringify(blocked.data))
  assert.match(blocked.data.message, /缺少：.*违法犯罪记录查询回执/)
  const partial = await api(pb.base, "/api/collections/teacher_profiles/records", {
    token,
    method: "POST",
    body: {
      user: opened.data.user.id,
      crime_check_no: "演示回执001",
      crime_check_date: "2026-01-01 00:00:00.000Z",
      training_note: "已完成岗前见习",
      confidentiality_accepted: false,
      duty: "辅助教学",
    },
  })
  assert.equal(partial.status, 200, JSON.stringify(partial.data))
  const still = await api(pb.base, "/api/collections/teaching_assignments/records", {
    token,
    method: "POST",
    body: { class: klass.id, teacher: opened.data.user.id, subject: "语文", school: school.id, org: org.id },
  })
  assert.equal(still.status, 400, JSON.stringify(still.data))
  assert.match(still.data.message, /保密承诺/)
  const finished = await api(pb.base, `/api/collections/teacher_profiles/records/${partial.data.id}`, {
    token,
    method: "PATCH",
    body: { confidentiality_accepted: true },
  })
  assert.equal(finished.status, 200, JSON.stringify(finished.data))
  const duty = await api(pb.base, "/api/collections/teaching_assignments/records", {
    token,
    method: "POST",
    body: { class: klass.id, teacher: opened.data.user.id, subject: "语文", school: school.id, org: org.id },
  })
  assert.equal(duty.status, 200, JSON.stringify(duty.data))
  const hidden = await api(pb.base, `/api/collections/teacher_profiles/records/${partial.data.id}`, { token: teacherToken })
  assert.equal(hidden.status, 404, JSON.stringify(hidden.data))
  assert.match(hidden.data.message, /^不存在/)
  const viewed = await api(pb.base, `/api/collections/teacher_profiles/records/${partial.data.id}`, { token })
  assert.equal(viewed.status, 200, JSON.stringify(viewed.data))
  const orgView = await api(pb.base, `/api/collections/teacher_profiles/records/${partial.data.id}`, { token: tokenOrg })
  assert.equal(orgView.status, 200, JSON.stringify(orgView.data))
  const audits = await api(pb.base, "/api/xueqing/audits?actor=" + admin.id, { token })
  assert.ok(audits.data.items.some((item) => item.action === "volunteer_view"))
  const orgAudits = await api(pb.base, "/api/xueqing/audits?actor=" + orgAdmin.id, { token: tokenOrg })
  assert.ok(orgAudits.data.items.some((item) => item.action === "volunteer_view"))
})
