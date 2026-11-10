import pluginVue from "eslint-plugin-vue"

export default [
  ...pluginVue.configs["flat/recommended"],
  {
    files: ["**/*.{js,vue}"],
    rules: {
      "vue/multi-word-component-names": "off",
    },
  },
  {
    ignores: ["dist/**", "dev-dist/**", "node_modules/**"],
  },
]
