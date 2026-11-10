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

test("P0-35 老师类型必填且只用于分组，P0-38 区划可空并可按乡镇片区筛选导出", async () => {
  const org = (await asSuper("/api/collections/organizations/records", { method: "POST", body: { name: "类型协会" } })).data
  const otherOrg = (await asSuper("/api/collections/organizations/records", { method: "POST", body: { name: "类型协会乙" } })).data
  const emptySchool = (await asSuper("/api/collections/schools/records", {
    method: "POST",
    body: { name: "空区划小学", org: org.id },
  })).data
  assert.equal(emptySchool.division_code, "")
  assert.equal(emptySchool.township, "")
  assert.equal(emptySchool.area, "")
  const east = (await asSuper("/api/collections/schools/records", {
    method: "POST",
    body: { name: "东乡小学", org: org.id, division_code: "110101", township: "演示东乡", area: "演示东片" },
  })).data
  const west = (await asSuper("/api/collections/schools/records", {
    method: "POST",
    body: { name: "西乡小学", org: org.id, division_code: "110102", township: "演示西乡", area: "演示西片" },
  })).data
  const outside = (await asSuper("/api/collections/schools/records", {
    method: "POST",
    body: { name: "外协会小学", org: otherOrg.id, township: "演示东乡", area: "演示东片" },
  })).data
  const orgAdmin = await createUser({ username: "type-org", display_name: "类型协会负责人", roles: ["org_admin"], org: org.id })
  const tokenOrg = (await login(pb.base, "type-org", PASSWORD)).data.token
  const edited = await api(pb.base, `/api/collections/schools/records/${emptySchool.id}`, {
    token: tokenOrg,
    method: "PATCH",
    body: { division_code: "110100", township: "演示东乡", area: "" },
  })
  assert.equal(edited.status, 200, JSON.stringify(edited.data))
  assert.equal(edited.data.division_code, "110100")
  assert.equal(edited.data.area, "")
  const schoolAdmin = await createUser({
    username: "type-school",
    display_name: "东乡管理员",
    roles: ["school_admin"],
    org: org.id,
    school: east.id,
  })
  const tokenSchool = (await login(pb.base, "type-school", PASSWORD)).data.token
  const edu = await createUser({ username: "type-edu", display_name: "类型教育局查看者", roles: ["education_bureau_viewer"] })
  const tokenEdu = (await login(pb.base, "type-edu", PASSWORD)).data.token

  const missing = await api(pb.base, "/api/xueqing/accounts", {
    token: tokenSchool,
    method: "POST",
    body: { username: "type-none", displayName: "未选类型" },
  })
  assert.equal(missing.status, 400, JSON.stringify(missing.data))
  assert.match(missing.data.message, /请选择老师类型/)
  const short = await api(pb.base, "/api/xueqing/accounts", {
    token: tokenSchool,
    method: "POST",
    body: { username: "type-short", displayName: "短期老师", teacherType: "短期支教" },
  })
  assert.equal(short.status, 200, JSON.stringify(short.data))
  assert.equal(short.data.user.teacher_type, "短期支教")
  const changedPassword = short.data.password
  const long = await api(pb.base, "/api/xueqing/accounts", {
    token: tokenSchool,
    method: "POST",
    body: { username: "type-long", displayName: "长期老师", teacherType: "长期支教" },
  })
  assert.equal(long.status, 200, JSON.stringify(long.data))
  const local = await api(pb.base, "/api/xueqing/accounts", {
    token: tokenSchool,
    method: "POST",
    body: { username: "type-local", displayName: "在编老师", teacherType: "在编或特岗教师" },
  })
  assert.equal(local.status, 200, JSON.stringify(local.data))

  const tokenShort = (await login(pb.base, "type-short", changedPassword)).data.token
  const ownPassword = await api(pb.base, `/api/collections/users/records/${short.data.user.id}`, {
    token: tokenShort,
    method: "PATCH",
    body: { oldPassword: changedPassword, password: PASSWORD, passwordConfirm: PASSWORD, teacher_type: "长期支教" },
  })
  assert.equal(ownPassword.status, 200, JSON.stringify(ownPassword.data))
  assert.equal(ownPassword.data.teacher_type, "短期支教")
  const readyShort = (await login(pb.base, "type-short", PASSWORD)).data.token
  const readyLong = (await login(pb.base, "type-long", long.data.password)).data.token
  await api(pb.base, `/api/collections/users/records/${long.data.user.id}`, {
    token: readyLong,
    method: "PATCH",
    body: { oldPassword: long.data.password, password: PASSWORD, passwordConfirm: PASSWORD },
  })
  const tokenLong = (await login(pb.base, "type-long", PASSWORD)).data.token

  const renamed = await api(pb.base, "/api/xueqing/teacher-types", {
    token: tokenSchool,
    method: "POST",
    body: { userId: local.data.user.id, teacherType: "短期支教" },
  })
  assert.equal(renamed.status, 200, JSON.stringify(renamed.data))
  const typeAudit = await api(pb.base, "/api/xueqing/audits?actor=" + schoolAdmin.id, { token: tokenSchool })
  assert.ok(typeAudit.data.items.some((item) => item.action === "teacher_type_changed" && item.target_id === local.data.user.id))

  const klass = (await api(pb.base, "/api/collections/classes/records", {
    token: tokenSchool,
    method: "POST",
    body: { name: "类型一班", school: east.id, org: org.id, grades: ["三年级"] },
  })).data
  const student = (await api(pb.base, "/api/collections/students/records", {
    token: tokenSchool,
    method: "POST",
    body: { display_name: "类型生", grade: "三年级", current_class: klass.id, school: east.id, org: org.id, uid: "00000000-0000-7000-8000-000000000031" },
  })).data
  const membership = await api(pb.base, "/api/collections/class_memberships/records", {
    token: tokenSchool,
    method: "POST",
    body: { student: student.id, class: klass.id, org: org.id },
  })
  assert.equal(membership.status, 200, JSON.stringify(membership.data))
  for (const [token, teacherId, label] of [[readyShort, short.data.user.id, "短期"], [tokenLong, long.data.user.id, "长期"]]) {
    const duty = await api(pb.base, "/api/collections/teaching_assignments/records", {
      token: tokenSchool,
      method: "POST",
      body: { class: klass.id, teacher: teacherId, subject: "语文", school: east.id, org: org.id },
    })
    assert.equal(duty.status, 200, label + JSON.stringify(duty.data))
    const record = await api(pb.base, "/api/collections/learning_records/records", {
      token,
      method: "POST",
      body: { student: student.id, subject: "语文", body: label + "记录", org: org.id, version: 1, uid: "00000000-0000-7000-8000-000000000032" },
    })
    assert.equal(record.status, 200, label + JSON.stringify(record.data))
  }

  const grouped = await api(pb.base, "/api/xueqing/teacher-types", { token: tokenOrg })
  assert.equal(grouped.status, 200, JSON.stringify(grouped.data))
  assert.equal(grouped.data.groups.find((item) => item.type === "长期支教").count, 1)
  assert.equal(grouped.data.groups.find((item) => item.type === "短期支教").count, 2)
  const filtered = await api(pb.base, "/api/xueqing/teacher-types?type=" + encodeURIComponent("长期支教"), { token: tokenOrg })
  assert.equal(filtered.data.items.length, 1)
  assert.equal(filtered.data.items[0].teacher_type, "长期支教")
  const eduTypes = await api(pb.base, "/api/xueqing/teacher-types", { token: tokenEdu })
  assert.equal(eduTypes.status, 404)

  const byTownship = await api(pb.base, "/api/xueqing/school-query?township=" + encodeURIComponent("演示东乡"), { token: tokenOrg })
  assert.equal(byTownship.status, 200, JSON.stringify(byTownship.data))
  assert.deepEqual(byTownship.data.items.map((item) => item.name).sort(), ["东乡小学", "空区划小学"])
  const byArea = await api(pb.base, "/api/xueqing/school-query?area=" + encodeURIComponent("演示西片"), { token: tokenOrg })
  assert.deepEqual(byArea.data.items.map((item) => item.name), ["西乡小学"])
  const ownSchool = await api(pb.base, "/api/xueqing/school-query?township=" + encodeURIComponent("演示东乡"), { token: tokenSchool })
  assert.deepEqual(ownSchool.data.items.map((item) => item.id), [east.id])
  const exported = await fetch(pb.base + "/api/xueqing/school-export?township=" + encodeURIComponent("演示东乡") + "&area=" + encodeURIComponent("演示东片"), {
    headers: { authorization: tokenOrg },
  })
  const bytes = new Uint8Array(await exported.arrayBuffer())
  const csv = new TextDecoder().decode(bytes)
  assert.equal(exported.status, 200, csv)
  assert.equal(exported.headers.get("content-type"), "text/csv; charset=utf-8")
  assert.deepEqual([bytes[0], bytes[1], bytes[2]], [0xef, 0xbb, 0xbf])
  assert.match(csv, /学校名称,行政区划代码,所属乡镇,所属片区/)
  assert.match(csv, /东乡小学,110101,演示东乡,演示东片/)
  assert.equal(csv.includes("西乡小学"), false)
  assert.equal(csv.includes("外协会小学"), false)
  assert.equal(csv.includes(outside.name), false)
  const eduExport = await api(pb.base, "/api/xueqing/school-query", { token: tokenEdu })
  assert.equal(eduExport.status, 404)
  assert.ok(orgAdmin.id && west.id && edu.id)
})
