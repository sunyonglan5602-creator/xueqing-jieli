import { createRouter, createWebHistory } from "vue-router"
import HomeView from "../views/HomeView.vue"
import MobileShell from "../views/MobileShell.vue"
import AdminShell from "../views/AdminShell.vue"

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/m", name: "mobile", component: MobileShell },
    { path: "/admin", name: "admin", component: AdminShell },
  ],
})
