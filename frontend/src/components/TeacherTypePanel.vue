<script setup>
import { onMounted, ref } from "vue"
import { api } from "../shared/api.js"
import { TEACHER_TYPES } from "../shared/teacher.js"
import { useSessionStore } from "../stores/session.js"

const session = useSessionStore()
const type = ref("")
const groups = ref([])
const items = ref([])
const message = ref("")

async function load() {
  message.value = ""
  const params = type.value ? `?type=${encodeURIComponent(type.value)}` : ""
  const result = await api(`/api/xueqing/teacher-types${params}`, { token: session.token })
  groups.value = result.groups
  items.value = result.items
}

onMounted(load)
</script>

<template>
  <section>
    <p>老师类型只用于筛选和分组，不改变学情权限。</p>
    <el-form @submit.prevent="load">
      <el-select
        v-model="type"
        placeholder="全部类型"
        clearable
      >
        <el-option
          v-for="item in TEACHER_TYPES"
          :key="item"
          :label="item"
          :value="item"
        />
      </el-select>
      <el-button native-type="submit">
        按类型筛选
      </el-button>
    </el-form>
    <ul>
      <li
        v-for="group in groups"
        :key="group.type"
      >
        {{ group.type }}：{{ group.count }}
      </li>
    </ul>
    <ul>
      <li
        v-for="item in items"
        :key="item.id"
      >
        {{ item.display_name }} {{ item.teacher_type }}
      </li>
    </ul>
    <p v-if="message">
      {{ message }}
    </p>
  </section>
</template>
