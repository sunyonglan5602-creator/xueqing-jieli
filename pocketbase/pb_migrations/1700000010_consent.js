/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const organizations = app.findCollectionByNameOrId("organizations")
  const schools = app.findCollectionByNameOrId("schools")
  const students = app.findCollectionByNameOrId("students")
  const users = app.findCollectionByNameOrId("users")
  const ready = "@request.auth.id != '' && @request.auth.must_change_password = false"
  const readRule = ready + " && org = @request.auth.org && ((@request.auth.roles ~ \"school_admin\" && school = @request.auth.school) || @request.auth.roles ~ \"org_admin\")"
  const consents = new Collection({
    type: "base",
    name: "consents",
    listRule: readRule,
    viewRule: readRule,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["已同意", "已拒绝", "已撤回"] },
      { type: "text", name: "receipt_no", required: false, max: 40 },
      { type: "date", name: "consented_on", required: false },
      { type: "select", name: "explain_method", required: false, maxSelect: 1, values: ["书面", "口头讲解 + 纸质回执"] },
      { type: "select", name: "signer_role", required: false, maxSelect: 1, values: ["父母", "祖辈", "其他照料人"] },
      { type: "relation", name: "org", required: true, collectionId: organizations.id, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "school", required: true, collectionId: schools.id, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "student", required: true, collectionId: students.id, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "operator", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
    ],
  })
  consents.addIndex("idx_consents_student", true, "student", "")
  app.save(consents)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("consents"))
})
