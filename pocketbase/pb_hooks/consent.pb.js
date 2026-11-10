// 未同意或未登记的学生不能记学情。撤回后停止新录入，并解除已生效的家长绑定。

routerAdd("GET", "/api/xueqing/consent-template", (e) => {
  const lib = require(__hooks + "/lib.js")
  e.response.header().set("Content-Type", "text/plain; charset=utf-8")
  return e.string(200, lib.CONSENT_TEMPLATE)
})

routerAdd("POST", "/api/xueqing/consents", (e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const body = e.requestInfo().body || {}
  return e.json(200, lib.saveConsent(auth, body))
})

routerAdd("POST", "/api/xueqing/consent-batch", (e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  const body = e.requestInfo().body || {}
  return e.json(200, lib.saveConsentBatch(auth, body))
})

routerAdd("GET", "/api/xueqing/record-students", (e) => {
  const lib = require(__hooks + "/lib.js")
  const auth = lib.requireReadyUser(e)
  return e.json(200, { items: lib.recordStudents(auth) })
})
