import "fake-indexeddb/auto"
import Dexie from "dexie"
import { describe, expect, it } from "vitest"
import { createSyncQueue, memoryStore } from "../src/shared/sync-queue.js"

function queueWith(fetchImpl) {
  return createSyncQueue({
    store: memoryStore(),
    subtle: crypto.subtle,
    fetchImpl,
    timeoutMs: 50,
  })
}

describe("离线队列", () => {
  it("断网暂存 200 条，联网后补传且不重复", async () => {
    const seen = []
    let online = false
    const queue = queueWith(async (path, body) => {
      if (!online) throw new Error("offline")
      seen.push(body.clientUid)
      return { ok: true }
    })
    for (let i = 0; i < 200; i += 1) {
      const result = await queue.submit({ clientUid: "row-" + i, path: "/api/xueqing/entries", body: { clientUid: "row-" + i } })
      expect(result.queued).toBe(true)
    }
    await queue.enqueue({ clientUid: "row-1", path: "/api/xueqing/entries", body: { clientUid: "row-1" } })
    expect(await queue.pendingCount()).toBe(200)
    online = true
    const flushed = await queue.flush()
    expect(flushed.done).toHaveLength(200)
    expect(flushed.pending).toBe(0)
    expect(new Set(seen).size).toBe(200)
  })

  it("补传到一半断网后能从断点继续", async () => {
    let failAt = 3
    const seen = []
    const queue = queueWith(async (path, body) => {
      if (seen.length === failAt) throw new Error("断网")
      seen.push(body.clientUid)
      return { ok: true }
    })
    for (let i = 0; i < 5; i += 1) await queue.enqueue({ clientUid: "c" + i, path: "/api", body: { clientUid: "c" + i }, createdAt: i + 1 })
    const first = await queue.flush()
    expect(first.done).toEqual(["c0", "c1", "c2"])
    expect(first.pending).toBe(2)
    failAt = 99
    const second = await queue.flush()
    expect(second.pending).toBe(0)
    expect(seen).toEqual(["c0", "c1", "c2", "c3", "c4"])
  })

  it("超过时限就转入待补传", async () => {
    const queue = queueWith((path, body, signal) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("timeout")))
    }))
    const result = await queue.submit({ clientUid: "slow", path: "/api", body: { clientUid: "slow" } })
    expect(result.queued).toBe(true)
    expect(await queue.pendingCount()).toBe(1)
  })

  it("Dexie 里存的是密文", async () => {
    const db = new Dexie("xqj-test")
    db.version(1).stores({ queue: "id, clientUid, status", meta: "id" })
    const store = {
      async getByClient(clientUid) {
        return db.queue.where("clientUid").equals(clientUid).first()
      },
      async pending() {
        return db.queue.toArray()
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
        await db.meta.put({ id: "dek", jwk: await crypto.subtle.exportKey("jwk", key) })
      },
    }
    const queue = createSyncQueue({ store, subtle: crypto.subtle, fetchImpl: async () => ({ ok: true }) })
    await queue.enqueue({ clientUid: "secret", path: "/api", body: { name: "演示生01" } })
    const row = await db.queue.get("secret")
    expect(JSON.stringify(row.secret)).not.toContain("演示生01")
    await db.delete()
  })
})
