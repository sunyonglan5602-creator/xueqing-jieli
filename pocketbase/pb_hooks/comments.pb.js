// 阶段评语走接口。直接改集合一律当作不存在。二期润色不注册路由。

routerAdd("GET", "/api/xueqing/comments/sources", (e) => require(__hooks + "/comments_api.js").sources(e))
routerAdd("POST", "/api/xueqing/comments/drafts", (e) => require(__hooks + "/comments_api.js").drafts(e))
routerAdd("POST", "/api/xueqing/comments/confirm", (e) => require(__hooks + "/comments_api.js").confirm(e))
routerAdd("GET", "/api/xueqing/comments", (e) => require(__hooks + "/comments_api.js").listComments(e))

onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  throw new NotFoundError("不存在")
}, "stage_comments")

onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  throw new NotFoundError("不存在")
}, "stage_comments")

onRecordDeleteRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  throw new NotFoundError("不存在")
}, "stage_comments")
