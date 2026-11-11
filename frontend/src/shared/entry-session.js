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

export const wuyuSession = reactive({
  clicks: 0,
  startedAt: 0,
})

export function resetWuyuSession() {
  wuyuSession.clicks = 0
  wuyuSession.startedAt = Date.now()
}

export function countWuyuClick() {
  wuyuSession.clicks += 1
}
