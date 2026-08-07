import type { FastifyInstance, FastifyRequest } from 'fastify'
import { getDb } from '../db/index'
import { requireAuth, requireRole } from '../middleware/auth'
import { generateId } from '../utils/id'

type AuthRequest = FastifyRequest & { user: NonNullable<FastifyRequest['user']> }

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const auth = { preHandler: [requireAuth, requireRole('teacher')] }

function ownedClass(classId: string, teacherId: string) {
  return getDb().prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?').get(classId, teacherId)
}

export async function classRoutes(app: FastifyInstance) {
  // List — the teacher's classes with live student counts, newest first
  app.get('/api/classes', auth, async (req) => {
    const db = getDb()
    const userId = (req as AuthRequest).user.userId
    const rows = db.prepare('SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at DESC').all(userId) as any[]
    return rows.map((c) => {
      const { c: count } = db.prepare('SELECT COUNT(*) as c FROM class_students WHERE class_id = ?').get(c.id) as { c: number }
      return { ...c, studentCount: count }
    })
  })

  // Create
  app.post('/api/classes', auth, async (req) => {
    const db = getDb()
    const userId = (req as AuthRequest).user.userId
    const { name, description } = req.body as { name: string; description?: string }
    const id = generateId()
    const joinCode = randomCode()
    const now = Date.now()

    db.prepare('INSERT INTO classes (id, teacher_id, name, description, join_code, created_at) VALUES (?,?,?,?,?,?)').run(id, userId, name, description || '', joinCode, now)

    return { class: db.prepare('SELECT * FROM classes WHERE id = ?').get(id) }
  })

  // Get
  app.get('/api/classes/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const c = ownedClass(id, (req as AuthRequest).user.userId)
    if (!c) return reply.status(404).send({ error: 'Not found' })
    return { class: c }
  })

  // Update
  app.put('/api/classes/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = (req as AuthRequest).user.userId
    const { name, description } = req.body as { name: string; description?: string }
    const result = getDb().prepare('UPDATE classes SET name=?, description=? WHERE id=? AND teacher_id=?').run(name, description || '', id, userId)
    if (result.changes === 0) return reply.status(404).send({ error: 'Not found' })
    return { ok: true }
  })

  // Delete — also removes membership rows (scoped to the teacher's own class)
  app.delete('/api/classes/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = (req as AuthRequest).user.userId
    const db = getDb()
    if (!ownedClass(id, userId)) return reply.status(404).send({ error: 'Not found' })
    db.prepare('DELETE FROM class_students WHERE class_id = ?').run(id)
    db.prepare('DELETE FROM classes WHERE id = ? AND teacher_id = ?').run(id, userId)
    return { ok: true }
  })

  // Students in a class
  app.get('/api/classes/:id/students', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    if (!ownedClass(id, (req as AuthRequest).user.userId)) return reply.status(404).send({ error: 'Not found' })
    const rows = db.prepare(`
      SELECT u.id, u.name, u.email, cs.joined_at
      FROM class_students cs JOIN users u ON cs.student_id = u.id
      WHERE cs.class_id = ?
      ORDER BY cs.joined_at
    `).all(id) as any[]
    return { students: rows }
  })

  // Add students by email (existing student accounts only)
  app.post('/api/classes/:id/students', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = (req as AuthRequest).user.userId
    const db = getDb()
    if (!ownedClass(id, userId)) return reply.status(404).send({ error: 'Not found' })

    const { emails } = req.body as { emails?: string[] }
    const now = Date.now()
    let added = 0
    const stmt = db.prepare('INSERT OR IGNORE INTO class_students (class_id, student_id, joined_at) VALUES (?,?,?)')

    for (const raw of emails || []) {
      const email = String(raw).trim()
      if (!email) continue
      const student = db.prepare('SELECT id FROM users WHERE email = ? AND role = ?').get(email, 'student') as { id: string } | undefined
      if (!student) continue
      const result = stmt.run(id, student.id, now)
      if (result.changes > 0) added++
    }

    return { added }
  })

  // Remove a student
  app.delete('/api/classes/:id/students/:sid', auth, async (req, reply) => {
    const { id, sid } = req.params as { id: string; sid: string }
    const userId = (req as AuthRequest).user.userId
    const db = getDb()
    if (!ownedClass(id, userId)) return reply.status(404).send({ error: 'Not found' })
    db.prepare('DELETE FROM class_students WHERE class_id = ? AND student_id = ?').run(id, sid)
    return { ok: true }
  })
}
