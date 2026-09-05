import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/index'
import { requireAuth, requireRole } from '../middleware/auth'
import { formatAnswerForReview, suggestManualGrade } from '../pipeline/grading'

const teacherAuth = { preHandler: [requireAuth, requireRole('teacher')] }

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}


function computeExamStats(publishId: string) {
  const db = getDb()
  const subs = db.prepare("SELECT * FROM submissions WHERE publish_id = ? AND status IN ('submitted','graded')").all(publishId) as any[]
  if (subs.length === 0) return null

  const scores = subs.map((s: any) => s.total_score || 0).sort((a: number, b: number) => a - b)
  const total = scores.reduce((a: number, b: number) => a + b, 0)
  const avg = total / scores.length
  const median = scores.length % 2 === 0 ? (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2 : scores[Math.floor(scores.length / 2)]
  const maxScore = Math.max(...scores)
  const minScore = Math.min(...scores)
  const maxPoints = subs[0].total_points || 100
  const passCount = scores.filter((s: number) => s / maxPoints >= 0.6).length

  const dist: Record<string, number> = { '0-59': 0, '60-69': 0, '70-79': 0, '80-89': 0, '90-100': 0 }
  for (const s of scores) {
    const pct = (s / maxPoints) * 100
    if (pct < 60) dist['0-59']++
    else if (pct < 70) dist['60-69']++
    else if (pct < 80) dist['70-79']++
    else if (pct < 90) dist['80-89']++
    else dist['90-100']++
  }

  return { studentCount: subs.length, avg_score: Math.round(avg * 10) / 10, median_score: median, max_score: maxScore, min_score: minScore, pass_count: passCount, pass_rate: Math.round(passCount / subs.length * 100), score_dist: JSON.stringify(dist), max_points: maxPoints, computed_at: Date.now() }
}

export async function statsRoutes(app: FastifyInstance) {
  // Exam stats
  app.get('/api/stats/exam/:publishId', teacherAuth, async (req) => {
    const { publishId } = req.params as { publishId: string }
    const db = getDb()
    const cached = db.prepare('SELECT * FROM exam_stats WHERE publish_id = ?').get(publishId) as any
    return { stats: cached || computeExamStats(publishId) }
  })

  // Recompute
  app.post('/api/stats/exam/:publishId/recompute', teacherAuth, async (req) => {
    const { publishId } = req.params as { publishId: string }
    const db = getDb()
    const stats = computeExamStats(publishId)
    if (!stats) return { error: 'No submissions' }

    db.prepare(`INSERT OR REPLACE INTO exam_stats (publish_id, student_count, avg_score, median_score, max_score, min_score, pass_count, pass_rate, score_dist, computed_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(publishId, stats.studentCount, stats.avg_score, stats.median_score, stats.max_score, stats.min_score, stats.pass_count, stats.pass_rate, stats.score_dist, stats.computed_at)

    return { stats: db.prepare('SELECT * FROM exam_stats WHERE publish_id = ?').get(publishId) }
  })

  // Question analysis
  app.get('/api/stats/exam/:publishId/questions', teacherAuth, async (req) => {
    const { publishId } = req.params as { publishId: string }
    const db = getDb()

    const subs = db.prepare("SELECT id, total_score FROM submissions WHERE publish_id = ? AND status IN ('submitted','graded') ORDER BY total_score DESC").all(publishId) as any[]
    if (subs.length === 0) return { questions: [] }

    const totalSubs = subs.length
    const cutoff = Math.ceil(totalSubs * 0.27)
    const highGroup = new Set(subs.slice(0, cutoff).map((sub: any) => sub.id))
    const lowGroup = new Set(subs.slice(-cutoff).map((sub: any) => sub.id))

    const answers = db.prepare(`
      SELECT
        sa.question_id,
        sa.is_correct,
        sa.submission_id,
        sa.answer,
        sa.score,
        sa.max_score,
        q.title,
        q.type,
        q.knowledge_points
      FROM submission_answers sa
      JOIN submissions s ON sa.submission_id = s.id
      JOIN questions q ON sa.question_id = q.id
      WHERE s.publish_id = ?
    `).all(publishId) as any[]

    const questionMap: Record<string, { high: { correct: number; total: number }; low: { correct: number; total: number }; total_correct: number; total_answers: number; blank: number; score: number; maxScore: number; title: string; type: string; knowledgePoints: string[] }> = {}

    for (const answer of answers) {
      if (!questionMap[answer.question_id]) {
        questionMap[answer.question_id] = {
          high: { correct: 0, total: 0 },
          low: { correct: 0, total: 0 },
          total_correct: 0,
          total_answers: 0,
          blank: 0,
          score: 0,
          maxScore: 0,
          title: answer.title,
          type: answer.type,
          knowledgePoints: parseJson<string[]>(answer.knowledge_points, []),
        }
      }
      const item = questionMap[answer.question_id]
      item.total_answers += 1
      item.score += Number(answer.score) || 0
      item.maxScore += Number(answer.max_score) || 0
      if (answer.is_correct === 1) item.total_correct += 1
      if (!answer.answer || answer.answer === 'null') item.blank += 1
      if (highGroup.has(answer.submission_id)) { item.high.total++; if (answer.is_correct === 1) item.high.correct++ }
      if (lowGroup.has(answer.submission_id)) { item.low.total++; if (answer.is_correct === 1) item.low.correct++ }
    }

    const result = Object.entries(questionMap).map(([qid, item]) => {
      const scoreRate = item.maxScore > 0 ? Math.round(item.score / item.maxScore * 100) : 0
      const discrimination = item.high.total > 0 && item.low.total > 0
        ? Math.round((item.high.correct / item.high.total - item.low.correct / item.low.total) * 100) / 100
        : 0
      return {
        question_id: qid,
        title: item.title,
        type: item.type,
        knowledgePoints: item.knowledgePoints,
        correct_count: item.total_correct,
        wrong_count: item.total_answers - item.total_correct - item.blank,
        blank_count: item.blank,
        correct_rate: item.total_answers > 0 ? Math.round(item.total_correct / item.total_answers * 100) : 0,
        score_rate: scoreRate,
        discrimination,
        reviewFlag: scoreRate < 60 || discrimination < 0.2,
      }
    })

    return { questions: result }
  })

  // Knowledge point analysis
  app.get('/api/stats/exam/:publishId/knowledge', teacherAuth, async (req, reply) => {
    const { publishId } = req.params as { publishId: string }
    const db = getDb()
    const publish = db.prepare('SELECT id FROM exam_publish WHERE id = ? AND teacher_id = ?').get(publishId, req.user!.userId)
    if (!publish) return reply.status(404).send({ error: 'Not found' })

    const rows = db.prepare(`
      SELECT
        sa.question_id,
        sa.score,
        sa.max_score,
        sa.is_correct,
        sa.answer,
        q.title,
        q.type,
        q.knowledge_points
      FROM submission_answers sa
      JOIN submissions s ON sa.submission_id = s.id
      JOIN questions q ON sa.question_id = q.id
      WHERE s.publish_id = ? AND s.status IN ('submitted','graded')
    `).all(publishId) as any[]

    const map = new Map<string, { knowledgePoint: string; answerCount: number; questionIds: Set<string>; score: number; maxScore: number; wrongCount: number; blankCount: number; examples: any[] }>()

    for (const row of rows) {
      const points = parseJson<string[]>(row.knowledge_points, [])
      const kps = points.length > 0 ? points : ['未标注']
      const score = Number(row.score) || 0
      const maxScore = Number(row.max_score) || 0
      const isWrong = maxScore > 0 && score < maxScore
      const isBlank = !row.answer || row.answer === 'null'

      for (const kp of kps) {
        const item = map.get(kp) || { knowledgePoint: kp, answerCount: 0, questionIds: new Set<string>(), score: 0, maxScore: 0, wrongCount: 0, blankCount: 0, examples: [] }
        item.answerCount += 1
        item.questionIds.add(row.question_id)
        item.score += score
        item.maxScore += maxScore
        if (isWrong) item.wrongCount += 1
        if (isBlank) item.blankCount += 1
        if (isWrong && item.examples.length < 3) {
          item.examples.push({ questionId: row.question_id, title: row.title, type: row.type, score, maxScore })
        }
        map.set(kp, item)
      }
    }

    const knowledgePoints = Array.from(map.values()).map((item) => {
      const scoreRate = item.maxScore > 0 ? Math.round(item.score / item.maxScore * 100) : 0
      return {
        knowledgePoint: item.knowledgePoint,
        answerCount: item.answerCount,
        questionCount: item.questionIds.size,
        avgScoreRate: scoreRate,
        lostScore: Math.round((item.maxScore - item.score) * 10) / 10,
        wrongCount: item.wrongCount,
        blankCount: item.blankCount,
        level: scoreRate >= 80 ? 'good' : scoreRate >= 60 ? 'watch' : 'weak',
        examples: item.examples,
      }
    }).sort((a, b) => a.avgScoreRate - b.avgScoreRate || b.lostScore - a.lostScore)

    return { knowledgePoints }
  })

  // Exam abnormal events
  app.get('/api/stats/exam/:publishId/events', teacherAuth, async (req, reply) => {
    const { publishId } = req.params as { publishId: string }
    const db = getDb()
    const publish = db.prepare('SELECT id FROM exam_publish WHERE id = ? AND teacher_id = ?').get(publishId, req.user!.userId)
    if (!publish) return reply.status(404).send({ error: 'Not found' })

    const events = db.prepare('SELECT ee.*, u.name as student_name, s.violations, s.submitted_late FROM exam_events ee JOIN submissions s ON ee.submission_id = s.id JOIN users u ON ee.student_id = u.id WHERE ee.publish_id = ? ORDER BY ee.created_at DESC LIMIT 200').all(publishId).map((event: any) => ({
      ...event,
      detail: event.detail ? JSON.parse(event.detail) : null,
    }))
    return { events }
  })

  // Pending grading
  app.get('/api/grading/pending', teacherAuth, async (req) => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT
        sa.*,
        s.student_id,
        s.submitted_at,
        s.violations,
        s.submitted_late,
        u.name as student_name,
        ep.title as exam_title,
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
      JOIN users u ON s.student_id = u.id
      JOIN questions q ON sa.question_id = q.id
      WHERE sa.graded_by = 'manual' AND sa.is_correct IS NULL AND ep.teacher_id = ?
      ORDER BY s.submitted_at, sa.question_order
    `).all(req.user!.userId) as any[]

    return {
      pending: rows.map((row: any) => {
        const studentAnswer = parseJson<Record<string, any> | null>(row.answer, null)
        const correctAnswer = parseJson<Record<string, any>>(row.correct_answer, {})
        const suggestion = row.ai_feedback
          ? {
              score: row.ai_score ?? 0,
              confidence: row.ai_confidence ?? 0,
              feedback: row.ai_feedback,
              matchedKeywords: [],
              missingKeywords: [],
            }
          : suggestManualGrade(row.question_type, correctAnswer, studentAnswer, Number(row.max_score) || 0)

        return {
          id: row.id,
          submissionId: row.submission_id,
          questionId: row.question_id,
          questionOrder: row.question_order,
          score: row.score,
          maxScore: row.max_score,
          isCorrect: row.is_correct,
          teacherNotes: row.teacher_notes || '',
          studentId: row.student_id,
          studentName: row.student_name,
          examTitle: row.exam_title,
          submittedAt: row.submitted_at,
          violations: row.violations || 0,
          submittedLate: Boolean(row.submitted_late),
          studentAnswer,
          studentAnswerText: formatAnswerForReview(studentAnswer),
          referenceAnswerText: formatAnswerForReview(correctAnswer),
          aiSuggestion: suggestion,
          question: {
            id: row.question_id,
            type: row.question_type,
            title: row.question_title,
            content: row.question_content,
            options: parseJson(row.question_options, undefined),
            answer: correctAnswer,
            explanation: row.question_explanation || '',
            difficulty: row.question_difficulty,
            knowledgePoints: parseJson(row.question_knowledge_points, []),
          },
        }
      }),
    }
  })

  // Grade an answer
  app.put('/api/grading/:answerId', teacherAuth, async (req, reply) => {
    const { answerId } = req.params as { answerId: string }
    const { score, isCorrect, notes, useAiSuggestion } = req.body as { score: number; isCorrect?: number; notes?: string; useAiSuggestion?: boolean }
    const db = getDb()

    const ans = db.prepare(`
      SELECT sa.*, s.id as submission_id, ep.teacher_id
      FROM submission_answers sa
      JOIN submissions s ON sa.submission_id = s.id
      JOIN exam_publish ep ON s.publish_id = ep.id
      WHERE sa.id = ? AND ep.teacher_id = ?
    `).get(answerId, req.user!.userId) as any
    if (!ans) return reply.status(404).send({ error: 'Not found' })

    const maxScore = Number(ans.max_score) || 0
    const finalScore = Math.max(0, Math.min(maxScore, Number(score) || 0))
    const finalCorrect = isCorrect !== undefined ? isCorrect : (finalScore >= maxScore ? 1 : finalScore > 0 ? 0 : 0)

    db.prepare('UPDATE submission_answers SET score = ?, is_correct = ?, graded_by = ?, teacher_notes = ? WHERE id = ?').run(
      finalScore,
      finalCorrect,
      useAiSuggestion ? 'ai-assisted' : 'manual',
      notes || null,
      answerId,
    )

    const totals = db.prepare('SELECT SUM(score) as total FROM submission_answers WHERE submission_id = ?').get(ans.submission_id) as any
    const allGraded = !db.prepare('SELECT id FROM submission_answers WHERE submission_id = ? AND is_correct IS NULL').get(ans.submission_id)

    db.prepare('UPDATE submissions SET total_score = ?, status = ?, graded_at = ?, grade_notes = ? WHERE id = ?').run(
      totals.total || 0,
      allGraded ? 'graded' : 'submitted',
      allGraded ? Date.now() : null,
      notes || null,
      ans.submission_id,
    )

    return { ok: true, score: finalScore }
  })

}
