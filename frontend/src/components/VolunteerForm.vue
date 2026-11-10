<script setup>
import { onMounted, ref } from "vue"
import { api, highestRole } from "../shared/api.js"
import { useSessionStore } from "../stores/session.js"

const session = useSessionStore()
const rank = highestRole(session.record)
const teachers = ref([])
const profiles = ref([])
const userId = ref("")
const crimeCheckNo = ref("")
const crimeCheckDate = ref("")
const trainingNote = ref("")
const confidentiality = ref(false)
const duty = ref("独立任课")
const message = ref("")

async function load() {
  if (rank === "school_admin") {
    teachers.value = (await api("/api/xueqing/accounts", { token: session.token })).items.filter((item) => item.roles.includes("teacher"))
  }
  try {
    profiles.value = (await api("/api/collections/teacher_profiles/records", { token: session.token })).items
  } catch (err) {
    message.value = err.message
  }
}

async function save() {
  message.value = ""
  try {
    await api("/api/collections/teacher_profiles/records", {
      token: session.token,
      method: "POST",
      body: {
        user: userId.value,
        crime_check_no: crimeCheckNo.value.trim(),
        crime_check_date: crimeCheckDate.value.trim(),
        training_note: trainingNote.value.trim(),
        confidentiality_accepted: confidentiality.value,
        duty: duty.value,
      },
    })
    await load()
  } catch (err) {
    message.value = err.message
  }
}

onMounted(load)
</script>

<template>
  <section>
    <p>由学校依法查询，系统不做资格认定。</p>
    <el-form
      v-if="rank === 'school_admin'"
      @submit.prevent="save"
    >
      <el-select
        v-model="userId"
        placeholder="老师"
      >
        <el-option
          v-for="item in teachers"
          :key="item.id"
          :label="item.display_name"
          :value="item.id"
        />
      </el-select>
      <el-input
        v-model="crimeCheckNo"
        placeholder="违法犯罪记录查询回执编号"
      />
      <el-input
        v-model="crimeCheckDate"
        placeholder="回执日期，如 2026-01-01 00:00:00.000Z"
      />
      <el-input
        v-model="trainingNote"
        placeholder="岗前培训或见习记录"
      />
      <el-checkbox v-model="confidentiality">
        已登记保密承诺
      </el-checkbox>
      <el-select v-model="duty">
        <el-option
          label="独立任课"
          value="独立任课"
        />
        <el-option
          label="辅助教学"
          value="辅助教学"
        />
      </el-select>
      <el-button native-type="submit">
        登记志愿者档案
      </el-button>
    </el-form>
    <ul>
      <li
        v-for="item in profiles"
        :key="item.id"
      >
        {{ item.duty }} {{ item.crime_check_no }}
      </li>
    </ul>
    <p v-if="message">
      {{ message }}
    </p>
  </section>
</template>
