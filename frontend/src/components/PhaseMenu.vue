<script setup>
import { phaseEntries } from "../shared/menu.js"
import { useSessionStore } from "../stores/session.js"

const session = useSessionStore()
const items = phaseEntries(session.record)
</script>

<template>
  <p
    v-for="item in items"
    :key="item.id"
  >
    {{ item.label }}：{{ item.phase }}
  </p>
</template>
