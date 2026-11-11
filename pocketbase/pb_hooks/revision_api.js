function revise(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const body = e.requestInfo().body || {}
  const groupUid = String(body.groupUid || "")
  const rows = $app.findRecordsByFilter("learning_records", "group_uid = {:group}", "-version", 0, 0, { group: groupUid })
  if (!rows.length) throw new NotFoundError("不存在")
  let top = rows[0]
  for (const row of rows) if (Number(row.get("version")) > Number(top.get("version"))) top = row
  if (top.get("author") !== auth.id) throw new BadRequestError("不能修改别人记的记录")
  const record = new Record($app.findCollectionByNameOrId("learning_records"))
  record.set("student", top.get("student"))
  record.set("subject", top.get("subject"))
  record.set("body", String(body.body || top.get("body")))
  record.set("previous_uid", top.get("uid"))
  record.set("org", auth.get("org"))
  lib.prepareLearningRecord(auth, record)
  record.set("version", Number(top.get("version")) + 1)
  record.set("group_uid", groupUid)
  record.set("subject_code", top.get("subject_code") || "")
  record.set("grade", top.get("grade") || "")
  record.set("textbook", top.get("textbook") || "")
  record.set("knowledge_code", top.get("knowledge_code") || "")
  record.set("status_mark", String(body.statusMark || ""))
  record.set("confirmed", true)
  $app.save(record)
  const unchanged = $app.findRecordById("learning_records", top.id)
  return e.json(200, { id: record.id, version: record.get("version"), previousBody: unchanged.get("body") })
}

function history(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const groupUid = lib.readQuery(e, "groupUid")
  const rows = $app.findRecordsByFilter("learning_records", "group_uid = {:group}", "version", 0, 0, { group: groupUid })
  if (!rows.length || rows[0].get("author") !== auth.id) throw new NotFoundError("不存在")
  const items = []
  for (const row of rows) {
    items.push({
      id: row.id,
      version: row.get("version"),
      body: row.get("body"),
      status_mark: row.get("status_mark") || "",
      created: row.get("created"),
      author: row.get("author"),
    })
  }
  return e.json(200, { items })
}

function latestAuthor(rows) {
  let top = rows[0]
  for (const row of rows) if (Number(row.get("version")) > Number(top.get("version"))) top = row
  return top.get("author")
}

module.exports = { revise, history }
