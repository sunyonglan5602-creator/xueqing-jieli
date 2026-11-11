export const ROLE_LABELS = {
  platform_admin: "平台管理员",
  org_admin: "协会负责人",
  school_admin: "学校管理员",
  teacher: "老师",
  parent: "家长",
  education_bureau_viewer: "教育局查看者",
}

export function phaseEntries(record) {
  const roles = record?.roles || []
  const items = []
  if (roles.includes("teacher")) {
    items.push({ id: "m9", label: "练习组卷", phase: "二期开放" })
    items.push({ id: "m13", label: "校本资源库", phase: "老师自建题" })
    items.push({ id: "m13-courseware", label: "课件", phase: "二期开放" })
    items.push({ id: "m13-lesson", label: "教案", phase: "二期开放" })
    items.push({ id: "m13-textbook", label: "校本教材上传", phase: "二期开放" })
  }
  if (roles.includes("org_admin") || roles.includes("education_bureau_viewer")) {
    items.push({ id: "m10", label: "区域教研", phase: "二期开放" })
  }
  if (roles.includes("school_admin") || roles.includes("org_admin")) {
    items.push({ id: "m11", label: "物资", phase: "三期开放" })
  }
  return items
}

export function showsStudentDetail(record) {
  const roles = record?.roles || []
  return roles.includes("org_admin") && !roles.includes("platform_admin")
}
