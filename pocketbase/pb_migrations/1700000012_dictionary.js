/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const schools = app.findCollectionByNameOrId("schools")
  const students = app.findCollectionByNameOrId("students")
  students.fields.removeByName("grade")
  students.fields.add(new TextField({ name: "grade", required: false, max: 20 }))
  app.save(students)

  const classes = app.findCollectionByNameOrId("classes")
  classes.fields.removeByName("grades")
  classes.fields.add(new JSONField({ name: "grades", required: false, maxSize: 2000 }))
  app.save(classes)

  const ready = "@request.auth.id != '' && @request.auth.must_change_password = false"
  const platformOrSchool = ready + " && (scope = 'platform' || school = @request.auth.school)"

  app.save(collection("dict_grades", ready, [
    text("name", true, 20),
    { type: "number", name: "sort_order", required: true, onlyInt: true, min: 1 },
    text("band", true, 10),
    bool("active"),
  ], "idx_dict_grades_name", "name"))

  app.save(collection("dict_subjects", ready, [
    text("code", true, 12),
    text("name", true, 20),
    json("grades"),
    text("record_type", true, 80),
    bool("error_entry"),
    bool("per_term_error"),
    text("note", false, 200),
    bool("active"),
  ], "idx_dict_subjects_code", "code"))

  const subjects = app.findCollectionByNameOrId("dict_subjects")
  subjects.addIndex("idx_dict_subjects_name", true, "name", "")
  app.save(subjects)

  app.save(collection("dict_terms", platformOrSchool, [
    text("code", true, 40),
    text("subject_code", true, 12),
    text("name", true, 200),
    json("grades"),
    text("entry_kind", true, 20),
    bool("allows_error"),
    text("scope", true, 20),
    text("definition", false, 200),
    bool("active"),
    { type: "relation", name: "school", required: false, collectionId: schools.id, maxSelect: 1, cascadeDelete: false },
  ], "idx_dict_terms_code", "code"))

  app.save(collection("dict_error_types", platformOrSchool, [
    text("code", true, 40),
    text("label", true, 80),
    text("definition", false, 200),
    text("applies", false, 80),
    text("conditions", false, 200),
    text("avoid", false, 80),
    json("grades"),
    text("scope", true, 20),
    bool("active"),
    { type: "relation", name: "school", required: false, collectionId: schools.id, maxSelect: 1, cascadeDelete: false },
  ], "idx_dict_error_types_code", "code"))

  app.save(collection("dict_forbidden", ready, [
    text("category", true, 20),
    text("phrase", true, 40),
    text("alternative", true, 200),
    json("ignores"),
  ], "idx_dict_forbidden_phrase", "phrase"))

  app.save(collection("dict_textbooks", ready, [
    text("name", true, 20),
    bool("custom"),
  ], "idx_dict_textbooks_name", "name"))

  app.save(collection("dict_status_marks", ready, [
    text("code", true, 20),
    text("label", true, 20),
    bool("counts_toward_weakness"),
    bool("expires"),
  ], "idx_dict_status_marks_code", "code"))

  app.save(collection("dict_meta", null, [
    { type: "number", name: "version", required: true, onlyInt: true, min: 0 },
  ]))
}, (app) => {
  for (const name of ["dict_meta", "dict_status_marks", "dict_textbooks", "dict_forbidden", "dict_error_types", "dict_terms", "dict_subjects", "dict_grades"]) {
    try {
      app.delete(app.findCollectionByNameOrId(name))
    } catch (err) {
      continue
    }
  }
  const oldGrades = ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级"]
  const students = app.findCollectionByNameOrId("students")
  students.fields.removeByName("grade")
  students.fields.add(new SelectField({ name: "grade", required: false, maxSelect: 1, values: oldGrades }))
  app.save(students)
  const classes = app.findCollectionByNameOrId("classes")
  classes.fields.removeByName("grades")
  classes.fields.add(new SelectField({ name: "grades", required: false, maxSelect: 6, values: oldGrades }))
  app.save(classes)
})

function collection(name, listRule, fields, indexName, indexColumns) {
  const created = new Collection({
    type: "base",
    name,
    listRule,
    viewRule: listRule,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields,
  })
  if (indexName) created.addIndex(indexName, true, indexColumns, "")
  return created
}

function text(name, required, max) {
  return { type: "text", name, required, max }
}

function bool(name) {
  return { type: "bool", name }
}

function json(name) {
  return { type: "json", name, required: false, maxSize: 2000 }
}
