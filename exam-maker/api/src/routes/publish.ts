import type { FastifyInstance, FastifyRequest } from 'fastify'
import { getDb } from '../db/index'
import { requireAuth, requireRole } from '../middleware/auth'
import { generateId } from '../utils/id'

type AuthRequest = FastifyRequest & { user: NonNullable<FastifyRequest['user']> }

const auth = { preHandler: [requireAuth, requireRole('teacher')] }

export async function publishRoutes(app: FastifyInstance) {
  // Create a publish record
  app.post('/api/publish', auth, async (req, reply) => {
    const body = req.body as { examId: string; classId?: string; title: string; duration: number; startTime?: number; endTime?: number; shuffle?: boolean; retry?: number }
    const userId = (req as AuthRequest).user.userId
    const db = getDb()

    if (!body.examId || !body.title || !body.duration) {
      return reply.status(400).send({ error: 'examId, title and duration are required' })
    }

    // Ownership: the exam being published must belong to the teacher
    const exam = db.prepare('SELECT id FROM exams WHERE id = ? AND teacher_id = ?').get(body.examId, userId)
    if (!exam) return reply.status(404).send({ error: 'Exam not found' })

    // Ownership: if a class is targeted, it must be the teacher's own class
    if (body.classId) {
      const cls = db.prepare('SELECT id FROM classes WHERE id = ? AND teacher_id = ?').get(body.classId, userId)
      if (!cls) return reply.status(404).send({ error: 'Class not found' })
    }

    const id = generateId()
    db.prepare('INSERT INTO exam_publish (id, exam_id, teacher_id, class_id, title, duration, start_time, end_time, shuffle, retry, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(
      id, body.examId, userId, body.classId || null, body.title, body.duration,
      body.startTime || null, body.endTime || null,
      body.shuffle ? 1 : 0, body.retry || 0, 'published', Date.now()
    )

    return { publish: db.prepare('SELECT * FROM exam_publish WHERE id = ?').get(id) }
  })

  // List — the teacher's publishes, newest first
  app.get('/api/publish', auth, async (req) => {
    const rows = getDb().prepare('SELECT * FROM exam_publish WHERE teacher_id = ? ORDER BY created_at DESC').all((req as AuthRequest).user.userId)
    return { publishes: rows }
  })

  // Get
  app.get('/api/publish/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const p = getDb().prepare('SELECT * FROM exam_publish WHERE id = ? AND teacher_id = ?').get(id, (req as AuthRequest).user.userId)
    if (!p) return reply.status(404).send({ error: 'Not found' })
    return { publish: p }
  })

  // Update
  app.put('/api/publish/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, any>
    const result = getDb().prepare('UPDATE exam_publish SET title=?, duration=?, start_time=?, end_time=?, shuffle=?, retry=?, status=? WHERE id=? AND teacher_id=?').run(
      body.title, body.duration, body.startTime || null, body.endTime || null, body.shuffle ? 1 : 0, body.retry || 0, body.status || 'published', id, (req as AuthRequest).user.userId
    )
    if (result.changes === 0) return reply.status(404).send({ error: 'Not found' })
    return { ok: true }
  })

  // Delete
  app.delete('/api/publish/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const result = getDb().prepare('DELETE FROM exam_publish WHERE id = ? AND teacher_id = ?').run(id, (req as AuthRequest).user.userId)
    if (result.changes === 0) return reply.status(404).send({ error: 'Not found' })
    return { ok: true }
  })
}
