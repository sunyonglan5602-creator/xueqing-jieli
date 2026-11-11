// 学科、年级、词表、禁用词都是数据。增删改走接口，不改代码。

routerUse((e) => {
  require(__hooks + "/dictionary_api.js").seed($app)
  return e.next()
})

onRecordCreateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  if (!lib.currentUser(e)) return e.next()
  lib.assertGradeList(e.record.get("grades"))
  return e.next()
}, "classes")

onRecordUpdateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  if (!lib.currentUser(e)) return e.next()
  lib.assertGradeList(e.record.get("grades"))
  return e.next()
}, "classes")

onRecordUpdateRequest((e) => {
  const lib = require(__hooks + "/lib.js")
  if (!lib.currentUser(e)) return e.next()
  lib.assertKnownGrade(e.record.get("grade"))
  return e.next()
}, "students")

routerAdd("GET", "/api/xueqing/dictionary/grades", (e) => require(__hooks + "/dictionary_api.js").listGrades(e))
routerAdd("POST", "/api/xueqing/dictionary/grades", (e) => require(__hooks + "/dictionary_api.js").createGrade(e))
routerAdd("GET", "/api/xueqing/dictionary/subjects", (e) => require(__hooks + "/dictionary_api.js").listSubjects(e))
routerAdd("POST", "/api/xueqing/dictionary/subjects", (e) => require(__hooks + "/dictionary_api.js").createSubject(e))
routerAdd("POST", "/api/xueqing/dictionary/subjects/update", (e) => require(__hooks + "/dictionary_api.js").updateSubject(e))
routerAdd("GET", "/api/xueqing/dictionary/terms", (e) => require(__hooks + "/dictionary_api.js").listTerms(e))
routerAdd("POST", "/api/xueqing/dictionary/terms", (e) => require(__hooks + "/dictionary_api.js").createTerm(e))
routerAdd("POST", "/api/xueqing/dictionary/terms/disable", (e) => require(__hooks + "/dictionary_api.js").disableTerm(e))
routerAdd("POST", "/api/xueqing/dictionary/error-types", (e) => require(__hooks + "/dictionary_api.js").createErrorType(e))
routerAdd("GET", "/api/xueqing/dictionary/error-types", (e) => require(__hooks + "/dictionary_api.js").listErrorTypes(e))
routerAdd("GET", "/api/xueqing/dictionary/textbooks", (e) => require(__hooks + "/dictionary_api.js").listTextbooks(e))
routerAdd("GET", "/api/xueqing/entry-catalog", (e) => require(__hooks + "/dictionary_api.js").entryCatalogRoute(e))
routerAdd("POST", "/api/xueqing/dictionary/check-attach", (e) => require(__hooks + "/dictionary_api.js").checkAttach(e))
