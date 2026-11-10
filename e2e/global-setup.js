export default async function globalSetup() {
  const deadline = Date.now() + 30_000
  let last = ""
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:8095/api/collections/users/auth-with-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identity: "demo-school-a", password: "Demo-Pass-0000" }),
      })
      if (response.ok) return
      last = await response.text()
    } catch (err) {
      last = String(err)
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`种子账号没有就绪：${last}`)
}
