/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const organizations = app.findCollectionByNameOrId("organizations")
  const schools = app.findCollectionByNameOrId("schools")
  const users = app.findCollectionByNameOrId("users")
  const ready = "@request.auth.id != ''"
  app.save(new Collection({
    type: "base",
    name: "practice_sheets",
    listRule: ready,
    viewRule: ready,
    createRule: ready,
    updateRule: ready,
    deleteRule: ready,
    fields: [
      { type: "relation", name: "org", required: true, collectionId: organizations.id, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "school", required: true, collectionId: schools.id, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "teacher", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "title", required: true, max: 40 },
      { type: "text", name: "question_ids_json", required: true, max: 4000 },
    ],
  }))
}, (app) => {
  app.delete(app.findCollectionByNameOrId("practice_sheets"))
})
