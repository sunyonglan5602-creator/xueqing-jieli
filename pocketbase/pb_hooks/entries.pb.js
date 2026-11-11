// 标签式录入。每条错题从保存起就带学科、年级、教材版本和知识点编号。

routerAdd("POST", "/api/xueqing/entries", (e) => {
  return require(__hooks + "/entries_api.js").saveEntries(e)
})
