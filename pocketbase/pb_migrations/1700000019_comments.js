/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const organizations = app.findCollectionByNameOrId("organizations")
  const schools = app.findCollectionByNameOrId("schools")
  const classes = app.findCollectionByNameOrId("classes")
  const students = app.findCollectionByNameOrId("students")
  const users = app.findCollectionByNameOrId("users")
  const ready = "@request.auth.id != ''"
  app.save(new Collection({
    type: "base",
    name: "stage_comments",
    listRule: ready,
    viewRule: ready,
    createRule: ready,
    updateRule: ready,
    deleteRule: ready,
    fields: [
      { type: "relation", name: "org", required: true, collectionId: organizations.id, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "school", required: true, collectionId: schools.id, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "class", required: true, collectionId: classes.id, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "student", required: true, collectionId: students.id, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "teacher", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "grade", required: true, max: 20 },
      { type: "text", name: "period", required: true, max: 40 },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["草稿", "已确认"] },
      { type: "bool", name: "published" },
      { type: "text", name: "generated_body", required: false, max: 8000 },
      { type: "text", name: "body", required: false, max: 8000 },
      { type: "text", name: "sentences_json", required: false, max: 20000 },
      { type: "text", name: "client_key", required: false, max: 80 },
      { type: "text", name: "started_at", required: false, max: 40 },
      { type: "text", name: "confirmed_at", required: false, max: 40 },
    ],
  }))
}, (app) => {
  app.delete(app.findCollectionByNameOrId("stage_comments"))
})
