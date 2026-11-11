const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export function createSyncQueue({ store, subtle, fetchImpl, now = () => Date.now(), timeoutMs = 3000 }) {
  return {
    async enqueue(item) {
      const existing = await store.getByClient(item.clientUid)
      if (existing) return existing
      const key = await loadKey(store, subtle)
      const secret = await encrypt(subtle, key, item.body)
      const row = {
        id: item.clientUid,
        clientUid: item.clientUid,
        path: item.path,
        secret,
        createdAt: item.createdAt === undefined || item.createdAt === null ? now() : item.createdAt,
        attempts: 0,
        status: "pending",
      }
      await store.put(row)
      return row
    },
    async pendingCount() {
      return (await store.pending()).length
    },
    async oldestPendingAt() {
      const rows = await store.pending()
      if (!rows.length) return 0
      return rows.map((row) => row.createdAt).sort((a, b) => a - b)[0]
    },
    async flush() {
      const key = await loadKey(store, subtle)
      const rows = (await store.pending()).sort((a, b) => a.createdAt - b.createdAt)
      const done = []
      for (const row of rows) {
        row.attempts += 1
        row.status = "sending"
        await store.put(row)
        const body = await decrypt(subtle, key, row.secret)
        try {
          const response = await fetchImpl(row.path, body)
          if (!response.ok) throw new Error("补传失败")
          await store.remove(row.id)
          done.push(row.clientUid)
        } catch (err) {
          row.status = "pending"
          await store.put(row)
          break
        }
      }
      return { done, pending: await this.pendingCount() }
    },
    async submit(item) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetchImpl(item.path, item.body, controller.signal)
        clearTimeout(timer)
        if (response.status >= 500) throw new Error("在线失败")
        return { queued: false, response }
      } catch (err) {
        clearTimeout(timer)
        await this.enqueue(item)
        return { queued: true }
      }
    },
  }
}

export function memoryStore() {
  const rows = new Map()
  let key = null
  return {
    async getByClient(clientUid) {
      for (const row of rows.values()) if (row.clientUid === clientUid) return row
      return null
    },
    async pending() {
      return [...rows.values()].filter((row) => row.status !== "done")
    },
    async put(row) {
      rows.set(row.id, row)
    },
    async remove(id) {
      rows.delete(id)
    },
    async readKey() {
      return key
    },
    async writeKey(value) {
      key = value
    },
  }
}

async function loadKey(store, subtle) {
  const saved = await store.readKey()
  if (saved) return saved
  const key = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])
  await store.writeKey(key)
  return key
}

async function encrypt(subtle, key, body) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await subtle.encrypt({ name: "AES-GCM", iv }, key, textEncoder.encode(JSON.stringify(body)))
  return { iv: [...iv], cipher: [...new Uint8Array(cipher)] }
}

async function decrypt(subtle, key, secret) {
  const plain = await subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(secret.iv) },
    key,
    new Uint8Array(secret.cipher),
  )
  return JSON.parse(textDecoder.decode(plain))
}
