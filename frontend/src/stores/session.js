import { defineStore } from "pinia"
import { api, landingPath } from "../shared/api.js"

export const useSessionStore = defineStore("session", {
  state: () => ({
    token: "",
    record: null,
  }),
  actions: {
    setAuth(data) {
      this.token = data.token
      this.record = data.record
    },
    async login(username, password) {
      const data = await api("/api/collections/users/auth-with-password", {
        method: "POST",
        body: { identity: username, password },
      })
      this.setAuth(data)
      return landingPath(data.record)
    },
    async changePassword(oldPassword, password) {
      await api(`/api/collections/users/records/${this.record.id}`, {
        token: this.token,
        method: "PATCH",
        body: { oldPassword, password, passwordConfirm: password },
      })
      const username = this.record.username
      return this.login(username, password)
    },
    logout() {
      this.token = ""
      this.record = null
    },
  },
})
