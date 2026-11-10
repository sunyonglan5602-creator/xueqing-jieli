/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const organizations = app.findCollectionByNameOrId("organizations")
  const schools = app.findCollectionByNameOrId("schools")
  const users = app.findCollectionByNameOrId("users")
  const ready = "@request.auth.id != '' && @request.auth.must_change_password = false"
  const readRule = ready + " && org = @request.auth.org && ((@request.auth.roles ~ \"school_admin\" && school = @request.auth.school) || @request.auth.roles ~ \"org_admin\")"
  const profiles = new Collection({
    type: "base",
    name: "teacher_profiles",
    listRule: readRule,
    viewRule: readRule,
    createRule: ready + " && @request.auth.roles ~ \"school_admin\"",
    updateRule: ready + " && @request.auth.roles ~ \"school_admin\" && school = @request.auth.school && org = @request.auth.org",
    deleteRule: null,
    fields: [
      { type: "text", name: "crime_check_no", required: false, max: 40 },
      { type: "date", name: "crime_check_date", required: false },
      { type: "text", name: "training_note", required: false, max: 200 },
      { type: "bool", name: "confidentiality_accepted" },
      { type: "select", name: "duty", required: false, maxSelect: 1, values: ["独立任课", "辅助教学"] },
      { type: "relation", name: "org", required: true, collectionId: organizations.id, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "school", required: true, collectionId: schools.id, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
    ],
  })
  profiles.addIndex("idx_teacher_profiles_user", true, "user", "")
  app.save(profiles)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("teacher_profiles"))
})
