import { defineStore } from "pinia"
import { WATERMARK } from "../shared/demo.js"

export const useAppStore = defineStore("app", {
  state: () => ({
    demo: true,
    watermark: WATERMARK,
  }),
})
