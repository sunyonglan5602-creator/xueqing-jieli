<script setup>
import { useAppStore } from "../stores/app.js"

const app = useAppStore()
</script>

<template>
  <p class="demo-watermark">
    {{ app.watermark }}
  </p>
</template>
