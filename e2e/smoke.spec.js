import { expect, test } from "@playwright/test"

test("三个入口都显示演示数据水印", async ({ page }) => {
  for (const path of ["/", "/m", "/admin"]) {
    await page.goto(path)
    await expect(page.getByText("演示数据").first()).toBeVisible()
  }
})
