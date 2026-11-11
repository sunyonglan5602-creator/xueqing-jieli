/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const schools = app.findCollectionByNameOrId("schools")
  const users = app.findCollectionByNameOrId("users")
  app.save(new Collection({
    type: "base",
    name: "school_semesters",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "school", required: true, collectionId: schools.id, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "end_on", required: true, max: 10 },
    ],
  }))
  app.save(new Collection({
    type: "base",
    name: "label_status_events",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "text", name: "record_uid", required: true, max: 36 },
      { type: "text", name: "status", required: true, max: 20 },
      { type: "text", name: "reason", required: false, max: 80 },
      { type: "relation", name: "actor", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { type: "date", name: "at", required: true },
      { type: "bool", name: "counts_toward_weakness" },
    ],
  }))
}, (app) => {
  app.delete(app.findCollectionByNameOrId("label_status_events"))
  app.delete(app.findCollectionByNameOrId("school_semesters"))
})
