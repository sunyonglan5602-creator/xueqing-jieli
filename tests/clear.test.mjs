import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { api, login, startPocketBase } from "./pb.mjs"

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
  return { record: created.data, token: (await login(pb.base, username, PASSWORD)).data.token }
}

test("清除前保护：吊销后只能补传，放弃必须输入放弃，条数守恒", async () => {
  const org = (await api(pb.base, "/api/collections/organizations/records", { token: superToken, method: "POST", body: { name: "清除协会" } })).data
  const school = (await api(pb.base, "/api/collections/schools/records", { token: superToken, method: "POST", body: { name: "清除小学", org: org.id } })).data
  const admin = await user("clear-school", { roles: ["school_admin"], org: org.id, school: school.id })
  const teacher = await user("clear-teacher", { roles: ["teacher"], teacher_type: "长期支教", org: org.id, school: school.id })
  const orgAdmin = await user("clear-org", { roles: ["org_admin"], org: org.id })
  const bad = await api(pb.base, "/api/xueqing/clears", {
    token: teacher.token,
    method: "POST",
    body: { reason: "退出", pendingBefore: 2, uploaded: 0, kept: 0, abandoned: 2, abandonText: "放" },
  })
  assert.equal(bad.status, 400)
  const cleared = await api(pb.base, "/api/xueqing/clears", {
    token: teacher.token,
    method: "POST",
    body: { reason: "退出", pendingBefore: 20, uploaded: 0, kept: 20, abandoned: 0 },
  })
  assert.equal(cleared.status, 200, JSON.stringify(cleared.data))
  const remote = await api(pb.base, "/api/xueqing/devices/discard", { token: admin.token, method: "POST", body: { userId: teacher.record.id } })
  assert.equal(remote.status, 404)
  const revoked = await api(pb.base, "/api/xueqing/devices/revoke", {
    token: admin.token,
    method: "POST",
    body: { userId: teacher.record.id, lastPending: 15 },
  })
  assert.equal(revoked.status, 200, JSON.stringify(revoked.data))
  assert.equal(revoked.data.lastPending, 15)
  const span = Date.parse(revoked.data.uploadUntil) - Date.parse(revoked.data.revokedAt)
  assert.ok(Math.abs(span - 14 * 24 * 60 * 60 * 1000) < 5000)
  const visible = await api(pb.base, "/api/xueqing/dictionary/grades", { token: teacher.token })
  assert.equal(visible.status, 401, JSON.stringify(visible.data))
  const items = []
  for (let i = 0; i < 10; i += 1) items.push({ clientUid: "before-" + i, clientCreatedAt: "2020-01-01T00:00:00.000Z" })
  for (let i = 0; i < 5; i += 1) items.push({ clientUid: "after-" + i, clientCreatedAt: "2099-01-01T00:00:00.000Z" })
  const uploaded = await api(pb.base, "/api/xueqing/devices/upload", { token: teacher.token, method: "POST", body: { items } })
  assert.equal(uploaded.status, 200, JSON.stringify(uploaded.data))
  assert.equal(uploaded.data.stored.length, 10)
  assert.equal(uploaded.data.quarantined.length, 5)
  const frozen = await api(pb.base, "/api/xueqing/organization-freezes", { token: orgAdmin.token, method: "POST", body: { days: 7 } })
  assert.equal(frozen.status, 200, JSON.stringify(frozen.data))
  const during = await api(pb.base, "/api/xueqing/freeze-uploads", {
    token: teacher.token,
    method: "POST",
    body: { clientUid: "freeze-1", body: "冻结期内补传" },
  })
  assert.equal(during.status, 200, JSON.stringify(during.data))
  assert.equal(during.data.archive, true)
})
