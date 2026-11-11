/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const records = app.findCollectionByNameOrId("learning_records")
  records.fields.add(
    new TextField({ name: "subject_code", required: false, max: 12 }),
    new TextField({ name: "grade", required: false, max: 20 }),
    new TextField({ name: "textbook", required: false, max: 40 }),
    new TextField({ name: "textbook_custom", required: false, max: 40 }),
    new TextField({ name: "knowledge_code", required: false, max: 40 }),
    new TextField({ name: "error_code", required: false, max: 40 }),
    new TextField({ name: "status_mark", required: false, max: 20 }),
    new TextField({ name: "scene", required: false, max: 10 }),
    new TextField({ name: "scene_date", required: false, max: 10 }),
    new TextField({ name: "assignment_name", required: false, max: 40 }),
    new TextField({ name: "client_key", required: false, max: 80 }),
    new TextField({ name: "source", required: false, max: 10 }),
    new TextField({ name: "grade_mismatch_reason", required: false, max: 80 }),
    new TextField({ name: "photo_jpeg", required: false, max: 450000 }),
    new TextField({ name: "group_uid", required: false, max: 36 }),
    new BoolField({ name: "confirmed" }),
  )
  app.save(records)
}, (app) => {
  const records = app.findCollectionByNameOrId("learning_records")
  for (const name of ["subject_code", "grade", "textbook", "textbook_custom", "knowledge_code", "error_code", "status_mark", "scene", "scene_date", "assignment_name", "client_key", "source", "grade_mismatch_reason", "photo_jpeg", "group_uid", "confirmed"]) {
    records.fields.removeByName(name)
  }
  app.save(records)
})
