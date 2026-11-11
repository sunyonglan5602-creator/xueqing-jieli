// 清除本机前先保住还没补传的记录。管理员不能远程丢弃队列。

routerUse((e) => {
  return require(__hooks + "/clear_api.js").guardRead(e)
})

routerAdd("POST", "/api/xueqing/clears", (e) => require(__hooks + "/clear_api.js").recordClear(e))
routerAdd("POST", "/api/xueqing/devices/revoke", (e) => require(__hooks + "/clear_api.js").revokeDevice(e))
routerAdd("POST", "/api/xueqing/devices/upload", (e) => require(__hooks + "/clear_api.js").uploadRevoked(e))
routerAdd("POST", "/api/xueqing/organization-freezes", (e) => require(__hooks + "/clear_api.js").freezeOrg(e))
routerAdd("POST", "/api/xueqing/freeze-uploads", (e) => require(__hooks + "/clear_api.js").freezeUpload(e))
