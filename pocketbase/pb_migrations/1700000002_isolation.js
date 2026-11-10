/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const organizations = app.findCollectionByNameOrId("organizations")
  const schools = app.findCollectionByNameOrId("schools")
  const users = app.findCollectionByNameOrId("users")

  schools.fields.add(
    new TextField({ name: "division_code", required: false, max: 20 }),
    new TextField({ name: "township", required: false, max: 40 }),
    new TextField({ name: "area", required: false, max: 40 }),
  )
  schools.updateRule = ready() + " && (@request.auth.roles ~ \"org_admin\" || @request.auth.roles ~ \"school_admin\") && org = @request.auth.org"
  app.save(schools)

  const classes = new Collection({
    type: "base",
    name: "classes",
    listRule: sameOrgStaff(),
    viewRule: sameOrgStaff(),
    createRule: schoolAdmin(),
    updateRule: schoolAdmin(),
    deleteRule: null,
    fields: [
      { type: "text", name: "name", required: true, min: 1, max: 40 },
      relation("org", organizations.id, true),
      relation("school", schools.id, true),
    ],
  })
  app.save(classes)

  const students = new Collection({
    type: "base",
    name: "students",
    listRule: studentReadRule(),
    viewRule: studentReadRule(),
    createRule: schoolAdmin(),
    updateRule: schoolAdmin(),
    deleteRule: studentReadRule(),
    fields: [
      { type: "text", name: "uid", required: true, min: 36, max: 36, pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" },
      { type: "text", name: "display_name", required: true, min: 1, max: 40 },
      relation("org", organizations.id, true),
      relation("school", schools.id, true),
      { type: "text", name: "active_parent_ids", required: false, max: 400, hidden: true },
    ],
  })
  students.addIndex("idx_students_uid", true, "uid", "")
  app.save(students)

  const memberships = new Collection({
    type: "base",
    name: "class_memberships",
    listRule: sameOrgStaff(),
    viewRule: sameOrgStaff(),
    createRule: schoolAdmin(),
    updateRule: sameOrgStaff(),
    deleteRule: sameOrgStaff(),
    fields: [
      { type: "text", name: "note", required: false, max: 80 },
      relation("org", organizations.id, true),
      relation("student", students.id, true),
      relation("class", classes.id, true),
    ],
  })
  app.save(memberships)

  const records = new Collection({
    type: "base",
    name: "learning_records",
    listRule: sameOrgStaff(),
    viewRule: sameOrgStaff(),
    createRule: ready() + " && (@request.auth.roles ~ \"teacher\" || @request.auth.roles ~ \"school_admin\")",
    updateRule: sameOrgStaff(),
    deleteRule: sameOrgStaff(),
    fields: [
      { type: "text", name: "uid", required: true, min: 36, max: 36 },
      { type: "text", name: "body", required: true, min: 1, max: 500 },
      { type: "number", name: "version", required: true, min: 1, onlyInt: true },
      { type: "text", name: "previous_uid", required: false, max: 36 },
      relation("org", organizations.id, true),
      relation("student", students.id, true),
      relation("author", users.id, true),
    ],
  })
  records.addIndex("idx_learning_records_uid", true, "uid", "")
  app.save(records)

  const bindings = new Collection({
    type: "base",
    name: "parent_student_bindings",
    listRule: bindingReadRule(),
    viewRule: bindingReadRule(),
    createRule: schoolAdmin(),
    updateRule: schoolAdmin(),
    deleteRule: null,
    fields: [
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["待核实", "已生效", "已撤回", "已解绑"] },
      { type: "select", name: "relationship_type", required: true, maxSelect: 1, values: ["法定监护人", "其他照料人"] },
      { type: "bool", name: "authorization_registered" },
      { type: "json", name: "authorization_record" },
      { type: "date", name: "valid_until" },
      relation("org", organizations.id, true),
      relation("parent", users.id, true),
      relation("student", students.id, true),
    ],
  })
  app.save(bindings)
}, (app) => {
  for (const name of ["parent_student_bindings", "learning_records", "class_memberships", "students", "classes"]) {
    app.delete(app.findCollectionByNameOrId(name))
  }
  const schools = app.findCollectionByNameOrId("schools")
  for (const name of ["division_code", "township", "area"]) schools.fields.removeByName(name)
  schools.updateRule = null
  app.save(schools)
})

function ready() {
  return "@request.auth.must_change_password = false"
}

function schoolAdmin() {
  return ready() + " && @request.auth.roles ~ \"school_admin\""
}

function sameOrgStaff() {
  return ready() + " && org = @request.auth.org && (@request.auth.roles ~ \"org_admin\" || @request.auth.roles ~ \"school_admin\" || @request.auth.roles ~ \"teacher\")"
}

function studentReadRule() {
  return ready() + " && ((org = @request.auth.org && (@request.auth.roles ~ \"org_admin\" || @request.auth.roles ~ \"school_admin\" || @request.auth.roles ~ \"teacher\")) || (@request.auth.roles ~ \"parent\" && active_parent_ids ~ @request.auth.id))"
}

function bindingReadRule() {
  return ready() + " && ((org = @request.auth.org && (@request.auth.roles ~ \"org_admin\" || @request.auth.roles ~ \"school_admin\" || @request.auth.roles ~ \"teacher\")) || parent = @request.auth.id)"
}

function relation(name, collectionId, required) {
  return {
    type: "relation",
    name,
    required,
    collectionId,
    maxSelect: 1,
    cascadeDelete: false,
  }
}
