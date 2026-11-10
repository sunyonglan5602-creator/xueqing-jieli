<script setup>
import { ref } from "vue"
import { api } from "../shared/api.js"
import { useSessionStore } from "../stores/session.js"

const session = useSessionStore()
const students = ref([])
const message = ref("")

async function load() {
  message.value = ""
  students.value = []
  try {
    const listed = await api("/api/collections/students/records", { token: session.token })
    students.value = listed.items
  } catch (err) {
    message.value = err.message
  }
}
</script>

<template>
  <section>
    <el-button @click="load">
      学生明细
    </el-button>
    <p v-if="message">
      {{ message }}
    </p>
    <ul>
      <li
        v-for="student in students"
        :key="student.id"
      >
        {{ student.display_name }}
      </li>
    </ul>
  </section>
</template>
