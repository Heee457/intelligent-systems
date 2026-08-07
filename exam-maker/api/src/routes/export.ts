import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/index'
import { requireAuth, requireRole } from '../middleware/auth'
import ExcelJS from 'exceljs'

const teacherAuth = { preHandler: [requireAuth, requireRole('teacher')] }

export async function exportRoutes(app: FastifyInstance) {
  // Export scores for a published exam
  app.get('/api/export/exam/:publishId/scores', teacherAuth, async (req, reply) => {
    const { publishId } = req.params as { publishId: string }
    const db = getDb()

    const publish = db.prepare('SELECT * FROM exam_publish WHERE id = ? AND teacher_id = ?').get(publishId, req.user!.userId) as any
    if (!publish) return reply.status(404).send({ error: 'Not found' })

    const subs = db.prepare("SELECT s.*, u.name, u.email FROM submissions s JOIN users u ON s.student_id = u.id WHERE s.publish_id = ? AND s.status IN ('submitted','graded') ORDER BY s.total_score DESC").all(publishId) as any[]

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('成绩单')
    ws.columns = [
      { header: '姓名', key: 'name', width: 15 },
      { header: '邮箱', key: 'email', width: 25 },
      { header: '得分', key: 'score', width: 10 },
      { header: '满分', key: 'max', width: 10 },
      { header: '状态', key: 'status', width: 10 },
      { header: '提交时间', key: 'time', width: 20 },
      { header: '违规次数', key: 'violations', width: 10 },
    ]

    for (const s of subs) {
      ws.addRow({ name: s.name, email: s.email, score: s.total_score, max: s.total_points, status: s.status === 'graded' ? '已批阅' : '待批阅', time: new Date(s.submitted_at).toLocaleString('zh-CN'), violations: s.violations })
    }

    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', `attachment; filename=scores-${publishId}.xlsx`)
    return reply.send(await wb.xlsx.writeBuffer())
  })

  // Export class grades
  app.get('/api/export/class/:classId/grades', teacherAuth, async (req, reply) => {
    const { classId } = req.params as { classId: string }
    const db = getDb()

    const students = db.prepare(`SELECT u.id, u.name, u.email FROM class_students cs JOIN users u ON cs.student_id = u.id WHERE cs.class_id = ?`).all(classId) as any[]

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('班级成绩')
    ws.columns = [
      { header: '姓名', key: 'name', width: 15 },
      { header: '邮箱', key: 'email', width: 25 },
      { header: '考试', key: 'exam', width: 30 },
      { header: '得分', key: 'score', width: 10 },
      { header: '满分', key: 'max', width: 10 },
      { header: '时间', key: 'time', width: 20 },
    ]

    for (const s of students) {
      const subs = db.prepare("SELECT s.*, ep.title FROM submissions s JOIN exam_publish ep ON s.publish_id = ep.id WHERE s.student_id = ? AND ep.class_id = ? AND s.status IN ('submitted','graded')").all(s.id, classId) as any[]
      for (const sub of subs) {
        ws.addRow({ name: s.name, email: s.email, exam: sub.title, score: sub.total_score, max: sub.total_points, time: sub.submitted_at ? new Date(sub.submitted_at).toLocaleString('zh-CN') : '' })
      }
    }

    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', `attachment; filename=class-grades-${classId}.xlsx`)
    return reply.send(await wb.xlsx.writeBuffer())
  })
}
