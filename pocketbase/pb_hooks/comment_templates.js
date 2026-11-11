// 阶段评语只在本机用模板拼接。二期润色函数留在这里，一期不接通、不发请求。

const NEXT_STEP = "请老师看过后再补一句可以接着练的事"
const DRAFT_HINT = "下面是系统按已确认记录拼出的草稿，请老师改完再确认。没有确认，不会发给家长，也不会放进交接包。"

const WUYU = [
  ["参加升旗或主题活动", "{{时间范围}}，{{姓名}}参加了【事实】，并按要求做完了自己的部分。", "{{时间范围}}，{{姓名}}按要求参加了升旗或班级主题活动。"],
  ["能说出一件与党和国家或家乡有关的事", "{{时间范围}}，{{姓名}}能说出【事实】。", "{{时间范围}}，{{姓名}}能说出一件与国家或家乡有关的事。"],
  ["遵守约定", "{{时间范围}}，{{姓名}}在【事实】里按事先说好的约定做了。", "{{时间范围}}，{{姓名}}遵守了课堂上事先说明的约定。"],
  ["爱护公物或保护环境", "{{时间范围}}，{{姓名}}【事实】。", "{{时间范围}}，{{姓名}}按要求爱护了公物，或做了一件环保小事。"],
  ["合作互助", "{{时间范围}}，{{姓名}}和同学一起完成了【事实】。", "{{时间范围}}，{{姓名}}和同学一起做完了一项任务。"],
  ["使用礼貌用语", "{{时间范围}}，{{姓名}}在与人交往时用上了礼貌用语【事实】。", "{{时间范围}}，{{姓名}}在和老师、同学说话时用上了礼貌用语。"],
  ["自己的事情自己做", "{{时间范围}}，{{姓名}}自己做完了【事实】。", "{{时间范围}}，{{姓名}}自己做完了一件该做的事。"],
  ["听完故事能说出一件事", "{{时间范围}}，{{姓名}}听完【事实】后，能说出其中的一个人或一件事。", "{{时间范围}}，{{姓名}}听完故事后，能说出其中的一件事。"],
  ["愿意提问", "{{时间范围}}，{{姓名}}就听不懂的地方提出了具体问题【事实】。", "{{时间范围}}，{{姓名}}就听不懂的地方提出了具体问题。"],
  ["完成学习任务", "{{时间范围}}，{{姓名}}按要求完成了【事实】。", "{{时间范围}}，{{姓名}}按要求做完了当天的学习任务。"],
  ["主动订正", "{{时间范围}}，{{姓名}}把【事实】的订正做完了。", "{{时间范围}}，{{姓名}}发现错误后，把订正做完了。"],
  ["和同伴一起学习", "{{时间范围}}，{{姓名}}和同学一起完成了【事实】。", "{{时间范围}}，{{姓名}}和同学一起完成了一项学习任务。"],
  ["参加兴趣小组或完成小制作", "{{时间范围}}，{{姓名}}参加了【事实】，并完成了自己的作品或任务。", "{{时间范围}}，{{姓名}}参加了兴趣小组或完成了一件小制作。"],
  ["提出问题并试着找办法", "{{时间范围}}，{{姓名}}提出了一个想弄明白的问题，并试着寻找办法【事实】。", "{{时间范围}}，{{姓名}}提出了一个问题，并试着寻找办法。"],
  ["阅读后能说出一点内容", "{{时间范围}}，{{姓名}}读完【事实】后，能说出其中的一点内容。", "{{时间范围}}，{{姓名}}读完后，能说出其中的一点内容。"],
  ["完成一项实验或动手探究", "{{时间范围}}，{{姓名}}按步骤完成了【事实】，并记下了看到的结果。", "{{时间范围}}，{{姓名}}按步骤完成了一项观察或实验。"],
  ["积极参加活动", "{{时间范围}}，{{姓名}}参加了【事实】，并完成了当次的基本要求。", "{{时间范围}}，{{姓名}}参加了体育或户外活动，并完成了基本要求。"],
  ["注意活动安全", "{{时间范围}}，{{姓名}}在活动中能按老师说明注意安全【事实】。", "{{时间范围}}，{{姓名}}在活动中能按老师说明使用器材或保持安全距离。"],
  ["做广播操或眼保健操", "{{时间范围}}，{{姓名}}按要求做了【事实】。", "{{时间范围}}，{{姓名}}按要求做了广播操或眼保健操。"],
  ["完成当日锻炼要求", "{{时间范围}}，{{姓名}}按学校安排完成了当日锻炼的基本要求【事实】。", "{{时间范围}}，{{姓名}}按要求参加了当日的体育锻炼。"],
  ["按提醒调整坐立读写姿势", "{{时间范围}}，{{姓名}}能按提醒调整坐、立或读写姿势【事实】。", "{{时间范围}}，{{姓名}}能按老师提醒调整坐、立或读写姿势。"],
  ["完成一项运动的基本动作", "{{时间范围}}，{{姓名}}在【事实】里做出了基本动作。", "{{时间范围}}，{{姓名}}在一项运动或游戏里完成了基本动作。"],
  ["讲究卫生", "{{时间范围}}，{{姓名}}按学校要求做了【事实】。", "{{时间范围}}，{{姓名}}按要求做了一项卫生习惯。"],
  ["完成一件作品", "{{时间范围}}，{{姓名}}完成了【事实】。", "{{时间范围}}，{{姓名}}按时完成了一件绘画、手工或表演作品。"],
  ["能说说同伴作品的优点", "{{时间范围}}，{{姓名}}能说出同伴作品里具体好在哪里【事实】。", "{{时间范围}}，{{姓名}}能指出同伴作品里具体好在哪里。"],
  ["参加美育活动", "{{时间范围}}，{{姓名}}参加了【事实】，并完成了自己的任务。", "{{时间范围}}，{{姓名}}参加了学校或班级的文化艺术活动。"],
  ["唱一首歌或完成一项艺术练习", "{{时间范围}}，{{姓名}}【事实】。", "{{时间范围}}，{{姓名}}按要求唱完了一首歌，或完成了一项艺术练习。"],
  ["指出一处具体的美", "{{时间范围}}，{{姓名}}能在校园或生活里指出一处具体的美【事实】。", "{{时间范围}}，{{姓名}}能在校园或生活里指出一处具体的美。"],
  ["观看后能说出感受", "{{时间范围}}，{{姓名}}在观看【事实】后，能说出自己的一点感受。", "{{时间范围}}，{{姓名}}在观看作品、演出或展览后，能说出自己的一点感受。"],
  ["用作品表达想法", "{{时间范围}}，{{姓名}}用【事实】表达了自己的想法或看到的事物。", "{{时间范围}}，{{姓名}}用画画、手工或表演表达了自己的想法。"],
  ["完成值日或整理", "{{时间范围}}，{{姓名}}完成了【事实】。", "{{时间范围}}，{{姓名}}完成了值日或整理任务。"],
  ["动手做完一项任务", "{{时间范围}}，{{姓名}}按步骤做完了【事实】。", "{{时间范围}}，{{姓名}}按步骤做完了一项劳动或生活技能任务。"],
  ["完成一项生活技能或家务练习", "{{时间范围}}，{{姓名}}在生活技能或家务练习中做完了【事实】。", "{{时间范围}}，{{姓名}}做完了一项生活技能或家务练习。"],
  ["爱惜劳动成果", "{{时间范围}}，{{姓名}}能把【事实】收好，不随手丢掉劳动成果。", "{{时间范围}}，{{姓名}}能按要求收好工具或劳动成果。"],
  ["参加公益或校外劳动", "{{时间范围}}，{{姓名}}参加了【事实】，并做完了自己承担的部分。", "{{时间范围}}，{{姓名}}参加了一次公益或校外劳动，并做完了自己的部分。"],
  ["完成种植养殖或职业体验中的一项任务", "{{时间范围}}，{{姓名}}在【事实】中做完了自己的任务。", "{{时间范围}}，{{姓名}}在种植、养殖或体验活动中做完了一项任务。"],
  ["按步骤使用工具", "{{时间范围}}，{{姓名}}能按步骤、按安全要求使用【事实】，并用完后放回。", "{{时间范围}}，{{姓名}}能按步骤使用劳动工具，并用完后放回。"],
]

function fill(template, name, period, fact) {
  return String(template)
    .split("{{时间范围}}").join(period)
    .split("{{姓名}}").join(name)
    .split("【事实】").join(fact || "")
}

function wuyuSentence(keyword, fact, period, name) {
  for (let i = 0; i < WUYU.length; i += 1) {
    if (WUYU[i][0] !== keyword) continue
    const factText = String(fact || "").trim()
    return fill(factText ? WUYU[i][1] : WUYU[i][2], name, period, factText)
  }
  return ""
}

function learningSentence(input) {
  const period = input.period
  const name = input.name
  const subject = input.subject || ""
  const knowledge = input.knowledge || "已确认的学习内容"
  const fact = String(input.fact || "").trim() || "有已确认的学习记录"
  if (subject === "数学" || subject === "语文" || subject === "英语") {
    return period + "，" + name + "在" + knowledge + "上" + fact + "。下一步可以" + NEXT_STEP + "。"
  }
  return period + "，" + name + "在" + subject + "的" + knowledge + "上" + fact + "。下一步建议：" + NEXT_STEP + "。"
}

function sourceMarker(kind, id) {
  return "〔来源:" + kind + ":" + id + "〕"
}

function usableLearning(row) {
  if (!row || row.confirmed !== true) return false
  if (row.status === "历史" || row.status === "已改善") return false
  return true
}

function usableWuyu(row) {
  return Boolean(row && row.confirmed === true && row.keyword)
}

function isPractice(row) {
  if (row.errorCode) return true
  return row.status === "尚需观察" || row.status === "偶发错误"
}

function buildStudentDraft(input) {
  const student = input.student
  const period = String(input.period || "").trim()
  const progress = []
  const practice = []
  const learning = input.learning || []
  for (let i = 0; i < learning.length; i += 1) {
    const row = learning[i]
    if (!usableLearning(row)) continue
    if (isPractice(row)) practice.push(row)
    else progress.push(row)
  }
  const ordered = progress.concat(practice)
  const sentences = []
  for (let i = 0; i < ordered.length; i += 1) {
    const row = ordered[i]
    const text = learningSentence({
      period,
      name: student.name,
      subject: row.subject,
      knowledge: row.knowledge,
      fact: row.fact,
    }) + sourceMarker("learning", row.id)
    sentences.push({ sourceKind: "learning", sourceId: row.id, text })
  }
  const wuyu = input.wuyu || []
  for (let i = 0; i < wuyu.length; i += 1) {
    const row = wuyu[i]
    if (!usableWuyu(row)) continue
    const sentence = wuyuSentence(row.keyword, row.fact, period, student.name)
    if (!sentence) continue
    sentences.push({
      sourceKind: "wuyu",
      sourceId: row.id,
      text: sentence + sourceMarker("wuyu", row.id),
    })
  }
  let body = ""
  for (let i = 0; i < sentences.length; i += 1) body += sentences[i].text
  return {
    studentId: student.id,
    studentName: student.name,
    grade: student.grade,
    period,
    sentences,
    generatedBody: body,
    body,
    status: "草稿",
    published: false,
  }
}

function gradeNotice(grade, gradeCount) {
  if (gradeCount > 1) return "当前是" + grade + "的评语。本班其他年级请切换后查看。"
  return "当前是" + grade + "的评语。"
}

function groupByGrade(drafts) {
  const order = []
  const buckets = {}
  for (let i = 0; i < drafts.length; i += 1) {
    const grade = drafts[i].grade || ""
    if (!buckets[grade]) {
      buckets[grade] = []
      order.push(grade)
    }
    buckets[grade].push(drafts[i])
  }
  const groups = []
  for (let i = 0; i < order.length; i += 1) {
    groups.push({
      grade: order[i],
      notice: gradeNotice(order[i], order.length),
      students: buckets[order[i]],
    })
  }
  return { groups, combinedClassComment: false }
}

function parseMarkers(body) {
  const text = String(body || "")
  const token = "〔来源:"
  const found = []
  let from = 0
  while (from < text.length) {
    const at = text.indexOf(token, from)
    if (at < 0) break
    const end = text.indexOf("〕", at)
    if (end < 0) break
    const parts = text.slice(at + token.length, end).split(":")
    if (parts.length === 2 && (parts[0] === "learning" || parts[0] === "wuyu") && parts[1]) {
      found.push({ sourceKind: parts[0], sourceId: parts[1] })
    }
    from = end + 1
  }
  return found
}

function missingMarkers(body, sentences) {
  const text = String(body || "")
  const missing = []
  for (let i = 0; i < sentences.length; i += 1) {
    const marker = sourceMarker(sentences[i].sourceKind, sentences[i].sourceId)
    if (text.indexOf(marker) < 0) missing.push(sentences[i].sourceId)
  }
  return missing
}

function polishComment() {
  return { connected: false, phase: "一期不接通", text: "" }
}

function editDistance(leftText, rightText) {
  const left = String(leftText || "")
  const right = String(rightText || "")
  const width = right.length
  let prev = []
  let curr = []
  for (let column = 0; column <= width; column += 1) prev[column] = column
  for (let row = 1; row <= left.length; row += 1) {
    curr[0] = row
    for (let column = 1; column <= width; column += 1) {
      const swap = left.charAt(row - 1) === right.charAt(column - 1) ? 0 : 1
      const del = prev[column] + 1
      const ins = curr[column - 1] + 1
      const sub = prev[column - 1] + swap
      let best = del < ins ? del : ins
      if (sub < best) best = sub
      curr[column] = best
    }
    const keep = prev
    prev = curr
    curr = keep
  }
  return prev[width]
}

module.exports = {
  NEXT_STEP,
  DRAFT_HINT,
  WUYU,
  wuyuSentence,
  learningSentence,
  sourceMarker,
  buildStudentDraft,
  gradeNotice,
  groupByGrade,
  parseMarkers,
  missingMarkers,
  polishComment,
  editDistance,
}
