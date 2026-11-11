<script setup>
import { computed, onMounted, ref } from "vue"
import { api } from "../shared/api.js"
import { countWuyuClick, wuyuSession } from "../shared/entry-session.js"
import { useSessionStore } from "../stores/session.js"

const emit = defineEmits(["close"])
const session = useSessionStore()
const dimensions = ref([])
const keywords = ref([])
const grades = ref([])
const students = ref([])
const picked = ref([])
const fact = ref("")
const message = ref("")
const saved = ref([])

const band = computed(() => {
  const names = students.value.filter((item) => picked.value.includes(item.id)).map((item) => item.grade)
  const bands = names.map((name) => grades.value.find((item) => item.name === name)?.band || "")
  if (bands.length && bands.every((item) => item === "低年级")) return "低年级"
  if (bands.length && bands.every((item) => item === "高年级")) return "高年级"
  return ""
})

function wording(item) {
  if (band.value === "低年级") return item.low_text
  if (band.value === "高年级") return item.high_text
  return item.keyword
}

async function tap(item) {
  countWuyuClick()
  message.value = ""
  try {
    const result = await api("/api/xueqing/wuyu", {
      token: session.token,
      method: "POST",
      body: { studentIds: picked.value, keywordCode: item.code, fact: fact.value.trim(), clientUid: crypto.randomUUID() },
    })
    saved.value = result.items
    message.value = "已保存 " + result.items.length + " 条，点击 " + wuyuSession.clicks + " 次，用时 " + Math.round((Date.now() - wuyuSession.startedAt) / 1000) + " 秒"
  } catch (err) {
    message.value = err.message
  }
}

function toggleStudent(id) {
  countWuyuClick()
  picked.value = picked.value.includes(id) ? picked.value.filter((item) => item !== id) : picked.value.concat(id)
}

onMounted(async () => {
  const listed = await api("/api/xueqing/wuyu/keywords", { token: session.token })
  dimensions.value = listed.dimensions
  keywords.value = listed.keywords
  grades.value = (await api("/api/xueqing/dictionary/grades", { token: session.token })).items
  students.value = (await api("/api/xueqing/record-students", { token: session.token })).items
})
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
    <p>点一个关键词就保存。事实句可以不填。</p>
    <p>
      <button
        v-for="item in students"
        :key="item.id"
        type="button"
        :disabled="!item.recordable"
        @click="toggleStudent(item.id)"
      >
        {{ item.display_name }}
      </button>
    </p>
    <div
      v-for="dimension in dimensions"
      :key="dimension.code"
    >
      <p>{{ dimension.name }} {{ dimension.icon }}</p>
      <button
        v-for="item in keywords.filter((keyword) => keyword.dimension === dimension.code)"
        :key="item.code"
        type="button"
        @click="tap(item)"
      >
        {{ dimension.icon }} {{ wording(item) }}
      </button>
    </div>
    <label>
      事实句
      <input v-model="fact">
    </label>
    <p v-if="message">
      {{ message }}
    </p>
    <p
      v-for="item in saved"
      :key="item.id"
    >
      {{ item.grade }} {{ item.wording }}
      <span v-if="item.fact">原文：{{ item.fact }}</span>
    </p>
  </section>
</template>
