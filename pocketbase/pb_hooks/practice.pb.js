// 手工挑题打印练习单。不按错题自动推送，也不生成变式题。

routerAdd("POST", "/api/xueqing/practice-sheets", (e) => require(__hooks + "/practice_api.js").createSheet(e))
routerAdd("GET", "/api/xueqing/practice-sheets/one", (e) => require(__hooks + "/practice_api.js").readSheet(e))

onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  throw new NotFoundError("不存在")
}, "practice_sheets")

onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  throw new NotFoundError("不存在")
}, "practice_sheets")

onRecordDeleteRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  throw new NotFoundError("不存在")
}, "practice_sheets")
