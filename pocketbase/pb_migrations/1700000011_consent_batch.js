/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const consents = app.findCollectionByNameOrId("consents")
  consents.fields.add(new BoolField({ name: "oral_explained" }))
  app.save(consents)
}, (app) => {
  const consents = app.findCollectionByNameOrId("consents")
  consents.fields.removeByName("oral_explained")
  app.save(consents)
})
