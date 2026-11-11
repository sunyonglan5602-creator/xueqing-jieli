/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const organizations = app.findCollectionByNameOrId("organizations")
  const users = app.findCollectionByNameOrId("users")
  app.save(new Collection({
    type: "base",
    name: "device_revocations",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { type: "date", name: "revoked_at", required: true },
      { type: "date", name: "upload_until", required: true },
    ],
  }))
  app.save(new Collection({
    type: "base",
    name: "quarantine_records",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "org", required: true, collectionId: organizations.id, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "client_key", required: true, max: 80 },
      { type: "json", name: "payload", required: false, maxSize: 20000 },
    ],
  }))
  app.save(new Collection({
    type: "base",
    name: "metric_aliases",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "org", required: false, collectionId: organizations.id, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "kind", required: true, max: 20 },
      { type: "text", name: "target", required: true, max: 40 },
      { type: "number", name: "seq", required: true, onlyInt: true, min: 1 },
    ],
  }))
  app.save(new Collection({
    type: "base",
    name: "metric_e6",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "number", name: "teacher_seq", required: true, onlyInt: true },
      { type: "text", name: "reason", required: true, max: 20 },
      { type: "number", name: "pending_before", required: false, onlyInt: true, min: 0 },
      { type: "number", name: "uploaded", required: false, onlyInt: true, min: 0 },
      { type: "number", name: "kept", required: false, onlyInt: true, min: 0 },
      { type: "number", name: "abandoned", required: false, onlyInt: true, min: 0 },
      { type: "date", name: "at", required: true },
      { type: "relation", name: "org", required: false, collectionId: organizations.id, maxSelect: 1, cascadeDelete: false },
    ],
  }))
  const orgs = app.findCollectionByNameOrId("organizations")
  orgs.fields.add(
    new DateField({ name: "delete_frozen_until", required: false }),
  )
  app.save(orgs)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("metric_e6"))
  app.delete(app.findCollectionByNameOrId("metric_aliases"))
  app.delete(app.findCollectionByNameOrId("quarantine_records"))
  app.delete(app.findCollectionByNameOrId("device_revocations"))
  const orgs = app.findCollectionByNameOrId("organizations")
  orgs.fields.removeByName("delete_frozen_until")
  app.save(orgs)
})
