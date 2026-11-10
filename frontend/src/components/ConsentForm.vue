<script setup>
import { onMounted, ref } from "vue"
import { api } from "../shared/api.js"
import { useSessionStore } from "../stores/session.js"

const session = useSessionStore()
const students = ref([])
const studentId = ref("")
const status = ref("已同意")
const receiptNo = ref("")
const consentedOn = ref("")
const explainMethod = ref("书面")
const signerRole = ref("父母")
const message = ref("")

async function load() {
  students.value = (await api("/api/collections/students/records", { token: session.token })).items
}

async function save() {
  message.value = ""
  try {
    const result = await api("/api/xueqing/consents", {
      token: session.token,
      method: "POST",
      body: {
        studentId: studentId.value,
        status: status.value,
        receiptNo: receiptNo.value.trim(),
        consentedOn: consentedOn.value.trim(),
        explainMethod: explainMethod.value,
        signerRole: signerRole.value,
      },
    })
    message.value = result.message || "已登记同意状态"
    await load()
  } catch (err) {
    message.value = err.message
  }
}

onMounted(load)
</script>

<template>
  <section>
    <p>
      <a href="/api/xueqing/consent-template">下载监护人告知书模板</a>
    </p>
    <el-form @submit.prevent="save">
      <el-select
        v-model="studentId"
        placeholder="学生"
      >
        <el-option
          v-for="item in students"
          :key="item.id"
          :label="item.display_name"
          :value="item.id"
        />
      </el-select>
      <el-select v-model="status">
        <el-option
          label="已同意"
          value="已同意"
        />
        <el-option
          label="已拒绝"
          value="已拒绝"
        />
        <el-option
          label="已撤回"
          value="已撤回"
        />
      </el-select>
      <el-input
        v-model="receiptNo"
        placeholder="回执编号"
      />
      <el-input
        v-model="consentedOn"
        placeholder="日期，如 2026-01-02 00:00:00.000Z"
      />
      <el-select v-model="explainMethod">
        <el-option
          label="书面"
          value="书面"
        />
        <el-option
          label="口头讲解 + 纸质回执"
          value="口头讲解 + 纸质回执"
        />
      </el-select>
      <el-select v-model="signerRole">
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
      <el-button native-type="submit">
        登记同意
      </el-button>
    </el-form>
    <p v-if="message">
      {{ message }}
    </p>
  </section>
</template>
