<script setup>
import { NavBar } from "vant"
</script>

<template>
  <NavBar
    title="教师端"
    left-arrow
    @click-left="$router.push('/')"
  />
  <main>
    <p>手机端使用 Vant 默认样式。登录和业务页在后续变更里接上。</p>
  </main>
</template>
