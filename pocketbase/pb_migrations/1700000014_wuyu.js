/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const ready = "@request.auth.id != '' && @request.auth.must_change_password = false"
  const users = app.findCollectionByNameOrId("users")
  const classes = app.findCollectionByNameOrId("classes")
  const schools = app.findCollectionByNameOrId("schools")
  const wuyu = app.findCollectionByNameOrId("wuyu_records")
  wuyu.fields.add(
    new TextField({ name: "keyword_code", required: false, max: 20 }),
    new TextField({ name: "dimension", required: false, max: 10 }),
    new TextField({ name: "wording", required: false, max: 200 }),
    new TextField({ name: "grade", required: false, max: 20 }),
    new TextField({ name: "client_key", required: false, max: 80 }),
    new RelationField({ name: "class", required: false, collectionId: classes.id, maxSelect: 1, cascadeDelete: false }),
    new RelationField({ name: "school", required: false, collectionId: schools.id, maxSelect: 1, cascadeDelete: false }),
    new RelationField({ name: "teacher", required: false, collectionId: users.id, maxSelect: 1, cascadeDelete: false }),
    new BoolField({ name: "confirmed" }),
  )
  app.save(wuyu)
  app.save(new Collection({
    type: "base",
    name: "dict_wuyu_dimensions",
    listRule: ready,
    viewRule: ready,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "text", name: "code", required: true, max: 10 },
      { type: "text", name: "name", required: true, max: 10 },
      { type: "text", name: "icon", required: true, max: 20 },
      { type: "text", name: "color", required: true, max: 10 },
    ],
  }))
  const keywords = new Collection({
    type: "base",
    name: "dict_wuyu_keywords",
    listRule: ready,
    viewRule: ready,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "text", name: "code", required: true, max: 20 },
      { type: "text", name: "dimension", required: true, max: 10 },
      { type: "text", name: "keyword", required: true, max: 40 },
      { type: "text", name: "low_text", required: true, max: 200 },
      { type: "text", name: "high_text", required: true, max: 200 },
      { type: "number", name: "sort", required: true, onlyInt: true },
    ],
  })
  keywords.addIndex("idx_dict_wuyu_keywords_code", true, "code", "")
  app.save(keywords)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("dict_wuyu_keywords"))
  app.delete(app.findCollectionByNameOrId("dict_wuyu_dimensions"))
  const wuyu = app.findCollectionByNameOrId("wuyu_records")
  for (const name of ["keyword_code", "dimension", "wording", "grade", "client_key", "class", "school", "teacher", "confirmed"]) {
    wuyu.fields.removeByName(name)
  }
  app.save(wuyu)
})
