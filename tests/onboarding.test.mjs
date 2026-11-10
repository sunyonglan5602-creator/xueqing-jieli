import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { after, before, describe, test } from "node:test"
import path from "node:path"
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

describe("入驻", { concurrency: 1 }, () => {
test("P0-22 未审核不能进业务页，开通和停用写入平台审计", async () => {
  const platform = await createUser({
    username: "review-platform",
    display_name: "演示平台管理员",
    roles: ["platform_admin"],
  })
  const tokenPlatform = (await login(pb.base, "review-platform", PASSWORD)).data.token
  const applied = await api(pb.base, "/api/xueqing/applications", {
    method: "POST",
    body: { name: "待审协会", contact: "演示联系人", partnerSchools: "演示小学甲" },
  })
  assert.equal(applied.status, 200, JSON.stringify(applied.data))
  assert.equal(applied.data.status, "待审核")
  const duplicate = await api(pb.base, "/api/xueqing/applications", {
    method: "POST",
    body: { name: "待审协会", contact: "另一个人", partnerSchools: "演示小学乙" },
  })
  assert.equal(duplicate.status, 400)
  assert.match(duplicate.data.message, /已存在/)

  const admin = await createUser({
    username: "review-org",
    display_name: "待审协会负责人",
    roles: ["org_admin"],
    org: applied.data.id,
  })
  const tokenOrg = (await login(pb.base, "review-org", PASSWORD)).data.token
  const blocked = await api(pb.base, "/api/collections/schools/records", { token: tokenOrg })
  assert.equal(blocked.status, 403, JSON.stringify(blocked.data))
  assert.match(blocked.data.message, /未审核的协会不能进入业务页/)
  const own = await api(pb.base, `/api/collections/users/records/${admin.id}`, { token: tokenOrg })
  assert.equal(own.status, 200)

  const stranger = await createUser({
    username: "review-stranger",
    display_name: "演示协会管理员",
    roles: ["org_admin"],
    org: (await asSuper("/api/collections/organizations/records", { method: "POST", body: { name: "已开通协会" } })).data.id,
  })
  const tokenStranger = (await login(pb.base, "review-stranger", PASSWORD)).data.token
  const denied = await api(pb.base, "/api/xueqing/organization-reviews", {
    token: tokenStranger,
    method: "POST",
    body: { orgId: applied.data.id, action: "开通" },
  })
  assert.equal(denied.status, 403)

  const opened = await api(pb.base, "/api/xueqing/organization-reviews", {
    token: tokenPlatform,
    method: "POST",
    body: { orgId: applied.data.id, action: "开通" },
  })
  assert.equal(opened.status, 200, JSON.stringify(opened.data))
  assert.equal(opened.data.status, "已开通")
  const schools = await api(pb.base, "/api/collections/schools/records", { token: tokenOrg })
  assert.equal(schools.status, 200, JSON.stringify(schools.data))
  const openAudit = await api(pb.base, "/api/xueqing/audits?actor=" + platform.id, { token: tokenPlatform })
  assert.equal(openAudit.status, 200, JSON.stringify(openAudit.data))
  assert.ok(openAudit.data.items.some((item) => item.action === "org_opened" && item.target_id === applied.data.id))

  const school = await api(pb.base, "/api/collections/schools/records", {
    token: tokenOrg,
    method: "POST",
    body: { name: "待审协会小学", org: applied.data.id },
  })
  assert.equal(school.status, 200, JSON.stringify(school.data))
  const schoolAdmin = await api(pb.base, "/api/xueqing/accounts", {
    token: tokenOrg,
    method: "POST",
    body: { username: "review-school", displayName: "待审协会学校管理员", schoolId: school.data.id },
  })
  assert.equal(schoolAdmin.status, 200, JSON.stringify(schoolAdmin.data))
  assert.deepEqual(schoolAdmin.data.user.roles, ["school_admin"])

  const disabled = await api(pb.base, "/api/xueqing/organization-reviews", {
    token: tokenPlatform,
    method: "POST",
    body: { orgId: applied.data.id, action: "停用" },
  })
  assert.equal(disabled.status, 200, JSON.stringify(disabled.data))
  assert.equal(disabled.data.status, "已停用")
  const after = await api(pb.base, "/api/collections/schools/records", { token: tokenOrg })
  assert.equal(after.status, 403)
  assert.match(after.data.message, /协会已停用/)
  const disableAudit = await api(pb.base, "/api/xueqing/audits?actor=" + platform.id, { token: tokenPlatform })
  assert.ok(disableAudit.data.items.some((item) => item.action === "org_disabled" && item.target_id === applied.data.id))
  assert.ok(stranger.id)
})

test("审计哈希链能发现被改过的记录", async () => {
  const platform = await createUser({
    username: "chain-platform",
    display_name: "链路平台管理员",
    roles: ["platform_admin"],
  })
  const tokenPlatform = (await login(pb.base, "chain-platform", PASSWORD)).data.token
  const first = await api(pb.base, "/api/collections/organizations/records", {
    token: tokenPlatform,
    method: "POST",
    body: { name: "链路协会甲" },
  })
  assert.equal(first.status, 200, JSON.stringify(first.data))
  assert.equal(first.data.status, "已开通")
  const second = await api(pb.base, "/api/collections/organizations/records", {
    token: tokenPlatform,
    method: "POST",
    body: { name: "链路协会乙" },
  })
  assert.equal(second.status, 200, JSON.stringify(second.data))

  const listed = await asSuper("/api/collections/audit_logs/records?filter=" + encodeURIComponent("action='org_opened'") + "&sort=chain_seq")
  assert.equal(listed.status, 200, JSON.stringify(listed.data))
  const rows = listed.data.items.filter((item) => item.target_id === first.data.id || item.target_id === second.data.id)
  assert.equal(rows.length, 2, JSON.stringify(listed.data.items))
  assert.equal(rows[1].prev_hash, rows[0].record_hash)
  assert.notEqual(rows[0].record_hash, "")
  const intact = await api(pb.base, "/api/xueqing/audit-chain", { token: tokenPlatform })
  assert.equal(intact.status, 200, JSON.stringify(intact.data))
  assert.equal(intact.data.ok, true)

  const database = new DatabaseSync(path.join(pb.dir, "data.db"))
  database.exec("PRAGMA busy_timeout = 5000")
  const changed = database.prepare("UPDATE audit_logs SET action = ? WHERE id = ?").run("tampered", rows[0].id)
  database.close()
  assert.equal(changed.changes, 1)

  const broken = await api(pb.base, "/api/xueqing/audit-chain", { token: tokenPlatform })
  assert.equal(broken.status, 200, JSON.stringify(broken.data))
  assert.equal(broken.data.ok, false)
  assert.equal(broken.data.id, rows[0].id)
  assert.ok(platform.id)
})
})
