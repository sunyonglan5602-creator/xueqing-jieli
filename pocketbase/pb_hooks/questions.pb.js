// 老师自建题走接口。直接改集合一律当作不存在。一期不做自动推送和变式题。

routerAdd("POST", "/api/xueqing/questions", (e) => require(__hooks + "/questions_api.js").saveQuestion(e))
routerAdd("GET", "/api/xueqing/questions", (e) => require(__hooks + "/questions_api.js").listQuestions(e))
routerAdd("GET", "/api/xueqing/questions/one", (e) => require(__hooks + "/questions_api.js").readQuestion(e))
routerAdd("POST", "/api/xueqing/questions/unpublish", (e) => require(__hooks + "/questions_api.js").unpublishQuestion(e))
routerAdd("POST", "/api/xueqing/questions/revoke", (e) => require(__hooks + "/questions_api.js").revokeQuestion(e))

onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  throw new NotFoundError("不存在")
}, "teacher_questions")

onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  throw new NotFoundError("不存在")
}, "teacher_questions")

onRecordDeleteRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  throw new NotFoundError("不存在")
}, "teacher_questions")
