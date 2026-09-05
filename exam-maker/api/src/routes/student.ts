import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/index'
import { requireAuth, requireRole } from '../middleware/auth'
import { generateId } from '../utils/id'
import { autoGradeSubmission, formatAnswerForReview, inferFillBlankCount } from '../pipeline/grading'

const auth = { preHandler: [requireAuth, requireRole('student')] }

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function scoreVisible(publish: any, now = Date.now()) {
  return !publish.score_release_time || now >= publish.score_release_time
}

function answerVisible(publish: any, now = Date.now()) {
  return !publish.answer_release_time || now >= publish.answer_release_time
}

function windowStatus(publish: any, now = Date.now()) {
  if (publish.start_time && now < publish.start_time) return 'scheduled'
  if (publish.end_time && now > publish.end_time) return 'closed'
  return 'open'
}

function studentCanAccessPublish(db: any, publish: any, studentId: string) {
  if (!publish || publish.status !== 'published' || !publish.class_id) return false
  return Boolean(db.prepare('SELECT 1 FROM class_students WHERE class_id = ? AND student_id = ?').get(publish.class_id, studentId))
}

function sanitizeSubmissionForStudent(submission: any, publish: any, now = Date.now()) {
  if (!submission) return null
  const visible = scoreVisible(publish, now)
  return {
    ...submission,
    total_score: visible ? submission.total_score : null,
    scoreVisible: visible,
    answerVisible: answerVisible(publish, now),
  }
}

function recordExamEvent(db: any, payload: { submissionId: string; publishId: string; studentId: string; type: string; detail?: unknown }) {
  db.prepare('INSERT INTO exam_events (id, submission_id, publish_id, student_id, type, detail, created_at) VALUES (?,?,?,?,?,?,?)').run(
    generateId(),
    payload.submissionId,
    payload.publishId,
    payload.studentId,
    payload.type,
    payload.detail === undefined ? null : JSON.stringify(payload.detail),
    Date.now(),
  )
}

export async function studentRoutes(app: FastifyInstance) {
  // Exam hall — list published exams for student's classes
  app.get('/api/student/dashboard', auth, async (req) => {
    const db = getDb()
    const now = Date.now()
    const studentId = req.user!.userId

    const rows = db.prepare('SELECT DISTINCT ep.*, e.total_score as exam_total_score FROM exam_publish ep JOIN exams e ON ep.exam_id = e.id JOIN class_students cs ON ep.class_id = cs.class_id LEFT JOIN submissions ss ON ss.publish_id = ep.id AND ss.student_id = ? WHERE ep.status = ? AND cs.student_id = ? AND (ep.end_time IS NULL OR ep.end_time > ? OR ss.id IS NOT NULL) ORDER BY ep.created_at DESC').all(studentId, 'published', studentId, now)

    const result = rows.map((ep: any) => {
      const sub = db.prepare('SELECT id, status, total_score, total_points, submitted_at, started_at, violations, submitted_late FROM submissions WHERE publish_id = ? AND student_id = ? ORDER BY started_at DESC LIMIT 1').get(ep.id, studentId) as any
      const attempts = (db.prepare('SELECT COUNT(*) as c FROM submissions WHERE publish_id = ? AND student_id = ?').get(ep.id, studentId) as any).c || 0
      const status = windowStatus(ep, now)
      const retryLimit = Number(ep.retry) || 0
      const canStart = status === 'open' && (!sub || sub.status === 'started' || attempts < retryLimit + 1)

      return {
        ...ep,
        startTime: ep.start_time,
        endTime: ep.end_time,
        scoreReleaseTime: ep.score_release_time,
        answerReleaseTime: ep.answer_release_time,
        allowLateSubmit: Boolean(ep.allow_late_submit),
        antiCheatLevel: ep.anti_cheat_level || 'record',
        maxViolations: ep.max_violations || 3,
        windowStatus: status,
        canStart,
        submission: sanitizeSubmissionForStudent(sub, ep, now),
      }
    })

    return { publishes: result }
  })

  // Get exam questions for taking
  app.get('/api/student/exam/:publishId', auth, async (req, reply) => {
    const { publishId } = req.params as { publishId: string }
    const db = getDb()
    const now = Date.now()
    const studentId = req.user!.userId

    const publish = db.prepare('SELECT * FROM exam_publish WHERE id = ?').get(publishId) as any
    if (!publish || !studentCanAccessPublish(db, publish, studentId)) return reply.status(404).send({ error: 'Not found' })

    const status = windowStatus(publish, now)
    if (status === 'scheduled') return reply.status(403).send({ error: '考试尚未开始' })
    if (status === 'closed' && !publish.allow_late_submit) return reply.status(403).send({ error: '考试已截止' })

    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(publish.exam_id) as any
    if (!exam) return reply.status(404).send({ error: 'Exam not found' })

    const examQuestions = parseJson<any[]>(exam.questions, [])
    const questionIds = examQuestions.map((eq: any) => eq.questionId)
    if (questionIds.length === 0) {
      return { publish: { id: publish.id, title: publish.title, duration: publish.duration }, questions: [] }
    }

    const questions = db.prepare('SELECT id, type, title, content, options, answer, difficulty, knowledge_points FROM questions WHERE id IN (' + questionIds.map(() => '?').join(',') + ')').all(...questionIds) as any[]

    let orderedQuestions = examQuestions.map((eq: any) => {
      const q = questions.find((item: any) => item.id === eq.questionId)
      if (!q) return null
      return { ...q, score: eq.score, order: eq.order, answer: parseJson(q.answer, null), options: q.options ? parseJson(q.options, undefined) : undefined, knowledgePoints: q.knowledge_points ? parseJson(q.knowledge_points, []) : [] }
    }).filter(Boolean)

    if (publish.shuffle) {
      orderedQuestions = orderedQuestions.sort(() => Math.random() - 0.5)
    }

    return {
      publish: {
        id: publish.id,
        title: publish.title,
        duration: publish.duration,
        startTime: publish.start_time,
        endTime: publish.end_time,
        scoreReleaseTime: publish.score_release_time,
        answerReleaseTime: publish.answer_release_time,
        allowLateSubmit: Boolean(publish.allow_late_submit),
        antiCheatLevel: publish.anti_cheat_level || 'record',
        maxViolations: publish.max_violations || 3,
        windowStatus: status,
      },
      questions: orderedQuestions.map((q: any) => {
        const { answer, ...safeQ } = q
        const answerBlankCount = Array.isArray(answer?.blanks) ? answer.blanks.length : 1
        return {
          ...safeQ,
          blankCount: q.type === 'fillblank' ? inferFillBlankCount(q.title, q.content, answerBlankCount) : undefined,
        }
      }),
    }
  })

  // Start exam
  app.post('/api/student/exam/:publishId/start', auth, async (req, reply) => {
    const { publishId } = req.params as { publishId: string }
    const db = getDb()
    const now = Date.now()
    const studentId = req.user!.userId

    const publish = db.prepare('SELECT * FROM exam_publish WHERE id = ?').get(publishId) as any
    if (!publish || !studentCanAccessPublish(db, publish, studentId)) return reply.status(404).send({ error: 'Not found' })

    const status = windowStatus(publish, now)
    if (status === 'scheduled') return reply.status(403).send({ error: '考试尚未开始' })
    if (status === 'closed') return reply.status(403).send({ error: '考试已截止' })

    const existing = db.prepare('SELECT id FROM submissions WHERE publish_id = ? AND student_id = ? AND status = ?').get(publishId, studentId, 'started') as any
    if (existing) {
      return { submissionId: existing.id }
    }

    const attempts = (db.prepare('SELECT COUNT(*) as c FROM submissions WHERE publish_id = ? AND student_id = ?').get(publishId, studentId) as any).c || 0
    const allowedAttempts = (Number(publish.retry) || 0) + 1
    if (attempts >= allowedAttempts) {
      return reply.status(403).send({ error: publish.retry > 0 ? '已达到最大重考次数' : '本场考试不允许重考' })
    }

    const id = generateId()
    db.prepare('INSERT INTO submissions (id, publish_id, student_id, status, started_at) VALUES (?,?,?,?,?)').run(id, publishId, studentId, 'started', now)

    return { submissionId: id, startedAt: now }
  })

  // Save answer for a question (real-time)
  app.post('/api/student/exam/:publishId/answer', auth, async (req, reply) => {
    const { publishId } = req.params as { publishId: string }
    const { submissionId, questionId, questionOrder, answer, maxScore } = req.body as any
    const db = getDb()
    const now = Date.now()
    const studentId = req.user!.userId

    const sub = db.prepare('SELECT * FROM submissions WHERE id = ? AND student_id = ?').get(submissionId, studentId) as any
    if (!sub || sub.status !== 'started' || sub.publish_id !== publishId) return reply.status(400).send({ error: 'Invalid submission' })

    const publish = db.prepare('SELECT * FROM exam_publish WHERE id = ?').get(publishId) as any
    if (!publish || !studentCanAccessPublish(db, publish, studentId)) return reply.status(404).send({ error: 'Not found' })

    const status = windowStatus(publish, now)
    if (status === 'scheduled') return reply.status(403).send({ error: '考试尚未开始' })
    if (status === 'closed') return reply.status(403).send({ error: '考试已截止，不能继续保存答案' })

    const elapsed = now - sub.started_at
    if (elapsed > publish.duration * 60 * 1000) {
      return reply.status(403).send({ error: '考试时间已到' })
    }

    const id = generateId()
    const existing = db.prepare('SELECT id FROM submission_answers WHERE submission_id = ? AND question_id = ?').get(submissionId, questionId) as any

    if (existing) {
      db.prepare('UPDATE submission_answers SET answer = ?, question_order = ? WHERE id = ?').run(JSON.stringify(answer), questionOrder, existing.id)
    } else {
      db.prepare('INSERT INTO submission_answers (id, submission_id, question_id, question_order, answer, max_score) VALUES (?,?,?,?,?,?)').run(id, submissionId, questionId, questionOrder, JSON.stringify(answer), maxScore || 0)
    }

    return { ok: true }
  })

  // Record an exam event such as tab switch or fullscreen exit.
  app.post('/api/student/exam/:publishId/events', auth, async (req, reply) => {
    const { publishId } = req.params as { publishId: string }
    const { submissionId, type, detail, violations } = req.body as any
    const db = getDb()
    const studentId = req.user!.userId

    const sub = db.prepare('SELECT * FROM submissions WHERE id = ? AND student_id = ? AND publish_id = ?').get(submissionId, studentId, publishId) as any
    if (!sub) return reply.status(400).send({ error: 'Invalid submission' })

    recordExamEvent(db, { submissionId, publishId, studentId, type: String(type || 'unknown'), detail })
    if (Number.isFinite(Number(violations))) {
      db.prepare('UPDATE submissions SET violations = MAX(COALESCE(violations, 0), ?) WHERE id = ?').run(Math.max(0, Number(violations)), submissionId)
    }

    const publish = db.prepare('SELECT * FROM exam_publish WHERE id = ?').get(publishId) as any
    return {
      ok: true,
      shouldSubmit: publish?.anti_cheat_level === 'strict' && Number(violations || 0) >= Number(publish.max_violations || 3),
    }
  })

  // Submit exam
  app.post('/api/student/exam/:publishId/submit', auth, async (req, reply) => {
    const { publishId } = req.params as { publishId: string }
    const { submissionId, violations } = req.body as any
    const db = getDb()
    const now = Date.now()
    const studentId = req.user!.userId

    const sub = db.prepare('SELECT * FROM submissions WHERE id = ? AND student_id = ?').get(submissionId, studentId) as any
    if (!sub || sub.status !== 'started' || sub.publish_id !== publishId) return reply.status(400).send({ error: 'Invalid submission' })

    const publish = db.prepare('SELECT * FROM exam_publish WHERE id = ?').get(publishId) as any
    if (!publish || !studentCanAccessPublish(db, publish, studentId)) return reply.status(404).send({ error: 'Not found' })

    const status = windowStatus(publish, now)
    if (status === 'scheduled') return reply.status(403).send({ error: '考试尚未开始' })
    const submittedLate = Boolean((publish.end_time && now > publish.end_time) || (now - sub.started_at > publish.duration * 60 * 1000))
    if (publish.end_time && now > publish.end_time && !publish.allow_late_submit) {
      return reply.status(403).send({ error: '考试已截止，不能迟交' })
    }
    if (submittedLate) {
      recordExamEvent(db, { submissionId, publishId, studentId, type: 'late_submit', detail: { endTime: publish.end_time, duration: publish.duration } })
    }

    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(publish.exam_id) as any
    const examQuestions = parseJson<any[]>(exam.questions, [])

    const questionIds = examQuestions.map((eq: any) => eq.questionId)
    const questions = questionIds.length > 0
      ? db.prepare('SELECT * FROM questions WHERE id IN (' + questionIds.map(() => '?').join(',') + ')').all(...questionIds) as any[]
      : []
    const questionsMap = new Map(questions.map((q: any) => [q.id, { ...q, answer: parseJson(q.answer, null) }]))

    const savedAnswers = db.prepare('SELECT * FROM submission_answers WHERE submission_id = ?').all(submissionId) as any[]
    const studentAnswers: Record<string, any> = {}
    for (const sa of savedAnswers) {
      studentAnswers[sa.question_id] = sa.answer ? parseJson(sa.answer, null) : null
    }

    const grading = autoGradeSubmission(examQuestions, questionsMap, studentAnswers)
    const finalViolations = Math.max(Number(sub.violations) || 0, Number(violations) || 0)

    db.prepare('UPDATE submissions SET status = ?, total_score = ?, total_points = ?, violations = ?, submitted_late = ?, submitted_at = ?, answers = ? WHERE id = ?').run(
      'submitted', grading.totalScore, grading.totalPoints, finalViolations, submittedLate ? 1 : 0, now, JSON.stringify(studentAnswers), submissionId
    )

    for (const ga of grading.answers) {
      const existing = db.prepare('SELECT id FROM submission_answers WHERE submission_id = ? AND question_id = ?').get(submissionId, ga.questionId) as any
      if (existing) {
        db.prepare('UPDATE submission_answers SET score = ?, is_correct = ?, graded_by = ? WHERE id = ?').run(ga.score, ga.isCorrect, ga.gradedBy, existing.id)
      } else {
        const eq = examQuestions.find((item: any) => item.questionId === ga.questionId)
        db.prepare('INSERT INTO submission_answers (id, submission_id, question_id, question_order, answer, score, max_score, is_correct, graded_by) VALUES (?,?,?,?,?,?,?,?,?)').run(
          generateId(), submissionId, ga.questionId, eq?.order || 0, null, ga.score, eq?.score || 0, ga.isCorrect, ga.gradedBy
        )
      }
    }

    const allAuto = grading.answers.every((a: any) => a.gradedBy === 'auto')
    if (allAuto) {
      db.prepare('UPDATE submissions SET status = ?, graded_at = ? WHERE id = ?').run('graded', now, submissionId)
    }

    return { submission: db.prepare('SELECT * FROM submissions WHERE id = ?').get(submissionId) }
  })

  // My submissions
  app.get('/api/student/submissions', auth, async (req) => {
    const db = getDb()
    const now = Date.now()
    const rows = db.prepare('SELECT s.*, ep.title as exam_title, ep.score_release_time, ep.answer_release_time FROM submissions s JOIN exam_publish ep ON s.publish_id = ep.id WHERE s.student_id = ? ORDER BY s.started_at DESC').all(req.user!.userId) as any[]
    return {
      submissions: rows.map((row: any) => sanitizeSubmissionForStudent(row, row, now)),
    }
  })

  // My mistakes and weak knowledge points
  app.get('/api/student/mistakes', auth, async (req) => {
    const db = getDb()
    const now = Date.now()
    const studentId = req.user!.userId
    const rows = db.prepare(`
      SELECT
        sa.*,
        s.submitted_at,
        ep.title as exam_title,
        ep.answer_release_time,
        q.type as question_type,
        q.title as question_title,
        q.content as question_content,
        q.options as question_options,
        q.answer as correct_answer,
        q.explanation as question_explanation,
        q.difficulty as question_difficulty,
        q.knowledge_points as question_knowledge_points
      FROM submission_answers sa
      JOIN submissions s ON sa.submission_id = s.id
      JOIN exam_publish ep ON s.publish_id = ep.id
      JOIN questions q ON sa.question_id = q.id
      WHERE s.student_id = ?
        AND s.status IN ('submitted', 'graded')
        AND (ep.score_release_time IS NULL OR ep.score_release_time <= ?)
        AND sa.is_correct IS NOT NULL
        AND COALESCE(sa.score, 0) < COALESCE(sa.max_score, 0)
      ORDER BY s.submitted_at DESC, sa.question_order ASC
      LIMIT 200
    `).all(studentId, now) as any[]

    const weakMap = new Map<string, { knowledgePoint: string; mistakeCount: number; lostScore: number; totalScore: number; latestAt: number }>()
    const mistakes = rows.map((row: any) => {
      const studentAnswer = row.answer ? parseJson<Record<string, any> | null>(row.answer, null) : null
      const correctAnswer = parseJson<Record<string, any>>(row.correct_answer, {})
      const knowledgePoints = parseJson<string[]>(row.question_knowledge_points, [])
      const points = knowledgePoints.length > 0 ? knowledgePoints : ['未标注']
      const maxScore = Number(row.max_score) || 0
      const score = Number(row.score) || 0
      const lostScore = Math.max(0, maxScore - score)
      for (const kp of points) {
        const item = weakMap.get(kp) || { knowledgePoint: kp, mistakeCount: 0, lostScore: 0, totalScore: 0, latestAt: 0 }
        item.mistakeCount += 1
        item.lostScore += lostScore
        item.totalScore += maxScore
        item.latestAt = Math.max(item.latestAt, row.submitted_at || 0)
        weakMap.set(kp, item)
      }
      const canSeeAnswer = answerVisible(row, now)
      return {
        id: row.id,
        submissionId: row.submission_id,
        questionId: row.question_id,
        questionOrder: row.question_order,
        examTitle: row.exam_title,
        submittedAt: row.submitted_at,
        score,
        maxScore,
        lostScore,
        isCorrect: row.is_correct,
        teacherNotes: row.teacher_notes || '',
        studentAnswer,
        studentAnswerText: formatAnswerForReview(studentAnswer),
        referenceAnswerText: canSeeAnswer ? formatAnswerForReview(correctAnswer) : undefined,
        answerVisible: canSeeAnswer,
        question: {
          id: row.question_id,
          type: row.question_type,
          title: row.question_title,
          content: row.question_content,
          options: parseJson(row.question_options, undefined),
          explanation: canSeeAnswer ? row.question_explanation || '' : '',
          difficulty: row.question_difficulty,
          knowledgePoints,
        },
      }
    })

    const weakPoints = Array.from(weakMap.values())
      .map((item) => ({
        ...item,
        masteryRate: item.totalScore > 0 ? Math.round((1 - item.lostScore / item.totalScore) * 100) : 0,
      }))
      .sort((a, b) => b.lostScore - a.lostScore || b.mistakeCount - a.mistakeCount)

    return { weakPoints, mistakes }
  })

  // Submission detail
  app.get('/api/student/submissions/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const now = Date.now()

    const sub = db.prepare('SELECT s.*, ep.title as exam_title, ep.score_release_time, ep.answer_release_time, ep.anti_cheat_level, ep.max_violations FROM submissions s JOIN exam_publish ep ON s.publish_id = ep.id WHERE s.id = ? AND s.student_id = ?').get(id, req.user!.userId) as any
    if (!sub) return reply.status(404).send({ error: 'Not found' })

    const canSeeScore = scoreVisible(sub, now)
    const canSeeAnswer = answerVisible(sub, now)
    const answers = db.prepare('SELECT * FROM submission_answers WHERE submission_id = ? ORDER BY question_order').all(id) as any[]

    const questionIds = answers.map((a: any) => a.question_id)
    const questions = questionIds.length > 0
      ? db.prepare('SELECT * FROM questions WHERE id IN (' + questionIds.map(() => '?').join(',') + ')').all(...questionIds) as any[]
      : []

    const questionsMap = new Map(questions.map((q: any) => {
      const parsed = {
        ...q,
        options: q.options ? parseJson(q.options, undefined) : undefined,
        knowledgePoints: q.knowledge_points ? parseJson(q.knowledge_points, []) : [],
        explanation: canSeeAnswer ? q.explanation || '' : '',
      }
      if (canSeeAnswer) {
        return [q.id, { ...parsed, answer: parseJson(q.answer, null) }]
      }
      const { answer, ...safeQuestion } = parsed
      return [q.id, safeQuestion]
    }))

    const events = db.prepare('SELECT type, detail, created_at FROM exam_events WHERE submission_id = ? ORDER BY created_at ASC').all(id).map((event: any) => ({
      ...event,
      detail: parseJson(event.detail, event.detail),
    }))

    return {
      scoreVisible: canSeeScore,
      answerVisible: canSeeAnswer,
      submission: {
        ...sub,
        total_score: canSeeScore ? sub.total_score : null,
      },
      events,
      answers: answers.map((a: any) => {
        const studentAnswer = a.answer ? parseJson<Record<string, any> | null>(a.answer, null) : null
        const question = questionsMap.get(a.question_id) as any
        return {
          ...a,
          score: canSeeScore ? a.score : null,
          is_correct: canSeeScore ? a.is_correct : null,
          studentAnswer,
          studentAnswerText: formatAnswerForReview(studentAnswer),
          referenceAnswerText: canSeeAnswer && question?.answer ? formatAnswerForReview(question.answer) : undefined,
          question,
        }
      }),
    }
  })

  // Join class
  app.post('/api/student/classes/join', auth, async (req) => {
    const { joinCode } = req.body as { joinCode: string }
    const db = getDb()

    const cls = db.prepare('SELECT * FROM classes WHERE join_code = ?').get(joinCode) as any
    if (!cls) return { error: '邀请码无效' }

    try {
      db.prepare('INSERT INTO class_students (class_id, student_id, joined_at) VALUES (?,?,?)').run(cls.id, req.user!.userId, Date.now())
      return { class: cls }
    } catch {
      return { error: '你已在此班级中' }
    }
  })
}
