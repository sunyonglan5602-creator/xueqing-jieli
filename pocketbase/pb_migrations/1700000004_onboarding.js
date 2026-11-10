/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const organizations = app.findCollectionByNameOrId("organizations")
  organizations.fields.add(
    new SelectField({
      name: "status",
      required: false,
      maxSelect: 1,
      values: ["待审核", "已开通", "已停用"],
    }),
    new TextField({ name: "contact", required: false, max: 40 }),
    new TextField({ name: "partner_schools", required: false, max: 500 }),
  )
  app.save(organizations)

  const audits = app.findCollectionByNameOrId("audit_logs")
  audits.fields.add(
    new NumberField({ name: "chain_seq", required: false, min: 0, onlyInt: true }),
    new TextField({ name: "prev_hash", required: false, max: 64 }),
    new TextField({ name: "record_hash", required: false, max: 64 }),
  )
  audits.addIndex("idx_audit_logs_chain", true, "chain_seq", "chain_seq > 0")
  app.save(audits)
}, (app) => {
  const audits = app.findCollectionByNameOrId("audit_logs")
  audits.removeIndex("idx_audit_logs_chain")
  for (const name of ["chain_seq", "prev_hash", "record_hash"]) audits.fields.removeByName(name)
  app.save(audits)
  const organizations = app.findCollectionByNameOrId("organizations")
  for (const name of ["status", "contact", "partner_schools"]) organizations.fields.removeByName(name)
  app.save(organizations)
})
