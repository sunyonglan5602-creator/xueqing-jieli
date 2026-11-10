<script setup>
import { onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import EnrollmentPanel from "../components/EnrollmentPanel.vue"
import OrgStudents from "../components/OrgStudents.vue"
import PhaseMenu from "../components/PhaseMenu.vue"
import RegionTools from "../components/RegionTools.vue"
import SchoolAccessForm from "../components/SchoolAccessForm.vue"
import StudentArchive from "../components/StudentArchive.vue"
import VolunteerForm from "../components/VolunteerForm.vue"
import TeacherTypePanel from "../components/TeacherTypePanel.vue"
import { api, highestRole } from "../shared/api.js"
import { showsStudentDetail } from "../shared/menu.js"
import { TEACHER_TYPES } from "../shared/teacher.js"
import { useSessionStore } from "../stores/session.js"

const router = useRouter()
const session = useSessionStore()
const rank = highestRole(session.record)
const accounts = ref([])
const error = ref("")
const blocked = ref(false)
const oneTime = ref("")
const username = ref("")
const displayName = ref("")
const orgName = ref("")
const orgId = ref(session.record.org || "")
const schoolName = ref("")
const schoolId = ref(session.record.school || "")
const alsoTeacher = ref(false)
const teacherType = ref("")
const divisionCode = ref("")
const township = ref("")
const area = ref("")
const orgs = ref([])
const schools = ref([])

async function load() {
  blocked.value = false
  try {
    const listed = (await api("/api/xueqing/accounts", { token: session.token })).items
    accounts.value = listed.map((item) => ({ ...item, nextType: item.teacher_type || "" }))
  } catch (err) {
    error.value = err.message
    blocked.value = /未审核|已停用|协会不存在/.test(err.message)
    return
  }
  if (rank === "platform_admin") {
    orgs.value = (await api("/api/collections/organizations/records", { token: session.token })).items
  }
  if (rank === "org_admin") {
    schools.value = (await api("/api/collections/schools/records", { token: session.token })).items
  }
}

async function reviewOrg(org, action) {
  error.value = ""
  try {
    await api("/api/xueqing/organization-reviews", {
      token: session.token,
      method: "POST",
      body: { orgId: org.id, action },
    })
    await load()
  } catch (err) {
    error.value = err.message
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
    body: {
      name: schoolName.value,
      org: session.record.org,
      division_code: divisionCode.value.trim(),
      township: township.value.trim(),
      area: area.value.trim(),
    },
  })
  schoolId.value = created.id
    schoolName.value = ""
    divisionCode.value = ""
    township.value = ""
    area.value = ""
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
    if (rank === "school_admin" || alsoTeacher.value) body.teacherType = teacherType.value
    const created = await api("/api/xueqing/accounts", {
      token: session.token,
      method: "POST",
      body,
    })
    oneTime.value = created.password
    username.value = ""
    displayName.value = ""
    teacherType.value = ""
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

async function saveType(row) {
  error.value = ""
  try {
    await api("/api/xueqing/teacher-types", {
      token: session.token,
      method: "POST",
      body: { userId: row.id, teacherType: row.nextType },
    })
    await load()
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
      <p>开通和重置都不使用短信或邮件。一次性口令只在这里显示一次。审核通过后，协会管理员在这里开通 1 所学校和 1 位学校管理员。</p>
      <PhaseMenu />
      <p v-if="error">
        {{ error }}
      </p>
      <template v-if="!blocked">
        <SchoolAccessForm v-if="rank === 'school_admin'" />
        <StudentArchive v-if="rank === 'school_admin'" />
        <EnrollmentPanel v-if="rank === 'school_admin' || rank === 'org_admin'" />
        <VolunteerForm v-if="rank === 'school_admin' || rank === 'org_admin'" />
        <RegionTools v-if="rank === 'org_admin' || rank === 'school_admin'" />
        <TeacherTypePanel v-if="rank === 'org_admin' || rank === 'school_admin'" />
        <OrgStudents v-if="showsStudentDetail(session.record)" />
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
            开通学校
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
          <el-select
            v-if="rank === 'school_admin' || alsoTeacher"
            v-model="teacherType"
            placeholder="老师类型"
          >
            <el-option
              v-for="type in TEACHER_TYPES"
              :key="type"
              :label="type"
              :value="type"
            />
          </el-select>
          <el-button
            native-type="submit"
          >
            开通下一级
          </el-button>
        </el-form>
        <p v-if="oneTime">
          一次性口令：{{ oneTime }}
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
          <el-table-column
            prop="teacher_type"
            label="老师类型"
          />
          <el-table-column label="操作">
            <template #default="{ row }">
              <el-button @click="reset(row)">
                重置口令
              </el-button>
              <template v-if="row.roles.includes('teacher')">
                <el-select
                  v-model="row.nextType"
                  placeholder="老师类型"
                >
                  <el-option
                    v-for="type in TEACHER_TYPES"
                    :key="type"
                    :label="type"
                    :value="type"
                  />
                </el-select>
                <el-button @click="saveType(row)">
                  保存类型
                </el-button>
              </template>
            </template>
          </el-table-column>
        </el-table>
        <el-table
          v-if="rank === 'platform_admin'"
          :data="orgs"
        >
          <el-table-column
            prop="name"
            label="协会"
          />
          <el-table-column
            prop="status"
            label="状态"
          />
          <el-table-column label="审核">
            <template #default="{ row }">
              <el-button
                v-if="row.status === '待审核'"
                @click="reviewOrg(row, '开通')"
              >
                开通
              </el-button>
              <el-button
                v-if="row.status === '已开通'"
                @click="reviewOrg(row, '停用')"
              >
                停用
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-main>
  </el-container>
</template>
