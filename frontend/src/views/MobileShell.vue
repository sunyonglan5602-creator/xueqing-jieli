<script setup>
import { NavBar } from "vant"
import { useRouter } from "vue-router"
import { useSessionStore } from "../stores/session.js"

const router = useRouter()
const session = useSessionStore()

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
    <p>已进入业务页。</p>
    <p>{{ session.record?.display_name }}</p>
  </main>
</template>
