<script setup>
import { computed, onMounted, ref } from "vue"
import { api } from "../shared/api.js"
import { compressPhoto } from "../shared/photo.js"
import { useSessionStore } from "../stores/session.js"

const emit = defineEmits(["close"])
const session = useSessionStore()
const subjects = ref([])
const textbooks = ref([])
const subjectCode = ref("")
const grade = ref("")
const textbook = ref("")
const textbookCustom = ref("")
const knowledgeCode = ref("")
const errorCode = ref("")
const difficulty = ref("")
const stem = ref("")
const answer = ref("")
const explanation = ref("")
const image = ref("")
const originalAuthorized = ref(false)
const shareToOrg = ref(false)
const message = ref("")
const items = ref([])

const subject = computed(() => subjects.value.find((item) => item.code === subjectCode.value) || null)
const terms = computed(() => (subject.value?.terms || []).filter((item) => !grade.value || (item.grades || []).includes(grade.value)))
const textbookRow = computed(() => textbooks.value.find((item) => item.name === textbook.value) || null)

async function load() {
  subjects.value = (await api("/api/xueqing/entry-catalog", { token: session.token })).subjects
  textbooks.value = (await api("/api/xueqing/dictionary/textbooks", { token: session.token })).items
  items.value = (await api("/api/xueqing/questions", { token: session.token })).items
}

async function onImage(event) {
  message.value = ""
  const file = event.target.files && event.target.files[0]
  image.value = ""
  if (!file) return
  try {
    image.value = await compressPhoto(file)
  } catch (err) {
    message.value = err.message
  }
}

async function save() {
  message.value = ""
  try {
    const saved = await api("/api/xueqing/questions", {
      token: session.token,
      method: "POST",
      body: {
        subjectCode: subjectCode.value,
        grade: grade.value,
        textbook: textbook.value,
        textbookCustom: textbookCustom.value,
        knowledgeCode: knowledgeCode.value,
        errorCode: errorCode.value,
        difficulty: difficulty.value,
        stem: stem.value,
        answer: answer.value,
        explanation: explanation.value,
        image: image.value,
        originalAuthorized: originalAuthorized.value,
        shareToOrg: shareToOrg.value,
      },
    })
    items.value = [saved].concat(items.value)
    message.value = "已保存，默认本校可见"
  } catch (err) {
    message.value = err.message
  }
}

async function change(item, path) {
  message.value = ""
  try {
    const saved = await api(path, { token: session.token, method: "POST", body: { id: item.id } })
    items.value = items.value.map((row) => (row.id === saved.id ? saved : row))
  } catch (err) {
    message.value = err.message
  }
}

onMounted(load)
</script>

<template>
  <section>
    <p>
      <button
        type="button"
        @click="emit('close')"
      >
        返回
      </button>
    </p>
    <p>老师自建题。课件、教案、校本教材上传二期开放。</p>
    <p>
      <label>
        学科
        <select v-model="subjectCode">
          <option value="">
            请选择
          </option>
          <option
            v-for="item in subjects"
            :key="item.code"
            :value="item.code"
          >
            {{ item.name }}
          </option>
        </select>
      </label>
    </p>
    <p>
      <label>
        年级
        <select v-model="grade">
          <option value="">
            请选择
          </option>
          <option
            v-for="item in subject?.grades || []"
            :key="item"
            :value="item"
          >
            {{ item }}
          </option>
        </select>
      </label>
    </p>
    <p>
      <label>
        教材版本
        <select v-model="textbook">
          <option value="">
            请选择
          </option>
          <option
            v-for="item in textbooks"
            :key="item.name"
            :value="item.name"
          >
            {{ item.name }}
          </option>
        </select>
      </label>
    </p>
    <p v-if="textbookRow?.custom">
      <label>
        自填教材
        <input
          v-model="textbookCustom"
          type="text"
        >
      </label>
    </p>
    <p>
      <label>
        知识点
        <select v-model="knowledgeCode">
          <option value="">
            请选择
          </option>
          <option
            v-for="item in terms"
            :key="item.code"
            :value="item.code"
          >
            {{ item.name }}
          </option>
        </select>
      </label>
    </p>
    <p>
      <label>
        题目
        <textarea v-model="stem" />
      </label>
    </p>
    <p>
      <label>
        答案
        <textarea v-model="answer" />
      </label>
    </p>
    <p>
      <label>
        解析
        <textarea v-model="explanation" />
      </label>
    </p>
    <p>
      <label>
        错误类型
        <select v-model="errorCode">
          <option value="">
            可不填
          </option>
          <option
            v-for="item in subject?.error_types || []"
            :key="item.code"
            :value="item.code"
          >
            {{ item.label }}
          </option>
        </select>
      </label>
    </p>
    <p>
      <label>
        难度
        <input
          v-model="difficulty"
          type="text"
        >
      </label>
    </p>
    <p>
      <label>
        图片
        <input
          type="file"
          accept="image/*"
          @change="onImage"
        >
      </label>
    </p>
    <p>
      <label>
        <input
          v-model="originalAuthorized"
          type="checkbox"
        >
        原创或已获授权
      </label>
    </p>
    <p>
      <label>
        <input
          v-model="shareToOrg"
          type="checkbox"
        >
        共享到本组织
      </label>
    </p>
    <p>
      <button
        type="button"
        @click="save"
      >
        保存题目
      </button>
    </p>
    <p v-if="message">
      {{ message }}
    </p>
    <article
      v-for="item in items"
      :key="item.id"
    >
      <p>{{ item.stem }}（{{ item.visibility }}，{{ item.status }}）</p>
      <button
        type="button"
        @click="change(item, '/api/xueqing/questions/unpublish')"
      >
        下架
      </button>
      <button
        type="button"
        @click="change(item, '/api/xueqing/questions/revoke')"
      >
        撤销
      </button>
    </article>
  </section>
</template>
