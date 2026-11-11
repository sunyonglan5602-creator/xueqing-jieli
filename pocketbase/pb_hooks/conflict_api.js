function syncEdit(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const body = e.requestInfo().body || {}
  const groupUid = String(body.groupUid || "")
  const baseVersion = Number(body.baseVersion || 0)
  const rows = $app.findRecordsByFilter("learning_records", "group_uid = {:group}", "-version", 0, 0, { group: groupUid })
  if (!rows.length) throw new NotFoundError("不存在")
  let base = null
  let latest = rows[0]
  for (const row of rows) {
    if (Number(row.get("version")) === baseVersion) base = row
    if (Number(row.get("version")) > Number(latest.get("version"))) latest = row
  }
  if (!base || base.get("author") !== auth.id) throw new NotFoundError("不存在")
  const clientKey = String(body.clientUid || "")
  const existing = clientKey ? findOne("learning_records", "client_key = {:key}", { key: clientKey }) : null
  if (existing) return e.json(200, { id: existing.id, conflict: false, kept: [base.id, existing.id] })
  const record = new Record($app.findCollectionByNameOrId("learning_records"))
  record.set("student", base.get("student"))
  record.set("subject", base.get("subject"))
  record.set("body", String(body.body || "离线修订"))
  record.set("previous_uid", base.get("uid"))
  record.set("org", auth.get("org"))
  lib.prepareLearningRecord(auth, record)
  record.set("version", Number(latest.get("version")) + 1)
  record.set("group_uid", groupUid)
  record.set("subject_code", base.get("subject_code") || "")
  record.set("grade", base.get("grade") || "")
  record.set("textbook", base.get("textbook") || "")
  record.set("knowledge_code", base.get("knowledge_code") || "")
  record.set("client_key", clientKey)
  record.set("confirmed", true)
  record.set("source", "离线")
  $app.save(record)
  const conflict = Number(latest.get("version")) > baseVersion
  if (conflict) {
    const row = new Record($app.findCollectionByNameOrId("record_conflicts"))
    row.set("org", auth.get("org"))
    row.set("teacher", auth.id)
    row.set("group_uid", groupUid)
    row.set("left_uid", latest.get("uid"))
    row.set("right_uid", record.get("uid"))
    row.set("status", "待处理")
    $app.save(row)
  }
  const still = $app.findRecordById("learning_records", base.id)
  return e.json(200, {
    id: record.id,
    conflict,
    kept: [still.id, latest.id, record.id],
    originalBody: still.get("body"),
  })
}

function listConflicts(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const rows = $app.findRecordsByFilter("record_conflicts", "teacher = {:teacher} && status = '待处理'", "", 0, 0, { teacher: auth.id })
  const items = []
  for (const row of rows) {
    items.push({ id: row.id, group_uid: row.get("group_uid"), left_uid: row.get("left_uid"), right_uid: row.get("right_uid"), status: row.get("status") })
  }
  return e.json(200, { items })
}

function findOne(collection, filter, params) {
  let rows = []
  try {
    rows = $app.findRecordsByFilter(collection, filter, "", 1, 0, params || {})
  } catch (err) {
    rows = []
  }
  return rows.length ? rows[0] : null
}

module.exports = { syncEdit, listConflicts }
