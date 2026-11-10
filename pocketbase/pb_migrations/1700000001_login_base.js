/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const organizations = new Collection({
    type: "base",
    name: "organizations",
    listRule: staffRule("id"),
    viewRule: staffRule("id"),
    createRule: ready() + " && @request.auth.roles ~ \"platform_admin\"",
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "text", name: "name", required: true, min: 1, max: 80 },
    ],
  })
  app.save(organizations)

  const schools = new Collection({
    type: "base",
    name: "schools",
    listRule: platformOrOrg("org"),
    viewRule: platformOrOrg("org"),
    createRule: ready() + " && @request.auth.roles ~ \"org_admin\" && org = @request.auth.org",
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "text", name: "name", required: true, min: 1, max: 80 },
      {
        type: "relation",
        name: "org",
        required: true,
        collectionId: organizations.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
    ],
  })
  app.save(schools)

  const users = app.findCollectionByNameOrId("users")
  users.fields.getByName("email").required = false
  users.fields.add(
    new TextField({
      name: "username",
      required: true,
      min: 3,
      max: 40,
      pattern: "^[a-z0-9][a-z0-9-]*$",
    }),
    new TextField({ name: "display_name", required: true, min: 1, max: 40 }),
    new SelectField({
      name: "roles",
      required: true,
      maxSelect: 4,
      values: [
        "platform_admin",
        "org_admin",
        "school_admin",
        "teacher",
        "parent",
        "education_bureau_viewer",
      ],
    }),
    new RelationField({
      name: "org",
      required: false,
      collectionId: organizations.id,
      maxSelect: 1,
      cascadeDelete: false,
    }),
    new RelationField({
      name: "school",
      required: false,
      collectionId: schools.id,
      maxSelect: 1,
      cascadeDelete: false,
    }),
    new BoolField({ name: "must_change_password" }),
    new NumberField({ name: "failed_login_count", min: 0, onlyInt: true }),
    new DateField({ name: "locked_until" }),
  )
  users.addIndex("idx_users_username", true, "username", "")
  users.passwordAuth.identityFields = ["username"]
  users.passwordAuth.enabled = true
  users.authAlert.enabled = false
  users.oauth2.enabled = false
  users.otp.enabled = false
  users.mfa.enabled = false
  users.listRule = "id = @request.auth.id"
  users.viewRule = "id = @request.auth.id"
  users.createRule = null
  users.updateRule = "id = @request.auth.id"
  users.deleteRule = null
  app.save(users)

  const packages = new Collection({
    type: "base",
    name: "handover_packages",
    listRule: sameOrgStaff("org"),
    viewRule: sameOrgStaff("org"),
    createRule: ready() + " && (@request.auth.roles ~ \"school_admin\" || @request.auth.roles ~ \"teacher\")",
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "text", name: "title", required: true, min: 1, max: 80 },
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
        required: false,
        collectionId: schools.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
      {
        type: "relation",
        name: "initiator",
        required: true,
        collectionId: users.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
    ],
  })
  app.save(packages)

  const reviews = new Collection({
    type: "base",
    name: "handover_reviews",
    listRule: sameOrgStaff("org"),
    viewRule: sameOrgStaff("org"),
    createRule: ready() + " && (@request.auth.roles ~ \"school_admin\" || @request.auth.roles ~ \"teacher\")",
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "text", name: "note", required: false, max: 200 },
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
        name: "package",
        required: true,
        collectionId: packages.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
      {
        type: "relation",
        name: "reviewer",
        required: true,
        collectionId: users.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
    ],
  })
  app.save(reviews)

  const audits = new Collection({
    type: "base",
    name: "audit_logs",
    listRule: "@request.auth.id != '' && (actor = @request.auth.id || @request.auth.roles ~ \"platform_admin\")",
    viewRule: "@request.auth.id != '' && (actor = @request.auth.id || @request.auth.roles ~ \"platform_admin\")",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "text", name: "action", required: true, max: 80 },
      { type: "text", name: "target_id", required: false, max: 40 },
      { type: "json", name: "detail", required: false },
      {
        type: "relation",
        name: "actor",
        required: false,
        collectionId: users.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
    ],
  })
  app.save(audits)
}, (app) => {
  for (const name of ["audit_logs", "handover_reviews", "handover_packages"]) {
    app.delete(app.findCollectionByNameOrId(name))
  }
  const users = app.findCollectionByNameOrId("users")
  for (const name of ["username", "display_name", "roles", "org", "school", "must_change_password", "failed_login_count", "locked_until"]) {
    users.fields.removeByName(name)
  }
  users.removeIndex("idx_users_username")
  users.fields.getByName("email").required = true
  users.passwordAuth.identityFields = ["email"]
  users.authAlert.enabled = true
  users.listRule = "id = @request.auth.id"
  users.viewRule = "id = @request.auth.id"
  users.createRule = ""
  users.updateRule = "id = @request.auth.id"
  app.save(users)
  app.delete(app.findCollectionByNameOrId("schools"))
  app.delete(app.findCollectionByNameOrId("organizations"))
})

function ready() {
  return "@request.auth.id != '' && @request.auth.must_change_password = false"
}

function staffRoles() {
  return "(@request.auth.roles ~ \"platform_admin\" || @request.auth.roles ~ \"org_admin\" || @request.auth.roles ~ \"school_admin\" || @request.auth.roles ~ \"teacher\")"
}

function staffRule(orgField) {
  return ready() + " && " + staffRoles() + " && (@request.auth.roles ~ \"platform_admin\" || @request.auth.org = " + orgField + ")"
}

function platformOrOrg(orgField) {
  return ready() + " && (@request.auth.roles ~ \"platform_admin\" || (@request.auth.org = " + orgField + " && (@request.auth.roles ~ \"org_admin\" || @request.auth.roles ~ \"school_admin\" || @request.auth.roles ~ \"teacher\")))"
}

function sameOrgStaff(orgField) {
  return ready() + " && @request.auth.org = " + orgField + " && (@request.auth.roles ~ \"school_admin\" || @request.auth.roles ~ \"teacher\" || @request.auth.roles ~ \"org_admin\")"
}
