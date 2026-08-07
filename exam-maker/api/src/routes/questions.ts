import type { FastifyInstance, FastifyRequest } from 'fastify'
import { getDb } from '../db/index'
import { requireAuth, requireRole } from '../middleware/auth'
import { generateId } from '../utils/id'

type AuthRequest = FastifyRequest & { user: NonNullable<FastifyRequest['user']> }

export async function questionRoutes(app: FastifyInstance) {
  const auth = { preHandler: [requireAuth, requireRole('teacher')] }

  // List — with pagination and filters
  app.get('/api/questions', auth, async (req) => {
    const { page = '1', limit = '20', type, difficulty, kp, keyword } = req.query as Record<string, string>
    const db = getDb()
    const userId = (req as AuthRequest).user.userId

    const pageNum = Math.max(1, parseInt(page) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20))

    const conditions = ['teacher_id = ?']
    const params: unknown[] = [userId]

    if (type) { conditions.push('type = ?'); params.push(type) }
    if (difficulty) { conditions.push('difficulty = ?'); params.push(difficulty) }
    if (kp) { conditions.push('knowledge_points LIKE ?'); params.push(`%${kp}%`) }
    if (keyword) { conditions.push('(title LIKE ? OR content LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`) }

    const where = conditions.join(' AND ')
    const offset = (pageNum - 1) * limitNum

    const total = (db.prepare(`SELECT COUNT(*) as count FROM questions WHERE ${where}`).get(...params) as { count: number }).count
    const rows = db.prepare(`SELECT * FROM questions WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limitNum, offset)

    return {
      questions: rows.map((r: any) => serializeQuestion(r)),
      total,
      page: pageNum,
      limit: limitNum,
    }
  })

  // Create
  app.post('/api/questions', auth, async (req) => {
    const db = getDb()
    const now = Date.now()
    const id = generateId()
    const body = req.body as Record<string, any>

    db.prepare(`INSERT INTO questions (id, teacher_id, type, title, content, options, answer, difficulty, knowledge_points, explanation, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, (req as AuthRequest).user.userId, body.type, body.title, body.content,
      body.options ? JSON.stringify(body.options) : null,
      JSON.stringify(body.answer),
      body.difficulty || 'medium',
      body.knowledgePoints ? JSON.stringify(body.knowledgePoints) : null,
      body.explanation || null, now, now
    )

    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(id)
    return { question: serializeQuestion(question) }
  })

  // Import (JSON array of questions, teacher-owned)
  app.post('/api/questions/import', auth, async (req) => {
    const body = req.body as { questions?: any[] }
    const db = getDb()
    const now = Date.now()
    const userId = (req as AuthRequest).user.userId
    let count = 0

    for (const q of body.questions || []) {
      if (!q || !q.type || !q.title || !q.content) continue
      const id = generateId()
      db.prepare(`INSERT INTO questions (id, teacher_id, type, title, content, options, answer, difficulty, knowledge_points, explanation, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, userId, q.type, q.title, q.content,
        q.options ? JSON.stringify(q.options) : null,
        JSON.stringify(q.answer || defaultAnswer(q.type)),
        q.difficulty || 'medium',
        q.knowledgePoints ? JSON.stringify(q.knowledgePoints) : null,
        q.explanation || null, now, now
      )
      count++
    }

    return { imported: count }
  })

  // Export — all of the teacher's questions, serialized
  app.get('/api/questions/export', auth, async (req) => {
    const db = getDb()
    const userId = (req as AuthRequest).user.userId
    const rows = db.prepare('SELECT * FROM questions WHERE teacher_id = ? ORDER BY created_at').all(userId)
    return rows.map((r: any) => serializeQuestion(r))
  })

  // Get
  app.get('/api/questions/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const q = getDb().prepare('SELECT * FROM questions WHERE id = ? AND teacher_id = ?').get(id, (req as AuthRequest).user.userId)
    if (!q) return reply.status(404).send({ error: 'Not found' })
    return { question: serializeQuestion(q) }
  })

  // Update
  app.put('/api/questions/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, any>
    const db = getDb()
    const userId = (req as AuthRequest).user.userId

    const result = db.prepare(`UPDATE questions SET type=?, title=?, content=?, options=?, answer=?, difficulty=?, knowledge_points=?, explanation=?, updated_at=? WHERE id=? AND teacher_id=?`).run(
      body.type, body.title, body.content,
      body.options ? JSON.stringify(body.options) : null,
      JSON.stringify(body.answer),
      body.difficulty, body.knowledgePoints ? JSON.stringify(body.knowledgePoints) : null,
      body.explanation || null, Date.now(), id, userId
    )
    if (result.changes === 0) return reply.status(404).send({ error: 'Not found' })

    return { question: serializeQuestion(db.prepare('SELECT * FROM questions WHERE id = ? AND teacher_id = ?').get(id, userId)) }
  })

  // Delete
  app.delete('/api/questions/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = (req as AuthRequest).user.userId
    const result = getDb().prepare('DELETE FROM questions WHERE id = ? AND teacher_id = ?').run(id, userId)
    if (result.changes === 0) return reply.status(404).send({ error: 'Not found' })
    return { ok: true }
  })
}

function serializeQuestion(r: any) {
  return {
    id: r.id, type: r.type, title: r.title, content: r.content,
    options: r.options ? JSON.parse(r.options) : undefined,
    answer: JSON.parse(r.answer),
    difficulty: r.difficulty,
    knowledgePoints: r.knowledge_points ? JSON.parse(r.knowledge_points) : [],
    explanation: r.explanation, createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

function defaultAnswer(type: string) {
  switch (type) {
    case 'choice': return { type: 'choice', selectedOptionId: '' }
    case 'truefalse': return { type: 'truefalse', value: true }
    case 'fillblank': return { type: 'fillblank', blanks: [''] }
    case 'essay': return { type: 'essay', referenceAnswer: '' }
    default: return { type: 'essay', referenceAnswer: '' }
  }
}
