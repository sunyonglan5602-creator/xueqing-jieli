/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const organizations = app.findCollectionByNameOrId("organizations")
  app.save(new Collection({
    type: "base",
    name: "metric_e5",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "org", required: false, collectionId: organizations.id, maxSelect: 1, cascadeDelete: false },
      { type: "number", name: "teacher_seq", required: true, onlyInt: true },
      { type: "number", name: "generated_chars", required: true, onlyInt: true, min: 0 },
      { type: "number", name: "final_chars", required: true, onlyInt: true, min: 0 },
      { type: "number", name: "edit_distance", required: false, onlyInt: true, min: 0 },
      { type: "bool", name: "modified" },
      { type: "number", name: "elapsed_seconds", required: false, onlyInt: true, min: 0 },
      { type: "text", name: "confirmed_at", required: true, max: 40 },
    ],
  }))
}, (app) => {
  app.delete(app.findCollectionByNameOrId("metric_e5"))
})
