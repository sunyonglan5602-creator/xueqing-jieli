// 协会入驻：公开申请，平台审核后开通；开通和停用写入平台审计。

onRecordCreate((e) => {
  if (!e.record.get("status")) e.record.set("status", "已开通")
  return e.next()
}, "organizations")

onRecordCreateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  if (!e.record.get("status")) e.record.set("status", "已开通")
  const auth = lib.currentUser(e)
  const openedByPlatform = Boolean(auth && lib.rankOf(auth) === "platform_admin")
  const result = e.next()
  if (openedByPlatform && e.record.get("status") === "已开通") {
    lib.writeAudit(auth.id, "org_opened", e.record.id, { org: e.record.id, name: e.record.get("name") })
  }
  return result
}, "organizations")

routerAdd("POST", "/api/xueqing/applications", (e) => {
  const body = e.requestInfo().body || {}
  const name = String(body.name || "").trim()
  const contact = String(body.contact || "").trim()
  const partnerSchools = String(body.partnerSchools || "").trim()
  if (!name || name.length > 80) throw new BadRequestError("请填写协会名称")
  if (!contact || contact.length > 40) throw new BadRequestError("请填写联系人")
  if (!partnerSchools || partnerSchools.length > 500) throw new BadRequestError("请填写合作学校清单")
  let duplicated = []
  try {
    duplicated = $app.findRecordsByFilter("organizations", "name = {:name}", "", 1, 0, { name })
  } catch (err) {
    duplicated = []
  }
  if (duplicated.length) throw new BadRequestError("协会名称已存在")
  const collection = $app.findCollectionByNameOrId("organizations")
  const record = new Record(collection, {
    name,
    contact,
    partner_schools: partnerSchools,
    status: "待审核",
  })
  $app.save(record)
  return e.json(200, { id: record.id, status: record.get("status") })
})

routerAdd("POST", "/api/xueqing/organization-reviews", (e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  if (lib.rankOf(auth) !== "platform_admin") throw new ForbiddenError("不能审核协会")
  const body = e.requestInfo().body || {}
  const action = String(body.action || "")
  let org = null
  try {
    org = $app.findRecordById("organizations", String(body.orgId || ""))
  } catch (err) {
    throw new NotFoundError("不存在")
  }
  if (action === "开通") {
    if (org.get("status") !== "待审核") throw new BadRequestError("只有待审核的协会可以开通")
    org.set("status", "已开通")
    $app.save(org)
    lib.writeAudit(auth.id, "org_opened", org.id, { org: org.id, name: org.get("name") })
  } else if (action === "停用") {
    if (org.get("status") !== "已开通") throw new BadRequestError("只有已开通的协会可以停用")
    org.set("status", "已停用")
    $app.save(org)
    lib.writeAudit(auth.id, "org_disabled", org.id, { org: org.id, name: org.get("name") })
  } else {
    throw new BadRequestError("请选择开通或停用")
  }
  return e.json(200, { id: org.id, status: org.get("status") })
})
