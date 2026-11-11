function saveSemester(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  if (lib.rankOf(auth) !== "school_admin") throw new NotFoundError("不存在")
  const body = e.requestInfo().body || {}
  const endOn = String(body.endOn || "")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endOn)) throw new BadRequestError("请填写学期结束日")
  const rows = $app.findRecordsByFilter("school_semesters", "school = {:school}", "", 1, 0, { school: auth.get("school") })
  const record = rows.length ? rows[0] : new Record($app.findCollectionByNameOrId("school_semesters"))
  record.set("school", auth.get("school"))
  record.set("end_on", endOn)
  $app.save(record)
  return e.json(200, { endOn })
}

function applyValidity(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  if (lib.rankOf(auth) !== "school_admin") throw new NotFoundError("不存在")
  const body = e.requestInfo().body || {}
  const now = String(body.now || "")
  const semesters = $app.findRecordsByFilter("school_semesters", "school = {:school}", "", 1, 0, { school: auth.get("school") })
  if (!semesters.length) throw new BadRequestError("请先设置学期结束日")
  const endOn = semesters[0].get("end_on")
  if (now <= endOn) return e.json(200, { changed: [] })
  const records = $app.findRecordsByFilter("learning_records", "org = {:org}", "", 0, 0, { org: auth.get("org") })
  const changed = []
  for (const record of records) {
    const mark = record.get("status_mark") || ""
    const errorCode = record.get("error_code") || ""
    if (mark !== "尚需观察" && !errorCode) continue
    const events = $app.findRecordsByFilter("label_status_events", "record_uid = {:uid}", "", 0, 0, { uid: record.get("uid") })
    let extended = false
    let alreadyHistory = false
    for (const event of events) {
      if (event.get("status") === "延长") extended = true
      if (event.get("status") === "历史") alreadyHistory = true
    }
    if (extended || alreadyHistory) continue
    appendEvent(record.get("uid"), "历史", "学期结束", auth.id, false)
    changed.push(record.get("uid"))
    const fresh = $app.findRecordById("learning_records", record.id)
    if (fresh.get("body") !== record.get("body") || (fresh.get("status_mark") || "") !== mark) {
      throw new BadRequestError("原记录被改动")
    }
  }
  return e.json(200, { changed })
}

function extendLabel(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const body = e.requestInfo().body || {}
  const reason = String(body.reason || "").trim()
  if (!reason) throw new BadRequestError("延长必须填理由")
  const record = findByUid(String(body.recordUid || ""))
  if (!record || record.get("author") !== auth.id && lib.rankOf(auth) !== "school_admin") throw new NotFoundError("不存在")
  const events = $app.findRecordsByFilter("label_status_events", "record_uid = {:uid} && status = '延长'", "", 0, 0, { uid: record.get("uid") })
  if (events.length >= 1 && lib.rankOf(auth) !== "school_admin") throw new BadRequestError("再延长要学校管理员同意")
  if (events.length >= 2) throw new BadRequestError("不能再延长")
  appendEvent(record.get("uid"), "延长", reason, auth.id, true)
  const fresh = $app.findRecordById("learning_records", record.id)
  return e.json(200, { extended: events.length + 1, body: fresh.get("body") })
}

function labelStatus(e) {
  const lib = require(__hooks + "/lib.js")
  lib.requireReadyUser(e)
  const uid = lib.readQuery(e, "recordUid")
  const record = findByUid(uid)
  if (!record) throw new NotFoundError("不存在")
  const events = $app.findRecordsByFilter("label_status_events", "record_uid = {:uid}", "-at", 1, 0, { uid })
  const status = events.length ? events[0].get("status") : (record.get("status_mark") || "")
  const counts = status !== "历史" && status !== "已改善" && status !== "偶发错误"
  return e.json(200, {
    status,
    counts_toward_weakness: counts && (events.length ? events[0].get("counts_toward_weakness") === true : status === "尚需观察"),
    original_status: record.get("status_mark") || "",
    original_body: record.get("body"),
  })
}

function appendEvent(uid, status, reason, actorId, counts) {
  const row = new Record($app.findCollectionByNameOrId("label_status_events"))
  row.set("record_uid", uid)
  row.set("status", status)
  row.set("reason", reason)
  row.set("actor", actorId)
  row.set("at", new Date().toISOString())
  row.set("counts_toward_weakness", counts === true)
  $app.save(row)
}

function findByUid(uid) {
  const rows = $app.findRecordsByFilter("learning_records", "uid = {:uid}", "", 1, 0, { uid })
  return rows.length ? rows[0] : null
}

module.exports = { saveSemester, applyValidity, extendLabel, labelStatus }
