import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  workers: 1,
  globalSetup: "./global-setup.js",
  use: {
    baseURL: "http://127.0.0.1:5173",
  },
  webServer: [
    {
      command: "bash ../scripts/e2e-backend.sh",
      url: "http://127.0.0.1:8095/api/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5173",
      cwd: "../frontend",
      env: { ...process.env, VITE_PB_URL: "http://127.0.0.1:8095" },
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
    },
  ],
})
