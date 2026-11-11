routerAdd("POST", "/api/xueqing/semesters", (e) => require(__hooks + "/validity_api.js").saveSemester(e))
routerAdd("POST", "/api/xueqing/validity/apply", (e) => require(__hooks + "/validity_api.js").applyValidity(e))
routerAdd("POST", "/api/xueqing/validity/extend", (e) => require(__hooks + "/validity_api.js").extendLabel(e))
routerAdd("GET", "/api/xueqing/validity/status", (e) => require(__hooks + "/validity_api.js").labelStatus(e))
