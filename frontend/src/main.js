import { createApp } from "vue"
import { createPinia } from "pinia"
import ElementPlus from "element-plus"
import "element-plus/dist/index.css"
import "vant/lib/index.css"
import App from "./App.vue"
import { flushOffline } from "./shared/offline-db.js"
import { router } from "./router/index.js"

window.addEventListener("online", () => { flushOffline() })
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") flushOffline()
})
if (navigator.storage && navigator.storage.persist) navigator.storage.persist()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.mount("#app")
