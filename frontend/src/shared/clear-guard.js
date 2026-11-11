export function planClear({ pending, online, uploaded = 0, failed = false, abandonText = "", reason }) {
  const before = pending
  if (before === 0) {
    return result(reason, before, 0, 0, 0, "clear")
  }
  if (online && !failed && uploaded === before) {
    return result(reason, before, uploaded, 0, 0, "clear")
  }
  if (online && (failed || uploaded < before)) {
    return result(reason, before, uploaded, before - uploaded, 0, "block")
  }
  if (abandonText === "放弃") {
    return result(reason, before, uploaded, 0, before - uploaded, "abandon")
  }
  return result(reason, before, uploaded, before - uploaded, 0, "lock")
}

function result(reason, before, uploaded, kept, abandoned, action) {
  return {
    reason,
    action,
    pendingBefore: before,
    uploaded,
    kept,
    abandoned,
    balanced: before === uploaded + kept + abandoned,
  }
}
