import { gzipSync } from "node:zlib"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const dist = fileURLToPath(new URL("../frontend/dist/", import.meta.url))
const files = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (/\.(html|js|css)$/.test(name) && !name.includes("workbox") && name !== "sw.js") files.push(path)
  }
}
walk(dist)
let bytes = 0
for (const file of files) bytes += gzipSync(readFileSync(file)).length
const limit = 1.5 * 1024 * 1024
if (bytes > limit) {
  console.error(`冷启动传输 ${bytes} 字节，超过 1.5MB`)
  process.exit(1)
}
console.log(`冷启动 gzip 传输 ${bytes} 字节，不超过 1.5MB。`)
