<script setup>
import { onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { api, highestRole } from "../shared/api.js"
import { useSessionStore } from "../stores/session.js"

const router = useRouter()
const session = useSessionStore()
const rank = highestRole(session.record)
const accounts = ref([])
const error = ref("")
const oneTime = ref("")
const username = ref("")
const displayName = ref("")
const orgName = ref("")
const orgId = ref(session.record.org || "")
const schoolName = ref("")
const schoolId = ref(session.record.school || "")
const alsoTeacher = ref(false)
const orgs = ref([])
const schools = ref([])

async function load() {
  try {
    accounts.value = (await api("/api/xueqing/accounts", { token: session.token })).items
  } catch (err) {
    error.value = err.message
    return
  }
  if (rank === "platform_admin") {
    orgs.value = (await api("/api/collections/organizations/records", { token: session.token })).items
  }
  if (rank === "org_admin") {
    schools.value = (await api("/api/collections/schools/records", { token: session.token })).items
  }
}

async function createOrg() {
  error.value = ""
  const created = await api("/api/collections/organizations/records", {
    token: session.token,
    method: "POST",
    body: { name: orgName.value },
  })
  orgId.value = created.id
  orgName.value = ""
  await load()
}

async function createSchool() {
  error.value = ""
  const created = await api("/api/collections/schools/records", {
    token: session.token,
    method: "POST",
    body: { name: schoolName.value, org: session.record.org },
  })
  schoolId.value = created.id
  schoolName.value = ""
  await load()
}

async function createAccount() {
  error.value = ""
  oneTime.value = ""
  try {
    const body = { username: username.value.trim(), displayName: displayName.value.trim() }
    if (rank === "platform_admin") body.orgId = orgId.value
    if (rank === "org_admin") {
      body.schoolId = schoolId.value
      body.alsoTeacher = alsoTeacher.value
    }
    const created = await api("/api/xueqing/accounts", {
      token: session.token,
      method: "POST",
      body,
    })
    oneTime.value = created.password
    username.value = ""
    displayName.value = ""
    await load()
  } catch (err) {
    error.value = err.message
  }
}

async function reset(row) {
  error.value = ""
  const started = Date.now()
  try {
    const result = await api("/api/xueqing/password-resets", {
      token: session.token,
      method: "POST",
      body: { userId: row.id },
    })
    oneTime.value = result.password
    row.resetMs = Date.now() - started
  } catch (err) {
    error.value = err.message
  }
}

function logout() {
  session.logout()
  router.push("/login")
}

onMounted(load)
</script>

<template>
  <el-container>
    <el-header>
      <el-button @click="logout">
        退出
      </el-button>
      管理端
    </el-header>
    <el-main>
      <p>开通和重置都不使用短信或邮件。一次性口令只在这里显示一次。</p>
      <el-form
        v-if="rank === 'platform_admin'"
        @submit.prevent="createOrg"
      >
        <el-input
          v-model="orgName"
          placeholder="协会名称"
        />
        <el-button
          native-type="submit"
        >
          建立协会
        </el-button>
      </el-form>
      <el-form
        v-if="rank === 'org_admin'"
        @submit.prevent="createSchool"
      >
        <el-input
          v-model="schoolName"
          placeholder="学校名称"
        />
        <el-button native-type="submit">
          建立学校
        </el-button>
      </el-form>
      <el-form @submit.prevent="createAccount">
        <el-select
          v-if="rank === 'platform_admin'"
          v-model="orgId"
          placeholder="协会"
        >
          <el-option
            v-for="org in orgs"
            :key="org.id"
            :label="org.name"
            :value="org.id"
          />
        </el-select>
        <el-select
          v-if="rank === 'org_admin'"
          v-model="schoolId"
          placeholder="学校"
        >
          <el-option
            v-for="school in schools"
            :key="school.id"
            :label="school.name"
            :value="school.id"
          />
        </el-select>
        <el-input
          v-model="username"
          placeholder="账号"
          autocomplete="off"
        />
        <el-input
          v-model="displayName"
          placeholder="名称"
        />
        <el-checkbox
          v-if="rank === 'org_admin'"
          v-model="alsoTeacher"
        >
          同时是老师
        </el-checkbox>
        <el-button
          native-type="submit"
        >
          开通下一级
        </el-button>
      </el-form>
      <p v-if="oneTime">
        一次性口令：{{ oneTime }}
      </p>
      <p v-if="error">
        {{ error }}
      </p>
      <el-table :data="accounts">
        <el-table-column
          prop="username"
          label="账号"
        />
        <el-table-column
          prop="display_name"
          label="名称"
        />
        <el-table-column label="操作">
          <template #default="{ row }">
            <el-button @click="reset(row)">
              重置口令
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-main>
  </el-container>
</template>
