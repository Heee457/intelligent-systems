import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/index'
import { requireAuth, requireRole } from '../middleware/auth'

const teacherAuth = { preHandler: [requireAuth, requireRole('teacher')] }

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
    const highGroup = new Set(subs.slice(0, cutoff).map((s: any) => s.id))
    const lowGroup = new Set(subs.slice(-cutoff).map((s: any) => s.id))

    const answers = db.prepare(`
      SELECT sa.question_id, sa.is_correct, sa.submission_id
      FROM submission_answers sa JOIN submissions s ON sa.submission_id = s.id
      WHERE s.publish_id = ?
    `).all(publishId) as any[]

    const questionMap: Record<string, { high: { correct: number; total: number }; low: { correct: number; total: number }; total_correct: number; total_answers: number; blank: number }> = {}

    for (const a of answers) {
      if (!questionMap[a.question_id]) questionMap[a.question_id] = { high: { correct: 0, total: 0 }, low: { correct: 0, total: 0 }, total_correct: 0, total_answers: 0, blank: 0 }
      const q = questionMap[a.question_id]
      q.total_answers++
      if (a.is_correct === 1) q.total_correct++
      if (a.is_correct === null || a.is_correct === 0 && !a.answer) q.blank++
      if (highGroup.has(a.submission_id)) { q.high.total++; if (a.is_correct === 1) q.high.correct++ }
      if (lowGroup.has(a.submission_id)) { q.low.total++; if (a.is_correct === 1) q.low.correct++ }
    }

    const result = Object.entries(questionMap).map(([qid, q]) => ({
      question_id: qid,
      correct_count: q.total_correct,
      wrong_count: q.total_answers - q.total_correct - q.blank,
      blank_count: q.blank,
      correct_rate: q.total_answers > 0 ? Math.round(q.total_correct / q.total_answers * 100) : 0,
      discrimination: q.high.total > 0 && q.low.total > 0
        ? Math.round((q.high.correct / q.high.total - q.low.correct / q.low.total) * 100) / 100
        : 0,
    }))

    return { questions: result }
  })

  // Pending grading
  app.get('/api/grading/pending', teacherAuth, async (req) => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT sa.*, s.student_id, u.name as student_name, ep.title as exam_title
      FROM submission_answers sa
      JOIN submissions s ON sa.submission_id = s.id
      JOIN exam_publish ep ON s.publish_id = ep.id
      JOIN users u ON s.student_id = u.id
      WHERE sa.graded_by = 'manual' AND sa.is_correct IS NULL AND ep.teacher_id = ?
      ORDER BY s.submitted_at
    `).all(req.user!.userId)
    // submissions has no teacher_id column; teacher ownership is on exam_publish.
    return { pending: rows }
  })

  // Grade an answer
  app.put('/api/grading/:answerId', teacherAuth, async (req) => {
    const { answerId } = req.params as { answerId: string }
    const { score, isCorrect, notes } = req.body as { score: number; isCorrect: number; notes?: string }
    const db = getDb()

    db.prepare('UPDATE submission_answers SET score = ?, is_correct = ?, graded_by = ? WHERE id = ?').run(score, isCorrect, 'manual', answerId)

    // Recalculate submission total
    const ans = db.prepare('SELECT submission_id FROM submission_answers WHERE id = ?').get(answerId) as any
    const totals = db.prepare('SELECT SUM(score) as total FROM submission_answers WHERE submission_id = ?').get(ans.submission_id) as any

    const allGraded = !db.prepare("SELECT id FROM submission_answers WHERE submission_id = ? AND is_correct IS NULL").get(ans.submission_id)

    db.prepare('UPDATE submissions SET total_score = ?, status = ?, graded_at = ?, grade_notes = ? WHERE id = ?').run(totals.total, allGraded ? 'graded' : 'submitted', allGraded ? Date.now() : null, notes || null, ans.submission_id)

    return { ok: true }
  })
}
