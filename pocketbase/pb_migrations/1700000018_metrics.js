/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const organizations = app.findCollectionByNameOrId("organizations")
  const common = [
    { type: "relation", name: "org", required: false, collectionId: organizations.id, maxSelect: 1, cascadeDelete: false },
  ]
  app.save(new Collection({
    type: "base",
    name: "metric_e1",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: common.concat([
      { type: "text", name: "event_id", required: true, max: 36 },
      { type: "number", name: "school_seq", required: true, onlyInt: true },
      { type: "number", name: "group_seq", required: true, onlyInt: true },
      { type: "number", name: "teacher_seq", required: true, onlyInt: true },
      { type: "text", name: "teacher_type", required: false, max: 20 },
      { type: "text", name: "kind", required: true, max: 20 },
      { type: "number", name: "student_count", required: true, onlyInt: true },
      { type: "number", name: "tag_count", required: false, onlyInt: true, min: 0 },
      { type: "number", name: "click_count", required: false, onlyInt: true, min: 0 },
      { type: "number", name: "elapsed_seconds", required: false, onlyInt: true, min: 0 },
      { type: "bool", name: "interrupted" },
      { type: "text", name: "origin", required: true, max: 10 },
      { type: "text", name: "client_created_at", required: true, max: 40 },
      { type: "text", name: "natural_week", required: true, max: 10 },
    ]),
  }))
  app.save(new Collection({
    type: "base",
    name: "metric_e2",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: common.concat([
      { type: "text", name: "submit_id", required: true, max: 64 },
      { type: "number", name: "teacher_seq", required: true, onlyInt: true },
      { type: "text", name: "first_at", required: true, max: 40 },
      { type: "text", name: "first_result", required: true, max: 20 },
      { type: "number", name: "attempts", required: false, onlyInt: true, min: 0 },
      { type: "text", name: "received_at", required: false, max: 40 },
      { type: "text", name: "final_status", required: true, max: 20 },
      { type: "bool", name: "conflict" },
    ]),
  }))
}, (app) => {
  app.delete(app.findCollectionByNameOrId("metric_e2"))
  app.delete(app.findCollectionByNameOrId("metric_e1"))
})
