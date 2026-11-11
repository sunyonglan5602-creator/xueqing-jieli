import { api } from "./api.js"

export async function loadGradeNames(token) {
  const data = await api("/api/xueqing/dictionary/grades", { token })
  return data.items.map((item) => item.name)
}
