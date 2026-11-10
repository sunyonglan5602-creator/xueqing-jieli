<script setup>
import { onMounted, ref } from "vue"
import { api, apiText, highestRole } from "../shared/api.js"
import { useSessionStore } from "../stores/session.js"

const session = useSessionStore()
const rank = highestRole(session.record)
const schools = ref([])
const schoolId = ref(session.record.school || "")
const divisionCode = ref("")
const township = ref("")
const area = ref("")
const filterTownship = ref("")
const filterArea = ref("")
const found = ref([])
const csv = ref("")
const message = ref("")

async function load() {
  if (rank === "org_admin") {
    schools.value = (await api("/api/collections/schools/records", { token: session.token })).items
    if (!schoolId.value && schools.value[0]) schoolId.value = schools.value[0].id
  } else {
    const school = await api(`/api/collections/schools/records/${session.record.school}`, { token: session.token })
    schools.value = [school]
    schoolId.value = school.id
  }
  fill()
}

function fill() {
  const school = schools.value.find((item) => item.id === schoolId.value)
  divisionCode.value = school?.division_code || ""
  township.value = school?.township || ""
  area.value = school?.area || ""
}

async function save() {
  message.value = ""
  try {
    await api(`/api/collections/schools/records/${schoolId.value}`, {
      token: session.token,
      method: "PATCH",
      body: {
        division_code: divisionCode.value.trim(),
        township: township.value.trim(),
        area: area.value.trim(),
      },
    })
    message.value = "已保存学校区划"
    await load()
  } catch (err) {
    message.value = err.message
  }
}

function queryString() {
  const params = new URLSearchParams()
  if (filterTownship.value.trim()) params.set("township", filterTownship.value.trim())
  if (filterArea.value.trim()) params.set("area", filterArea.value.trim())
  const text = params.toString()
  return text ? `?${text}` : ""
}

async function search() {
  message.value = ""
  found.value = (await api(`/api/xueqing/school-query${queryString()}`, { token: session.token })).items
}

async function download() {
  message.value = ""
  csv.value = await apiText(`/api/xueqing/school-export${queryString()}`, { token: session.token })
}

onMounted(load)
</script>

<template>
  <section>
    <p>行政区划代码、所属乡镇、所属片区可以先空着。这里按乡镇或片区筛选和导出，不是教育局下钻。</p>
    <el-form @submit.prevent="save">
      <el-select
        v-if="rank === 'org_admin'"
        v-model="schoolId"
        placeholder="学校"
        @change="fill"
      >
        <el-option
          v-for="school in schools"
          :key="school.id"
          :label="school.name"
          :value="school.id"
        />
      </el-select>
      <el-input
        v-model="divisionCode"
        placeholder="行政区划代码，可空"
      />
      <el-input
        v-model="township"
        placeholder="所属乡镇，可空"
      />
      <el-input
        v-model="area"
        placeholder="所属片区，可空"
      />
      <el-button native-type="submit">
        保存区划
      </el-button>
    </el-form>
    <el-form @submit.prevent="search">
      <el-input
        v-model="filterTownship"
        placeholder="按乡镇筛选"
      />
      <el-input
        v-model="filterArea"
        placeholder="按片区筛选"
      />
      <el-button native-type="submit">
        查询学校
      </el-button>
      <el-button @click="download">
        导出学校
      </el-button>
    </el-form>
    <ul>
      <li
        v-for="school in found"
        :key="school.id"
      >
        {{ school.name }} {{ school.township }} {{ school.area }}
      </li>
    </ul>
    <pre v-if="csv">{{ csv }}</pre>
    <p v-if="message">
      {{ message }}
    </p>
  </section>
</template>
