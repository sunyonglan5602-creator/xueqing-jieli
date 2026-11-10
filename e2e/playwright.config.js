import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173",
    cwd: "../frontend",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
  },
})
