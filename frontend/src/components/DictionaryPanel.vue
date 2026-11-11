<script setup>
import { onMounted, ref } from "vue"
import { api, highestRole } from "../shared/api.js"
import { loadGradeNames } from "../shared/grades.js"
import { useSessionStore } from "../stores/session.js"

const session = useSessionStore()
const rank = highestRole(session.record)
const grades = ref([])
const subjects = ref([])
const terms = ref([])
const teachers = ref([])
const classes = ref([])
const message = ref("")
const subjectCode = ref("")
const subjectName = ref("")
const subjectGrades = ref([])
const recordType = ref("纸笔错题")
const errorEntry = ref(false)
const termSubject = ref("")
const termName = ref("")
const termGrades = ref([])
const teacherId = ref("")
const classId = ref("")
const assignSubject = ref("")

async function load() {
  grades.value = await loadGradeNames(session.token)
  subjects.value = (await api("/api/xueqing/dictionary/subjects", { token: session.token })).items
  if (rank === "school_admin") {
    terms.value = (await api("/api/xueqing/dictionary/terms?includeInactive=1", { token: session.token })).items
      .filter((item) => item.scope === "school")
    teachers.value = (await api("/api/xueqing/accounts", { token: session.token })).items
    classes.value = (await api("/api/collections/classes/records", { token: session.token })).items
  }
}

async function addSubject() {
  message.value = ""
  try {
    await api("/api/xueqing/dictionary/subjects", {
      token: session.token,
      method: "POST",
      body: {
        code: subjectCode.value.trim(),
        name: subjectName.value.trim(),
        grades: subjectGrades.value,
        recordType: recordType.value.trim(),
        errorEntry: errorEntry.value,
        perTermError: false,
      },
    })
    subjectCode.value = ""
    subjectName.value = ""
    subjectGrades.value = []
    errorEntry.value = false
    await load()
  } catch (err) {
    message.value = err.message
  }
}

async function addTerm() {
  message.value = ""
  try {
    await api("/api/xueqing/dictionary/terms", {
      token: session.token,
      method: "POST",
      body: {
        subjectCode: termSubject.value,
        name: termName.value.trim(),
        grades: termGrades.value,
        entryKind: "performance",
      },
    })
    termName.value = ""
    await load()
  } catch (err) {
    message.value = err.message
  }
}

async function disableTerm(code) {
  message.value = ""
  try {
    await api("/api/xueqing/dictionary/terms/disable", {
      token: session.token,
      method: "POST",
      body: { code },
    })
    await load()
  } catch (err) {
    message.value = err.message
  }
}

async function assign() {
  message.value = ""
  try {
    await api("/api/collections/teaching_assignments/records", {
      token: session.token,
      method: "POST",
      body: {
        class: classId.value,
        teacher: teacherId.value,
        subject: assignSubject.value,
        school: session.record.school,
        org: session.record.org,
      },
    })
    message.value = "已从学科字典分科"
  } catch (err) {
    message.value = err.message
  }
}

onMounted(load)
</script>

<template>
  <section>
    <p>学科、开设年级、记录类型和词表来自数据配置。学校只能从平台学科表里给老师分科。</p>
    <p v-if="message">
      {{ message }}
    </p>
    <el-form
      v-if="rank === 'platform_admin'"
      @submit.prevent="addSubject"
    >
      <el-input
        v-model="subjectCode"
        placeholder="学科编号"
      />
      <el-input
        v-model="subjectName"
        placeholder="学科名称"
      />
      <el-select
        v-model="subjectGrades"
        multiple
        placeholder="开设年级"
      >
        <el-option
          v-for="item in grades"
          :key="item"
          :label="item"
          :value="item"
        />
      </el-select>
      <el-input
        v-model="recordType"
        placeholder="记录类型"
      />
      <el-checkbox v-model="errorEntry">
        录入页可以出现错题入口
      </el-checkbox>
      <el-button native-type="submit">
        增加学科
      </el-button>
    </el-form>
    <el-form
      v-if="rank === 'school_admin'"
      @submit.prevent="assign"
    >
      <el-select
        v-model="teacherId"
        placeholder="老师"
      >
        <el-option
          v-for="item in teachers"
          :key="item.id"
          :label="item.display_name"
          :value="item.id"
        />
      </el-select>
      <el-select
        v-model="classId"
        placeholder="班级"
      >
        <el-option
          v-for="item in classes"
          :key="item.id"
          :label="item.name"
          :value="item.id"
        />
      </el-select>
      <el-select
        v-model="assignSubject"
        placeholder="学科"
      >
        <el-option
          v-for="item in subjects"
          :key="item.code"
          :label="item.name"
          :value="item.name"
        />
      </el-select>
      <el-button native-type="submit">
        分科
      </el-button>
    </el-form>
    <el-form
      v-if="rank === 'school_admin'"
      @submit.prevent="addTerm"
    >
      <el-select
        v-model="termSubject"
        placeholder="学科"
      >
        <el-option
          v-for="item in subjects"
          :key="item.code"
          :label="item.name"
          :value="item.code"
        />
      </el-select>
      <el-input
        v-model="termName"
        placeholder="校本标签"
      />
      <el-select
        v-model="termGrades"
        multiple
        placeholder="适用年级"
      >
        <el-option
          v-for="item in grades"
          :key="item"
          :label="item"
          :value="item"
        />
      </el-select>
      <el-button native-type="submit">
        增加校本标签
      </el-button>
    </el-form>
    <p
      v-for="item in terms"
      :key="item.code"
    >
      {{ item.name }}
      <span v-if="!item.active">已停用，历史记录仍可读</span>
      <button
        v-if="item.active"
        type="button"
        @click="disableTerm(item.code)"
      >
        停用
      </button>
    </p>
  </section>
</template>
