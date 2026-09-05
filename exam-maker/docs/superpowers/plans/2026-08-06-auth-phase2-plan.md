# 阶段 2：教师端基础 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将题库和试卷数据从 localStorage 迁移到 SQLite 后端，新增班级管理和试卷发布功能

**Architecture:** Fastify REST API（带 JWT + teacher 角色鉴权）+ React 前端 store 从 zustand persist 改为 API fetch 调用。SQLite 新增 questions/exams/classes/class_students/exam_publish 5 张表

**Tech Stack:** better-sqlite3, Fastify, React + zustand, react-router-dom v6, Tailwind CSS

## Global Constraints

- 所有 API 端点添加 `requireAuth` + `requireRole('teacher')` 鉴权
- 题库列表分页（每页 20 条，query params: `?page=1&limit=20`）
- 前端兼容现代浏览器最近 2 个主版本
- 后端 Node.js ≥ 18
- Follow existing code style: direct SQL, no ORM, ES modules

---

### Task 1: 数据库新增 5 张表

**Files:**
- Modify: `api/src/db/index.ts` — 添加建表迁移

- [ ] **Step 1: 在 `runMigrations` 中添加新表**

在 `api/src/db/index.ts` 的 `runMigrations` 函数中，`CREATE TABLE IF NOT EXISTS users` 之后追加：

```typescript
db.exec(`
  CREATE TABLE IF NOT EXISTS questions (
    id              TEXT PRIMARY KEY,
    teacher_id      TEXT NOT NULL REFERENCES users(id),
    type            TEXT NOT NULL,
    title           TEXT NOT NULL,
    content         TEXT NOT NULL,
    options         TEXT,
    answer          TEXT NOT NULL,
    difficulty      TEXT NOT NULL DEFAULT 'medium',
    knowledge_points TEXT,
    explanation     TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exams (
    id          TEXT PRIMARY KEY,
    teacher_id  TEXT NOT NULL REFERENCES users(id),
    title       TEXT NOT NULL,
    questions   TEXT NOT NULL,
    total_score REAL NOT NULL,
    status      TEXT DEFAULT 'draft',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS classes (
    id          TEXT PRIMARY KEY,
    teacher_id  TEXT NOT NULL REFERENCES users(id),
    name        TEXT NOT NULL,
    description TEXT,
    join_code   TEXT NOT NULL UNIQUE,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS class_students (
    class_id    TEXT NOT NULL REFERENCES classes(id),
    student_id  TEXT NOT NULL REFERENCES users(id),
    joined_at   INTEGER NOT NULL,
    PRIMARY KEY (class_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS exam_publish (
    id          TEXT PRIMARY KEY,
    exam_id     TEXT NOT NULL,
    teacher_id  TEXT NOT NULL REFERENCES users(id),
    class_id    TEXT REFERENCES classes(id),
    title       TEXT NOT NULL,
    duration    INTEGER NOT NULL,
    start_time  INTEGER,
    end_time    INTEGER,
    shuffle     INTEGER DEFAULT 0,
    retry       INTEGER DEFAULT 0,
    status      TEXT DEFAULT 'draft',
    created_at  INTEGER NOT NULL
  );
`)
```

- [ ] **Step 2: 验证**

```bash
cd api && npx tsc --noEmit
```
预期：编译无错误。重启服务器后表自动创建。

- [ ] **Step 3: Commit**

```bash
git add api/src/db/index.ts
git commit -m "feat: add questions/exams/classes/class_students/exam_publish tables"
```

---

### Task 2: 题库 CRUD API

**Files:**
- Create: `api/src/routes/questions.ts`
- Modify: `api/src/index.ts` — 注册路由

**Interfaces:**
- Consumes: `getDb()`, `requireAuth`, `requireRole('teacher')`, `generateId()`
- Produces: `GET/POST /api/questions`, `GET/PUT/DELETE /api/questions/:id`, `POST /api/questions/import`, `GET /api/questions/export`

- [ ] **Step 1: 创建 `api/src/routes/questions.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/index'
import { requireAuth } from '../middleware/auth'
import { requireRole } from '../middleware/auth'
import { generateId } from '../utils/id'

export async function questionRoutes(app: FastifyInstance) {
  const auth = { preHandler: [requireAuth, requireRole('teacher')] }

  // List — with pagination and filters
  app.get('/api/questions', auth, async (req) => {
    const { page = '1', limit = '20', type, difficulty, kp, keyword } = req.query as Record<string, string>
    const db = getDb()
    const userId = req.user!.userId

    const conditions = ['teacher_id = ?']
    const params: unknown[] = [userId]

    if (type) { conditions.push('type = ?'); params.push(type) }
    if (difficulty) { conditions.push('difficulty = ?'); params.push(difficulty) }
    if (kp) { conditions.push("knowledge_points LIKE ?"); params.push(`%${kp}%`) }
    if (keyword) { conditions.push('(title LIKE ? OR content LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`) }

    const where = conditions.join(' AND ')
    const offset = (parseInt(page) - 1) * parseInt(limit)

    const total = (db.prepare(`SELECT COUNT(*) as count FROM questions WHERE ${where}`).get(...params) as { count: number }).count
    const rows = db.prepare(`SELECT * FROM questions WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset)

    return {
      questions: rows.map((r: any) => ({ ...r, options: r.options ? JSON.parse(r.options) : undefined, answer: JSON.parse(r.answer), knowledgePoints: r.knowledge_points ? JSON.parse(r.knowledge_points) : [] })),
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    }
  })

  // Create
  app.post('/api/questions', auth, async (req) => {
    const db = getDb()
    const now = Date.now()
    const id = generateId()
    const body = req.body as Record<string, any>

    db.prepare(`INSERT INTO questions (id, teacher_id, type, title, content, options, answer, difficulty, knowledge_points, explanation, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, req.user!.userId, body.type, body.title, body.content,
      body.options ? JSON.stringify(body.options) : null,
      JSON.stringify(body.answer),
      body.difficulty || 'medium',
      body.knowledgePoints ? JSON.stringify(body.knowledgePoints) : null,
      body.explanation || null, now, now
    )

    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(id)
    return { question: serializeQuestion(question) }
  })

  // Get
  app.get('/api/questions/:id', auth, async (req) => {
    const { id } = req.params as { id: string }
    const q = getDb().prepare('SELECT * FROM questions WHERE id = ? AND teacher_id = ?').get(id, req.user!.userId)
    if (!q) return { error: 'Not found' }
    return { question: serializeQuestion(q) }
  })

  // Update
  app.put('/api/questions/:id', auth, async (req) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, any>
    const db = getDb()

    db.prepare(`UPDATE questions SET type=?, title=?, content=?, options=?, answer=?, difficulty=?, knowledge_points=?, explanation=?, updated_at=? WHERE id=? AND teacher_id=?`).run(
      body.type, body.title, body.content,
      body.options ? JSON.stringify(body.options) : null,
      JSON.stringify(body.answer),
      body.difficulty, body.knowledgePoints ? JSON.stringify(body.knowledgePoints) : null,
      body.explanation || null, Date.now(), id, req.user!.userId
    )

    return { question: serializeQuestion(db.prepare('SELECT * FROM questions WHERE id = ?').get(id)) }
  })

  // Delete
  app.delete('/api/questions/:id', auth, async (req) => {
    const { id } = req.params as { id: string }
    getDb().prepare('DELETE FROM questions WHERE id = ? AND teacher_id = ?').run(id, req.user!.userId)
    return { ok: true }
  })

  // Import (JSON array + pipeline blueprint)
  app.post('/api/questions/import', auth, async (req) => {
    const body = req.body as { questions: any[] }
    const db = getDb()
    const now = Date.now()
    let count = 0

    for (const q of body.questions) {
      const id = generateId()
      db.prepare(`INSERT INTO questions (id, teacher_id, type, title, content, options, answer, difficulty, knowledge_points, explanation, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, req.user!.userId, q.type, q.title, q.content,
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

  // Export
  app.get('/api/questions/export', auth, async (req) => {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM questions WHERE teacher_id = ? ORDER BY created_at').all(req.user!.userId)
    return rows.map((r: any) => serializeQuestion(r))
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
```

- [ ] **Step 2: 在 `api/src/index.ts` 注册**

```typescript
import { questionRoutes } from './routes/questions'
// ...
await app.register(questionRoutes)
```

- [ ] **Step 3: 验证编译 + curl 测试**

```bash
cd api && npx tsc --noEmit
# Restart server, test with curl:
TOKEN="<teacher jwt>"
curl -s http://localhost:3001/api/questions -H "Authorization: Bearer $TOKEN"
```

- [ ] **Step 4: Commit**

```bash
git add api/src/routes/questions.ts api/src/index.ts
git commit -m "feat: add question CRUD API with pagination and import/export"
```

---

### Task 3: 试卷 CRUD + 自动组卷 API

**Files:**
- Create: `api/src/routes/exams.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: 创建 `api/src/routes/exams.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/index'
import { requireAuth, requireRole } from '../middleware/auth'
import { generateId } from '../utils/id'

const auth = { preHandler: [requireAuth, requireRole('teacher')] }

export async function examRoutes(app: FastifyInstance) {
  // List
  app.get('/api/exams', auth, async (req) => {
    const rows = getDb().prepare('SELECT * FROM exams WHERE teacher_id = ? ORDER BY updated_at DESC').all(req.user!.userId)
    return rows.map(serializeExam)
  })

  // Create
  app.post('/api/exams', auth, async (req) => {
    const db = getDb()
    const now = Date.now()
    const id = generateId()
    const body = req.body as Record<string, any>

    db.prepare('INSERT INTO exams (id, teacher_id, title, questions, total_score, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)').run(
      id, req.user!.userId, body.title, JSON.stringify(body.questions || []), body.totalScore || 0, 'draft', now, now
    )

    return { exam: serializeExam(db.prepare('SELECT * FROM exams WHERE id = ?').get(id)) }
  })

  // Get
  app.get('/api/exams/:id', auth, async (req) => {
    const { id } = req.params as { id: string }
    const e = getDb().prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?').get(id, req.user!.userId)
    if (!e) return { error: 'Not found' }
    return { exam: serializeExam(e) }
  })

  // Update
  app.put('/api/exams/:id', auth, async (req) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, any>
    const db = getDb()

    db.prepare('UPDATE exams SET title=?, questions=?, total_score=?, status=?, updated_at=? WHERE id=? AND teacher_id=?').run(
      body.title, JSON.stringify(body.questions || []), body.totalScore || 0, body.status || 'draft', Date.now(), id, req.user!.userId
    )

    return { exam: serializeExam(db.prepare('SELECT * FROM exams WHERE id = ?').get(id)) }
  })

  // Delete
  app.delete('/api/exams/:id', auth, async (req) => {
    const { id } = req.params as { id: string }
    getDb().prepare('DELETE FROM exams WHERE id = ? AND teacher_id = ?').run(id, req.user!.userId)
    return { ok: true }
  })

  // Auto-generate from rule
  app.post('/api/exams/generate', auth, async (req) => {
    const body = req.body as { name: string; sections: any[]; totalScore: number }
    const db = getDb()
    const now = Date.now()

    // For each section, randomly pick questions matching criteria from the teacher's pool
    const examQuestions: any[] = []
    for (const section of body.sections) {
      let query = 'SELECT * FROM questions WHERE teacher_id = ? AND type = ?'
      const params: any[] = [req.user!.userId, section.type]

      if (section.difficulty) {
        query += ' AND difficulty = ?'
        params.push(section.difficulty)
      }

      const pool = db.prepare(query).all(...params) as any[]
      // Random shuffle and pick
      const shuffled = pool.sort(() => Math.random() - 0.5)
      const picked = shuffled.slice(0, section.count)

      picked.forEach((q: any, i: number) => {
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
      id, req.user!.userId, body.name, JSON.stringify(examQuestions), totalScore, 'draft', now, now
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
```

- [ ] **Step 2: 注册路由**

```typescript
import { examRoutes } from './routes/exams'
await app.register(examRoutes)
```

- [ ] **Step 3: 验证编译**

```bash
cd api && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

---

### Task 4: 班级管理 API

**Files:**
- Create: `api/src/routes/classes.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: 创建 `api/src/routes/classes.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/index'
import { requireAuth, requireRole } from '../middleware/auth'
import { generateId } from '../utils/id'

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const auth = { preHandler: [requireAuth, requireRole('teacher')] }

export async function classRoutes(app: FastifyInstance) {
  app.get('/api/classes', auth, async (req) => {
    const rows = getDb().prepare('SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at DESC').all(req.user!.userId)
    return rows.map((c: any) => ({
      ...c,
      studentCount: (getDb().prepare('SELECT COUNT(*) as c FROM class_students WHERE class_id = ?').get(c.id) as any).c,
    }))
  })

  app.post('/api/classes', auth, async (req) => {
    const { name, description } = req.body as { name: string; description?: string }
    const db = getDb()
    const id = generateId()
    const joinCode = randomCode()
    const now = Date.now()

    db.prepare('INSERT INTO classes (id, teacher_id, name, description, join_code, created_at) VALUES (?,?,?,?,?,?)').run(id, req.user!.userId, name, description || '', joinCode, now)

    return { class: db.prepare('SELECT * FROM classes WHERE id = ?').get(id) }
  })

  app.put('/api/classes/:id', auth, async (req) => {
    const { id } = req.params as { id: string }
    const { name, description } = req.body as { name: string; description?: string }
    getDb().prepare('UPDATE classes SET name=?, description=? WHERE id=? AND teacher_id=?').run(name, description || '', id, req.user!.userId)
    return { ok: true }
  })

  app.delete('/api/classes/:id', auth, async (req) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    db.prepare('DELETE FROM class_students WHERE class_id = ?').run(id)
    db.prepare('DELETE FROM classes WHERE id = ? AND teacher_id = ?').run(id, req.user!.userId)
    return { ok: true }
  })

  app.get('/api/classes/:id/students', auth, async (req) => {
    const { id } = req.params as { id: string }
    const rows = getDb().prepare(`
      SELECT u.id, u.name, u.email, cs.joined_at
      FROM class_students cs JOIN users u ON cs.student_id = u.id
      WHERE cs.class_id = ?
      ORDER BY cs.joined_at
    `).all(id)
    return { students: rows }
  })

  app.post('/api/classes/:id/students', auth, async (req) => {
    const { id } = req.params as { id: string }
    const { emails } = req.body as { emails: string[] }
    const db = getDb()
    const now = Date.now()
    let added = 0

    for (const email of emails) {
      const student = db.prepare('SELECT id FROM users WHERE email = ? AND role = ?').get(email.trim(), 'student') as any
      if (!student) continue
      try {
        db.prepare('INSERT OR IGNORE INTO class_students (class_id, student_id, joined_at) VALUES (?,?,?)').run(id, student.id, now)
        added++
      } catch { /* already in class */ }
    }

    return { added }
  })

  app.delete('/api/classes/:id/students/:sid', auth, async (req) => {
    const { id, sid } = req.params as { id: string; sid: string }
    getDb().prepare('DELETE FROM class_students WHERE class_id = ? AND student_id = ?').run(id, sid)
    return { ok: true }
  })
}
```

- [ ] **Step 2: 注册并验证编译**

```bash
cd api && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

---

### Task 5: 试卷发布 API

**Files:**
- Create: `api/src/routes/publish.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: 创建 `api/src/routes/publish.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/index'
import { requireAuth, requireRole } from '../middleware/auth'
import { generateId } from '../utils/id'

const auth = { preHandler: [requireAuth, requireRole('teacher')] }

export async function publishRoutes(app: FastifyInstance) {
  app.post('/api/publish', auth, async (req) => {
    const body = req.body as { examId: string; classId?: string; title: string; duration: number; startTime?: number; endTime?: number; shuffle?: boolean; retry?: number }
    const db = getDb()
    const id = generateId()

    db.prepare(`INSERT INTO exam_publish (id, exam_id, teacher_id, class_id, title, duration, start_time, end_time, shuffle, retry, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, body.examId, req.user!.userId, body.classId || null, body.title, body.duration,
      body.startTime || null, body.endTime || null,
      body.shuffle ? 1 : 0, body.retry || 0, 'published', Date.now()
    )

    return { publish: db.prepare('SELECT * FROM exam_publish WHERE id = ?').get(id) }
  })

  app.get('/api/publish', auth, async (req) => {
    const rows = getDb().prepare('SELECT * FROM exam_publish WHERE teacher_id = ? ORDER BY created_at DESC').all(req.user!.userId)
    return { publishes: rows }
  })

  app.put('/api/publish/:id', auth, async (req) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, any>
    getDb().prepare('UPDATE exam_publish SET title=?, duration=?, start_time=?, end_time=?, shuffle=?, retry=?, status=? WHERE id=? AND teacher_id=?').run(
      body.title, body.duration, body.startTime || null, body.endTime || null, body.shuffle ? 1 : 0, body.retry || 0, body.status || 'published', id, req.user!.userId
    )
    return { ok: true }
  })

  app.delete('/api/publish/:id', auth, async (req) => {
    const { id } = req.params as { id: string }
    getDb().prepare('DELETE FROM exam_publish WHERE id = ? AND teacher_id = ?').run(id, req.user!.userId)
    return { ok: true }
  })
}
```

- [ ] **Step 2: 注册并验证**

```bash
cd api && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

---

### Task 6: 前端 questionStore 改为 API 调用

**Files:**
- Modify: `web/src/store/questionStore.ts` — 从 localStorage persist 改为 API fetch

- [ ] **Step 1: 重写 `web/src/store/questionStore.ts`**

```typescript
import { create } from 'zustand'
import type { Question, QuestionType, Difficulty } from '../types'
import { useAuthStore } from './authStore'

interface QuestionFilter {
  type?: QuestionType
  difficulty?: Difficulty
  knowledgePoint?: string
  keyword?: string
}

interface QuestionState {
  questions: Question[]
  loading: boolean
  error: string | null

  fetchQuestions: (filter?: QuestionFilter) => Promise<void>
  addQuestion: (q: Omit<Question, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Question | null>
  updateQuestion: (id: string, data: Partial<Question>) => Promise<void>
  deleteQuestion: (id: string) => Promise<void>
  deleteQuestions: (ids: string[]) => Promise<void>
  batchSetDifficulty: (ids: string[], difficulty: Difficulty) => Promise<void>
  importQuestions: (json: string) => Promise<number>
  exportQuestions: () => Promise<string>
}

const API = 'http://localhost:3001'

function headers() {
  const token = useAuthStore.getState().token
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

export const useQuestionStore = create<QuestionState>()((set, get) => ({
  questions: [],
  loading: false,
  error: null,

  fetchQuestions: async (filter) => {
    set({ loading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (filter?.type) params.set('type', filter.type)
      if (filter?.difficulty) params.set('difficulty', filter.difficulty)
      if (filter?.knowledgePoint) params.set('kp', filter.knowledgePoint)
      if (filter?.keyword) params.set('keyword', filter.keyword)

      const res = await fetch(`${API}/api/questions?${params}`, { headers: headers() })
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      set({ questions: data.questions, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  addQuestion: async (q) => {
    const res = await fetch(`${API}/api/questions`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify(q),
    })
    if (!res.ok) return null
    const data = await res.json()
    set((s) => ({ questions: [data.question, ...s.questions] }))
    return data.question
  },

  updateQuestion: async (id, data) => {
    await fetch(`${API}/api/questions/${id}`, {
      method: 'PUT', headers: headers(),
      body: JSON.stringify(data),
    })
    set((s) => ({ questions: s.questions.map((q) => q.id === id ? { ...q, ...data, updatedAt: Date.now() } : q) }))
  },

  deleteQuestion: async (id) => {
    await fetch(`${API}/api/questions/${id}`, { method: 'DELETE', headers: headers() })
    set((s) => ({ questions: s.questions.filter((q) => q.id !== id) }))
  },

  deleteQuestions: async (ids) => {
    for (const id of ids) {
      await fetch(`${API}/api/questions/${id}`, { method: 'DELETE', headers: headers() })
    }
    set((s) => ({ questions: s.questions.filter((q) => !ids.includes(q.id)) }))
  },

  batchSetDifficulty: async (ids, difficulty) => {
    for (const id of ids) {
      await fetch(`${API}/api/questions/${id}`, {
        method: 'PUT', headers: headers(),
        body: JSON.stringify({ difficulty }),
      })
    }
    set((s) => ({ questions: s.questions.map((q) => ids.includes(q.id) ? { ...q, difficulty } : q) }))
  },

  importQuestions: async (json) => {
    const parsed = JSON.parse(json)
    const res = await fetch(`${API}/api/questions/import`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ questions: Array.isArray(parsed) ? parsed : parsed.questions }),
    })
    const data = await res.json()
    get().fetchQuestions()
    return data.imported
  },

  exportQuestions: async () => {
    const res = await fetch(`${API}/api/questions/export`, { headers: headers() })
    const data = await res.json()
    return JSON.stringify(data, null, 2)
  },
}))
```

- [ ] **Step 2: 验证编译**

```bash
cd web && ../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 3: Commit**

---

### Task 7: 前端 examStore 改为 API 调用

**Files:**
- Modify: `web/src/store/examStore.ts`

- [ ] **Step 1: 重写 `web/src/store/examStore.ts`**

```typescript
import { create } from 'zustand'
import type { Exam, GenerationRule } from '../types'
import { useAuthStore } from './authStore'

const API = 'http://localhost:3001'

function headers() {
  const token = useAuthStore.getState().token
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

interface ExamState {
  exams: Exam[]
  loading: boolean

  fetchExams: () => Promise<void>
  createExam: (title: string) => Promise<Exam | null>
  deleteExam: (id: string) => Promise<void>
  updateExam: (id: string, data: Partial<Exam>) => Promise<void>
  addQuestionToExam: (examId: string, questionId: string, score: number) => Promise<void>
  removeQuestionFromExam: (examId: string, questionId: string) => Promise<void>
  generateExamFromRule: (rule: GenerationRule) => Promise<Exam | null>
}

export const useExamStore = create<ExamState>()((set, get) => ({
  exams: [],
  loading: false,

  fetchExams: async () => {
    set({ loading: true })
    const res = await fetch(`${API}/api/exams`, { headers: headers() })
    const data = await res.json()
    set({ exams: Array.isArray(data) ? data : data.exams || [], loading: false })
  },

  createExam: async (title) => {
    const res = await fetch(`${API}/api/exams`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ title, questions: [], totalScore: 0 }),
    })
    if (!res.ok) return null
    const data = await res.json()
    set((s) => ({ exams: [data.exam, ...s.exams] }))
    return data.exam
  },

  deleteExam: async (id) => {
    await fetch(`${API}/api/exams/${id}`, { method: 'DELETE', headers: headers() })
    set((s) => ({ exams: s.exams.filter((e) => e.id !== id) }))
  },

  updateExam: async (id, data) => {
    await fetch(`${API}/api/exams/${id}`, {
      method: 'PUT', headers: headers(),
      body: JSON.stringify(data),
    })
    set((s) => ({ exams: s.exams.map((e) => e.id === id ? { ...e, ...data, updatedAt: Date.now() } : e) }))
  },

  addQuestionToExam: async (examId, questionId, score) => {
    const exam = get().exams.find((e) => e.id === examId)
    if (!exam) return
    const questions = [...exam.questions, { questionId, score, order: exam.questions.length + 1 }]
    const totalScore = questions.reduce((s, q) => s + q.score, 0)
    await get().updateExam(examId, { questions, totalScore })
  },

  removeQuestionFromExam: async (examId, questionId) => {
    const exam = get().exams.find((e) => e.id === examId)
    if (!exam) return
    const questions = exam.questions.filter((q) => q.questionId !== questionId).map((q, i) => ({ ...q, order: i + 1 }))
    const totalScore = questions.reduce((s, q) => s + q.score, 0)
    await get().updateExam(examId, { questions, totalScore })
  },

  generateExamFromRule: async (rule) => {
    const res = await fetch(`${API}/api/exams/generate`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify(rule),
    })
    if (!res.ok) return null
    const data = await res.json()
    set((s) => ({ exams: [data.exam, ...s.exams] }))
    return data.exam
  },
}))
```

- [ ] **Step 2: 验证编译**

```bash
cd web && ../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 3: Commit**

---

### Task 8: 前端班级页面 + 发布弹窗 + 路由

**Files:**
- Create: `web/src/routes/ClassList.tsx`
- Create: `web/src/routes/ClassDetail.tsx`
- Modify: `web/src/App.tsx` — 添加 `/classes`, `/classes/:id` 路由

- [ ] **Step 1: 创建 `web/src/routes/ClassList.tsx`**

```typescript
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const API = 'http://localhost:3001'

function headers() {
  const token = useAuthStore.getState().token
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

export default function ClassList() {
  const [classes, setClasses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const fetchClasses = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`${API}/api/classes`, { headers: headers() })
    const data = await res.json()
    setClasses(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchClasses() }, [fetchClasses])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await fetch(`${API}/api/classes`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ name, description }),
    })
    setName(''); setDescription(''); setShowCreate(false)
    fetchClasses()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此班级？')) return
    await fetch(`${API}/api/classes/${id}`, { method: 'DELETE', headers: headers() })
    fetchClasses()
  }

  if (loading) return <div className="text-center py-12 text-gray-400">加载中...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">班级管理</h1>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm hover:bg-indigo-600">+ 创建班级</button>
      </div>

      {showCreate && (
        <div className="mb-6 p-4 bg-white rounded-xl border border-gray-200">
          <form onSubmit={handleCreate} className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">班级名称</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 outline-none" required />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">描述（可选）</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 outline-none" />
            </div>
            <button type="submit" className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm">创建</button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">取消</button>
          </form>
        </div>
      )}

      {classes.length === 0 ? (
        <div className="text-center py-24 text-gray-400 text-sm">还没有班级，点击上方按钮创建</div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {classes.map((c: any) => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
              <Link to={`/classes/${c.id}`} className="text-lg font-semibold text-gray-900 hover:text-indigo-600">{c.name}</Link>
              <p className="text-sm text-gray-400 mt-1">{c.description || '无描述'}</p>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <span className="text-xs text-gray-500">邀请码: <code className="bg-gray-100 px-1 rounded">{c.join_code}</code></span>
                <span className="text-xs text-gray-400">{c.studentCount || 0} 名学生</span>
              </div>
              <button onClick={() => handleDelete(c.id)} className="mt-3 text-xs text-red-400 hover:text-red-600">删除</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 创建 `web/src/routes/ClassDetail.tsx`**

```typescript
import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const API = 'http://localhost:3001'

function headers() {
  const token = useAuthStore.getState().token
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

export default function ClassDetail() {
  const { id } = useParams<{ id: string }>()
  const [classData, setClassData] = useState<any>(null)
  const [students, setStudents] = useState<any[]>([])
  const [emailInput, setEmailInput] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [classRes, studentRes] = await Promise.all([
      fetch(`${API}/api/classes`, { headers: headers() }),
      fetch(`${API}/api/classes/${id}/students`, { headers: headers() }),
    ])
    const classes = await classRes.json()
    const studentData = await studentRes.json()
    setClassData(Array.isArray(classes) ? classes.find((c: any) => c.id === id) : null)
    setStudents(studentData.students || [])
    setLoading(false)
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAddStudents = async () => {
    const emails = emailInput.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
    if (emails.length === 0) return
    const res = await fetch(`${API}/api/classes/${id}/students`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ emails }),
    })
    const data = await res.json()
    alert(`成功添加 ${data.added} 名学生`)
    setEmailInput('')
    fetchData()
  }

  const handleRemove = async (sid: string) => {
    await fetch(`${API}/api/classes/${id}/students/${sid}`, { method: 'DELETE', headers: headers() })
    fetchData()
  }

  if (loading || !classData) return <div className="text-center py-12 text-gray-400">加载中...</div>

  return (
    <div>
      <Link to="/classes" className="text-sm text-indigo-600 hover:text-indigo-800 mb-4 inline-block">← 返回班级列表</Link>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{classData.name}</h1>
          <p className="text-sm text-gray-400 mt-1">邀请码: <code className="bg-gray-100 px-2 py-0.5 rounded text-indigo-600 font-mono">{classData.join_code}</code></p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">添加学生</h3>
          <textarea value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="输入学生邮箱，每行一个或用逗号分隔" rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-indigo-200 outline-none mb-3" />
          <button onClick={handleAddStudents} className="px-4 py-1.5 bg-indigo-500 text-white rounded-lg text-sm">添加</button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">学生列表 ({students.length})</h3>
          {students.length === 0 ? (
            <p className="text-sm text-gray-400">暂无学生</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {students.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.email}</p>
                  </div>
                  <button onClick={() => handleRemove(s.id)} className="text-xs text-red-400 hover:text-red-600">移除</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 在 `web/src/App.tsx` 添加路由**

在 TeacherLayout 的 Routes 中添加：
```typescript
<Route path="/classes" element={<ClassList />} />
<Route path="/classes/:id" element={<ClassDetail />} />
```

同时在 imports 中添加：
```typescript
import ClassList from './routes/ClassList'
import ClassDetail from './routes/ClassDetail'
```

- [ ] **Step 4: 更新 TeacherLayout 导航栏**

在 `web/src/components/layout/TeacherLayout.tsx` 的 navItems 中添加：
```typescript
{ to: '/classes', label: '👥 班级' },
```

- [ ] **Step 5: 验证编译**

```bash
cd web && ../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 6: Commit**

---

### Task 9: 前端页面适配 — useEffect 加载数据 + 导出/导入更新 + 发布功能

**Files:**
- Modify: `web/src/routes/QuestionBank.tsx` — useEffect 调用 `fetchQuestions`
- Modify: `web/src/routes/ExamList.tsx` — useEffect 调用 `fetchExams`
- Modify: `web/src/routes/ExamViewer.tsx` — 添加 "发布" 按钮

- [ ] **Step 1: QuestionBank 添加数据加载**

在 `QuestionBank.tsx` 顶部添加：
```typescript
import { useEffect } from 'react'

// In component:
const { fetchQuestions } = useQuestionStore()
useEffect(() => { fetchQuestions() }, [])
```

更新导出按钮为 async：
```typescript
const handleExport = async () => {
  const json = await exportQuestions()
  const blob = new Blob([json], { type: 'application/json' })
  // ... rest of download logic
}
```

- [ ] **Step 2: ExamList 添加数据加载**

在 `ExamList.tsx` 组件中添加：
```typescript
const { fetchExams } = useExamStore()
useEffect(() => { fetchExams() }, [])
```

- [ ] **Step 3: ExamViewer 添加发布按钮**

在 `ExamViewer.tsx` 的状态栏旁添加：
```typescript
const [showPublish, setShowPublish] = useState(false)
// ...
<button onClick={() => setShowPublish(true)} className="px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg">发布</button>
```

当 `showPublish` 为 true 时，渲染发布表单：
```typescript
{showPublish && (
  <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
    <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
      <h3 className="font-semibold text-lg">发布试卷</h3>
      <input placeholder="发布标题" className="w-full px-3 py-2 border rounded-lg text-sm" onChange={...} />
      <input type="number" placeholder="考试时长（分钟）" className="w-full px-3 py-2 border rounded-lg text-sm" onChange={...} />
      <div className="flex gap-2">
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" /> 打乱题目顺序</label>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => setShowPublish(false)} className="px-4 py-1.5 border rounded-lg text-sm">取消</button>
        <button onClick={handlePublish} className="px-4 py-1.5 bg-green-500 text-white rounded-lg text-sm">确认发布</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: 验证 + Commit**

---

### Task 10: E2E 验证

- [ ] **Step 1: 验证 API 端点**

```bash
TOKEN="<teacher JWT from login>"

# Questions
curl -s http://localhost:3001/api/questions -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -10
curl -s -X POST http://localhost:3001/api/questions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"type":"choice","title":"测试","content":"测试内容","answer":{"type":"choice","selectedOptionId":"a1"},"difficulty":"medium"}'

# Exams
curl -s -X POST http://localhost:3001/api/exams -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title":"测试试卷","questions":[],"totalScore":0}'

# Classes
curl -s -X POST http://localhost:3001/api/classes -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"测试班级","description":"测试"}'

# Publish
curl -s -X POST http://localhost:3001/api/publish -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"examId":"<exam id>","title":"期中考试","duration":120}'
```

所有端点返回 200 系列响应。

- [ ] **Step 2: 验证 TSC 两项目编译**

```bash
cd api && npx tsc --noEmit
cd web && ../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 3: Commit**

---

## 自检

- [x] questions/exams/classes/exam_publish 4 张新表 + class_students 关联表
- [x] 题库 CRUD + 分页 + 筛选 + 导入/导出
- [x] 试卷 CRUD + 自动组卷（题库随机抽题）
- [x] 班级 CRUD + 学生批量导入/移除
- [x] 试卷发布（设置时长/时间/打乱/重试）
- [x] 前端 store 从 localStorage 迁移到 API 调用
- [x] 前端 ClassList + ClassDetail 页面
- [x] 前端路由 + 导航更新
- [x] 发布弹窗
