routerAdd("POST", "/api/xueqing/sync-edits", (e) => require(__hooks + "/conflict_api.js").syncEdit(e))
routerAdd("GET", "/api/xueqing/conflicts", (e) => require(__hooks + "/conflict_api.js").listConflicts(e))
