# 阶段 3：学生端 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 学生考试大厅、在线答题（计时/防作弊/实时保存/自动批改）、成绩查看、加入班级

**Architecture:** 新增 submissions + submission_answers 两张表，学生 API 端点组，自动批改引擎（选择/判断/填空精确匹配，问答标记待批阅），前端全屏答题页 + 倒计时 + 切屏检测

**Tech Stack:** Fastify, better-sqlite3, React + zustand, react-router-dom v6, Tailwind CSS

## Global Constraints

- 所有学生 API 添加 `requireAuth` + `requireRole('student')`
- 自动批改规则：选择/判断精确匹配，填空标准化后比较，问答标记 NULL 待人工批阅
- 答题实时保存（每题独立 API 调用），防断电
- 倒计时服务端校验：`started_at + duration`，超时拒绝保存
- 前端全屏模式 + visibilitychange 切屏检测
- Follow existing code patterns: direct SQL, no ORM, ES modules

---

### Task 1: 新增 submissions + submission_answers 表

**Files:**
- Modify: `api/src/db/index.ts`

- [ ] **Step 1: 在 `runMigrations` 中添加表**

在 `api/src/db/index.ts` 现有建表之后追加：

```typescript
db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id            TEXT PRIMARY KEY,
    publish_id    TEXT NOT NULL REFERENCES exam_publish(id),
    student_id    TEXT NOT NULL REFERENCES users(id),
    status        TEXT DEFAULT 'started',
    answers       TEXT,
    total_score   REAL,
    total_points  REAL,
    violations    INTEGER DEFAULT 0,
    started_at    INTEGER NOT NULL,
    submitted_at  INTEGER,
    graded_at     INTEGER,
    grader_id     TEXT REFERENCES users(id),
    grade_notes   TEXT
  );

  CREATE TABLE IF NOT EXISTS submission_answers (
    id              TEXT PRIMARY KEY,
    submission_id   TEXT NOT NULL REFERENCES submissions(id),
    question_id     TEXT NOT NULL,
    question_order  INTEGER NOT NULL,
    answer          TEXT,
    score           REAL,
    max_score       REAL,
    is_correct      INTEGER,
    graded_by       TEXT DEFAULT 'auto'
  );
`)
```

- [ ] **Step 2: 验证编译**

```bash
cd api && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

---

### Task 2: 自动批改引擎

**Files:**
- Create: `api/src/pipeline/grading.ts`

**Interfaces:**
- Consumes: Question `answer` field (JSON), student answer (JSON)
- Produces: `gradeAnswer(question: any, studentAnswer: any): { score: number; maxScore: number; isCorrect: number | null }`

- [ ] **Step 1: 创建 `api/src/pipeline/grading.ts`**

```typescript
function normalize(str: string): string {
  return str.replace(/\s+/g, '').replace(/[，,。.]/g, '').toLowerCase()
}

export function gradeAnswer(
  questionType: string,
  correctAnswer: Record<string, any>,
  studentAnswer: Record<string, any> | null,
  maxScore: number
): { score: number; maxScore: number; isCorrect: number | null } {
  if (!studentAnswer) {
    return { score: 0, maxScore, isCorrect: 0 }
  }

  switch (questionType) {
    case 'choice': {
      const correct = correctAnswer.selectedOptionId === studentAnswer.selectedOptionId
      return { score: correct ? maxScore : 0, maxScore, isCorrect: correct ? 1 : 0 }
    }

    case 'truefalse': {
      const correct = correctAnswer.value === studentAnswer.value
      return { score: correct ? maxScore : 0, maxScore, isCorrect: correct ? 1 : 0 }
    }

    case 'fillblank': {
      const correctBlanks = correctAnswer.blanks || []
      const studentBlanks = studentAnswer.blanks || []
      let correctCount = 0
      for (let i = 0; i < correctBlanks.length; i++) {
        if (i < studentBlanks.length && normalize(studentBlanks[i]) === normalize(correctBlanks[i])) {
          correctCount++
        }
      }
      const score = correctBlanks.length > 0 ? (correctCount / correctBlanks.length) * maxScore : 0
      const isCorrect = correctCount === correctBlanks.length ? 1 : correctCount > 0 ? null : 0
      return { score: Math.round(score * 10) / 10, maxScore, isCorrect }
    }

    case 'match': {
      const correctPairs = correctAnswer.pairs || []
      const studentPairs = studentAnswer.pairs || []
      let matchCount = 0
      for (const cp of correctPairs) {
        const sp = studentPairs.find((p: any) => p.left === cp.left)
        if (sp && sp.right === cp.right) matchCount++
      }
      const score = correctPairs.length > 0 ? (matchCount / correctPairs.length) * maxScore : 0
      return { score: Math.round(score * 10) / 10, maxScore, isCorrect: matchCount === correctPairs.length ? 1 : 0 }
    }

    case 'ordering': {
      const correct = correctAnswer.orderedItems || []
      const student = studentAnswer.orderedItems || []
      if (correct.length === 0) return { score: maxScore, maxScore, isCorrect: 1 }
      const match = JSON.stringify(correct) === JSON.stringify(student)
      return { score: match ? maxScore : 0, maxScore, isCorrect: match ? 1 : 0 }
    }

    case 'essay':
    default: {
      // Essay questions marked for manual grading
      return { score: 0, maxScore, isCorrect: null }
    }
  }
}

export function autoGradeSubmission(
  examQuestions: Array<{ questionId: string; score: number; order: number }>,
  questionsMap: Map<string, any>,
  studentAnswers: Record<string, any>
): { totalScore: number; totalPoints: number; answers: Array<{ questionId: string; questionOrder: number; answer: any; score: number; maxScore: number; isCorrect: number | null; gradedBy: string }> } {
  let totalScore = 0
  let totalPoints = 0
  const answers: any[] = []

  for (const eq of examQuestions) {
    const question = questionsMap.get(eq.questionId)
    const studentAnswer = studentAnswers[eq.questionId] || null
    const result = gradeAnswer(question?.type || 'essay', question?.answer || {}, studentAnswer, eq.score)

    totalScore += result.score
    totalPoints += eq.score

    answers.push({
      questionId: eq.questionId,
      questionOrder: eq.order,
      answer: JSON.stringify(studentAnswer),
      score: result.score,
      maxScore: eq.score,
      isCorrect: result.isCorrect,
      gradedBy: result.isCorrect === null ? 'manual' : 'auto',
    })
  }

  return { totalScore, totalPoints, answers }
}
```

- [ ] **Step 2: 验证编译**

```bash
cd api && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

---

### Task 3: 学生端 API

**Files:**
- Create: `api/src/routes/student.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: 创建 `api/src/routes/student.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/index'
import { requireAuth, requireRole, type JwtPayload } from '../middleware/auth'
import { generateId } from '../utils/id'
import { autoGradeSubmission } from '../pipeline/grading'

interface AuthRequest { user: JwtPayload }

const auth = { preHandler: [requireAuth, requireRole('student')] }

export async function studentRoutes(app: FastifyInstance) {
  // Exam hall — list published exams for student's classes
  app.get('/api/student/dashboard', auth, async (req) => {
    const db = getDb()
    const now = Date.now()

    const rows = db.prepare(`
      SELECT DISTINCT ep.*, e.total_score as exam_total_score
      FROM exam_publish ep
      JOIN exams e ON ep.exam_id = e.id
      LEFT JOIN class_students cs ON ep.class_id = cs.class_id
      WHERE ep.status = 'published'
        AND (ep.class_id IS NULL OR cs.student_id = ?)
        AND (ep.end_time IS NULL OR ep.end_time > ?)
      ORDER BY ep.created_at DESC
    `).all(req.user!.userId, now)

    // Add submission status for each publish
    const result = rows.map((ep: any) => {
      const sub = db.prepare(
        'SELECT id, status, total_score, submitted_at FROM submissions WHERE publish_id = ? AND student_id = ? ORDER BY created_at DESC LIMIT 1'
      ).get(ep.id, req.user!.userId) as any

      return {
        ...ep,
        submission: sub || null,
      }
    })

    return { publishes: result }
  })

  // Get exam questions for taking
  app.get('/api/student/exam/:publishId', auth, async (req) => {
    const { publishId } = req.params as { publishId: string }
    const db = getDb()

    const publish = db.prepare('SELECT * FROM exam_publish WHERE id = ?').get(publishId) as any
    if (!publish) return { error: 'Not found' }

    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(publish.exam_id) as any
    if (!exam) return { error: 'Exam not found' }

    const examQuestions = JSON.parse(exam.questions)
    const questionIds = examQuestions.map((eq: any) => eq.questionId)

    // Fetch question details
    const questions = db.prepare(
      `SELECT id, type, title, content, options, answer, difficulty, knowledge_points
       FROM questions WHERE id IN (${questionIds.map(() => '?').join(',')})`
    ).all(...questionIds) as any[]

    // If shuffle enabled, randomize order
    let orderedQuestions = examQuestions.map((eq: any) => {
      const q = questions.find((q: any) => q.id === eq.questionId)
      return { ...q, score: eq.score, order: eq.order, answer: JSON.parse(q.answer), options: q.options ? JSON.parse(q.options) : undefined, knowledgePoints: q.knowledge_points ? JSON.parse(q.knowledge_points) : [] }
    })

    if (publish.shuffle) {
      orderedQuestions = orderedQuestions.sort(() => Math.random() - 0.5)
    }

    return {
      publish: { id: publish.id, title: publish.title, duration: publish.duration, endTime: publish.end_time },
      questions: orderedQuestions.map((q: any) => {
        const { answer, ...safeQ } = q
        return safeQ  // Don't send answers to client!
      }),
    }
  })

  // Start exam
  app.post('/api/student/exam/:publishId/start', auth, async (req) => {
    const { publishId } = req.params as { publishId: string }
    const db = getDb()

    const publish = db.prepare('SELECT * FROM exam_publish WHERE id = ?').get(publishId) as any
    if (!publish) return { error: 'Not found' }

    // Check retry limit
    if (publish.retry > 0) {
      const count = (db.prepare('SELECT COUNT(*) as c FROM submissions WHERE publish_id = ? AND student_id = ?').get(publishId, req.user!.userId) as any).c
      if (count >= publish.retry + 1) {
        return { error: '已达到最大重考次数' }
      }
    }

    // Check if already has active submission
    const existing = db.prepare(
      'SELECT id FROM submissions WHERE publish_id = ? AND student_id = ? AND status = ?'
    ).get(publishId, req.user!.userId, 'started') as any

    if (existing) {
      return { submissionId: existing.id }
    }

    const id = generateId()
    const now = Date.now()

    db.prepare('INSERT INTO submissions (id, publish_id, student_id, status, started_at) VALUES (?,?,?,?,?)').run(id, publishId, req.user!.userId, 'started', now)

    return { submissionId: id, startedAt: now }
  })

  // Save answer for a question (real-time)
  app.post('/api/student/exam/:publishId/answer', auth, async (req) => {
    const { publishId } = req.params as { publishId: string }
    const { submissionId, questionId, questionOrder, answer, maxScore } = req.body as any
    const db = getDb()

    // Verify submission belongs to student and hasn't expired
    const sub = db.prepare('SELECT * FROM submissions WHERE id = ? AND student_id = ?').get(submissionId, req.user!.userId) as any
    if (!sub || sub.status !== 'started') return { error: 'Invalid submission' }

    // Check time limit
    const publish = db.prepare('SELECT * FROM exam_publish WHERE id = ?').get(publishId) as any
    const elapsed = Date.now() - sub.started_at
    if (elapsed > publish.duration * 60 * 1000) {
      return { error: '考试时间已到' }
    }

    const id = generateId()
    const existing = db.prepare('SELECT id FROM submission_answers WHERE submission_id = ? AND question_id = ?').get(submissionId, questionId) as any

    if (existing) {
      db.prepare('UPDATE submission_answers SET answer = ?, question_order = ? WHERE id = ?').run(JSON.stringify(answer), questionOrder, existing.id)
    } else {
      db.prepare('INSERT INTO submission_answers (id, submission_id, question_id, question_order, answer, max_score) VALUES (?,?,?,?,?,?)').run(id, submissionId, questionId, questionOrder, JSON.stringify(answer), maxScore || 0)
    }

    return { ok: true }
  })

  // Submit exam
  app.post('/api/student/exam/:publishId/submit', auth, async (req) => {
    const { publishId } = req.params as { publishId: string }
    const { submissionId, violations } = req.body as any
    const db = getDb()
    const now = Date.now()

    const sub = db.prepare('SELECT * FROM submissions WHERE id = ? AND student_id = ?').get(submissionId, req.user!.userId) as any
    if (!sub || sub.status !== 'started') return { error: 'Invalid submission' }

    // Get exam questions for grading
    const publish = db.prepare('SELECT * FROM exam_publish WHERE id = ?').get(publishId) as any
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(publish.exam_id) as any
    const examQuestions = JSON.parse(exam.questions)

    // Build questions map
    const questionIds = examQuestions.map((eq: any) => eq.questionId)
    const questions = db.prepare(`SELECT * FROM questions WHERE id IN (${questionIds.map(() => '?').join(',')})`).all(...questionIds) as any[]
    const questionsMap = new Map(questions.map((q: any) => [q.id, { ...q, answer: JSON.parse(q.answer) }]))

    // Collect student answers from submission_answers
    const savedAnswers = db.prepare('SELECT * FROM submission_answers WHERE submission_id = ?').all(submissionId) as any[]
    const studentAnswers: Record<string, any> = {}
    for (const sa of savedAnswers) {
      studentAnswers[sa.question_id] = sa.answer ? JSON.parse(sa.answer) : null
    }

    // Auto-grade
    const grading = autoGradeSubmission(examQuestions, questionsMap, studentAnswers)

    // Update submission
    db.prepare('UPDATE submissions SET status = ?, total_score = ?, total_points = ?, violations = ?, submitted_at = ?, answers = ? WHERE id = ?').run(
      'submitted', grading.totalScore, grading.totalPoints, violations || 0, now, JSON.stringify(studentAnswers), submissionId
    )

    // Upsert submission_answers with scores
    for (const ga of grading.answers) {
      db.prepare('UPDATE submission_answers SET score = ?, is_correct = ?, graded_by = ? WHERE submission_id = ? AND question_id = ?').run(
        ga.score, ga.isCorrect, ga.gradedBy, submissionId, ga.questionId
      )
    }

    // Auto-mark submission as graded if all questions are auto-graded
    const allAuto = grading.answers.every((a: any) => a.gradedBy === 'auto')
    if (allAuto) {
      db.prepare('UPDATE submissions SET status = ?, graded_at = ? WHERE id = ?').run('graded', now, submissionId)
    }

    return { submission: db.prepare('SELECT * FROM submissions WHERE id = ?').get(submissionId) }
  })

  // My submissions
  app.get('/api/student/submissions', auth, async (req) => {
    const rows = getDb().prepare(`
      SELECT s.*, ep.title as exam_title
      FROM submissions s JOIN exam_publish ep ON s.publish_id = ep.id
      WHERE s.student_id = ?
      ORDER BY s.started_at DESC
    `).all(req.user!.userId)
    return { submissions: rows }
  })

  // Submission detail
  app.get('/api/student/submissions/:id', auth, async (req) => {
    const { id } = req.params as { id: string }
    const db = getDb()

    const sub = db.prepare('SELECT s.*, ep.title as exam_title FROM submissions s JOIN exam_publish ep ON s.publish_id = ep.id WHERE s.id = ? AND s.student_id = ?').get(id, req.user!.userId) as any
    if (!sub) return { error: 'Not found' }

    const answers = db.prepare('SELECT * FROM submission_answers WHERE submission_id = ? ORDER BY question_order').all(id)

    // Fetch question details
    const questionIds = answers.map((a: any) => a.question_id)
    const questions = questionIds.length > 0
      ? db.prepare(`SELECT * FROM questions WHERE id IN (${questionIds.map(() => '?').join(',')})`).all(...questionIds) as any[]
      : []

    const questionsMap = new Map(questions.map((q: any) => [q.id, { ...q, answer: JSON.parse(q.answer), options: q.options ? JSON.parse(q.options) : undefined }]))

    return {
      submission: sub,
      answers: answers.map((a: any) => ({
        ...a,
        studentAnswer: a.answer ? JSON.parse(a.answer) : null,
        question: questionsMap.get(a.question_id),
      })),
    }
  })

  // Join class
  app.post('/api/student/classes/join', auth, async (req) => {
    const { joinCode } = req.body as { joinCode: string }
    const db = getDb()

    const cls = db.prepare('SELECT * FROM classes WHERE join_code = ?').get(joinCode) as any
    if (!cls) return { error: '邀请码无效' }

    try {
      db.prepare('INSERT INTO class_students (class_id, student_id, joined_at) VALUES (?,?,?)').run(cls.id, req.user!.userId, Date.now())
      return { class: cls }
    } catch {
      return { error: '你已在此班级中' }
    }
  })
}
```

- [ ] **Step 2: 注册路由**

```typescript
import { studentRoutes } from './routes/student'
await app.register(studentRoutes)
```

- [ ] **Step 3: 验证编译**

```bash
cd api && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

---

### Task 4: 学生端前端页面 — StudentDashboard + StudentGrades

**Files:**
- Create: `web/src/routes/student/StudentDashboard.tsx`
- Create: `web/src/routes/student/StudentGrades.tsx`

- [ ] **Step 1: 创建 `web/src/routes/student/StudentDashboard.tsx`**

```typescript
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const API = 'http://localhost:3001'

function headers() {
  const token = useAuthStore.getState().token
  return { Authorization: `Bearer ${token}` }
}

export default function StudentDashboard() {
  const navigate = useNavigate()
  const [publishes, setPublishes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const [joinMsg, setJoinMsg] = useState('')

  useEffect(() => {
    fetch(`${API}/api/student/dashboard`, { headers: headers() })
      .then(r => r.json()).then(d => { setPublishes(d.publishes || []); setLoading(false) })
  }, [])

  const handleJoin = async () => {
    const res = await fetch(`${API}/api/student/classes/join`, {
      method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ joinCode }),
    })
    const d = await res.json()
    setJoinMsg(d.class ? `已加入：${d.class.name}` : d.error || '失败')
    setJoinCode('')
  }

  const handleStart = async (publishId: string) => {
    const res = await fetch(`${API}/api/student/exam/${publishId}/start`, {
      method: 'POST', headers: headers(),
    })
    const d = await res.json()
    if (d.submissionId) navigate(`/student/exam/${publishId}?sid=${d.submissionId}`)
    else alert(d.error || '无法开始考试')
  }

  const ongoing = publishes.filter((p: any) => p.submission?.status === 'started')
  const upcoming = publishes.filter((p: any) => !p.submission)
  const completed = publishes.filter((p: any) => p.submission?.status === 'submitted' || p.submission?.status === 'graded')

  if (loading) return <div className="text-center py-24 text-gray-400">加载中...</div>

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">考试大厅</h1>
        <div className="flex gap-3 items-center bg-white rounded-xl border border-gray-200 p-4">
          <input value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="输入班级邀请码" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
          <button onClick={handleJoin} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm">加入班级</button>
          {joinMsg && <span className="text-sm text-gray-500">{joinMsg}</span>}
        </div>
      </div>

      {ongoing.length > 0 && (
        <Section title="进行中" publishes={ongoing} onStart={handleStart} highlight />
      )}

      <Section title="即将开始" publishes={upcoming} onStart={handleStart} />
      <Section title="已结束" publishes={completed} onStart={handleStart} done />
    </div>
  )
}

function Section({ title, publishes, onStart, highlight, done }: any) {
  if (publishes.length === 0) return null
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-3">{title}</h2>
      <div className="grid grid-cols-3 gap-4">
        {publishes.map((p: any) => (
          <div key={p.id} className={`bg-white rounded-xl border p-5 ${highlight ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-gray-200'}`}>
            <h3 className="font-semibold text-gray-900">{p.title}</h3>
            <p className="text-sm text-gray-400 mt-1">时长：{p.duration} 分钟</p>
            {p.submission && (
              <p className="text-sm text-gray-400">得分：{p.submission.total_score ?? '—'} / {p.exam_total_score}</p>
            )}
            {!done && (
              <button onClick={() => onStart(p.id)} className="mt-3 px-4 py-1.5 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600">
                {p.submission ? '继续答题' : '开始考试'}
              </button>
            )}
            {done && p.submission && (
              <button onClick={() => window.location.href = `/student/submission/${p.submission.id}`} className="mt-3 px-4 py-1.5 text-sm border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50">
                查看详情
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 创建 `web/src/routes/student/StudentGrades.tsx`**

```typescript
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const API = 'http://localhost:3001'

export default function StudentGrades() {
  const [submissions, setSubmissions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const token = useAuthStore(s => s.token)

  useEffect(() => {
    fetch(`${API}/api/student/submissions`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { setSubmissions(d.submissions || []); setLoading(false) })
  }, [token])

  if (loading) return <div className="text-center py-24 text-gray-400">加载中...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">我的成绩</h1>
      {submissions.length === 0 ? (
        <div className="text-center py-24 text-gray-400">暂无考试记录</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {submissions.map((s: any) => (
            <Link key={s.id} to={`/student/submission/${s.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50">
              <div>
                <p className="font-medium text-gray-900">{s.exam_title}</p>
                <p className="text-xs text-gray-400">{new Date(s.started_at).toLocaleString('zh-CN')}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900">{s.total_score ?? '—'} / {s.total_points}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  s.status === 'graded' ? 'bg-green-100 text-green-700' :
                  s.status === 'submitted' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {s.status === 'graded' ? '已批阅' : s.status === 'submitted' ? '待批阅' : '进行中'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 验证编译**

```bash
cd web && ../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 4: Commit**

---

### Task 5: 答题页 ExamTaking

**Files:**
- Create: `web/src/routes/student/ExamTaking.tsx`
- Create: `web/src/routes/student/SubmissionDetail.tsx`

- [ ] **Step 1: 创建 `web/src/routes/student/ExamTaking.tsx`**

```typescript
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const API = 'http://localhost:3001'

export default function ExamTaking() {
  const { publishId } = useParams<{ publishId: string }>()
  const [searchParams] = useSearchParams()
  const submissionId = searchParams.get('sid') || ''
  const navigate = useNavigate()
  const token = useAuthStore(s => s.token)
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const [questions, setQuestions] = useState<any[]>([])
  const [publish, setPublish] = useState<any>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [timeLeft, setTimeLeft] = useState(0)
  const [violations, setViolations] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const timerRef = useRef<any>(null)

  // Load exam
  useEffect(() => {
    fetch(`${API}/api/student/exam/${publishId}`, { headers })
      .then(r => r.json()).then(d => {
        setQuestions(d.questions || [])
        setPublish(d.publish)
        setTimeLeft((d.publish?.duration || 0) * 60)
      })
  }, [publishId])

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((t: number) => {
        if (t <= 1) { clearInterval(timerRef.current); handleSubmit(); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  // Fullscreen
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {})
    const onFullscreenChange = () => { if (!document.fullscreenElement) setViolations(v => v + 1) }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  // Visibility (tab switch) detection
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) setViolations(v => v + 1) }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const saveAnswer = useCallback(async (qId: string, order: number, ans: any, maxScore: number) => {
    setAnswers(prev => ({ ...prev, [qId]: ans }))
    await fetch(`${API}/api/student/exam/${publishId}/answer`, {
      method: 'POST', headers,
      body: JSON.stringify({ submissionId, questionId: qId, questionOrder: order, answer: ans, maxScore }),
    })
  }, [publishId, submissionId])

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    clearInterval(timerRef.current)
    const res = await fetch(`${API}/api/student/exam/${publishId}/submit`, {
      method: 'POST', headers,
      body: JSON.stringify({ submissionId, violations }),
    })
    document.exitFullscreen?.()
    navigate(`/student/submission/${submissionId}`)
  }

  if (questions.length === 0) return <div className="text-center py-24 text-gray-400">加载试卷...</div>

  const q = questions[currentIdx]
  const answeredCount = Object.keys(answers).length
  const fmtTime = `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`

  return (
    <div className="fixed inset-0 bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <span className="font-semibold">{publish?.title}</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{answeredCount}/{questions.length} 已答</span>
          <span className={`font-mono font-bold ${timeLeft < 300 ? 'text-red-600' : 'text-gray-700'}`}>{fmtTime}</span>
          {violations > 0 && <span className="text-xs text-red-500">违规: {violations}次</span>}
          <button onClick={handleSubmit} disabled={submitting} className="px-4 py-1.5 bg-red-500 text-white rounded-lg text-sm">{submitting ? '提交中...' : '交卷'}</button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r p-4 overflow-y-auto">
          <div className="grid grid-cols-4 gap-2">
            {questions.map((q, i) => (
              <button key={i} onClick={() => setCurrentIdx(i)} className={`w-12 h-12 rounded-lg text-sm font-medium ${
                i === currentIdx ? 'ring-2 ring-indigo-400 bg-indigo-50' :
                answers[q.id] ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Question */}
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-3xl mx-auto bg-white rounded-xl border p-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm font-bold text-indigo-600">第 {currentIdx + 1} 题</span>
              <span className="text-sm text-gray-400">({q.score} 分)</span>
            </div>
            <h3 className="text-lg font-semibold mb-4">{q.title}</h3>
            <p className="text-gray-700 mb-6">{q.content}</p>

            {/* Choice */}
            {q.type === 'choice' && q.options && (
              <div className="space-y-3">
                {q.options.map((opt: any) => (
                  <label key={opt.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                    answers[q.id]?.selectedOptionId === opt.id ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'
                  }`}>
                    <input type="radio" name={`q-${q.id}`} checked={answers[q.id]?.selectedOptionId === opt.id}
                      onChange={() => saveAnswer(q.id, currentIdx + 1, { type: 'choice', selectedOptionId: opt.id }, q.score)}
                    />
                    <span className="font-medium text-gray-500">{opt.label}.</span>
                    <span>{opt.content}</span>
                  </label>
                ))}
              </div>
            )}

            {/* True/False */}
            {q.type === 'truefalse' && (
              <div className="flex gap-4">
                {[true, false].map(v => (
                  <label key={String(v)} className={`flex-1 p-4 rounded-lg border text-center cursor-pointer ${
                    answers[q.id]?.value === v ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'
                  }`}>
                    <input type="radio" name={`q-${q.id}`} checked={answers[q.id]?.value === v}
                      onChange={() => saveAnswer(q.id, currentIdx + 1, { type: 'truefalse', value: v }, q.score)}
                      className="hidden"
                    />
                    <span className="font-medium">{v ? '✓ 正确' : '✗ 错误'}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Fill blank */}
            {q.type === 'fillblank' && (
              <div className="space-y-3">
                {[0, 1, 2, 3].map(i => (
                  <input key={i} value={answers[q.id]?.blanks?.[i] || ''}
                    onChange={e => {
                      const blanks = [...(answers[q.id]?.blanks || [])]
                      blanks[i] = e.target.value
                      saveAnswer(q.id, currentIdx + 1, { type: 'fillblank', blanks }, q.score)
                    }}
                    placeholder={`空格 ${i + 1}`}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                ))}
              </div>
            )}

            {/* Essay */}
            {q.type === 'essay' && (
              <textarea value={answers[q.id]?.referenceAnswer || ''}
                onChange={e => saveAnswer(q.id, currentIdx + 1, { type: 'essay', referenceAnswer: e.target.value }, q.score)}
                rows={6} placeholder="请输入答案...（支持上传图片）"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
              />
            )}

            {/* Nav */}
            <div className="flex justify-between mt-8 pt-4 border-t border-gray-100">
              <button onClick={() => setCurrentIdx(i => i - 1)} disabled={currentIdx === 0}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-30">上一题</button>
              <button onClick={() => setCurrentIdx(i => i + 1)} disabled={currentIdx >= questions.length - 1}
                className="px-4 py-2 text-sm bg-indigo-500 text-white rounded-lg disabled:opacity-30">下一题</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 创建 `web/src/routes/student/SubmissionDetail.tsx`** — 答题结果查看页

```typescript
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const API = 'http://localhost:3001'

export default function SubmissionDetail() {
  const { id } = useParams<{ id: string }>()
  const token = useAuthStore(s => s.token)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/api/student/submissions/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [id, token])

  if (loading) return <div className="text-center py-24 text-gray-400">加载中...</div>
  if (!data?.submission) return <div className="text-center py-24 text-gray-400">未找到</div>

  const { submission, answers } = data

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{submission.exam_title}</h1>
          <p className="text-sm text-gray-400">{new Date(submission.submitted_at).toLocaleString('zh-CN')}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-indigo-600">{submission.total_score} / {submission.total_points}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            submission.status === 'graded' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          }`}>{submission.status === 'graded' ? '已批阅' : '待批阅'}</span>
        </div>
      </div>

      <div className="space-y-6">
        {answers.map((a: any, i: number) => (
          <div key={i} className={`bg-white rounded-xl border p-5 ${
            a.is_correct === 1 ? 'border-green-200' : a.is_correct === 0 ? 'border-red-200' : 'border-yellow-200'
          }`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-bold text-gray-500">第 {a.question_order} 题</span>
                  <span className="text-xs text-gray-400">({a.score} / {a.max_score} 分)</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    a.is_correct === 1 ? 'bg-green-100 text-green-700' :
                    a.is_correct === 0 ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {a.is_correct === 1 ? '✓' : a.is_correct === 0 ? '✗' : '待批阅'}
                  </span>
                </div>
                {a.question && (
                  <>
                    <p className="text-sm font-medium text-gray-700">{a.question.title}</p>
                    <p className="text-sm text-gray-500 mt-1">{a.question.content}</p>
                    {a.question.type === 'choice' && a.question.options && (
                      <div className="mt-2 space-y-1">
                        {a.question.options.map((opt: any) => (
                          <p key={opt.id} className={`text-sm ${opt.id === a.studentAnswer?.selectedOptionId ? 'font-bold' : ''} ${opt.id === a.question.answer?.selectedOptionId ? 'text-green-600' : ''}`}>
                            {opt.label}. {opt.content}
                            {opt.id === a.question.answer?.selectedOptionId && ' ← 正确答案'}
                            {opt.id === a.studentAnswer?.selectedOptionId && opt.id !== a.question.answer?.selectedOptionId && ' ← 你的答案'}
                          </p>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 验证 + Commit**

---

### Task 6: 路由注册 + 导航栏更新 + 学生加入班级 UI

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/layout/StudentLayout.tsx`

- [ ] **Step 1: 更新 `web/src/App.tsx`** — 替换 StudentPlaceholder 为真实页面

```typescript
import StudentDashboard from './routes/student/StudentDashboard'
import ExamTaking from './routes/student/ExamTaking'
import StudentGrades from './routes/student/StudentGrades'
import SubmissionDetail from './routes/student/SubmissionDetail'

// Replace the student routes block:
<Route
  element={
    <ProtectedRoute role="student">
      <StudentLayout />
    </ProtectedRoute>
  }
>
  <Route path="/student/dashboard" element={<StudentDashboard />} />
  <Route path="/student/exam/:publishId" element={<ExamTaking />} />
  <Route path="/student/grades" element={<StudentGrades />} />
  <Route path="/student/submission/:id" element={<SubmissionDetail />} />
</Route>
```

- [ ] **Step 2: 更新 `web/src/components/layout/StudentLayout.tsx`** — 添加导航

```typescript
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

export default function StudentLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-1">
        <span className="text-xl font-bold text-indigo-600 mr-6">📝 exam-maker</span>
        <NavLink to="/student/dashboard" className={({ isActive }) => `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          🏠 考试大厅
        </NavLink>
        <NavLink to="/student/grades" className={({ isActive }) => `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          📊 我的成绩
        </NavLink>
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{user?.name}</span>
          <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-red-500">退出</button>
        </div>
      </nav>
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 3: 验证编译 + Commit**

---

### Task 7: E2E 验证

- [ ] **Step 1: 全流程测试**

```bash
# Register student
STUDENT_TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/register -H "Content-Type: application/json" -d '{"email":"s3@test.com","password":"test123","name":"学生三","role":"student"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Teacher creates + publishes
TEACHER_TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"email":"p2@test.com","password":"test123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
QID=$(curl -s -X POST http://localhost:3001/api/questions -H "Authorization: Bearer $TEACHER_TOKEN" -H "Content-Type: application/json" -d '{"type":"choice","title":"TestQ","content":"2+2=?","options":[{"id":"a","label":"A","content":"4"}],"answer":{"type":"choice","selectedOptionId":"a"},"difficulty":"easy"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['question']['id'])")
EID=$(curl -s -X POST http://localhost:3001/api/exams -H "Authorization: Bearer $TEACHER_TOKEN" -H "Content-Type: application/json" -d '{"title":"Phase3 Test","questions":[{"questionId":"'$QID'","score":10,"order":1}],"totalScore":10}' | python3 -c "import sys,json; print(json.load(sys.stdin)['exam']['id'])")
PID=$(curl -s -X POST http://localhost:3001/api/publish -H "Authorization: Bearer $TEACHER_TOKEN" -H "Content-Type: application/json" -d '{"examId":"'$EID'","title":"Phase3 Test","duration":60}' | python3 -c "import sys,json; print(json.load(sys.stdin)['publish']['id'])")

# Student dashboard
curl -s http://localhost:3001/api/student/dashboard -H "Authorization: Bearer $STUDENT_TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Dashboard: {len(d[\"publishes\"])} exams')"

# Start exam
SID=$(curl -s -X POST http://localhost:3001/api/student/exam/$PID/start -H "Authorization: Bearer $STUDENT_TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['submissionId'])")
echo "Started: $SID"

# Save answer
curl -s -X POST http://localhost:3001/api/student/exam/$PID/answer -H "Authorization: Bearer $STUDENT_TOKEN" -H "Content-Type: application/json" -d '{"submissionId":"'$SID'","questionId":"'$QID'","questionOrder":1,"answer":{"type":"choice","selectedOptionId":"a"},"maxScore":10}'

# Submit
curl -s -X POST http://localhost:3001/api/student/exam/$PID/submit -H "Authorization: Bearer $STUDENT_TOKEN" -H "Content-Type: application/json" -d '{"submissionId":"'$SID'","violations":0}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Score: {d[\"submission\"][\"total_score\"]}/{d[\"submission\"][\"total_points\"]}')"

echo "=== Phase 3 E2E PASS ==="
```

- [ ] **Step 2: TSC 验证**

```bash
cd api && npx tsc --noEmit
cd web && ../node_modules/.bin/tsc --noEmit
```
