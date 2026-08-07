import type { FastifyInstance, FastifyRequest } from 'fastify'
import { getDb } from '../db/index'
import { requireAuth, requireRole } from '../middleware/auth'
import { generateId } from '../utils/id'

type AuthRequest = FastifyRequest & { user: NonNullable<FastifyRequest['user']> }

const auth = { preHandler: [requireAuth, requireRole('teacher')] }

export async function examRoutes(app: FastifyInstance) {
  // List — the teacher's exams, newest first
  app.get('/api/exams', auth, async (req) => {
    const rows = getDb().prepare('SELECT * FROM exams WHERE teacher_id = ? ORDER BY updated_at DESC').all((req as AuthRequest).user.userId)
    return rows.map(serializeExam)
  })

  // Create
  app.post('/api/exams', auth, async (req) => {
    const db = getDb()
    const now = Date.now()
    const id = generateId()
    const body = req.body as Record<string, any>

    db.prepare('INSERT INTO exams (id, teacher_id, title, questions, total_score, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)').run(
      id, (req as AuthRequest).user.userId, body.title, JSON.stringify(body.questions || []), body.totalScore || 0, 'draft', now, now
    )

    return { exam: serializeExam(db.prepare('SELECT * FROM exams WHERE id = ?').get(id)) }
  })

  // Get
  app.get('/api/exams/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const e = getDb().prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?').get(id, (req as AuthRequest).user.userId)
    if (!e) return reply.status(404).send({ error: 'Not found' })
    return { exam: serializeExam(e) }
  })

  // Update
  app.put('/api/exams/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, any>
    const db = getDb()
    const userId = (req as AuthRequest).user.userId

    const result = db.prepare('UPDATE exams SET title=?, questions=?, total_score=?, status=?, updated_at=? WHERE id=? AND teacher_id=?').run(
      body.title, JSON.stringify(body.questions || []), body.totalScore || 0, body.status || 'draft', Date.now(), id, userId
    )
    if (result.changes === 0) return reply.status(404).send({ error: 'Not found' })

    return { exam: serializeExam(db.prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?').get(id, userId)) }
  })

  // Delete
  app.delete('/api/exams/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const result = getDb().prepare('DELETE FROM exams WHERE id = ? AND teacher_id = ?').run(id, (req as AuthRequest).user.userId)
    if (result.changes === 0) return reply.status(404).send({ error: 'Not found' })
    return { ok: true }
  })

  // Auto-generate from rule — randomly pick questions from the teacher's pool per section
  app.post('/api/exams/generate', auth, async (req) => {
    const body = req.body as { name: string; sections: any[]; totalScore: number }
    const db = getDb()
    const now = Date.now()
    const userId = (req as AuthRequest).user.userId

    const examQuestions: any[] = []
    for (const section of body.sections || []) {
      let query = 'SELECT * FROM questions WHERE teacher_id = ? AND type = ?'
      const params: any[] = [userId, section.type]

      if (section.difficulty) {
        query += ' AND difficulty = ?'
        params.push(section.difficulty)
      }

      const pool = db.prepare(query).all(...params) as any[]
      // Random shuffle and pick
      const shuffled = pool.sort(() => Math.random() - 0.5)
      const picked = shuffled.slice(0, section.count)

      picked.forEach((q: any) => {
        examQuestions.push({
          questionId: q.id,
          score: section.scorePerQuestion,
          order: examQuestions.length + 1,
        })
      })
    }

    const id = generateId()
    const totalScore = examQuestions.reduce((s: number, q: any) => s + q.score, 0)

    db.prepare('INSERT INTO exams (id, teacher_id, title, questions, total_score, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)').run(
      id, userId, body.name, JSON.stringify(examQuestions), totalScore, 'draft', now, now
    )

    return { exam: serializeExam(db.prepare('SELECT * FROM exams WHERE id = ?').get(id)) }
  })
}

function serializeExam(r: any) {
  return {
    id: r.id, title: r.title,
    questions: JSON.parse(r.questions),
    totalScore: r.total_score,
    status: r.status,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}
