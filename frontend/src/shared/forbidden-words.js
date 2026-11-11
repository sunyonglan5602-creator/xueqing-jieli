import rules from "../../../pocketbase/pb_hooks/dict_rules.js"

export function commentForbidden(text, rows) {
  return rules.forbiddenHit(text, rows || [])
}

export function commentForbiddenMessage(hit) {
  return rules.forbiddenMessage(hit) + "仍要这样写，请确认后再保存。"
}
