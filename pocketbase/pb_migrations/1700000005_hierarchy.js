/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const organizations = app.findCollectionByNameOrId("organizations")
  const schools = app.findCollectionByNameOrId("schools")
  const users = app.findCollectionByNameOrId("users")
  const classes = app.findCollectionByNameOrId("classes")
  const students = app.findCollectionByNameOrId("students")
  const memberships = app.findCollectionByNameOrId("class_memberships")
  const records = app.findCollectionByNameOrId("learning_records")
  const bindings = app.findCollectionByNameOrId("parent_student_bindings")

  const ready = "@request.auth.id != '' && @request.auth.must_change_password = false"
  schools.fields.add(new SelectField({
    name: "cross_subject_view",
    required: false,
    maxSelect: 1,
    values: ["打开", "关闭"],
  }))
  schools.listRule = ready + " && (@request.auth.roles ~ \"platform_admin\" || (@request.auth.roles ~ \"org_admin\" && org = @request.auth.org) || ((@request.auth.roles ~ \"school_admin\" || @request.auth.roles ~ \"teacher\") && id = @request.auth.school))"
  schools.viewRule = schools.listRule
  schools.updateRule = ready + " && org = @request.auth.org && (@request.auth.roles ~ \"org_admin\" || (@request.auth.roles ~ \"school_admin\" && id = @request.auth.school))"
  app.save(schools)

  classes.fields.add(new TextField({ name: "teacher_ids", required: false, max: 800, hidden: true }))
  classes.listRule = ready + " && org = @request.auth.org && (@request.auth.roles ~ \"org_admin\" || (@request.auth.roles ~ \"school_admin\" && school = @request.auth.school) || (@request.auth.roles ~ \"teacher\" && teacher_ids ~ @request.auth.id))"
  classes.viewRule = classes.listRule
  app.save(classes)

  students.fields.add(
    new TextField({ name: "class_teacher_ids", required: false, max: 800, hidden: true }),
    new DateField({ name: "detail_until", required: false, hidden: true }),
    new RelationField({ name: "current_class", required: false, collectionId: classes.id, maxSelect: 1, cascadeDelete: false }),
  )
  const studentRule = ready + " && ((@request.auth.roles ~ \"school_admin\" && org = @request.auth.org && school = @request.auth.school) || (@request.auth.roles ~ \"teacher\" && org = @request.auth.org && class_teacher_ids ~ @request.auth.id) || (@request.auth.roles ~ \"parent\" && active_parent_ids ~ @request.auth.id) || (@request.auth.roles ~ \"org_admin\" && org = @request.auth.org && detail_until > @now))"
  students.listRule = studentRule
  students.viewRule = studentRule
  app.save(students)

  memberships.fields.add(
    new DateField({ name: "started_on", required: false }),
    new RelationField({ name: "previous_id", required: false, collectionId: memberships.id, maxSelect: 1, cascadeDelete: false }),
  )
  const rosterRule = ready + " && org = @request.auth.org && ((@request.auth.roles ~ \"school_admin\" && class.school = @request.auth.school) || (@request.auth.roles ~ \"teacher\" && class.teacher_ids ~ @request.auth.id) || (@request.auth.roles ~ \"org_admin\" && student.detail_until > @now))"
  memberships.listRule = rosterRule
  memberships.viewRule = rosterRule
  app.save(memberships)

  records.fields.add(
    new TextField({ name: "subject", required: false, max: 20 }),
    new RelationField({ name: "class", required: false, collectionId: classes.id, maxSelect: 1, cascadeDelete: false }),
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
  )
  const recordRule = ready + " && org = @request.auth.org && ((@request.auth.roles ~ \"school_admin\" && student.school = @request.auth.school) || (@request.auth.roles ~ \"teacher\" && class.teacher_ids ~ @request.auth.id) || (@request.auth.roles ~ \"org_admin\" && student.detail_until > @now))"
  records.listRule = recordRule
  records.viewRule = recordRule
  records.updateRule = recordRule
  app.save(records)

  const bindingRule = ready + " && ((parent = @request.auth.id) || (org = @request.auth.org && @request.auth.roles ~ \"school_admin\" && student.school = @request.auth.school) || (org = @request.auth.org && @request.auth.roles ~ \"teacher\" && student.class_teacher_ids ~ @request.auth.id) || (org = @request.auth.org && @request.auth.roles ~ \"org_admin\" && student.detail_until > @now))"
  bindings.listRule = bindingRule
  bindings.viewRule = bindingRule
  app.save(bindings)

  const assignments = new Collection({
    type: "base",
    name: "teaching_assignments",
    listRule: ready + " && org = @request.auth.org && (@request.auth.roles ~ \"org_admin\" || (@request.auth.roles ~ \"school_admin\" && school = @request.auth.school) || teacher = @request.auth.id)",
    viewRule: ready + " && org = @request.auth.org && (@request.auth.roles ~ \"org_admin\" || (@request.auth.roles ~ \"school_admin\" && school = @request.auth.school) || teacher = @request.auth.id)",
    createRule: ready + " && @request.auth.roles ~ \"school_admin\"",
    updateRule: ready + " && @request.auth.roles ~ \"school_admin\" && school = @request.auth.school && org = @request.auth.org",
    deleteRule: null,
    fields: [
      text("subject", true, 20),
      date("valid_until"),
      relation("org", organizations.id, true),
      relation("school", schools.id, true),
      relation("class", classes.id, true),
      relation("teacher", users.id, true),
    ],
  })
  app.save(assignments)

  const grants = new Collection({
    type: "base",
    name: "detail_grants",
    listRule: ready + " && org = @request.auth.org && (@request.auth.roles ~ \"org_admin\" || (@request.auth.roles ~ \"school_admin\" && school = @request.auth.school))",
    viewRule: ready + " && org = @request.auth.org && (@request.auth.roles ~ \"org_admin\" || (@request.auth.roles ~ \"school_admin\" && school = @request.auth.school))",
    createRule: ready + " && @request.auth.roles ~ \"school_admin\"",
    updateRule: ready + " && @request.auth.roles ~ \"school_admin\" && school = @request.auth.school && org = @request.auth.org",
    deleteRule: null,
    fields: [
      date("valid_until"),
      relation("org", organizations.id, true),
      relation("school", schools.id, true),
      relation("granted_by", users.id, true),
    ],
  })
  app.save(grants)

  const wuyu = new Collection({
    type: "base",
    name: "wuyu_records",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
    fields: [
      text("body", false, 200),
      relation("org", organizations.id, false),
      relation("student", students.id, false),
    ],
  })
  app.save(wuyu)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("wuyu_records"))
  app.delete(app.findCollectionByNameOrId("detail_grants"))
  app.delete(app.findCollectionByNameOrId("teaching_assignments"))
  const records = app.findCollectionByNameOrId("learning_records")
  for (const name of ["subject", "class", "created"]) records.fields.removeByName(name)
  app.save(records)
  const memberships = app.findCollectionByNameOrId("class_memberships")
  for (const name of ["started_on", "previous_id"]) memberships.fields.removeByName(name)
  app.save(memberships)
  const students = app.findCollectionByNameOrId("students")
  for (const name of ["class_teacher_ids", "detail_until", "current_class"]) students.fields.removeByName(name)
  app.save(students)
  const classes = app.findCollectionByNameOrId("classes")
  classes.fields.removeByName("teacher_ids")
  app.save(classes)
  const schools = app.findCollectionByNameOrId("schools")
  schools.fields.removeByName("cross_subject_view")
  app.save(schools)
})

function text(name, required, max) {
  return { type: "text", name, required, max }
}

function date(name) {
  return { type: "date", name, required: false }
}

function relation(name, collectionId, required) {
  return { type: "relation", name, required, collectionId, maxSelect: 1, cascadeDelete: false }
}
