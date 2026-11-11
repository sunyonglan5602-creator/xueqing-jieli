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
  teacher_type: "长期支教",
  org: orgA.id,
  school: schoolA.id,
  must_change_password: false,
})
const teacherA = await ensureUser("demo-teacher-a", {
  display_name: "演示老师甲",
  roles: ["teacher"],
  teacher_type: "长期支教",
  org: orgA.id,
  school: schoolA.id,
  must_change_password: true,
})
const teacherShort = await ensureUser("demo-teacher-short", {
  display_name: "演示短期老师",
  roles: ["teacher"],
  teacher_type: "短期支教",
  org: orgA.id,
  school: schoolA.id,
  must_change_password: false,
})
const teacherLocal = await ensureUser("demo-teacher-local", {
  display_name: "演示在编老师",
  roles: ["teacher"],
  teacher_type: "在编或特岗教师",
  org: orgA.id,
  school: schoolA.id,
  must_change_password: false,
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

const schoolA2 = await ensure("schools", "name='演示小学甲二'", {
  name: "演示小学甲二",
  org: orgA.id,
  division_code: "110101",
  township: "演示东乡",
  area: "演示东片",
})
const schoolB2 = await ensure("schools", "name='演示小学乙二'", { name: "演示小学乙二", org: orgB.id })
const classA = await ensure("classes", "name='演示一班'", {
  name: "演示一班",
  org: orgA.id,
  school: schoolA.id,
  grades: ["三年级", "四年级"],
})
const student1 = await ensure("students", "display_name='演示生01'", {
  display_name: "演示生01",
  grade: "三年级",
  current_class: classA.id,
  uid: "01900000-0000-7000-8000-000000000001",
  org: orgA.id,
  school: schoolA.id,
  active_parent_ids: "",
})
const student2 = await ensure("students", "display_name='演示生02'", {
  display_name: "演示生02",
  grade: "四年级",
  current_class: classA.id,
  uid: "01900000-0000-7000-8000-000000000002",
  org: orgA.id,
  school: schoolA.id,
  active_parent_ids: "",
})
const classPairs = [
  [schoolA, orgA, "演示甲校二班"],
  [schoolA2, orgA, "演示甲二一班"],
  [schoolA2, orgA, "演示甲二二班"],
  [schoolB, orgB, "演示乙校一班"],
  [schoolB, orgB, "演示乙校二班"],
  [schoolB2, orgB, "演示乙二一班"],
  [schoolB2, orgB, "演示乙二二班"],
]
for (const [school, org, name] of classPairs) {
  await ensure("classes", `name='${name}'`, {
    name,
    org: org.id,
    school: school.id,
    grades: ["三年级"],
  })
}
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

for (const teacher of [teacherA, teacherShort, teacherLocal]) {
  await ensure("teacher_profiles", `user='${teacher.id}'`, {
    user: teacher.id,
    org: orgA.id,
    school: schoolA.id,
    crime_check_no: "演示回执",
    crime_check_date: "2026-01-01 00:00:00.000Z",
    training_note: "已完成岗前见习",
    confidentiality_accepted: true,
    duty: "独立任课",
  })
}
for (const student of [student1, student2]) {
  await ensure("consents", `student='${student.id}'`, {
    student: student.id,
    org: orgA.id,
    school: schoolA.id,
    status: "已同意",
    receipt_no: `演示回执-${student.display_name}`,
    consented_on: "2026-01-02 00:00:00.000Z",
    explain_method: "口头讲解 + 纸质回执",
    signer_role: "父母",
    oral_explained: true,
    operator: teacherA.id,
  })
}
await ensure("teaching_assignments", `teacher='${teacherLocal.id}' && subject='语文' && class='${classA.id}'`, {
  subject: "语文",
  org: orgA.id,
  school: schoolA.id,
  class: classA.id,
  teacher: teacherLocal.id,
})
await ensure("teaching_assignments", `teacher='${teacherLocal.id}' && subject='数学' && class='${classA.id}'`, {
  subject: "数学",
  org: orgA.id,
  school: schoolA.id,
  class: classA.id,
  teacher: teacherLocal.id,
})
await ensure("class_memberships", `student='${student1.id}' && class='${classA.id}'`, {
  student: student1.id,
  class: classA.id,
  org: orgA.id,
  started_on: "2026-09-01 00:00:00.000Z",
})
await ensure("class_memberships", `student='${student2.id}' && class='${classA.id}'`, {
  student: student2.id,
  class: classA.id,
  org: orgA.id,
  started_on: "2026-09-01 00:00:00.000Z",
})
await ensure("learning_records", `uid='01900000-0000-7000-8000-000000000101'`, {
  uid: "01900000-0000-7000-8000-000000000101",
  body: "演示记录：课堂听写有两处错字",
  version: 1,
  org: orgA.id,
  student: student1.id,
  class: classA.id,
  subject: "语文",
  author: teacherA.id,
})

console.log(`假数据已就绪。演示口令：${demoPassword}`)
console.log(`演示班 ${classA.id}，演示生 ${student1.id} / ${student2.id}`)
console.log(`协会 ${orgA.id} / ${orgB.id}，学校 ${schoolA.id} / ${schoolB.id}`)
