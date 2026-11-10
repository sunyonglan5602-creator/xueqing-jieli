/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const students = app.findCollectionByNameOrId("students")
  const records = app.findCollectionByNameOrId("learning_records")
  const memberships = app.findCollectionByNameOrId("class_memberships")
  students.fields.add(new TextField({ name: "school_ids", required: false, max: 400, hidden: true }))
  const ready = "@request.auth.id != '' && @request.auth.must_change_password = false"
  const studentRule = ready + " && ((@request.auth.roles ~ \"school_admin\" && org = @request.auth.org && (school = @request.auth.school || school_ids ~ @request.auth.school)) || (@request.auth.roles ~ \"teacher\" && org = @request.auth.org && class_teacher_ids ~ @request.auth.id) || (@request.auth.roles ~ \"parent\" && active_parent_ids ~ @request.auth.id) || (@request.auth.roles ~ \"org_admin\" && org = @request.auth.org && detail_until > @now))"
  students.listRule = studentRule
  students.viewRule = studentRule
  app.save(students)
  const recordRule = ready + " && org = @request.auth.org && ((@request.auth.roles ~ \"school_admin\" && (student.school = @request.auth.school || class.school = @request.auth.school)) || (@request.auth.roles ~ \"teacher\" && class.teacher_ids ~ @request.auth.id) || (@request.auth.roles ~ \"org_admin\" && student.detail_until > @now))"
  records.listRule = recordRule
  records.viewRule = recordRule
  records.updateRule = recordRule
  app.save(records)
  memberships.fields.add(new TextField({ name: "change_kind", required: false, max: 8 }))
  app.save(memberships)
}, (app) => {
  const memberships = app.findCollectionByNameOrId("class_memberships")
  memberships.fields.removeByName("change_kind")
  app.save(memberships)
  const students = app.findCollectionByNameOrId("students")
  students.fields.removeByName("school_ids")
  app.save(students)
})
