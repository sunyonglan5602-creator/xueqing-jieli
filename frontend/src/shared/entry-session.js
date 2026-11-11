import { reactive } from "vue"

export const entrySession = reactive({
  clicks: 0,
  startedAt: 0,
})

export function resetEntrySession() {
  entrySession.clicks = 0
  entrySession.startedAt = Date.now()
}

export function countEntryClick() {
  entrySession.clicks += 1
}
