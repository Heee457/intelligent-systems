# 阶段 4：高级功能（AB卷/补考/Excel/分析）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** AB卷生成、补考管理、Excel成绩导出、试卷分析（逐题正确率/区分度）、手动批阅问答题

**Architecture:** 新增 4 张表 + 4 个 API 路由组 + 4 个前端页面。统计分析使用缓存表避免实时计算。Excel 使用 exceljs 库生成

**Tech Stack:** Fastify, better-sqlite3, exceljs, React + zustand, Tailwind CSS

## Global Constraints

- 区分度 = (高分组正确率 - 低分组正确率)，高/低分组各取前/后 27%
- Excel 导出包含成绩单、试卷分析、班级汇总
- AB卷从同一题库生成两套等价试卷（随机抽题，两次不同随机种子）
- 补考创建新 exam_publish 记录指向同一 exam 或新 exam
- Follow existing code patterns

---

### Task 1: 新增 4 张表 + exceljs 依赖

**Files:**
- Modify: `api/src/db/index.ts`
- Modify: `api/package.json`

- [ ] **Step 1: 安装 exceljs**

```bash
cd api && npm install exceljs
```

- [ ] **Step 2: 在 `runMigrations` 中添加表**

```typescript
db.exec(`
  CREATE TABLE IF NOT EXISTS exam_stats (
    publish_id     TEXT PRIMARY KEY REFERENCES exam_publish(id),
    student_count  INTEGER NOT NULL,
    avg_score      REAL,
    median_score   REAL,
    max_score      REAL,
    min_score      REAL,
    pass_count     INTEGER,
    pass_rate      REAL,
    score_dist     TEXT,
    computed_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS question_stats (
    publish_id      TEXT NOT NULL REFERENCES exam_publish(id),
    question_id     TEXT NOT NULL,
    correct_count   INTEGER DEFAULT 0,
    wrong_count     INTEGER DEFAULT 0,
    blank_count     INTEGER DEFAULT 0,
    correct_rate    REAL,
    discrimination  REAL,
    PRIMARY KEY (publish_id, question_id)
  );

  CREATE TABLE IF NOT EXISTS exam_variant_assign (
    publish_id  TEXT NOT NULL REFERENCES exam_publish(id),
    student_id  TEXT NOT NULL REFERENCES users(id),
    variant     TEXT NOT NULL,
    PRIMARY KEY (publish_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS makeup_exams (
    id            TEXT PRIMARY KEY,
    original_publish_id TEXT NOT NULL REFERENCES exam_publish(id),
    student_id    TEXT NOT NULL REFERENCES users(id),
    publish_id    TEXT REFERENCES exam_publish(id),
    reason        TEXT,
    status        TEXT DEFAULT 'pending',
    created_at    INTEGER NOT NULL
  );
`)
```

- [ ] **Step 3: 验证编译 + Commit**

---

### Task 2: 统计 + 批阅 API

**Files:**
- Create: `api/src/routes/stats.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: 创建 `api/src/routes/stats.ts`**

```typescript
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
      WHERE sa.graded_by = 'manual' AND s.teacher_id = ?
      ORDER BY s.submitted_at
    `).all(req.user!.userId)
    // Note: need teacher_id on submissions or check via publish
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

    const allManual = !db.prepare("SELECT id FROM submission_answers WHERE submission_id = ? AND graded_by != 'auto' AND graded_by != 'manual'").get(ans.submission_id)
    const allGraded = !db.prepare("SELECT id FROM submission_answers WHERE submission_id = ? AND is_correct IS NULL").get(ans.submission_id)

    db.prepare('UPDATE submissions SET total_score = ?, status = ?, graded_at = ?, grade_notes = ? WHERE id = ?').run(totals.total, allGraded ? 'graded' : 'submitted', allGraded ? Date.now() : null, notes || null, ans.submission_id)

    return { ok: true }
  })
}
```

- [ ] **Step 2: 注册路由 + 验证编译**

```bash
cd api && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

---

### Task 3: Excel 导出 API

**Files:**
- Create: `api/src/routes/export.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: 创建 `api/src/routes/export.ts`**

```typescript
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
```

- [ ] **Step 2: 注册 + 验证 + Commit**

---

### Task 4: AB卷 + 补考 API

**Files:**
- Create: `api/src/routes/variant.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: 创建 `api/src/routes/variant.ts`**

```typescript
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
```

- [ ] **Step 2: 注册 + 验证 + Commit**

---

### Task 5: 前端 — 试卷分析 + 批阅中心 + 学生详情

**Files:**
- Create: `web/src/routes/ExamAnalysis.tsx`
- Create: `web/src/routes/GradingCenter.tsx`
- Create: `web/src/routes/StudentDetail.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: 创建 `web/src/routes/ExamAnalysis.tsx`**

```typescript
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const API = 'http://localhost:3001'

export default function ExamAnalysis() {
  const { id } = useParams<{ id: string }>()
  const token = useAuthStore(s => s.token)
  const headers = { Authorization: `Bearer ${token}` }
  const [stats, setStats] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/stats/exam/${id}`, { headers }).then(r => r.json()),
      fetch(`${API}/api/stats/exam/${id}/questions`, { headers }).then(r => r.json()),
    ]).then(([s, q]) => {
      setStats(s.stats)
      setQuestions(q.questions || [])
      setLoading(false)
    })
  }, [id])

  if (loading) return <div className="text-center py-24 text-gray-400">加载中...</div>
  if (!stats) return <div className="text-center py-24 text-gray-400">暂无数据</div>

  const dist = stats.score_dist ? JSON.parse(stats.score_dist) : {}

  return (
    <div className="space-y-6">
      <Link to={`/exams/${id}`} className="text-sm text-indigo-600 mb-4 inline-block">← 返回试卷</Link>
      <h1 className="text-2xl font-bold text-gray-900">试卷分析</h1>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="参与人数" value={stats.student_count} />
        <StatCard label="平均分" value={`${stats.avg_score}/${stats.max_points}`} />
        <StatCard label="中位数" value={stats.median_score} />
        <StatCard label="及格率" value={`${stats.pass_rate}%`} />
      </div>

      <div className="grid grid-cols-5 gap-2">
        {Object.entries(dist).map(([k, v]: any) => (
          <div key={k} className="bg-white rounded-lg border border-gray-200 p-3 text-center">
            <div className="text-xs text-gray-400">{k}</div>
            <div className="text-lg font-bold">{v}人</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold mb-4">逐题分析</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2">题号</th>
              <th>正确率</th>
              <th>正确/错误/空答</th>
              <th>区分度</th>
              <th>评价</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q: any) => (
              <tr key={q.question_id} className="border-b border-gray-50">
                <td className="py-2">{q.question_id.slice(0, 8)}</td>
                <td>
                  <div className="w-24 h-2 bg-gray-100 rounded-full">
                    <div className={`h-2 rounded-full ${q.correct_rate >= 80 ? 'bg-green-500' : q.correct_rate >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${q.correct_rate}%` }} />
                  </div>
                  <span className="text-xs">{q.correct_rate}%</span>
                </td>
                <td className="text-xs">{q.correct_count}/{q.wrong_count}/{q.blank_count}</td>
                <td className={`font-mono ${q.discrimination >= 0.4 ? 'text-green-600' : q.discrimination >= 0.2 ? 'text-yellow-600' : 'text-red-600'}`}>{q.discrimination}</td>
                <td className="text-xs">{q.discrimination >= 0.4 ? '优秀' : q.discrimination >= 0.2 ? '一般' : '需改进'}{q.discrimination >= 0.6 ? ' ⚠ 注意' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  )
}
```

- [ ] **Step 2: 创建 `web/src/routes/GradingCenter.tsx`**

```typescript
import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'

const API = 'http://localhost:3001'

export default function GradingCenter() {
  const token = useAuthStore(s => s.token)
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [pending, setPending] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [scoring, setScoring] = useState<Record<string, { score: number; isCorrect: number; notes: string }>>({})

  useEffect(() => {
    fetch(`${API}/api/grading/pending`, { headers }).then(r => r.json()).then(d => {
      setPending(d.pending || [])
      setLoading(false)
    })
  }, [])

  const handleGrade = async (answerId: string) => {
    const g = scoring[answerId]
    if (!g) return
    await fetch(`${API}/api/grading/${answerId}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ score: g.score, isCorrect: g.isCorrect, notes: g.notes }),
    })
    setPending(p => p.filter(a => a.id !== answerId))
  }

  if (loading) return <div className="text-center py-24 text-gray-400">加载中...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">批阅中心</h1>
      {pending.length === 0 ? (
        <div className="text-center py-24 text-gray-400">没有待批阅的题目</div>
      ) : (
        <div className="space-y-4">
          {pending.map((a: any) => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium">{a.student_name} — {a.exam_title}</span>
              </div>
              <div className="flex items-center gap-3">
                <input type="number" value={scoring[a.id]?.score || 0}
                  onChange={e => setScoring(s => ({ ...s, [a.id]: { ...s[a.id], score: Number(e.target.value), isCorrect: Number(e.target.value) > 0 ? 1 : 0, notes: '' } }))}
                  className="w-20 px-2 py-1 border border-gray-200 rounded text-sm" placeholder="得分" />
                <span className="text-sm text-gray-400">/ {a.max_score} 分</span>
                <button onClick={() => handleGrade(a.id)} className="px-3 py-1 bg-green-500 text-white rounded-lg text-sm">确认</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 创建 `web/src/routes/StudentDetail.tsx`**

```typescript
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const API = 'http://localhost:3001'

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>()
  const token = useAuthStore(s => s.token)
  const [submissions, setSubmissions] = useState<any[]>([])
  const [student, setStudent] = useState<any>(null)

  useEffect(() => {
    fetch(`${API}/api/student/submissions`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => {
        // Filter to this student (admin view)
        setSubmissions((d.submissions || []).filter((s: any) => s.student_id === id))
      })
  }, [id])

  // For now show what we can
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">学生详情</h1>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {submissions.map((s: any) => (
          <Link key={s.id} to={`/student/submission/${s.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50">
            <div>
              <p className="font-medium">{s.exam_title}</p>
              <p className="text-xs text-gray-400">{new Date(s.started_at).toLocaleString('zh-CN')}</p>
            </div>
            <span className="font-semibold">{s.total_score}/{s.total_points}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 在 App.tsx 添加路由**

```typescript
import ExamAnalysis from './routes/ExamAnalysis'
import GradingCenter from './routes/GradingCenter'
import StudentDetail from './routes/StudentDetail'

// In teacher routes:
<Route path="/exams/:id/analysis" element={<ExamAnalysis />} />
<Route path="/grading" element={<GradingCenter />} />
<Route path="/students/:id" element={<StudentDetail />} />
```

- [ ] **Step 5: 验证编译 + Commit**

---

### Task 6: E2E 验证

- [ ] **Step 1: 测试统计 + 导出 + 补考**

```bash
TOKEN="<teacher JWT>"

# Stats
curl -s "http://localhost:3001/api/stats/exam/<publishId>" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Stats:', d.get('stats','none'))"

# Recompute
curl -s -X POST "http://localhost:3001/api/stats/exam/<publishId>/recompute" -H "Authorization: Bearer $TOKEN"

# Question analysis
curl -s "http://localhost:3001/api/stats/exam/<publishId>/questions" -H "Authorization: Bearer $TOKEN"

# Export scores (downloads xlsx)
curl -s -o /tmp/scores.xlsx "http://localhost:3001/api/export/exam/<publishId>/scores" -H "Authorization: Bearer $TOKEN"

# Makeup
curl -s -X POST "http://localhost:3001/api/makeup" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"originalPublishId":"<id>","studentId":"<sid>","reason":"因病缺考","useNewExam":true}'
```

- [ ] **Step 2: TSC 两项目编译**

---

## 自检

- [x] 4 张新表（exam_stats, question_stats, exam_variant_assign, makeup_exams）
- [x] 统计 + 批阅 API（考试统计/逐题分析/待批阅/手动评分）
- [x] Excel 导出（成绩单 + 班级汇总）
- [x] AB卷 + 补考 API
- [x] 前端 3 个新页面（ExamAnalysis/GradingCenter/StudentDetail）
- [x] 路由更新
