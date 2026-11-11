// 五育一键点选。事实句选填。页面不计数、不排名。

routerAdd("GET", "/api/xueqing/wuyu/keywords", (e) => require(__hooks + "/wuyu_api.js").keywords(e))
routerAdd("POST", "/api/xueqing/wuyu", (e) => require(__hooks + "/wuyu_api.js").saveWuyu(e))
routerAdd("GET", "/api/xueqing/wuyu", (e) => require(__hooks + "/wuyu_api.js").listWuyu(e))
