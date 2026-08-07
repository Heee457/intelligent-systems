import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/index'
import { requireAuth, requireRole } from '../middleware/auth'
import { generateId } from '../utils/id'
import { autoGradeSubmission } from '../pipeline/grading'

const auth = { preHandler: [requireAuth, requireRole('student')] }

export async function studentRoutes(app: FastifyInstance) {
  // Exam hall — list published exams for student's classes
  app.get('/api/student/dashboard', auth, async (req) => {
    const db = getDb()
    const now = Date.now()

    const rows = db.prepare(`
      SELECT DISTINCT ep.*, e.total_score as exam_total_score
      FROM exam_publish ep
      JOIN exams e ON ep.exam_id = e.id
      LEFT JOIN class_students cs ON ep.class_id = cs.class_id
      WHERE ep.status = 'published'
        AND (ep.class_id IS NULL OR cs.student_id = ?)
        AND (ep.end_time IS NULL OR ep.end_time > ?)
      ORDER BY ep.created_at DESC
    `).all(req.user!.userId, now)

    // Add submission status for each publish
    const result = rows.map((ep: any) => {
      const sub = db.prepare(
        'SELECT id, status, total_score, submitted_at FROM submissions WHERE publish_id = ? AND student_id = ? ORDER BY created_at DESC LIMIT 1'
      ).get(ep.id, req.user!.userId) as any

      return {
        ...ep,
        submission: sub || null,
      }
    })

    return { publishes: result }
  })

  // Get exam questions for taking
  app.get('/api/student/exam/:publishId', auth, async (req) => {
    const { publishId } = req.params as { publishId: string }
    const db = getDb()

    const publish = db.prepare('SELECT * FROM exam_publish WHERE id = ?').get(publishId) as any
    if (!publish) return { error: 'Not found' }

    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(publish.exam_id) as any
    if (!exam) return { error: 'Exam not found' }

    const examQuestions = JSON.parse(exam.questions)
    const questionIds = examQuestions.map((eq: any) => eq.questionId)

    // Fetch question details
    const questions = db.prepare(
      `SELECT id, type, title, content, options, answer, difficulty, knowledge_points
       FROM questions WHERE id IN (${questionIds.map(() => '?').join(',')})`
    ).all(...questionIds) as any[]

    // If shuffle enabled, randomize order
    let orderedQuestions = examQuestions.map((eq: any) => {
      const q = questions.find((q: any) => q.id === eq.questionId)
      return { ...q, score: eq.score, order: eq.order, answer: JSON.parse(q.answer), options: q.options ? JSON.parse(q.options) : undefined, knowledgePoints: q.knowledge_points ? JSON.parse(q.knowledge_points) : [] }
    })

    if (publish.shuffle) {
      orderedQuestions = orderedQuestions.sort(() => Math.random() - 0.5)
    }

    return {
      publish: { id: publish.id, title: publish.title, duration: publish.duration, endTime: publish.end_time },
      questions: orderedQuestions.map((q: any) => {
        const { answer, ...safeQ } = q
        return safeQ  // Don't send answers to client!
      }),
    }
  })

  // Start exam
  app.post('/api/student/exam/:publishId/start', auth, async (req) => {
    const { publishId } = req.params as { publishId: string }
    const db = getDb()

    const publish = db.prepare('SELECT * FROM exam_publish WHERE id = ?').get(publishId) as any
    if (!publish) return { error: 'Not found' }

    // Check retry limit
    if (publish.retry > 0) {
      const count = (db.prepare('SELECT COUNT(*) as c FROM submissions WHERE publish_id = ? AND student_id = ?').get(publishId, req.user!.userId) as any).c
      if (count >= publish.retry + 1) {
        return { error: '已达到最大重考次数' }
      }
    }

    // Check if already has active submission
    const existing = db.prepare(
      'SELECT id FROM submissions WHERE publish_id = ? AND student_id = ? AND status = ?'
    ).get(publishId, req.user!.userId, 'started') as any

    if (existing) {
      return { submissionId: existing.id }
    }

    const id = generateId()
    const now = Date.now()

    db.prepare('INSERT INTO submissions (id, publish_id, student_id, status, started_at) VALUES (?,?,?,?,?)').run(id, publishId, req.user!.userId, 'started', now)

    return { submissionId: id, startedAt: now }
  })

  // Save answer for a question (real-time)
  app.post('/api/student/exam/:publishId/answer', auth, async (req) => {
    const { publishId } = req.params as { publishId: string }
    const { submissionId, questionId, questionOrder, answer, maxScore } = req.body as any
    const db = getDb()

    // Verify submission belongs to student and hasn't expired
    const sub = db.prepare('SELECT * FROM submissions WHERE id = ? AND student_id = ?').get(submissionId, req.user!.userId) as any
    if (!sub || sub.status !== 'started') return { error: 'Invalid submission' }

    // Check time limit
    const publish = db.prepare('SELECT * FROM exam_publish WHERE id = ?').get(publishId) as any
    const elapsed = Date.now() - sub.started_at
    if (elapsed > publish.duration * 60 * 1000) {
      return { error: '考试时间已到' }
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

  // Submit exam
  app.post('/api/student/exam/:publishId/submit', auth, async (req) => {
    const { publishId } = req.params as { publishId: string }
    const { submissionId, violations } = req.body as any
    const db = getDb()
    const now = Date.now()

    const sub = db.prepare('SELECT * FROM submissions WHERE id = ? AND student_id = ?').get(submissionId, req.user!.userId) as any
    if (!sub || sub.status !== 'started') return { error: 'Invalid submission' }

    // Get exam questions for grading
    const publish = db.prepare('SELECT * FROM exam_publish WHERE id = ?').get(publishId) as any
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(publish.exam_id) as any
    const examQuestions = JSON.parse(exam.questions)

    // Build questions map
    const questionIds = examQuestions.map((eq: any) => eq.questionId)
    const questions = db.prepare(`SELECT * FROM questions WHERE id IN (${questionIds.map(() => '?').join(',')})`).all(...questionIds) as any[]
    const questionsMap = new Map(questions.map((q: any) => [q.id, { ...q, answer: JSON.parse(q.answer) }]))

    // Collect student answers from submission_answers
    const savedAnswers = db.prepare('SELECT * FROM submission_answers WHERE submission_id = ?').all(submissionId) as any[]
    const studentAnswers: Record<string, any> = {}
    for (const sa of savedAnswers) {
      studentAnswers[sa.question_id] = sa.answer ? JSON.parse(sa.answer) : null
    }

    // Auto-grade
    const grading = autoGradeSubmission(examQuestions, questionsMap, studentAnswers)

    // Update submission
    db.prepare('UPDATE submissions SET status = ?, total_score = ?, total_points = ?, violations = ?, submitted_at = ?, answers = ? WHERE id = ?').run(
      'submitted', grading.totalScore, grading.totalPoints, violations || 0, now, JSON.stringify(studentAnswers), submissionId
    )

    // Upsert submission_answers with scores
    for (const ga of grading.answers) {
      db.prepare('UPDATE submission_answers SET score = ?, is_correct = ?, graded_by = ? WHERE submission_id = ? AND question_id = ?').run(
        ga.score, ga.isCorrect, ga.gradedBy, submissionId, ga.questionId
      )
    }

    // Auto-mark submission as graded if all questions are auto-graded
    const allAuto = grading.answers.every((a: any) => a.gradedBy === 'auto')
    if (allAuto) {
      db.prepare('UPDATE submissions SET status = ?, graded_at = ? WHERE id = ?').run('graded', now, submissionId)
    }

    return { submission: db.prepare('SELECT * FROM submissions WHERE id = ?').get(submissionId) }
  })

  // My submissions
  app.get('/api/student/submissions', auth, async (req) => {
    const rows = getDb().prepare(`
      SELECT s.*, ep.title as exam_title
      FROM submissions s JOIN exam_publish ep ON s.publish_id = ep.id
      WHERE s.student_id = ?
      ORDER BY s.started_at DESC
    `).all(req.user!.userId)
    return { submissions: rows }
  })

  // Submission detail
  app.get('/api/student/submissions/:id', auth, async (req) => {
    const { id } = req.params as { id: string }
    const db = getDb()

    const sub = db.prepare('SELECT s.*, ep.title as exam_title FROM submissions s JOIN exam_publish ep ON s.publish_id = ep.id WHERE s.id = ? AND s.student_id = ?').get(id, req.user!.userId) as any
    if (!sub) return { error: 'Not found' }

    const answers = db.prepare('SELECT * FROM submission_answers WHERE submission_id = ? ORDER BY question_order').all(id)

    // Fetch question details
    const questionIds = answers.map((a: any) => a.question_id)
    const questions = questionIds.length > 0
      ? db.prepare(`SELECT * FROM questions WHERE id IN (${questionIds.map(() => '?').join(',')})`).all(...questionIds) as any[]
      : []

    const questionsMap = new Map(questions.map((q: any) => [q.id, { ...q, answer: JSON.parse(q.answer), options: q.options ? JSON.parse(q.options) : undefined }]))

    return {
      submission: sub,
      answers: answers.map((a: any) => ({
        ...a,
        studentAnswer: a.answer ? JSON.parse(a.answer) : null,
        question: questionsMap.get(a.question_id),
      })),
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
