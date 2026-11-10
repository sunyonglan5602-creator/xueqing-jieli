export async function apiText(path, { token } = {}) {
  const headers = {}
  if (token) headers.authorization = token
  const response = await fetch(path, { headers })
  const text = await response.text()
  if (!response.ok) {
    let message = text
    try {
      message = JSON.parse(text).message || text
    } catch {
      message = text
    }
    const error = new Error(message || "请求失败")
    error.status = response.status
    throw error
  }
  return text
}

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
