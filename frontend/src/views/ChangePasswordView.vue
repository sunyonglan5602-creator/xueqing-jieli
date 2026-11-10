<script setup>
import { ref } from "vue"
import { useRouter } from "vue-router"
import { Button, Field, Form } from "vant"
import { useSessionStore } from "../stores/session.js"

const router = useRouter()
const session = useSessionStore()
const oldPassword = ref("")
const password = ref("")
const error = ref("")

async function submit() {
  error.value = ""
  try {
    const path = await session.changePassword(oldPassword.value, password.value)
    router.push(path)
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <main>
    <h1>修改初始口令</h1>
    <p>未修改初始口令不能进入业务页。</p>
    <Form @submit="submit">
      <Field
        v-model="oldPassword"
        type="password"
        label="原口令"
        autocomplete="new-password"
      />
      <Field
        v-model="password"
        type="password"
        label="新口令"
        autocomplete="new-password"
      />
      <Button
        native-type="submit"
        type="primary"
        block
      >
        确认修改
      </Button>
    </Form>
    <p v-if="error">
      {{ error }}
    </p>
  </main>
</template>
