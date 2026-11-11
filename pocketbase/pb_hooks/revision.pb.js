routerAdd("POST", "/api/xueqing/revisions", (e) => require(__hooks + "/revision_api.js").revise(e))
routerAdd("GET", "/api/xueqing/record-history", (e) => require(__hooks + "/revision_api.js").history(e))
