/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new SelectField({
    name: "teacher_type",
    required: false,
    maxSelect: 1,
    values: ["短期支教", "长期支教", "在编或特岗教师"],
  }))
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("teacher_type")
  app.save(users)
})
