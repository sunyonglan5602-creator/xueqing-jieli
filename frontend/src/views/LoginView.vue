<script setup>
import { ref } from "vue"
import { useRouter } from "vue-router"
import { Button, Field, Form } from "vant"
import { useSessionStore } from "../stores/session.js"

const router = useRouter()
const session = useSessionStore()
const username = ref("")
const password = ref("")
const error = ref("")

async function submit() {
  error.value = ""
  try {
    const path = await session.login(username.value.trim(), password.value)
    router.push(path)
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <main>
    <h1>登录</h1>
    <Form @submit="submit">
      <Field
        v-model="username"
        name="username"
        label="账号"
        autocomplete="off"
      />
      <Field
        v-model="password"
        name="password"
        type="password"
        label="口令"
        autocomplete="new-password"
      />
      <Button
        native-type="submit"
        type="primary"
        block
      >
        登录
      </Button>
    </Form>
    <p v-if="error">
      {{ error }}
    </p>
  </main>
</template>
