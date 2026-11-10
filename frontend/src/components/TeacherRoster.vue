<script setup>
import { onMounted, ref } from "vue"
import { api } from "../shared/api.js"
import { canRecord } from "../shared/consent.js"
import { useSessionStore } from "../stores/session.js"

const session = useSessionStore()
const students = ref([])
const message = ref("")

async function load() {
  try {
    students.value = (await api("/api/xueqing/record-students", { token: session.token })).items
  } catch (err) {
    message.value = err.message
  }
}

onMounted(load)
</script>

<template>
  <section>
    <p>未同意或未登记的学生不能记学情。</p>
    <p
      v-for="item in students"
      :key="item.id"
    >
      <button
        type="button"
        :disabled="!canRecord(item.consent_status)"
      >
        {{ item.display_name }}
      </button>
      <span v-if="!canRecord(item.consent_status)">{{ item.consent_status }}</span>
    </p>
    <p v-if="message">
      {{ message }}
    </p>
  </section>
</template>
