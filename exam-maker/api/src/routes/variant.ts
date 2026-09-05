import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/index'
import { requireAuth, requireRole } from '../middleware/auth'
import { generateId } from '../utils/id'

const teacherAuth = { preHandler: [requireAuth, requireRole('teacher')] }

export async function variantRoutes(app: FastifyInstance) {
  // Generate A/B variants for a published exam
  app.post('/api/publish/:id/variants', teacherAuth, async (req) => {
    const { id } = req.params as { id: string }
    const db = getDb()

    const publish = db.prepare('SELECT * FROM exam_publish WHERE id = ? AND teacher_id = ?').get(id, req.user!.userId) as any
    if (!publish) return { error: 'Not found' }

    // Get class students for variant assignment
    const students = db.prepare(`
      SELECT cs.student_id FROM class_students cs WHERE cs.class_id = ?
      UNION SELECT ?  -- include all students if no class
    `).all(publish.class_id || '', req.user!.userId) as any[]

    // Randomly assign A/B
    for (const s of students) {
      const variant = Math.random() < 0.5 ? 'A' : 'B'
      db.prepare('INSERT OR REPLACE INTO exam_variant_assign (publish_id, student_id, variant) VALUES (?,?,?)').run(id, s.student_id, variant)
    }

    // Mark publish as having variants
    db.prepare('UPDATE exam_publish SET variant = ? WHERE id = ?').run('AB', id)

    return { assigned: students.length }
  })

  // Get variant for a student
  app.get('/api/publish/:id/variant', teacherAuth, async (req) => {
    const { id } = req.params as { id: string }
    const rows = getDb().prepare('SELECT * FROM exam_variant_assign WHERE publish_id = ? ORDER BY variant').all(id)
    return { assignments: rows }
  })

  // Create makeup exam
  app.post('/api/makeup', teacherAuth, async (req) => {
    const { originalPublishId, studentId, reason, useNewExam } = req.body as any
    const db = getDb()
    const id = generateId()

    let publishId = null
    if (useNewExam) {
      // Create a new publish for make-up
      const orig = db.prepare('SELECT * FROM exam_publish WHERE id = ?').get(originalPublishId) as any
      const newPublishId = generateId()
      db.prepare('INSERT INTO exam_publish (id, exam_id, teacher_id, class_id, title, duration, start_time, end_time, shuffle, retry, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(
        newPublishId, orig.exam_id, orig.teacher_id, orig.class_id, orig.title + ' (补考)', orig.duration, Date.now(), null, orig.shuffle, 0, 'published', Date.now()
      )
      publishId = newPublishId
    } else {
      publishId = originalPublishId
    }

    db.prepare('INSERT INTO makeup_exams (id, original_publish_id, student_id, publish_id, reason, status, created_at) VALUES (?,?,?,?,?,?,?)').run(id, originalPublishId, studentId, publishId, reason, 'approved', Date.now())

    return { makeup: db.prepare('SELECT * FROM makeup_exams WHERE id = ?').get(id) }
  })

  // List makeup exams
  app.get('/api/makeup', teacherAuth, async (req) => {
    const rows = getDb().prepare(`
      SELECT me.*, u.name as student_name, ep.title as exam_title
      FROM makeup_exams me
      JOIN users u ON me.student_id = u.id
      JOIN exam_publish ep ON me.original_publish_id = ep.id
      WHERE ep.teacher_id = ?
      ORDER BY me.created_at DESC
    `).all(req.user!.userId)
    return { makeups: rows }
  })
}
