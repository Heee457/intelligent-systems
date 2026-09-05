import type { FastifyInstance, FastifyRequest } from 'fastify'
import { getDb } from '../db/index'
import { requireAuth, requireRole } from '../middleware/auth'
import { generateId } from '../utils/id'

type AuthRequest = FastifyRequest & { user: NonNullable<FastifyRequest['user']> }

type AntiCheatLevel = 'off' | 'record' | 'strict'

type PublishBody = {
  examId: string
  classId?: string
  classIds?: string[]
  title: string
  duration: number
  startTime?: number | string | null
  endTime?: number | string | null
  scoreReleaseTime?: number | string | null
  answerReleaseTime?: number | string | null
  shuffle?: boolean
  retry?: number
  allowLateSubmit?: boolean
  antiCheatLevel?: AntiCheatLevel
  maxViolations?: number
  status?: string
}

function normalizeEpoch(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function normalizeAntiCheat(value: unknown): AntiCheatLevel {
  return value === 'off' || value === 'strict' ? value : 'record'
}

function normalizeNonNegative(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
}

function normalizeClassIds(body: PublishBody) {
  const raw = Array.isArray(body.classIds) ? body.classIds : body.classId ? [body.classId] : []
  return [...new Set(raw.map((id) => String(id).trim()).filter(Boolean))]
}

const auth = { preHandler: [requireAuth, requireRole('teacher')] }

export async function publishRoutes(app: FastifyInstance) {
  // Create a publish record
  app.post('/api/publish', auth, async (req, reply) => {
    const body = req.body as PublishBody
    const userId = (req as AuthRequest).user.userId
    const db = getDb()

    const duration = Math.max(0, Number(body.duration) || 0)
    const startTime = normalizeEpoch(body.startTime)
    const endTime = normalizeEpoch(body.endTime)
    const scoreReleaseTime = normalizeEpoch(body.scoreReleaseTime)
    const answerReleaseTime = normalizeEpoch(body.answerReleaseTime)
    const antiCheatLevel = normalizeAntiCheat(body.antiCheatLevel)
    const maxViolations = Math.max(1, normalizeNonNegative(body.maxViolations, 3))
    const classIds = normalizeClassIds(body)

    if (!body.examId || !body.title || duration <= 0) {
      return reply.status(400).send({ error: 'examId, title and duration are required' })
    }
    if (classIds.length === 0) {
      return reply.status(400).send({ error: '请选择至少一个班级' })
    }
    if (startTime && endTime && endTime <= startTime) {
      return reply.status(400).send({ error: '截止时间必须晚于开始时间' })
    }

    // Ownership: the exam being published must belong to the teacher.
    const exam = db.prepare('SELECT id FROM exams WHERE id = ? AND teacher_id = ?').get(body.examId, userId)
    if (!exam) return reply.status(404).send({ error: 'Exam not found' })

    const placeholders = classIds.map(() => '?').join(',')
    const ownedClasses = db.prepare('SELECT id FROM classes WHERE teacher_id = ? AND id IN (' + placeholders + ')').all(userId, ...classIds) as Array<{ id: string }>
    if (ownedClasses.length !== classIds.length) return reply.status(404).send({ error: 'Class not found' })

    const now = Date.now()
    const insert = db.prepare('INSERT INTO exam_publish (id, exam_id, teacher_id, class_id, title, duration, start_time, end_time, shuffle, retry, allow_late_submit, score_release_time, answer_release_time, anti_cheat_level, max_violations, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    const ids = classIds.map(() => generateId())
    const tx = db.transaction(() => {
      classIds.forEach((classId, index) => {
        insert.run(
          ids[index], body.examId, userId, classId, body.title, duration,
          startTime, endTime,
          body.shuffle ? 1 : 0, normalizeNonNegative(body.retry), body.allowLateSubmit ? 1 : 0,
          scoreReleaseTime, answerReleaseTime, antiCheatLevel, maxViolations, 'published', now,
        )
      })
    })
    tx()

    db.prepare('UPDATE exams SET locked_at = COALESCE(locked_at, ?) WHERE id = ? AND teacher_id = ?').run(now, body.examId, userId)
    const publishes = ids.map((id) => serializePublish(db, db.prepare('SELECT * FROM exam_publish WHERE id = ?').get(id)))
    return { publish: publishes[0], publishes }
  })

  // List — the teacher's publishes, newest first
  app.get('/api/publish', auth, async (req) => {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM exam_publish WHERE teacher_id = ? ORDER BY created_at DESC').all((req as AuthRequest).user.userId)
    return { publishes: rows.map((row) => serializePublish(db, row)) }
  })

  // Get
  app.get('/api/publish/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const p = db.prepare('SELECT * FROM exam_publish WHERE id = ? AND teacher_id = ?').get(id, (req as AuthRequest).user.userId)
    if (!p) return reply.status(404).send({ error: 'Not found' })
    return { publish: serializePublish(db, p) }
  })

  // Update
  app.put('/api/publish/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<PublishBody>
    const userId = (req as AuthRequest).user.userId
    const db = getDb()
    const existing = db.prepare('SELECT * FROM exam_publish WHERE id = ? AND teacher_id = ?').get(id, userId) as any
    if (!existing) return reply.status(404).send({ error: 'Not found' })

    const duration = body.duration !== undefined ? Math.max(0, Number(body.duration) || 0) : existing.duration
    const startTime = body.startTime !== undefined ? normalizeEpoch(body.startTime) : existing.start_time
    const endTime = body.endTime !== undefined ? normalizeEpoch(body.endTime) : existing.end_time
    const scoreReleaseTime = body.scoreReleaseTime !== undefined ? normalizeEpoch(body.scoreReleaseTime) : existing.score_release_time
    const answerReleaseTime = body.answerReleaseTime !== undefined ? normalizeEpoch(body.answerReleaseTime) : existing.answer_release_time
    const antiCheatLevel = body.antiCheatLevel !== undefined ? normalizeAntiCheat(body.antiCheatLevel) : (existing.anti_cheat_level || 'record')
    const maxViolations = body.maxViolations !== undefined ? Math.max(1, normalizeNonNegative(body.maxViolations, 3)) : (existing.max_violations || 3)

    if (duration <= 0) return reply.status(400).send({ error: '考试时长必须大于 0' })
    if (startTime && endTime && endTime <= startTime) {
      return reply.status(400).send({ error: '截止时间必须晚于开始时间' })
    }

    const result = db.prepare('UPDATE exam_publish SET title=?, duration=?, start_time=?, end_time=?, shuffle=?, retry=?, allow_late_submit=?, score_release_time=?, answer_release_time=?, anti_cheat_level=?, max_violations=?, status=? WHERE id=? AND teacher_id=?').run(
      body.title !== undefined ? body.title : existing.title,
      duration,
      startTime || null,
      endTime || null,
      body.shuffle !== undefined ? (body.shuffle ? 1 : 0) : existing.shuffle,
      body.retry !== undefined ? normalizeNonNegative(body.retry) : existing.retry,
      body.allowLateSubmit !== undefined ? (body.allowLateSubmit ? 1 : 0) : existing.allow_late_submit,
      scoreReleaseTime || null,
      answerReleaseTime || null,
      antiCheatLevel,
      maxViolations,
      body.status || existing.status || 'published',
      id,
      userId,
    )
    if (result.changes === 0) return reply.status(404).send({ error: 'Not found' })
    return { publish: serializePublish(db, db.prepare('SELECT * FROM exam_publish WHERE id = ? AND teacher_id = ?').get(id, userId)) }
  })

  // Delete
  app.delete('/api/publish/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const result = getDb().prepare('DELETE FROM exam_publish WHERE id = ? AND teacher_id = ?').run(id, (req as AuthRequest).user.userId)
    if (result.changes === 0) return reply.status(404).send({ error: 'Not found' })
    return { ok: true }
  })
}


function serializePublish(db: ReturnType<typeof getDb>, row: any) {
  if (!row) return row
  const classInfo = row.class_id
    ? db.prepare('SELECT id, name FROM classes WHERE id = ?').get(row.class_id) as any
    : null
  const examInfo = db.prepare('SELECT id, title, status FROM exams WHERE id = ?').get(row.exam_id) as any
  const studentCount = row.class_id
    ? ((db.prepare('SELECT COUNT(*) as count FROM class_students WHERE class_id = ?').get(row.class_id) as any)?.count || 0)
    : 0
  const startedCount = ((db.prepare('SELECT COUNT(DISTINCT student_id) as count FROM submissions WHERE publish_id = ?').get(row.id) as any)?.count || 0)
  const submittedCount = ((db.prepare("SELECT COUNT(DISTINCT student_id) as count FROM submissions WHERE publish_id = ? AND status IN ('submitted','graded')").get(row.id) as any)?.count || 0)
  const gradedCount = ((db.prepare("SELECT COUNT(DISTINCT student_id) as count FROM submissions WHERE publish_id = ? AND status = 'graded'").get(row.id) as any)?.count || 0)
  return {
    ...row,
    examId: row.exam_id,
    examTitle: examInfo?.title || null,
    examStatus: examInfo?.status || null,
    classId: row.class_id,
    className: classInfo?.name || null,
    startTime: row.start_time,
    endTime: row.end_time,
    scoreReleaseTime: row.score_release_time,
    answerReleaseTime: row.answer_release_time,
    allowLateSubmit: Boolean(row.allow_late_submit),
    antiCheatLevel: row.anti_cheat_level || 'record',
    maxViolations: row.max_violations || 3,
    createdAt: row.created_at,
    studentCount,
    startedCount,
    submittedCount,
    gradedCount,
  }
}
