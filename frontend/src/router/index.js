import { createRouter, createWebHistory } from "vue-router"
import HomeView from "../views/HomeView.vue"
import LoginView from "../views/LoginView.vue"
import ChangePasswordView from "../views/ChangePasswordView.vue"
import MobileShell from "../views/MobileShell.vue"
import AdminShell from "../views/AdminShell.vue"
import { landingPath } from "../shared/api.js"
import { useSessionStore } from "../stores/session.js"

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/login", name: "login", component: LoginView },
    { path: "/change-password", name: "change-password", component: ChangePasswordView, meta: { auth: true } },
    { path: "/m", name: "mobile", component: MobileShell, meta: { auth: true, business: true } },
    { path: "/admin", name: "admin", component: AdminShell, meta: { auth: true, business: true } },
  ],
})

router.beforeEach((to) => {
  const session = useSessionStore()
  if (to.meta.auth && !session.token) return { path: "/login" }
  if (!session.record) return true
  const landing = landingPath(session.record)
  if (session.record.must_change_password && to.path !== "/change-password") return { path: "/change-password" }
  if (!session.record.must_change_password && to.path === "/change-password") return { path: landing }
  if (to.meta.business && to.path !== landing && landing !== "/change-password") return { path: landing }
  return true
})
