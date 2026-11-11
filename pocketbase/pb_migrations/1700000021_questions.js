/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const organizations = app.findCollectionByNameOrId("organizations")
  const schools = app.findCollectionByNameOrId("schools")
  const users = app.findCollectionByNameOrId("users")
  const ready = "@request.auth.id != ''"
  app.save(new Collection({
    type: "base",
    name: "teacher_questions",
    listRule: ready,
    viewRule: ready,
    createRule: ready,
    updateRule: ready,
    deleteRule: ready,
    fields: [
      { type: "relation", name: "org", required: true, collectionId: organizations.id, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "school", required: true, collectionId: schools.id, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "author", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "subject_code", required: true, max: 12 },
      { type: "text", name: "grade", required: true, max: 20 },
      { type: "text", name: "textbook", required: true, max: 40 },
      { type: "text", name: "textbook_custom", required: false, max: 40 },
      { type: "text", name: "knowledge_code", required: true, max: 40 },
      { type: "text", name: "stem", required: true, max: 2000 },
      { type: "text", name: "answer", required: false, max: 2000 },
      { type: "text", name: "explanation", required: false, max: 2000 },
      { type: "text", name: "error_code", required: false, max: 40 },
      { type: "text", name: "difficulty", required: false, max: 20 },
      { type: "text", name: "image_jpeg", required: false, max: 450000 },
      { type: "select", name: "visibility", required: true, maxSelect: 1, values: ["本校", "本组织"] },
      { type: "bool", name: "original_authorized" },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["在用", "已下架", "已撤销"] },
      { type: "text", name: "resource_type", required: true, max: 20 },
      { type: "text", name: "source", required: true, max: 20 },
    ],
  }))
}, (app) => {
  app.delete(app.findCollectionByNameOrId("teacher_questions"))
})
