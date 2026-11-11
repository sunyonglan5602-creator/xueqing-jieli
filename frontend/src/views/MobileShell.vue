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
import { flushOffline, pendingLabel } from "../shared/offline-db.js"
import { ROLE_LABELS } from "../shared/menu.js"
import { useSessionStore } from "../stores/session.js"

const router = useRouter()
const session = useSessionStore()
const role = highestRole(session.record)
const entryOpen = ref(false)
const entryKey = ref(0)
const wuyuOpen = ref(false)
const wuyuKey = ref(0)
const pending = ref({ count: 0, stale: false })
const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true

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

onMounted(async () => {
  resetEntrySession()
  await flushOffline()
  pending.value = await pendingLabel()
})

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
    <p v-if="!standalone">
      请先把本网站添加到手机主屏幕。没添加的话，没网时会打不开。
    </p>
    <p
      v-if="pending.count"
      :style="pending.stale ? 'color:#b00020' : ''"
    >
      {{ pending.stale ? `还有 ${pending.count} 条记录没传上去，请打开网站把记录传上去。` : `离线 · 待补传 ${pending.count} 条` }}
    </p>
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
