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

test("P0-32 成批登记缺项只标出错行，填好的行仍然保存", async () => {
  const org = (await asSuper("/api/collections/organizations/records", { method: "POST", body: { name: "回执协会" } })).data
  const school = (await asSuper("/api/collections/schools/records", { method: "POST", body: { name: "回执小学", org: org.id } })).data
  await asSuper("/api/collections/users/records", {
    method: "POST",
    body: {
      username: "batch-school",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "回执管理员",
      roles: ["school_admin"],
      org: org.id,
      school: school.id,
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })
  const token = (await login(pb.base, "batch-school", PASSWORD)).data.token
  const klass = (await api(pb.base, "/api/collections/classes/records", {
    token,
    method: "POST",
    body: { name: "回执班", school: school.id, org: org.id, grades: ["三年级"] },
  })).data
  const first = await api(pb.base, "/api/xueqing/students", {
    token,
    method: "POST",
    body: { displayName: "回执生01", grade: "三年级", classId: klass.id },
  })
  const second = await api(pb.base, "/api/xueqing/students", {
    token,
    method: "POST",
    body: { displayName: "回执生02", grade: "三年级", classId: klass.id },
  })
  assert.equal(first.status, 200, JSON.stringify(first.data))
  assert.equal(second.status, 200, JSON.stringify(second.data))
  const batch = await api(pb.base, "/api/xueqing/consent-batch", {
    token,
    method: "POST",
    body: {
      classId: klass.id,
      rows: [
        {
          studentId: first.data.id,
          receiptNo: "回执-01",
          consentedOn: "2026-01-02 00:00:00.000Z",
          signerRole: "父母",
          oralExplained: true,
        },
        {
          studentId: second.data.id,
          receiptNo: "",
          consentedOn: "",
          signerRole: "",
          oralExplained: null,
        },
        {
          studentId: second.data.id,
          receiptNo: "回执-02",
          consentedOn: "2026-01-03 00:00:00.000Z",
          signerRole: "祖辈",
          oralExplained: false,
        },
      ],
    },
  })
  assert.equal(batch.status, 200, JSON.stringify(batch.data))
  assert.deepEqual(batch.data.saved.map((item) => item.row), [1, 3])
  assert.equal(batch.data.errors.length, 1)
  assert.equal(batch.data.errors[0].row, 2)
  assert.match(batch.data.errors[0].message, /谁签的/)
  assert.match(batch.data.errors[0].message, /当面口头讲解/)
  const consents = await api(pb.base, "/api/collections/consents/records", { token })
  assert.equal(consents.data.items.length, 2)
  const oral = consents.data.items.find((item) => item.student === first.data.id)
  assert.equal(oral.oral_explained, true)
  assert.equal(oral.signer_role, "父母")
  assert.equal(oral.explain_method, "口头讲解 + 纸质回执")
  const written = consents.data.items.find((item) => item.receipt_no === "回执-02")
  assert.equal(written.oral_explained, false)
  assert.equal(written.signer_role, "祖辈")
})
