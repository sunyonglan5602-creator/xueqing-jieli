<script setup>
import { onMounted, ref } from "vue"
import { api, highestRole } from "../shared/api.js"
import { loadGradeNames } from "../shared/grades.js"
import { useSessionStore } from "../stores/session.js"

const session = useSessionStore()
const rank = highestRole(session.record)
const grades = ref([])
const classes = ref([])
const students = ref([])
const studentId = ref("")
const classId = ref("")
const kind = ref(rank === "org_admin" ? "转校" : "转班")
const grade = ref("四年级")
const message = ref("")

async function load() {
  grades.value = await loadGradeNames(session.token)
  classes.value = (await api("/api/collections/classes/records", { token: session.token })).items
  if (rank === "school_admin") {
    students.value = (await api("/api/collections/students/records", { token: session.token })).items
  }
}

async function submit() {
  message.value = ""
  try {
    const result = await api("/api/xueqing/enrollments", {
      token: session.token,
      method: "POST",
      body: {
        studentId: studentId.value,
        classId: classId.value,
        kind: kind.value,
        grade: grade.value,
      },
    })
    message.value = "已追加在班记录，学生编号仍是 " + result.uid
  } catch (err) {
    message.value = err.message
  }
}

onMounted(load)
</script>

<template>
  <section>
    <p>转班、升级、转校只追加一条在班记录，旧记录保留，学生编号不变。</p>
    <el-form @submit.prevent="submit">
      <el-select
        v-if="rank === 'school_admin'"
        v-model="kind"
      >
        <el-option
          label="转班"
          value="转班"
        />
        <el-option
          label="升级"
          value="升级"
        />
      </el-select>
      <el-select
        v-if="rank === 'school_admin'"
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
      <el-input
        v-else
        v-model="studentId"
        placeholder="学生编号"
      />
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
        v-if="kind === '升级'"
        v-model="grade"
        placeholder="新年级"
      >
        <el-option
          v-for="item in grades"
          :key="item"
          :label="item"
          :value="item"
        />
      </el-select>
      <el-button native-type="submit">
        {{ kind }}
      </el-button>
    </el-form>
    <p v-if="message">
      {{ message }}
    </p>
  </section>
</template>
