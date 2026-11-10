/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const organizations = app.findCollectionByNameOrId("organizations")
  const schools = app.findCollectionByNameOrId("schools")
  const users = app.findCollectionByNameOrId("users")
  const audits = app.findCollectionByNameOrId("audit_logs")
  audits.fields.add(
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
    new TextField({ name: "student_ref", required: false, max: 40 }),
    new RelationField({
      name: "org",
      required: false,
      collectionId: organizations.id,
      maxSelect: 1,
      cascadeDelete: false,
    }),
  )
  audits.updateRule = "@request.auth.id != ''"
  audits.deleteRule = "@request.auth.id != ''"
  app.save(audits)

  const requests = new Collection({
    type: "base",
    name: "export_requests",
    listRule: "@request.auth.must_change_password = false && org = @request.auth.org && (requester = @request.auth.id || @request.auth.roles ~ \"school_admin\" || @request.auth.roles ~ \"org_admin\")",
    viewRule: "@request.auth.must_change_password = false && org = @request.auth.org && (requester = @request.auth.id || @request.auth.roles ~ \"school_admin\" || @request.auth.roles ~ \"org_admin\")",
    createRule: "@request.auth.must_change_password = false && (@request.auth.roles ~ \"teacher\" || @request.auth.roles ~ \"school_admin\")",
    updateRule: "@request.auth.must_change_password = false && @request.auth.roles ~ \"school_admin\" && org = @request.auth.org",
    deleteRule: null,
    fields: [
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["待审批", "已批准", "已驳回"] },
      {
        type: "relation",
        name: "org",
        required: true,
        collectionId: organizations.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
      {
        type: "relation",
        name: "school",
        required: true,
        collectionId: schools.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
      {
        type: "relation",
        name: "requester",
        required: true,
        collectionId: users.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
      {
        type: "relation",
        name: "approver",
        required: false,
        collectionId: users.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
    ],
  })
  app.save(requests)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("export_requests"))
  const audits = app.findCollectionByNameOrId("audit_logs")
  audits.fields.removeByName("student_ref")
  audits.fields.removeByName("org")
  audits.updateRule = null
  audits.deleteRule = null
  app.save(audits)
})
