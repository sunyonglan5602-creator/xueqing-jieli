<script setup>
import { computed, onMounted, ref } from "vue"
import { api } from "../shared/api.js"
import { submitOffline } from "../shared/offline-db.js"
import { countEntryClick, entrySession } from "../shared/entry-session.js"
import { compressPhoto } from "../shared/photo.js"
import { useSessionStore } from "../stores/session.js"

const emit = defineEmits(["close"])
const session = useSessionStore()
const catalog = ref([])
const students = ref([])
const textbooks = ref([])
const classId = ref("")
const subjectCode = ref("")
const textbook = ref("")
const picked = ref([])
const knowledgeCode = ref("")
const errorCode = ref("")
const statusMark = ref("")
const note = ref("")
const photoOn = ref(false)
const photo = ref("")
const message = ref("")
const savedClicks = ref(0)

const storageKey = computed(() => "xqj-entry-context:" + (session.record?.id || ""))
const subject = computed(() => catalog.value.find((item) => item.code === subjectCode.value) || null)
const currentClass = computed(() => subject.value?.classes?.find((item) => item.id === classId.value) || null)
const pairs = computed(() => {
  const items = []
  for (const item of catalog.value) {
    for (const klass of item.classes || []) items.push({ classId: klass.id, className: klass.name, subjectCode: item.code, subjectName: item.name })
  }
  return items
})
const classStudents = computed(() => students.value.filter((item) => item.class_id === classId.value))
const visibleTerms = computed(() => {
  const grades = picked.value.length
    ? classStudents.value.filter((item) => picked.value.includes(item.id)).map((item) => item.grade)
    : (currentClass.value?.grades || [])
  return (subject.value?.terms || []).filter((item) => !grades.length || item.grades.some((grade) => grades.includes(grade)))
})
const showErrors = computed(() => {
  if (!subject.value?.error_entry) return false
  if (!subject.value.per_term_error) return true
  const term = visibleTerms.value.find((item) => item.code === knowledgeCode.value)
  return Boolean(term?.allows_error)
})

function remember() {
  localStorage.setItem(storageKey.value, JSON.stringify({
    classId: classId.value,
    subjectCode: subjectCode.value,
    textbook: textbook.value,
  }))
}

function choose(pair) {
  countEntryClick()
  classId.value = pair.classId
  subjectCode.value = pair.subjectCode
  knowledgeCode.value = ""
  errorCode.value = ""
  picked.value = []
  remember()
}

function toggleStudent(id) {
  countEntryClick()
  picked.value = picked.value.includes(id) ? picked.value.filter((item) => item !== id) : picked.value.concat(id)
}

function chooseTerm(code) {
  countEntryClick()
  knowledgeCode.value = code
  if (!showErrors.value) errorCode.value = ""
}

function chooseError(code) {
  countEntryClick()
  errorCode.value = code
}

async function onPhoto(event) {
  photo.value = ""
  message.value = ""
  const file = event.target.files && event.target.files[0]
  if (!file) return
  try {
    photo.value = await compressPhoto(file)
  } catch (err) {
    message.value = err.message
  }
}

async function save() {
  countEntryClick()
  message.value = ""
  try {
    const result = await submitOffline("/api/xueqing/entries", {
      classId: classId.value,
      subjectCode: subjectCode.value,
      studentIds: picked.value,
      knowledgeCode: knowledgeCode.value,
      errorCode: showErrors.value ? errorCode.value : "",
      textbook: textbook.value,
      statusMark: statusMark.value,
      note: note.value.trim(),
      scene: "课堂",
      photo: photoOn.value ? photo.value : "",
      clientUid: crypto.randomUUID(),
      source: navigator.onLine ? "在线" : "离线",
      clickCount: entrySession.clicks,
      elapsedSeconds: Math.round((Date.now() - entrySession.startedAt) / 1000),
    }, session.token)
    savedClicks.value = entrySession.clicks
    message.value = "已保存 " + result.items.length + " 条，点击 " + entrySession.clicks + " 次，用时 " + Math.round((Date.now() - entrySession.startedAt) / 1000) + " 秒"
    remember()
  } catch (err) {
    message.value = err.message
  }
}

onMounted(async () => {
  catalog.value = (await api("/api/xueqing/entry-catalog", { token: session.token })).subjects
  students.value = (await api("/api/xueqing/record-students", { token: session.token })).items
  textbooks.value = (await api("/api/xueqing/dictionary/textbooks", { token: session.token })).items
  const saved = JSON.parse(localStorage.getItem(storageKey.value) || "null")
  const pair = pairs.value.find((item) => saved && item.classId === saved.classId && item.subjectCode === saved.subjectCode)
  if (pair) {
    classId.value = pair.classId
    subjectCode.value = pair.subjectCode
  }
  textbook.value = (saved && saved.textbook) || textbooks.value[0]?.name || ""
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
    <p v-if="!pairs.length">
      还没有已授权的班级和科目。
    </p>
    <p v-else-if="!currentClass">
      请选择已授权的班级和科目。
      <button
        v-for="pair in pairs"
        :key="pair.classId + pair.subjectCode"
        type="button"
        @click="choose(pair)"
      >
        {{ pair.className }} · {{ pair.subjectName }}
      </button>
    </p>
    <template v-else>
      <p>{{ currentClass.name }} · {{ subject.name }}</p>
      <p>
        <button
          v-for="pair in pairs"
          :key="pair.classId + pair.subjectCode"
          type="button"
          @click="choose(pair)"
        >
          {{ pair.className }} · {{ pair.subjectName }}
        </button>
      </p>
      <label>
        教材版本
        <select v-model="textbook">
          <option
            v-for="item in textbooks"
            :key="item.name"
            :value="item.name"
          >
            {{ item.name }}
          </option>
        </select>
      </label>
      <p>课堂 {{ new Date().toISOString().slice(0, 10) }}</p>
      <p>
        <button
          v-for="item in classStudents"
          :key="item.id"
          type="button"
          :disabled="!item.recordable"
          @click="toggleStudent(item.id)"
        >
          {{ item.display_name }}
        </button>
        <span v-if="classStudents.some((item) => !item.recordable)">还没有监护人同意，只用化名，不能记任何学情记录。</span>
      </p>
      <p>
        <button
          v-for="item in visibleTerms"
          :key="item.code"
          type="button"
          @click="chooseTerm(item.code)"
        >
          {{ item.name }}
        </button>
      </p>
      <p v-if="showErrors">
        <button
          v-for="item in subject.error_types"
          :key="item.code"
          type="button"
          @click="chooseError(item.code)"
        >
          {{ item.label }}
        </button>
      </p>
      <p>
        <button
          type="button"
          @click="statusMark = statusMark === '偶发错误' ? '' : '偶发错误'"
        >
          偶发错误
        </button>
        <button
          type="button"
          @click="statusMark = statusMark === '尚需观察' ? '' : '尚需观察'"
        >
          尚需观察
        </button>
      </p>
      <label>
        备注
        <input v-model="note">
      </label>
      <label>
        <input
          v-model="photoOn"
          type="checkbox"
        >
        拍照（默认关闭）
      </label>
      <input
        v-if="photoOn"
        type="file"
        accept="image/*"
        @change="onPhoto"
      >
      <p>
        <button
          type="button"
          @click="save"
        >
          保存
        </button>
      </p>
      <p v-if="message">
        {{ message }}
      </p>
      <p v-if="savedClicks">
        点击次数 {{ savedClicks }}
      </p>
    </template>
  </section>
</template>
