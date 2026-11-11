<script setup>
import { computed, onMounted, ref } from "vue"
import { api } from "../shared/api.js"
import { buildStudentDraft, DRAFT_HINT, gradeNotice, polishComment } from "../shared/comment-draft.js"
import { submitOffline } from "../shared/offline-db.js"
import { useSessionStore } from "../stores/session.js"

const emit = defineEmits(["close"])
const session = useSessionStore()
const sources = ref(null)
const grade = ref("")
const period = ref("本阶段")
const edited = ref({})
const message = ref("")
const startedAt = ref(String(Date.now()))
const polish = polishComment()

const grades = computed(() => sources.value?.grades || [])
const notice = computed(() => (grade.value ? gradeNotice(grade.value, grades.value.length) : ""))
const students = computed(() => (sources.value?.students || []).filter((item) => item.grade === grade.value && item.recordable))

const drafts = computed(() => {
  if (!sources.value) return []
  return students.value.map((student) => {
    const saved = (sources.value.comments || []).find((item) => item.studentId === student.id && item.period === period.value.trim() && item.grade === grade.value && item.status === "已确认")
    const draft = buildStudentDraft({
      student: { id: student.id, name: student.name, grade: student.grade },
      period: period.value.trim() || "本阶段",
      learning: (sources.value.learning || []).filter((item) => item.studentId === student.id),
      wuyu: (sources.value.wuyu || []).filter((item) => item.studentId === student.id),
    })
    return { student, draft, saved }
  })
})

function cacheKey(classId) {
  return "xqj-comment-sources:" + classId
}

async function load() {
  const cachedId = sessionStorage.getItem("xqj-comment-class") || ""
  try {
    const data = await api("/api/xueqing/comments/sources" + (cachedId ? "?classId=" + cachedId : ""), { token: session.token })
    const comments = await api("/api/xueqing/comments?classId=" + data.classId, { token: session.token })
    sources.value = { ...data, comments: comments.items || [] }
    sessionStorage.setItem(cacheKey(data.classId), JSON.stringify(sources.value))
    sessionStorage.setItem("xqj-comment-class", data.classId)
  } catch (err) {
    const raw = cachedId ? sessionStorage.getItem(cacheKey(cachedId)) : ""
    if (!raw) {
      message.value = err.message
      return
    }
    sources.value = JSON.parse(raw)
  }
  if (!grade.value && sources.value?.grades?.length) grade.value = sources.value.grades[0]
}

function generate() {
  message.value = ""
  const next = { ...edited.value }
  for (const item of drafts.value) {
    if (item.saved) continue
    next[item.student.id] = item.draft.body
  }
  edited.value = next
  if (!drafts.value.some((item) => item.draft.sentences.length)) message.value = "本阶段没有已确认、可写入评语的记录。"
}

async function confirm(item) {
  message.value = ""
  const text = edited.value[item.student.id] || ""
  try {
    const saved = await submitOffline("/api/xueqing/comments/confirm", {
      classId: sources.value.classId,
      studentId: item.student.id,
      grade: item.student.grade,
      period: period.value.trim(),
      body: text,
      sentences: item.draft.sentences,
      startedAt: startedAt.value,
      clientUid: crypto.randomUUID(),
    }, session.token)
    sources.value.comments = (sources.value.comments || []).concat(saved)
    message.value = "已确认，未发布"
  } catch (err) {
    message.value = err.queued ? "已转入待补传" : err.message
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
    <p>{{ DRAFT_HINT }}</p>
    <p>二期润色：{{ polish.phase }}</p>
    <p v-if="notice">
      {{ notice }}
    </p>
    <p>
      <label>
        时间范围
        <input
          v-model="period"
          type="text"
        >
      </label>
    </p>
    <p>
      <button
        v-for="item in grades"
        :key="item"
        type="button"
        @click="grade = item"
      >
        {{ item }}
      </button>
    </p>
    <p>
      <button
        type="button"
        @click="generate"
      >
        生成草稿
      </button>
    </p>
    <article
      v-for="item in drafts"
      :key="item.student.id"
    >
      <h2>{{ item.student.name }}</h2>
      <template v-if="item.saved">
        <p>已确认，未发布</p>
        <p>{{ item.saved.body }}</p>
      </template>
      <p v-else-if="!item.draft.sentences.length">
        本阶段没有已确认、可写入评语的记录。
      </p>
      <template v-else>
        <textarea
          v-model="edited[item.student.id]"
          rows="6"
        />
        <p
          v-for="sentence in item.draft.sentences"
          :key="sentence.sourceKind + sentence.sourceId"
        >
          来源记录 {{ sentence.sourceKind }} {{ sentence.sourceId }}
        </p>
        <button
          type="button"
          :disabled="!edited[item.student.id]"
          @click="confirm(item)"
        >
          确认评语
        </button>
      </template>
    </article>
    <p v-if="message">
      {{ message }}
    </p>
  </section>
</template>
