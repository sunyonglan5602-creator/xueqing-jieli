/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const grades = ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级"]
  const organizations = app.findCollectionByNameOrId("organizations")
  const schools = app.findCollectionByNameOrId("schools")
  const users = app.findCollectionByNameOrId("users")
  const classes = app.findCollectionByNameOrId("classes")
  const students = app.findCollectionByNameOrId("students")
  classes.fields.add(new SelectField({ name: "grades", required: false, maxSelect: 6, values: grades }))
  app.save(classes)
  students.fields.add(
    new SelectField({ name: "grade", required: false, maxSelect: 1, values: grades }),
    new TextField({ name: "mismatch_reason", required: false, max: 80 }),
    new BoolField({ name: "confirm_duplicate" }),
    new RelationField({ name: "merged_into", required: false, collectionId: students.id, maxSelect: 1, cascadeDelete: false }),
  )
  app.save(students)
  const ready = "@request.auth.id != '' && @request.auth.must_change_password = false"
  const merges = new Collection({
    type: "base",
    name: "student_merges",
    listRule: ready + " && @request.auth.roles ~ \"school_admin\" && school = @request.auth.school && org = @request.auth.org",
    viewRule: ready + " && @request.auth.roles ~ \"school_admin\" && school = @request.auth.school && org = @request.auth.org",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      relation("org", organizations.id),
      relation("school", schools.id),
      relation("source", students.id),
      relation("target", students.id),
      relation("merged_by", users.id),
    ],
  })
  app.save(merges)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("student_merges"))
  const students = app.findCollectionByNameOrId("students")
  for (const name of ["grade", "mismatch_reason", "confirm_duplicate", "merged_into"]) students.fields.removeByName(name)
  app.save(students)
  const classes = app.findCollectionByNameOrId("classes")
  classes.fields.removeByName("grades")
  app.save(classes)
})

function relation(name, collectionId) {
  return { type: "relation", name, required: true, collectionId, maxSelect: 1, cascadeDelete: false }
}
