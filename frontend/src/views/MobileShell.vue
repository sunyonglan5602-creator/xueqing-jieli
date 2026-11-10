<script setup>
import { NavBar } from "vant"
import { useRouter } from "vue-router"
import PhaseMenu from "../components/PhaseMenu.vue"
import { highestRole } from "../shared/api.js"
import { ROLE_LABELS } from "../shared/menu.js"
import { useSessionStore } from "../stores/session.js"

const router = useRouter()
const session = useSessionStore()
const role = highestRole(session.record)

function logout() {
  session.logout()
  router.push("/login")
}
</script>

<template>
  <NavBar
    title="教师端"
    left-text="退出"
    @click-left="logout"
  />
  <main>
    <p v-if="role === 'education_bureau_viewer'">
      {{ ROLE_LABELS.education_bureau_viewer }}一期不开放。
    </p>
    <p v-else>
      已进入业务页。
    </p>
    <p>{{ session.record?.display_name }}</p>
    <PhaseMenu />
  </main>
</template>
