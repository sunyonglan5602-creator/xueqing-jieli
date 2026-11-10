<script setup>
import { useRouter } from "vue-router"

const router = useRouter()
</script>

<template>
  <el-container>
    <el-header>
      <el-button @click="router.push('/')">
        返回
      </el-button>
      管理端
    </el-header>
    <el-main>
      <p>后台使用 Element Plus 默认样式。账号和权限页面在后续变更里接上。</p>
    </el-main>
  </el-container>
</template>
