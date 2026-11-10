<script setup>
import { onMounted, ref } from "vue"
import { api } from "../shared/api.js"
import { GRADES } from "../shared/grades.js"
import { useSessionStore } from "../stores/session.js"

const session = useSessionStore()
const classes = ref([])
const students = ref([])
const className = ref("")
const classGrades = ref(["三年级"])
const classId = ref("")
const displayName = ref("")
const grade = ref("三年级")
const mismatchReason = ref("")
const confirmDuplicate = ref(false)
const csv = ref("姓名,年级\n")
const sourceId = ref("")
const targetId = ref("")
const message = ref("")

async function load() {
  classes.value = (await api("/api/collections/classes/records", { token: session.token })).items
  students.value = (await api("/api/collections/students/records", { token: session.token })).items
  if (!classId.value && classes.value[0]) classId.value = classes.value[0].id
}

async function createClass() {
  message.value = ""
  try {
    await api("/api/collections/classes/records", {
      token: session.token,
      method: "POST",
      body: { name: className.value.trim(), school: session.record.school, org: session.record.org, grades: classGrades.value },
    })
    className.value = ""
    await load()
  } catch (err) {
    message.value = err.message
  }
}

async function createStudent() {
  message.value = ""
  try {
    await api("/api/xueqing/students", {
      token: session.token,
      method: "POST",
      body: {
        displayName: displayName.value.trim(),
        grade: grade.value,
        classId: classId.value,
        mismatchReason: mismatchReason.value.trim(),
        confirmDuplicate: confirmDuplicate.value,
      },
    })
    displayName.value = ""
    mismatchReason.value = ""
    confirmDuplicate.value = false
    await load()
  } catch (err) {
    message.value = err.message
  }
}

async function importCsv() {
  message.value = ""
  try {
    await api("/api/xueqing/student-imports", {
      token: session.token,
      method: "POST",
      body: { classId: classId.value, csv: csv.value },
    })
    await load()
  } catch (err) {
    message.value = err.message
  }
}

async function merge() {
  message.value = ""
  try {
    await api("/api/xueqing/student-merges", {
      token: session.token,
      method: "POST",
      body: { sourceId: sourceId.value, targetId: targetId.value },
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
    <p>学生只登记姓名或代称、年级和班级。同校同名同年级会提示疑似重复。复式班可以挂多个年级。</p>
    <el-form @submit.prevent="createClass">
      <el-input
        v-model="className"
        placeholder="班级名称"
      />
      <el-select
        v-model="classGrades"
        multiple
        placeholder="班级年级"
      >
        <el-option
          v-for="item in GRADES"
          :key="item"
          :label="item"
          :value="item"
        />
      </el-select>
      <el-button native-type="submit">
        建立班级
      </el-button>
    </el-form>
    <el-form @submit.prevent="createStudent">
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
      <el-input
        v-model="displayName"
        placeholder="姓名或代称"
      />
      <el-select
        v-model="grade"
        placeholder="年级"
      >
        <el-option
          v-for="item in GRADES"
          :key="item"
          :label="item"
          :value="item"
        />
      </el-select>
      <el-input
        v-model="mismatchReason"
        placeholder="年级与班级不匹配时填写原因"
      />
      <el-checkbox v-model="confirmDuplicate">
        确认为另一名学生，不是重复档案
      </el-checkbox>
      <el-button native-type="submit">
        建立学生
      </el-button>
    </el-form>
    <el-form @submit.prevent="importCsv">
      <el-input
        v-model="csv"
        type="textarea"
        placeholder="姓名,年级"
      />
      <el-button native-type="submit">
        导入本班名单
      </el-button>
    </el-form>
    <el-form @submit.prevent="merge">
      <el-select
        v-model="sourceId"
        placeholder="被合并的学生"
      >
        <el-option
          v-for="item in students"
          :key="item.id"
          :label="item.display_name"
          :value="item.id"
        />
      </el-select>
      <el-select
        v-model="targetId"
        placeholder="保留的学生"
      >
        <el-option
          v-for="item in students"
          :key="item.id"
          :label="item.display_name"
          :value="item.id"
        />
      </el-select>
      <el-button native-type="submit">
        合并重复档案
      </el-button>
    </el-form>
    <p v-if="message">
      {{ message }}
    </p>
  </section>
</template>
