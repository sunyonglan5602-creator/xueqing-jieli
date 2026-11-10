import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
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

async function asSuper(path, options = {}) {
  return api(pb.base, path, { ...options, token: superToken })
}

async function createOrg(name) {
  const response = await asSuper("/api/collections/organizations/records", {
    method: "POST",
    body: { name },
  })
  assert.equal(response.status, 200, JSON.stringify(response.data))
  return response.data
}

async function createSchool(name, org) {
  const response = await asSuper("/api/collections/schools/records", {
    method: "POST",
    body: { name, org },
  })
  assert.equal(response.status, 200, JSON.stringify(response.data))
  return response.data
}

async function createUser(fields) {
  const response = await asSuper("/api/collections/users/records", {
    method: "POST",
    body: {
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
      ...fields,
    },
  })
  assert.equal(response.status, 200, JSON.stringify(response.data))
  return response.data
}

describe("P0-01 登录和口令", () => {
  test("角色包含家长和教育局查看者，后者没有业务权限", async () => {
    const org = await createOrg("演示协会甲")
    const school = await createSchool("演示小学甲", org.id)
    const platform = await createUser({
      username: "demo-platform",
      display_name: "演示平台管理员",
      roles: ["platform_admin"],
    })
    const orgAdmin = await createUser({
      username: "demo-org-a",
      display_name: "演示协会甲负责人",
      roles: ["org_admin"],
      org: org.id,
    })
    const schoolAdmin = await createUser({
      username: "demo-school-a",
      display_name: "演示小学甲管理员",
      roles: ["school_admin", "teacher"],
      org: org.id,
      school: school.id,
    })
    const teacher = await createUser({
      username: "demo-teacher-a",
      display_name: "演示老师甲",
      roles: ["teacher"],
      org: org.id,
      school: school.id,
      must_change_password: true,
    })
    await createUser({
      username: "demo-parent-a",
      display_name: "演示家长甲",
      roles: ["parent"],
    })
    await createUser({
      username: "demo-edu",
      display_name: "演示教育局查看者",
      roles: ["education_bureau_viewer"],
    })

    const first = await login(pb.base, "demo-teacher-a", PASSWORD)
    assert.equal(first.status, 200)
    assert.equal(first.data.record.must_change_password, true)
    const blocked = await api(pb.base, "/api/collections/organizations/records", { token: first.data.token })
    assert.equal(blocked.status, 403)
    assert.match(blocked.data.message, /请先修改初始口令/)

    const changed = await api(pb.base, `/api/collections/users/records/${teacher.id}`, {
      token: first.data.token,
      method: "PATCH",
      body: { oldPassword: PASSWORD, password: "Demo-Pass-1111", passwordConfirm: "Demo-Pass-1111" },
    })
    assert.equal(changed.status, 200, JSON.stringify(changed.data))
    assert.equal(changed.data.must_change_password, false)
    const teacherReady = await login(pb.base, "demo-teacher-a", "Demo-Pass-1111")
    assert.equal(teacherReady.status, 200, JSON.stringify(teacherReady.data))
    const opened = await api(pb.base, "/api/collections/organizations/records", { token: teacherReady.data.token })
    assert.equal(opened.status, 200, JSON.stringify(opened.data))
    assert.equal(opened.data.items.length, 1)

    const promoted = await api(pb.base, `/api/collections/users/records/${teacher.id}`, {
      token: teacherReady.data.token,
      method: "PATCH",
      body: { roles: ["platform_admin"], must_change_password: true },
    })
    assert.equal(promoted.status, 200)
    assert.deepEqual(promoted.data.roles, ["teacher"])
    assert.equal(promoted.data.must_change_password, false)

    for (let i = 0; i < 4; i += 1) {
      const failed = await login(pb.base, "demo-school-a", "wrong-pass")
      assert.equal(failed.status, 400)
      assert.match(failed.data.message, /账号或口令不正确/)
    }
    const fifth = await login(pb.base, "demo-school-a", "wrong-pass")
    assert.equal(fifth.status, 400)
    assert.match(fifth.data.message, /锁定 15 分钟/)
    const locked = await login(pb.base, "demo-school-a", PASSWORD)
    assert.equal(locked.status, 400)
    assert.match(locked.data.message, /锁定 15 分钟/)
    const stored = await asSuper(`/api/collections/users/records/${schoolAdmin.id}`)
    const until = new Date(stored.data.locked_until).getTime()
    assert.ok(until > Date.now() + 14 * 60 * 1000)
    assert.ok(until < Date.now() + 16 * 60 * 1000)
    await asSuper(`/api/collections/users/records/${schoolAdmin.id}`, {
      method: "PATCH",
      body: { locked_until: "2000-01-01 00:00:00.000Z", failed_login_count: 0 },
    })
    const unlocked = await login(pb.base, "demo-school-a", PASSWORD)
    assert.equal(unlocked.status, 200, JSON.stringify(unlocked.data))

    const mail = await api(pb.base, "/api/collections/users/request-password-reset", {
      method: "POST",
      body: { email: "nobody@example.invalid" },
    })
    assert.equal(mail.status, 400)
    assert.match(mail.data.message, /上一级管理员/)

    const platformLogin = await login(pb.base, "demo-platform", PASSWORD)
    const started = Date.now()
    const reset = await api(pb.base, "/api/xueqing/password-resets", {
      token: platformLogin.data.token,
      method: "POST",
      body: { userId: orgAdmin.id },
    })
    assert.equal(reset.status, 200, JSON.stringify(reset.data))
    assert.ok(Date.now() - started < 1000)
    assert.equal(typeof reset.data.password, "string")
    assert.ok(reset.data.password.length >= 8)
    const audits = await api(pb.base, "/api/collections/audit_logs/records?filter=" + encodeURIComponent("action='password_reset'"), {
      token: platformLogin.data.token,
    })
    assert.equal(audits.status, 200)
    assert.equal(audits.data.items.length, 1)
    assert.equal(JSON.stringify(audits.data).includes(reset.data.password), false)
    const skip = await api(pb.base, "/api/xueqing/password-resets", {
      token: platformLogin.data.token,
      method: "POST",
      body: { userId: teacher.id },
    })
    assert.equal(skip.status, 404)
    assert.match(skip.data.message, /^不存在/)

    const orgLogin = await login(pb.base, "demo-org-a", reset.data.password)
    assert.equal(orgLogin.status, 200, JSON.stringify(orgLogin.data))
    assert.equal(orgLogin.data.record.must_change_password, true)
    const orgChanged = await api(pb.base, `/api/collections/users/records/${orgAdmin.id}`, {
      token: orgLogin.data.token,
      method: "PATCH",
      body: { oldPassword: reset.data.password, password: PASSWORD, passwordConfirm: PASSWORD },
    })
    assert.equal(orgChanged.status, 200, JSON.stringify(orgChanged.data))
    const orgReady = await login(pb.base, "demo-org-a", PASSWORD)
    const openedSchool = await api(pb.base, "/api/xueqing/accounts", {
      token: orgReady.data.token,
      method: "POST",
      body: { username: "demo-school-b", displayName: "演示小学乙管理员", schoolId: school.id, alsoTeacher: false },
    })
    assert.equal(openedSchool.status, 200, JSON.stringify(openedSchool.data))
    assert.deepEqual(openedSchool.data.user.roles, ["school_admin"])
    const openAudit = await api(pb.base, "/api/collections/audit_logs/records?filter=" + encodeURIComponent("action='account_opened'"), {
      token: orgReady.data.token,
    })
    assert.equal(openAudit.data.items.length, 1)

    const schoolLogin = await login(pb.base, "demo-school-a", PASSWORD)
    const otherOrg = await createOrg("演示协会乙")
    const otherSchool = await createSchool("演示小学乙", otherOrg.id)
    const otherAdmin = await createUser({
      username: "demo-school-c",
      display_name: "演示小学乙管理员",
      roles: ["school_admin"],
      org: otherOrg.id,
      school: otherSchool.id,
    })
    const cross = await api(pb.base, "/api/xueqing/password-resets", {
      token: schoolLogin.data.token,
      method: "POST",
      body: { userId: otherAdmin.id },
    })
    assert.equal(cross.status, 404)
    const teacherReset = await api(pb.base, "/api/xueqing/password-resets", {
      token: schoolLogin.data.token,
      method: "POST",
      body: { userId: teacher.id },
    })
    assert.equal(teacherReset.status, 200, JSON.stringify(teacherReset.data))

    const edu = await login(pb.base, "demo-edu", PASSWORD)
    const eduOrgs = await api(pb.base, "/api/collections/organizations/records", { token: edu.data.token })
    assert.equal(eduOrgs.status, 200)
    assert.equal(eduOrgs.data.items.length, 0)
    const parent = await login(pb.base, "demo-parent-a", PASSWORD)
    const parentOrgs = await api(pb.base, "/api/collections/organizations/records", { token: parent.data.token })
    assert.equal(parentOrgs.data.items.length, 0)

    const pack = await api(pb.base, "/api/collections/handover_packages/records", {
      token: schoolLogin.data.token,
      method: "POST",
      body: { title: "演示交接", initiator: teacher.id, org: otherOrg.id },
    })
    assert.equal(pack.status, 200, JSON.stringify(pack.data))
    assert.equal(pack.data.initiator, schoolAdmin.id)
    assert.equal(pack.data.org, org.id)
    const selfReview = await api(pb.base, "/api/collections/handover_reviews/records", {
      token: schoolLogin.data.token,
      method: "POST",
      body: { package: pack.data.id, note: "自己审" },
    })
    assert.equal(selfReview.status, 400)
    assert.match(selfReview.data.message, /不能审核自己发起的交接/)
    const teacherLogin = await login(pb.base, "demo-teacher-a", teacherReset.data.password)
    assert.equal(teacherLogin.status, 200, JSON.stringify(teacherLogin.data))
    const teacherChanged = await api(pb.base, `/api/collections/users/records/${teacher.id}`, {
      token: teacherLogin.data.token,
      method: "PATCH",
      body: {
        oldPassword: teacherReset.data.password,
        password: "Demo-Pass-2222",
        passwordConfirm: "Demo-Pass-2222",
      },
    })
    assert.equal(teacherChanged.status, 200, JSON.stringify(teacherChanged.data))
    const reviewer = await login(pb.base, "demo-teacher-a", "Demo-Pass-2222")
    const review = await api(pb.base, "/api/collections/handover_reviews/records", {
      token: reviewer.data.token,
      method: "POST",
      body: { package: pack.data.id, note: "另一位老师审" },
    })
    assert.equal(review.status, 200, JSON.stringify(review.data))
    assert.equal(review.data.reviewer, teacher.id)

    assert.ok(platform.id)
  })
})
