// 只写明显是假的演示账号。口令是本地演示用的，不是密钥。

const base = `http://${process.env.PB_HTTP || "127.0.0.1:8090"}`
const email = process.env.PB_SUPERUSER_EMAIL
const password = process.env.PB_SUPERUSER_PASSWORD
const demoPassword = process.env.SEED_PASSWORD || "Demo-Pass-0000"

if (!email || !password) {
  console.error("请在 .env 里填写 PB_SUPERUSER_EMAIL 和 PB_SUPERUSER_PASSWORD，并先启动本机服务。")
  process.exit(1)
}

async function api(path, { token, method = "GET", body } = {}) {
  const headers = {}
  if (token) headers.authorization = token
  if (body !== undefined) headers["content-type"] = "application/json"
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) throw new Error(`${method} ${path} ${response.status} ${data.message || text}`)
  return data
}

const auth = await api("/api/collections/_superusers/auth-with-password", {
  method: "POST",
  body: { identity: email, password },
})
const token = auth.token

async function ensure(collection, filter, body) {
  const found = await api(`/api/collections/${collection}/records?filter=${encodeURIComponent(filter)}`, { token })
  if (found.items.length > 0) return found.items[0]
  return api(`/api/collections/${collection}/records`, { token, method: "POST", body })
}

const orgA = await ensure("organizations", "name='演示协会甲'", { name: "演示协会甲" })
const orgB = await ensure("organizations", "name='演示协会乙'", { name: "演示协会乙" })
const schoolA = await ensure("schools", "name='演示小学甲'", { name: "演示小学甲", org: orgA.id })
const schoolB = await ensure("schools", "name='演示小学乙'", { name: "演示小学乙", org: orgB.id })

async function ensureUser(username, fields) {
  return ensure("users", `username='${username}'`, {
    username,
    password: demoPassword,
    passwordConfirm: demoPassword,
    emailVisibility: false,
    failed_login_count: 0,
    ...fields,
  })
}

await ensureUser("demo-platform", {
  display_name: "演示平台管理员",
  roles: ["platform_admin"],
  must_change_password: false,
})
await ensureUser("demo-org-a", {
  display_name: "演示协会甲负责人",
  roles: ["org_admin"],
  org: orgA.id,
  must_change_password: false,
})
await ensureUser("demo-org-b", {
  display_name: "演示协会乙负责人",
  roles: ["org_admin"],
  org: orgB.id,
  must_change_password: false,
})
await ensureUser("demo-school-a", {
  display_name: "演示小学甲管理员",
  roles: ["school_admin", "teacher"],
  org: orgA.id,
  school: schoolA.id,
  must_change_password: false,
})
await ensureUser("demo-teacher-a", {
  display_name: "演示老师甲",
  roles: ["teacher"],
  org: orgA.id,
  school: schoolA.id,
  must_change_password: true,
})
const parentA = await ensureUser("demo-parent-a", {
  display_name: "演示家长甲",
  roles: ["parent"],
  must_change_password: false,
})
const parentB = await ensureUser("demo-parent-b", {
  display_name: "演示家长乙",
  roles: ["parent"],
  must_change_password: false,
})
await ensureUser("demo-edu", {
  display_name: "演示教育局查看者",
  roles: ["education_bureau_viewer"],
  must_change_password: false,
})

const classA = await ensure("classes", "name='演示一班'", { name: "演示一班", org: orgA.id, school: schoolA.id })
const student1 = await ensure("students", "display_name='演示生01'", {
  display_name: "演示生01",
  uid: "01900000-0000-7000-8000-000000000001",
  org: orgA.id,
  school: schoolA.id,
  active_parent_ids: "",
})
const student2 = await ensure("students", "display_name='演示生02'", {
  display_name: "演示生02",
  uid: "01900000-0000-7000-8000-000000000002",
  org: orgA.id,
  school: schoolA.id,
  active_parent_ids: "",
})
await ensure("parent_student_bindings", `parent='${parentA.id}' && student='${student1.id}'`, {
  parent: parentA.id,
  student: student1.id,
  org: orgA.id,
  status: "已生效",
  relationship_type: "法定监护人",
  authorization_registered: false,
})
await ensure("parent_student_bindings", `parent='${parentB.id}' && student='${student1.id}'`, {
  parent: parentB.id,
  student: student1.id,
  org: orgA.id,
  status: "待核实",
  relationship_type: "其他照料人",
  authorization_registered: false,
})
await ensure("parent_student_bindings", `parent='${parentA.id}' && student='${student2.id}'`, {
  parent: parentA.id,
  student: student2.id,
  org: orgA.id,
  status: "待核实",
  relationship_type: "法定监护人",
  authorization_registered: false,
})

console.log(`假数据已就绪。演示口令：${demoPassword}`)
console.log(`演示班 ${classA.id}，演示生 ${student1.id} / ${student2.id}`)
console.log(`协会 ${orgA.id} / ${orgB.id}，学校 ${schoolA.id} / ${schoolB.id}`)
