import { readFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const allowed = /^(MIT|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|ISC|0BSD)(\s+OR\s+(MIT|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|ISC|0BSD))*$/

function readPackage(dir) {
  return JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8"))
}

function licenseOf(manifest) {
  const value = manifest.license
  if (typeof value === "string") {
    return value
  }
  if (value && typeof value.type === "string") {
    return value.type
  }
  return ""
}

const projects = ["frontend", "e2e"]
const failures = []

for (const name of projects) {
  const dir = resolve(root, name)
  const manifest = readPackage(dir)
  const deps = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
  }
  for (const dep of Object.keys(deps)) {
    const installed = resolve(dir, "node_modules", dep, "package.json")
    if (!existsSync(installed)) {
      failures.push(`${name}: 未安装 ${dep}`)
      continue
    }
    const license = licenseOf(JSON.parse(readFileSync(installed, "utf8")))
    if (!allowed.test(license)) {
      failures.push(`${name}: ${dep} 的许可证是「${license || "未声明"}」`)
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"))
  process.exit(1)
}

console.log("直接依赖的许可证都在 MIT / Apache-2.0 / BSD / ISC 范围内。")
