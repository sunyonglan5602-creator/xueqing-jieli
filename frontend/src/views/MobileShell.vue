<script setup>
import { onMounted, ref } from "vue"
import { NavBar } from "vant"
import { useRouter } from "vue-router"
import PhaseMenu from "../components/PhaseMenu.vue"
import RecordEntry from "../components/RecordEntry.vue"
import WuyuEntry from "../components/WuyuEntry.vue"
import TeacherRoster from "../components/TeacherRoster.vue"
import { highestRole } from "../shared/api.js"
import { countEntryClick, resetEntrySession, resetWuyuSession } from "../shared/entry-session.js"
import { ROLE_LABELS } from "../shared/menu.js"
import { useSessionStore } from "../stores/session.js"

const router = useRouter()
const session = useSessionStore()
const role = highestRole(session.record)
const entryOpen = ref(false)
const entryKey = ref(0)
const wuyuOpen = ref(false)
const wuyuKey = ref(0)

function openEntry() {
  resetEntrySession()
  countEntryClick()
  entryKey.value += 1
  entryOpen.value = true
  wuyuOpen.value = false
}

function openWuyu() {
  resetWuyuSession()
  wuyuKey.value += 1
  wuyuOpen.value = true
  entryOpen.value = false
}

onMounted(resetEntrySession)

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
    <button
      v-if="role === 'teacher'"
      type="button"
      @click="openEntry"
    >
      记学情
    </button>
    <button
      v-if="role === 'teacher'"
      type="button"
      @click="openWuyu"
    >
      记一笔
    </button>
    <RecordEntry
      v-if="entryOpen"
      :key="entryKey"
      @close="entryOpen = false"
    />
    <WuyuEntry
      v-if="wuyuOpen"
      :key="wuyuKey"
      @close="wuyuOpen = false"
    />
    <TeacherRoster v-if="role === 'teacher' && !entryOpen && !wuyuOpen" />
    <PhaseMenu />
  </main>
</template>
