<script setup>
import { ref } from "vue"
import { Button, Field, Form } from "vant"
import { api } from "../shared/api.js"

const name = ref("")
const contact = ref("")
const partnerSchools = ref("")
const error = ref("")
const receipt = ref("")

async function submit() {
  error.value = ""
  receipt.value = ""
  try {
    const created = await api("/api/xueqing/applications", {
      method: "POST",
      body: {
        name: name.value.trim(),
        contact: contact.value.trim(),
        partnerSchools: partnerSchools.value.trim(),
      },
    })
    receipt.value = created.id
    name.value = ""
    contact.value = ""
    partnerSchools.value = ""
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <main>
    <h1>协会入驻申请</h1>
    <p>提交后等待平台审核。未审核的协会不能进入业务页。不需要短信或邮件。</p>
    <Form @submit="submit">
      <Field
        v-model="name"
        name="name"
        label="协会名称"
      />
      <Field
        v-model="contact"
        name="contact"
        label="联系人"
      />
      <Field
        v-model="partnerSchools"
        name="partnerSchools"
        label="合作学校清单"
        type="textarea"
      />
      <Button
        native-type="submit"
        type="primary"
        block
      >
        提交申请
      </Button>
    </Form>
    <p v-if="receipt">
      申请已提交，编号 {{ receipt }}。状态为待审核。
    </p>
    <p v-if="error">
      {{ error }}
    </p>
  </main>
</template>
