<script setup>
import { onMounted, ref } from "vue"
import { api } from "../shared/api.js"
import { useSessionStore } from "../stores/session.js"

const session = useSessionStore()
const classes = ref([])
const classId = ref("")
const rows = ref([])
const errors = ref([])
const message = ref("")

async function loadClasses() {
  classes.value = (await api("/api/collections/classes/records", { token: session.token })).items
  if (!classId.value && classes.value[0]) classId.value = classes.value[0].id
  await loadStudents()
}

async function loadStudents() {
  const all = (await api("/api/collections/students/records", { token: session.token })).items
  rows.value = all.filter((item) => item.current_class === classId.value).map((item) => ({
    studentId: item.id,
    displayName: item.display_name,
    receiptNo: "",
    consentedOn: "",
    signerRole: "父母",
    oralExplained: false,
  }))
}

async function submit() {
  message.value = ""
  errors.value = []
  try {
    const result = await api("/api/xueqing/consent-batch", {
      token: session.token,
      method: "POST",
      body: {
        classId: classId.value,
        rows: rows.value.map((row) => ({
          studentId: row.studentId,
          receiptNo: row.receiptNo.trim(),
          consentedOn: row.consentedOn.trim(),
          signerRole: row.signerRole,
          oralExplained: row.oralExplained,
        })),
      },
    })
    errors.value = result.errors
    message.value = `已保存 ${result.saved.length} 行`
  } catch (err) {
    message.value = err.message
  }
}

onMounted(loadClasses)
</script>

<template>
  <section>
    <p>一次登记一个班的同意回执。缺项的行会标出行号，已经填好的行仍会保存。</p>
    <el-form @submit.prevent="submit">
      <el-select
        v-model="classId"
        placeholder="班级"
        @change="loadStudents"
      >
        <el-option
          v-for="item in classes"
          :key="item.id"
          :label="item.name"
          :value="item.id"
        />
      </el-select>
      <div
        v-for="(row, index) in rows"
        :key="row.studentId"
      >
        <span>第 {{ index + 1 }} 行 {{ row.displayName }}</span>
        <el-input
          v-model="row.receiptNo"
          placeholder="回执编号"
        />
        <el-input
          v-model="row.consentedOn"
          placeholder="日期，如 2026-01-02 00:00:00.000Z"
        />
        <el-select v-model="row.signerRole">
          <el-option
            label="父母"
            value="父母"
          />
          <el-option
            label="祖辈"
            value="祖辈"
          />
          <el-option
            label="其他照料人"
            value="其他照料人"
          />
        </el-select>
        <el-checkbox v-model="row.oralExplained">
          有当面口头讲解
        </el-checkbox>
      </div>
      <el-button native-type="submit">
        成批登记
      </el-button>
    </el-form>
    <p
      v-for="item in errors"
      :key="item.row"
    >
      第 {{ item.row }} 行：{{ item.message }}
    </p>
    <p v-if="message">
      {{ message }}
    </p>
  </section>
</template>
