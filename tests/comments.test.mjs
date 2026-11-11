import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { api, login, registerConsent, registerVolunteer, startPocketBase } from "./pb.mjs"

const PASSWORD = "Demo-Pass-0000"
let pb
let superToken

before(async () => {
  pb = await startPocketBase()
  superToken = (await login(pb.base, pb.email, pb.password, "_superusers")).data.token
})

after(async () => {
  if (pb) await pb.stop()
})

test("P0-21 复式班按年级出草稿，只引用已确认记录，确认后才算正式评语", async () => {
  const org = (await api(pb.base, "/api/collections/organizations/records", {
    token: superToken,
    method: "POST",
    body: { name: "评语协会" },
  })).data
  const school = (await api(pb.base, "/api/collections/schools/records", {
    token: superToken,
    method: "POST",
    body: { name: "评语小学", org: org.id },
  })).data
  const admin = (await api(pb.base, "/api/collections/users/records", {
    token: superToken,
    method: "POST",
    body: {
      username: "comment-school",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "评语管理员",
      roles: ["school_admin"],
      org: org.id,
      school: school.id,
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })).data
  const adminToken = (await login(pb.base, "comment-school", PASSWORD)).data.token
  const opened = await api(pb.base, "/api/xueqing/accounts", {
    token: adminToken,
    method: "POST",
    body: { username: "comment-teacher", displayName: "评语老师", teacherType: "长期支教" },
  })
  const first = (await login(pb.base, "comment-teacher", opened.data.password)).data.token
  await api(pb.base, `/api/collections/users/records/${opened.data.user.id}`, {
    token: first,
    method: "PATCH",
    body: { oldPassword: opened.data.password, password: PASSWORD, passwordConfirm: PASSWORD },
  })
  const teacherToken = (await login(pb.base, "comment-teacher", PASSWORD)).data.token
  await registerVolunteer(pb.base, adminToken, opened.data.user.id)
  const klass = (await api(pb.base, "/api/collections/classes/records", {
    token: adminToken,
    method: "POST",
    body: { name: "评语复式班", school: school.id, org: org.id, grades: ["三年级", "四年级"] },
  })).data
  await api(pb.base, "/api/collections/teaching_assignments/records", {
    token: adminToken,
    method: "POST",
    body: { class: klass.id, teacher: opened.data.user.id, subject: "语文", school: school.id, org: org.id },
  })
  const low = (await api(pb.base, "/api/xueqing/students", {
    token: adminToken,
    method: "POST",
    body: { displayName: "评语三年生", grade: "三年级", classId: klass.id },
  })).data
  const high = (await api(pb.base, "/api/xueqing/students", {
    token: adminToken,
    method: "POST",
    body: { displayName: "评语四年生", grade: "四年级", classId: klass.id },
  })).data
  await registerConsent(pb.base, adminToken, low.id)
  await registerConsent(pb.base, adminToken, high.id)
  const lowSaved = await api(pb.base, "/api/xueqing/entries", {
    token: teacherToken,
    method: "POST",
    body: {
      classId: klass.id,
      subjectCode: "C",
      studentIds: [low.id],
      knowledgeCode: "C-3-001",
      textbook: "人教版",
      note: "朗读课文更流畅了",
      clientUid: "comment-low",
    },
  })
  assert.equal(lowSaved.status, 200, JSON.stringify(lowSaved.data))
  const highSaved = await api(pb.base, "/api/xueqing/entries", {
    token: teacherToken,
    method: "POST",
    body: {
      classId: klass.id,
      subjectCode: "C",
      studentIds: [high.id],
      knowledgeCode: "C-4-001",
      textbook: "人教版",
      note: "能把段落按顺序说下来",
      clientUid: "comment-high",
    },
  })
  assert.equal(highSaved.status, 200, JSON.stringify(highSaved.data))
  const expired = await api(pb.base, "/api/xueqing/entries", {
    token: teacherToken,
    method: "POST",
    body: {
      classId: klass.id,
      subjectCode: "C",
      studentIds: [low.id],
      knowledgeCode: "C-3-002",
      textbook: "人教版",
      note: "事件历史样本",
      statusMark: "尚需观察",
      clientUid: "comment-expired",
    },
  })
  assert.equal(expired.status, 200, JSON.stringify(expired.data))
  const marked = await api(pb.base, "/api/collections/label_status_events/records", {
    token: superToken,
    method: "POST",
    body: {
      record_uid: expired.data.items[0].uid,
      status: "历史",
      reason: "学期结束",
      actor: opened.data.user.id,
      at: "2026-11-01 00:00:00.000Z",
      counts_toward_weakness: false,
    },
  })
  assert.equal(marked.status, 200, JSON.stringify(marked.data))
  const hidden = await api(pb.base, "/api/collections/learning_records/records", {
    token: superToken,
    method: "POST",
    body: {
      uid: "01900000-0000-7000-8000-000000000211",
      body: "未确认样本",
      version: 1,
      org: org.id,
      student: low.id,
      class: klass.id,
      subject: "语文",
      author: opened.data.user.id,
      confirmed: false,
    },
  })
  assert.equal(hidden.status, 200, JSON.stringify(hidden.data))
  const historyRow = await api(pb.base, "/api/collections/learning_records/records", {
    token: superToken,
    method: "POST",
    body: {
      uid: "01900000-0000-7000-8000-000000000212",
      body: "历史样本",
      version: 1,
      org: org.id,
      student: low.id,
      class: klass.id,
      subject: "语文",
      author: opened.data.user.id,
      confirmed: true,
      status_mark: "历史",
    },
  })
  assert.equal(historyRow.status, 200, JSON.stringify(historyRow.data))
  const keyword = (await api(pb.base, "/api/xueqing/wuyu/keywords", { token: teacherToken })).data.keywords.find((item) => item.keyword === "遵守约定")
  const wuyu = await api(pb.base, "/api/xueqing/wuyu", {
    token: teacherToken,
    method: "POST",
    body: { studentIds: [low.id], keywordCode: keyword.code, clientUid: "comment-wuyu" },
  })
  assert.equal(wuyu.status, 200, JSON.stringify(wuyu.data))

  const mixed = await api(pb.base, "/api/xueqing/comments/drafts", {
    token: teacherToken,
    method: "POST",
    body: { classId: klass.id, period: "本阶段" },
  })
  assert.equal(mixed.status, 400, JSON.stringify(mixed.data))
  assert.equal(String(mixed.data.message).includes("全班评语"), true)

  const grade3 = await api(pb.base, "/api/xueqing/comments/drafts", {
    token: teacherToken,
    method: "POST",
    body: { classId: klass.id, period: "本阶段", grade: "三年级" },
  })
  assert.equal(grade3.status, 200, JSON.stringify(grade3.data))
  assert.equal(grade3.data.combinedClassComment, false)
  assert.equal(grade3.data.notice, "当前是三年级的评语。本班其他年级请切换后查看。")
  assert.equal(grade3.data.grades.join(","), "三年级,四年级")
  assert.equal(grade3.data.items.length, 1)
  assert.equal(grade3.data.items[0].studentId, low.id)
  assert.equal(grade3.data.items[0].status, "草稿")
  assert.equal(grade3.data.items[0].published, false)
  const body = grade3.data.items[0].body
  assert.equal(body.includes("朗读课文更流畅了"), true)
  assert.equal(body.includes("理解关键词句"), true)
  assert.equal(body.includes("遵守了课堂上事先说明的约定"), true)
  assert.equal(body.includes("〔来源:learning:"), true)
  assert.equal(body.includes("〔来源:wuyu:"), true)
  assert.equal(body.includes("能把段落按顺序说下来"), false)
  assert.equal(body.includes("事件历史样本"), false)
  assert.equal(body.includes("未确认样本"), false)
  assert.equal(body.includes("历史样本"), false)
  assert.equal(body.includes("评语四年生"), false)
  assert.equal(JSON.stringify(grade3.data).includes("全班评语"), false)

  const grade4 = await api(pb.base, "/api/xueqing/comments/drafts", {
    token: teacherToken,
    method: "POST",
    body: { classId: klass.id, period: "本阶段", grade: "四年级" },
  })
  assert.equal(grade4.status, 200, JSON.stringify(grade4.data))
  assert.equal(grade4.data.items.length, 1)
  assert.equal(grade4.data.items[0].studentId, high.id)
  assert.equal(grade4.data.items[0].body.includes("能把段落按顺序说下来"), true)
  assert.equal(grade4.data.items[0].body.includes("朗读课文更流畅了"), false)

  const stripped = body.replace(/〔来源:wuyu:[^〕]+〕/, "")
  const rejected = await api(pb.base, "/api/xueqing/comments/confirm", {
    token: teacherToken,
    method: "POST",
    body: { classId: klass.id, studentId: low.id, grade: "三年级", period: "本阶段", body: stripped },
  })
  assert.equal(rejected.status, 400, JSON.stringify(rejected.data))
  assert.equal(rejected.data.message.includes("来源标记"), true)

  const confirmed = await api(pb.base, "/api/xueqing/comments/confirm", {
    token: teacherToken,
    method: "POST",
    body: {
      classId: klass.id,
      studentId: low.id,
      grade: "三年级",
      period: "本阶段",
      body,
      clientUid: "comment-confirm-1",
      startedAt: String(Date.now()),
    },
  })
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data))
  assert.equal(confirmed.data.status, "已确认")
  assert.equal(confirmed.data.published, false)
  const stored = await api(pb.base, "/api/collections/stage_comments/records/" + confirmed.data.id, { token: superToken })
  assert.equal(stored.data.published, false)
  assert.equal(stored.data.status, "已确认")
  const again = await api(pb.base, "/api/xueqing/comments/confirm", {
    token: teacherToken,
    method: "POST",
    body: {
      classId: klass.id,
      studentId: low.id,
      grade: "三年级",
      period: "本阶段",
      body,
      clientUid: "comment-confirm-1",
    },
  })
  assert.equal(again.status, 200, JSON.stringify(again.data))
  assert.equal(again.data.id, confirmed.data.id)
  const duplicate = await api(pb.base, "/api/xueqing/comments/confirm", {
    token: teacherToken,
    method: "POST",
    body: { classId: klass.id, studentId: low.id, grade: "三年级", period: "本阶段", body, clientUid: "comment-confirm-2" },
  })
  assert.equal(duplicate.status, 400)

  const orgB = (await api(pb.base, "/api/collections/organizations/records", {
    token: superToken,
    method: "POST",
    body: { name: "评语协会乙" },
  })).data
  const schoolB = (await api(pb.base, "/api/collections/schools/records", {
    token: superToken,
    method: "POST",
    body: { name: "评语小学乙", org: orgB.id },
  })).data
  await api(pb.base, "/api/collections/users/records", {
    token: superToken,
    method: "POST",
    body: {
      username: "comment-school-b",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      display_name: "评语管理员乙",
      roles: ["school_admin"],
      org: orgB.id,
      school: schoolB.id,
      must_change_password: false,
      failed_login_count: 0,
      emailVisibility: false,
    },
  })
  const otherToken = (await login(pb.base, "comment-school-b", PASSWORD)).data.token
  const hiddenSources = await api(pb.base, "/api/xueqing/comments/sources?classId=" + klass.id, { token: otherToken })
  assert.equal(hiddenSources.status, 404, JSON.stringify(hiddenSources.data))
  assert.match(hiddenSources.data.message, /^不存在/)
  const direct = await api(pb.base, "/api/collections/stage_comments/records", {
    token: teacherToken,
    method: "POST",
    body: { body: "直接写", org: org.id, status: "已确认", published: true },
  })
  assert.equal(direct.status, 404)
  const polish = await api(pb.base, "/api/xueqing/comments/polish", {
    token: teacherToken,
    method: "POST",
    body: { body: "润色" },
  })
  assert.equal(polish.status, 404)
})
