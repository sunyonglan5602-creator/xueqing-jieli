import Dexie from "dexie"
import { createSyncQueue } from "./sync-queue.js"

const db = new Dexie("xqj-offline")
db.version(1).stores({
  queue: "id, clientUid, status, createdAt",
  meta: "id",
})

const store = {
  async getByClient(clientUid) {
    return db.queue.where("clientUid").equals(clientUid).first()
  },
  async pending() {
    return db.queue.filter((row) => row.status !== "done").toArray()
  },
  async put(row) {
    await db.queue.put(row)
  },
  async remove(id) {
    await db.queue.delete(id)
  },
  async readKey() {
    const row = await db.meta.get("dek")
    if (!row) return null
    return crypto.subtle.importKey("jwk", row.jwk, { name: "AES-GCM" }, true, ["encrypt", "decrypt"])
  },
  async writeKey(key) {
    const jwk = await crypto.subtle.exportKey("jwk", key)
    await db.meta.put({ id: "dek", jwk })
  },
}

export const offlineQueue = createSyncQueue({
  store,
  subtle: crypto.subtle,
  fetchImpl: (path, body, signal) => fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: bodyToken(body) },
    body: JSON.stringify(body.payload),
    signal,
  }),
})

function bodyToken(body) {
  return body.token || ""
}

export async function submitOffline(path, payload, token) {
  const clientUid = payload.clientUid || crypto.randomUUID()
  payload.clientUid = clientUid
  const result = await offlineQueue.submit({
    clientUid,
    path,
    body: { payload, token },
    createdAt: Date.now(),
  })
  if (!result.queued) {
    const data = await result.response.json()
    if (!result.response.ok) {
      const error = new Error(data.message || "请求失败")
      error.status = result.response.status
      throw error
    }
    return data
  }
  const error = new Error("已转入待补传")
  error.queued = true
  throw error
}

export async function flushOffline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { done: [], pending: await offlineQueue.pendingCount() }
  return offlineQueue.flush()
}

export async function pendingLabel() {
  const count = await offlineQueue.pendingCount()
  const oldest = await offlineQueue.oldestPendingAt()
  const stale = oldest > 0 && Date.now() - oldest > 24 * 60 * 60 * 1000
  return { count, stale }
}
