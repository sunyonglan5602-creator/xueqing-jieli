<script setup>
import { onMounted, ref } from "vue"
import { api } from "../shared/api.js"
import { useSessionStore } from "../stores/session.js"

const session = useSessionStore()
const crossSubject = ref("打开")
const until = ref("")
const message = ref("")

async function load() {
  const school = await api(`/api/collections/schools/records/${session.record.school}`, { token: session.token })
  crossSubject.value = school.cross_subject_view || "打开"
}

async function saveView() {
  message.value = ""
  try {
    await api(`/api/collections/schools/records/${session.record.school}`, {
      token: session.token,
      method: "PATCH",
      body: { cross_subject_view: crossSubject.value },
    })
    message.value = "已保存跨科查看"
  } catch (err) {
    message.value = err.message
  }
}

async function grant() {
  message.value = ""
  try {
    await api("/api/collections/detail_grants/records", {
      token: session.token,
      method: "POST",
      body: { school: session.record.school, valid_until: until.value.trim() },
    })
    until.value = ""
    message.value = "已允许协会查看学生明细，到期自动失效"
  } catch (err) {
    message.value = err.message
  }
}

onMounted(load)
</script>

<template>
  <section>
    <p>老师默认能看本班各科，只能改自己记的。关掉跨科查看后，只能看自己任课学科。</p>
    <el-form @submit.prevent="saveView">
      <el-select v-model="crossSubject">
        <el-option
          label="打开跨科查看"
          value="打开"
        />
        <el-option
          label="关闭跨科查看"
          value="关闭"
        />
      </el-select>
      <el-button native-type="submit">
        保存跨科查看
      </el-button>
    </el-form>
    <p>协会负责人查看学生明细须本校同意，到期自动失效，每次查看写入审计。</p>
    <el-form @submit.prevent="grant">
      <el-input
        v-model="until"
        placeholder="到期时间，如 2099-01-01 00:00:00.000Z"
      />
      <el-button native-type="submit">
        允许协会查看
      </el-button>
    </el-form>
    <p v-if="message">
      {{ message }}
    </p>
  </section>
</template>
