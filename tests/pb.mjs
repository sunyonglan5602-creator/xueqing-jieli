import { spawn, spawnSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import net from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

export async function startPocketBase() {
  const dir = await mkdtemp(path.join(tmpdir(), "xqj-"))
  const port = await freePort()
  const bin = path.join(root, "pocketbase/bin/pocketbase")
  const common = [
    "--dir", dir,
    "--migrationsDir", path.join(root, "pocketbase/pb_migrations"),
    "--hooksDir", path.join(root, "pocketbase/pb_hooks"),
    "--publicDir", path.join(root, "pocketbase/pb_public"),
    "--automigrate=false",
  ]
  const email = "superuser@example.invalid"
  const password = "Super-Pass-0000"
  const upsert = spawnSync(bin, ["superuser", "upsert", email, password, ...common], { encoding: "utf8" })
  if (upsert.status !== 0) {
    throw new Error(upsert.stderr || upsert.stdout || "superuser upsert failed")
  }
  const proc = spawn(bin, ["serve", "--http", `127.0.0.1:${port}`, "--hooksWatch=false", ...common], {
    stdio: ["ignore", "pipe", "pipe"],
  })
  let logs = ""
  proc.stdout.on("data", (chunk) => { logs += chunk })
  proc.stderr.on("data", (chunk) => { logs += chunk })
  const base = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 8000
  let healthy = false
  let last = ""
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) break
    try {
      const response = await fetch(`${base}/api/health`)
      last = `${response.status} ${await response.text()}`
      if (response.ok) {
        healthy = true
        break
      }
    } catch (err) {
      last = String(err)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (!healthy) {
    proc.kill()
    throw new Error(`${last}\n${logs}` || "PocketBase 没有启动")
  }
  return {
    base,
    logs: () => logs,
    email,
    password,
    async stop() {
      proc.kill()
      await rm(dir, { recursive: true, force: true })
    },
  }
}

export async function api(base, path, { token, method = "GET", body } = {}) {
  const headers = {}
  if (token) headers.authorization = token
  if (body !== undefined) headers["content-type"] = "application/json"
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let data = {}
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { message: text }
    }
  }
  return { status: response.status, data }
}

export async function login(base, identity, password, collection = "users") {
  return api(base, `/api/collections/${collection}/auth-with-password`, {
    method: "POST",
    body: { identity, password },
  })
}
