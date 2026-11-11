const REASONS = ["退出", "切换用户", "公用电脑", "吊销", "组织删除", "30 天未联网"]

function recordClear(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const body = e.requestInfo().body || {}
  const reason = String(body.reason || "")
  if (REASONS.indexOf(reason) < 0) throw new BadRequestError("请选择清除原因")
  const before = Number(body.pendingBefore || 0)
  const uploaded = Number(body.uploaded || 0)
  const kept = Number(body.kept || 0)
  const abandoned = Number(body.abandoned || 0)
  if (before !== uploaded + kept + abandoned) throw new BadRequestError("清除前后的条数对不上")
  if (abandoned > 0 && String(body.abandonText || "") !== "放弃") throw new BadRequestError("请输入放弃")
  const row = new Record($app.findCollectionByNameOrId("metric_e6"))
  row.set("teacher_seq", teacherSeq(auth))
  row.set("reason", reason)
  row.set("pending_before", before)
  row.set("uploaded", uploaded)
  row.set("kept", kept)
  row.set("abandoned", abandoned)
  row.set("at", new Date().toISOString())
  if (auth.get("org")) row.set("org", auth.get("org"))
  $app.save(row)
  lib.writeAudit(auth.id, "local_clear", row.id, {
    org: auth.get("org") || "",
    reason,
    pendingBefore: before,
    uploaded,
    kept,
    abandoned,
  })
  return e.json(200, { id: row.id, teacher_seq: row.get("teacher_seq") })
}

function revokeDevice(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  if (lib.rankOf(auth) !== "school_admin") throw new NotFoundError("不存在")
  const body = e.requestInfo().body || {}
  const user = $app.findRecordById("users", String(body.userId || ""))
  if (user.get("school") !== auth.get("school")) throw new NotFoundError("不存在")
  const now = Date.now()
  const record = new Record($app.findCollectionByNameOrId("device_revocations"))
  record.set("user", user.id)
  record.set("revoked_at", new Date(now).toISOString())
  record.set("upload_until", new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString())
  $app.save(record)
  return e.json(200, { revokedAt: record.get("revoked_at"), uploadUntil: record.get("upload_until"), lastPending: Number(body.lastPending || 0) })
}

function uploadRevoked(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const revocation = currentRevocation(auth.id)
  if (!revocation) throw new BadRequestError("这台设备没有被吊销")
  if (Date.parse(revocation.get("upload_until")) < Date.now()) throw new UnauthorizedError("仅补传凭证已失效")
  const body = e.requestInfo().body || {}
  const items = body.items || []
  const stored = []
  const quarantined = []
  const revokedAt = Date.parse(revocation.get("revoked_at"))
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i] || {}
    const createdAt = Date.parse(item.clientCreatedAt || "")
    if (createdAt > revokedAt) {
      const row = new Record($app.findCollectionByNameOrId("quarantine_records"))
      row.set("org", auth.get("org"))
      row.set("user", auth.id)
      row.set("client_key", String(item.clientUid || ""))
      row.set("payload", item)
      $app.save(row)
      quarantined.push(row.id)
    } else {
      stored.push(String(item.clientUid || ""))
    }
  }
  return e.json(200, { stored, quarantined })
}

function freezeOrg(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  if (lib.rankOf(auth) !== "org_admin") throw new NotFoundError("不存在")
  const body = e.requestInfo().body || {}
  const days = Number(body.days || 7)
  if (days < 1 || days > 30) throw new BadRequestError("冻结期要在 1 到 30 天")
  const org = $app.findRecordById("organizations", auth.get("org"))
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  org.set("delete_frozen_until", until)
  $app.save(org)
  return e.json(200, { until })
}

function freezeUpload(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const org = $app.findRecordById("organizations", auth.get("org"))
  const until = Date.parse(org.get("delete_frozen_until") || "")
  if (!until || until < Date.now()) throw new BadRequestError("组织不在冻结期")
  const body = e.requestInfo().body || {}
  const row = new Record($app.findCollectionByNameOrId("quarantine_records"))
  row.set("org", auth.get("org"))
  row.set("user", auth.id)
  row.set("client_key", String(body.clientUid || ""))
  row.set("payload", { archive: true, body: body.body || "" })
  $app.save(row)
  return e.json(200, { id: row.id, archive: true })
}

function guardRead(e) {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.currentUser(e)
  if (!auth) return e.next()
  const path = lib.requestPath(e)
  const guarded = path.indexOf("/api/collections/students") === 0 || path.indexOf("/api/xueqing/record-students") === 0 || path.indexOf("/api/xueqing/entry-catalog") === 0 || path.indexOf("/api/xueqing/dictionary/grades") === 0
  if (!guarded) return e.next()
  const revocation = currentRevocation(auth.id)
  if (!revocation) return e.next()
  throw new UnauthorizedError("仅能补传，不能查看")
}

function teacherSeq(auth) {
  const org = auth.get("org") || ""
  const rows = $app.findRecordsByFilter("metric_aliases", "kind = 'teacher' && target = {:target}", "", 1, 0, { target: auth.id })
  if (rows.length) return Number(rows[0].get("seq"))
  const all = $app.findRecordsByFilter("metric_aliases", "kind = 'teacher' && org = {:org}", "-seq", 1, 0, { org })
  const seq = all.length ? Number(all[0].get("seq")) + 1 : 1
  const row = new Record($app.findCollectionByNameOrId("metric_aliases"))
  row.set("kind", "teacher")
  if (org) row.set("org", org)
  row.set("target", auth.id)
  row.set("seq", seq)
  $app.save(row)
  return seq
}

function currentRevocation(userId) {
  const rows = $app.findRecordsByFilter("device_revocations", "user = {:user}", "-revoked_at", 1, 0, { user: userId })
  return rows.length ? rows[0] : null
}

module.exports = { recordClear, revokeDevice, uploadRevoked, guardRead, freezeOrg, freezeUpload }
