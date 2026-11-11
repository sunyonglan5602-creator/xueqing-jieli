function asList(value) {
  if (value === null || value === undefined || value === "") return []
  if (typeof value === "string") return parseList(value)
  if (typeof value.length === "number" && value.length > 0 && typeof value[0] === "number") {
    return parseList(decodeUtf8(value))
  }
  const list = []
  if (typeof value.length === "number") {
    for (let i = 0; i < value.length; i += 1) list.push(value[i])
  }
  return list
}

function parseList(value) {
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed
  } catch (err) {
    return value ? [value] : []
  }
  return value ? [value] : []
}

function decodeUtf8(value) {
  let out = ""
  for (let i = 0; i < value.length; i += 1) {
    const c = value[i]
    if (c < 128) out += String.fromCharCode(c)
    else if (c < 224) {
      out += String.fromCharCode(((c & 31) << 6) | (value[i + 1] & 63))
      i += 1
    } else {
      out += String.fromCharCode(((c & 15) << 12) | ((value[i + 1] & 63) << 6) | (value[i + 2] & 63))
      i += 2
    }
  }
  return out
}

function forbiddenHit(text, rows) {
  const value = String(text || "").trim()
  if (!value) return null
  let found = null
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    const phrase = String(row.phrase || "")
    if (!phrase) continue
    const ignores = asList(row.ignores)
    const matched = phrase.length === 1 ? value === phrase : phraseOccurs(value, phrase, ignores)
    if (!matched) continue
    if (!found || phrase.length > found.phrase.length) {
      found = { phrase, alternative: row.alternative || "", category: row.category || "" }
    }
  }
  return found
}

function phraseOccurs(value, phrase, ignores) {
  let from = 0
  while (from <= value.length - phrase.length) {
    const at = value.indexOf(phrase, from)
    if (at < 0) return false
    if (!coveredByLonger(value, at, phrase.length, ignores)) return true
    from = at + phrase.length
  }
  return false
}

function coveredByLonger(value, at, length, ignores) {
  for (let i = 0; i < ignores.length; i += 1) {
    const longer = String(ignores[i] || "")
    if (!longer || longer.length <= length) continue
    let from = 0
    while (from <= value.length - longer.length) {
      const longerAt = value.indexOf(longer, from)
      if (longerAt < 0) break
      if (at >= longerAt && at + length <= longerAt + longer.length) return true
      from = longerAt + longer.length
    }
  }
  return false
}

function forbiddenMessage(hit) {
  return "这句话里有「" + hit.phrase + "」，容易变成对孩子的判断。可以改成：" + hit.alternative + "。"
}

function gradeFits(studentGrade, termGrades) {
  return asList(termGrades).indexOf(studentGrade) >= 0
}

function mismatchMessage(termGrades, studentName) {
  return "这个标签是给" + asList(termGrades).join("、") + "用的，和" + studentName + "的年级不一致。要继续保存，请写一句原因。"
}

function showsErrorEntry(subject, term) {
  if (!subject || subject.error_entry !== true) return false
  if (subject.per_term_error === true) return Boolean(term && term.allows_error === true)
  return true
}

module.exports = {
  asList,
  forbiddenHit,
  forbiddenMessage,
  gradeFits,
  mismatchMessage,
  showsErrorEntry,
}
