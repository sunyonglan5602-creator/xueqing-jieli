/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const organizations = app.findCollectionByNameOrId("organizations")
  const users = app.findCollectionByNameOrId("users")
  app.save(new Collection({
    type: "base",
    name: "record_conflicts",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "org", required: true, collectionId: organizations.id, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "teacher", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "group_uid", required: true, max: 36 },
      { type: "text", name: "left_uid", required: true, max: 36 },
      { type: "text", name: "right_uid", required: true, max: 36 },
      { type: "text", name: "status", required: true, max: 20 },
    ],
  }))
}, (app) => {
  app.delete(app.findCollectionByNameOrId("record_conflicts"))
})
