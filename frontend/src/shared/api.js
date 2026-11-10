export async function api(path, { token, method = "GET", body } = {}) {
  const headers = {}
  if (token) headers.authorization = token
  if (body !== undefined) headers["content-type"] = "application/json"
  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let data = {}
  if (text) data = JSON.parse(text)
  if (!response.ok) {
    const error = new Error(data.message || "请求失败")
    error.status = response.status
    throw error
  }
  return data
}

const ADMIN_ROLES = ["platform_admin", "org_admin", "school_admin"]

export function highestRole(record) {
  const roles = record?.roles || []
  for (const role of ["platform_admin", "org_admin", "school_admin", "teacher", "parent", "education_bureau_viewer"]) {
    if (roles.includes(role)) return role
  }
  return ""
}

export function landingPath(record) {
  if (!record) return "/login"
  if (record.must_change_password) return "/change-password"
  if (ADMIN_ROLES.includes(highestRole(record))) return "/admin"
  return "/m"
}
