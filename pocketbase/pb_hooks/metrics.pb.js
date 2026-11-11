routerAdd("GET", "/api/xueqing/metrics", (e) => require(__hooks + "/metrics_api.js").listMetrics(e))
routerAdd("POST", "/api/xueqing/metric-submissions", (e) => require(__hooks + "/metrics_api.js").recordSubmission(e))
