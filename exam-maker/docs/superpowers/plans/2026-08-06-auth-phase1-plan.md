# 阶段 1：认证系统 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 exam-maker 添加 JWT 认证系统，包括注册/登录/路由守卫/教师学生双端布局

**Architecture:** Fastify + better-sqlite3 存储用户，bcrypt 加密密码，JWT 24h 鉴权。前端拆分为 AuthLayout / TeacherLayout / StudentLayout 三种布局，ProtectedRoute 组件实现角色路由守卫

**Tech Stack:** better-sqlite3, bcrypt, jsonwebtoken, React + zustand, react-router-dom v6

## Global Constraints

- 密码 bcrypt 10 rounds 加密
- JWT 24h 过期，payload: `{ userId, role, iat, exp }`
- 所有非认证 API 路由后续阶段需添加 JWT 鉴权
- 前端兼容现代浏览器最近 2 个主版本
- 后端 Node.js ≥ 18

---

### Task 1: 安装依赖 + 初始化 SQLite

**Files:**
- Modify: `api/package.json`
- Create: `api/src/db/index.ts`
- Create: `api/.env`

**Interfaces:**
- Produces: `initDatabase(): Database` — 导出 better-sqlite3 Database 实例，自动建表
- Produces: `getDb(): Database` — 获取已初始化的 db 单例

- [ ] **Step 1: 安装后端新依赖**

```bash
cd api && npm install better-sqlite3 bcrypt jsonwebtoken
npm install -D @types/better-sqlite3 @types/bcrypt @types/jsonwebtoken
```

- [ ] **Step 2: 确保 `.env` 中有 JWT_SECRET**

读取 `api/.env`，确认包含：
```
JWT_SECRET=change-me-to-a-random-string
```
如不存在则追加。

- [ ] **Step 3: 创建 `api/src/db/index.ts`**

```typescript
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DATA_ROOT = process.env.EXAM_DATA_ROOT || '/data/exams'
const DB_PATH = path.join(DATA_ROOT, 'exam-maker.db')

let db: Database.Database | null = null

export function getDb(): Database {
  if (!db) {
    fs.mkdirSync(DATA_ROOT, { recursive: true })
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
  }
  return db
}

function runMigrations(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      email       TEXT NOT NULL UNIQUE,
      password    TEXT NOT NULL,
      name        TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'student',
      avatar_url  TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
  `)
}
```

- [ ] **Step 4: 启动时初始化数据库**

在 `api/src/index.ts` 的顶部（import 之后，route 注册之前）添加：
```typescript
import { getDb } from './db/index'

// Initialize database
getDb()
console.log('SQLite database initialized')
```

- [ ] **Step 5: 验证**

```bash
cd api && npx tsc --noEmit
```
预期：编译无错误。

- [ ] **Step 6: Commit**

```bash
git add api/package.json api/package-lock.json api/.env api/src/db/index.ts api/src/index.ts
git commit -m "feat: add SQLite database initialization with users table"
```

---

### Task 2: 认证中间件

**Files:**
- Create: `api/src/middleware/auth.ts`

**Interfaces:**
- Consumes: `getDb()` from Task 1
- Produces: `requireAuth: preHandlerHook` — 验证 JWT，注入 `req.user = { userId, role }`
- Produces: `requireRole(role): preHandlerHook` — 检查角色

- [ ] **Step 1: 创建 `api/src/middleware/auth.ts`**

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

export interface JwtPayload {
  userId: string
  role: 'teacher' | 'student'
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload
  }
}

function extractToken(req: FastifyRequest): string | null {
  const auth = req.headers.authorization
  if (!auth) return null
  const parts = auth.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null
  return parts[1]
}

export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const token = extractToken(req)
  if (!token) {
    return reply.status(401).send({ error: '未登录' })
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload
    req.user = payload
  } catch {
    return reply.status(401).send({ error: '登录已过期，请重新登录' })
  }
}

export function requireRole(role: 'teacher' | 'student') {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) {
      return reply.status(401).send({ error: '未登录' })
    }
    if (req.user.role !== role) {
      return reply.status(403).send({ error: '无权访问' })
    }
  }
}
```

- [ ] **Step 2: 验证编译**

```bash
cd api && npx tsc --noEmit
```
预期：编译无错误。

- [ ] **Step 3: Commit**

```bash
git add api/src/middleware/auth.ts
git commit -m "feat: add JWT auth middleware with role checking"
```

---

### Task 3: 认证 API 端点

**Files:**
- Create: `api/src/routes/auth.ts`
- Modify: `api/src/index.ts` — 注册 auth 路由

**Interfaces:**
- Consumes: `getDb()` from Task 1, `requireAuth` from Task 2
- Produces: POST `/api/auth/register`, POST `/api/auth/login`, GET `/api/auth/me`, POST `/api/auth/refresh`

- [ ] **Step 1: 创建 `api/src/routes/auth.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { getDb } from '../db/index'
import { requireAuth, type JwtPayload } from '../middleware/auth'
import { generateId } from '../utils/id'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
const JWT_EXPIRES = '24h'

function signToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES })
}

function sanitizeUser(row: Record<string, unknown>) {
  const { password, ...user } = row
  return user
}

export async function authRoutes(app: FastifyInstance) {
  // Register
  app.post('/api/auth/register', async (req, reply) => {
    const { email, password, name, role } = req.body as {
      email: string; password: string; name: string; role: string
    }

    if (!email || !password || !name) {
      return reply.status(400).send({ error: '邮箱、密码、姓名为必填项' })
    }
    if (!['teacher', 'student'].includes(role)) {
      return reply.status(400).send({ error: '角色必须是 teacher 或 student' })
    }
    if (password.length < 6) {
      return reply.status(400).send({ error: '密码至少 6 位' })
    }

    const db = getDb()
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (existing) {
      return reply.status(409).send({ error: '该邮箱已被注册' })
    }

    const now = Date.now()
    const id = generateId()
    const hash = await bcrypt.hash(password, 10)

    db.prepare(`
      INSERT INTO users (id, email, password, name, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, email, hash, name, role, now, now)

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown>
    const token = signToken(id, role)

    return reply.status(201).send({ token, user: sanitizeUser(user) })
  })

  // Login
  app.post('/api/auth/login', async (req, reply) => {
    const { email, password } = req.body as { email: string; password: string }

    if (!email || !password) {
      return reply.status(400).send({ error: '邮箱和密码为必填项' })
    }

    const db = getDb()
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as Record<string, unknown> | undefined
    if (!user) {
      return reply.status(401).send({ error: '邮箱或密码错误' })
    }

    const valid = await bcrypt.compare(password, user.password as string)
    if (!valid) {
      return reply.status(401).send({ error: '邮箱或密码错误' })
    }

    const token = signToken(user.id as string, user.role as string)
    return { token, user: sanitizeUser(user) }
  })

  // Get current user
  app.get('/api/auth/me', { preHandler: [requireAuth] }, async (req) => {
    const db = getDb()
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.userId) as Record<string, unknown>
    return { user: sanitizeUser(user) }
  })

  // Refresh token
  app.post('/api/auth/refresh', { preHandler: [requireAuth] }, async (req) => {
    const token = signToken(req.user!.userId, req.user!.role)
    return { token }
  })
}
```

- [ ] **Step 2: 在 `api/src/index.ts` 注册路由**

```typescript
import { authRoutes } from './routes/auth'

// 在现有 route 注册之前添加：
await app.register(authRoutes)
```

- [ ] **Step 3: 验证编译**

```bash
cd api && npx tsc --noEmit
```
预期：编译无错误。

- [ ] **Step 4: Commit**

```bash
git add api/src/routes/auth.ts api/src/index.ts
git commit -m "feat: add register/login/me/refresh auth endpoints"
```

---

### Task 4: 前端 authStore

**Files:**
- Create: `web/src/store/authStore.ts`

**Interfaces:**
- Produces: `useAuthStore()` — zustand store
  - State: `{ user, token, loading }`
  - Actions: `login(email, password)`, `register(email, password, name, role)`, `logout()`, `fetchMe()`

- [ ] **Step 1: 创建 `web/src/store/authStore.ts`**

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  name: string
  role: 'teacher' | 'student'
  avatar_url?: string
}

interface AuthState {
  user: User | null
  token: string | null
  loading: boolean
  error: string | null

  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string, role: 'teacher' | 'student') => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
  clearError: () => void
}

const API_BASE = 'http://localhost:3001'

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      loading: false,
      error: null,

      login: async (email, password) => {
        set({ loading: true, error: null })
        try {
          const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || '登录失败')
          set({ token: data.token, user: data.user, loading: false })
        } catch (err) {
          set({ error: err instanceof Error ? err.message : '未知错误', loading: false })
          throw err
        }
      },

      register: async (email, password, name, role) => {
        set({ loading: true, error: null })
        try {
          const res = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name, role }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || '注册失败')
          set({ token: data.token, user: data.user, loading: false })
        } catch (err) {
          set({ error: err instanceof Error ? err.message : '未知错误', loading: false })
          throw err
        }
      },

      logout: () => {
        set({ user: null, token: null, error: null })
      },

      fetchMe: async () => {
        const { token } = get()
        if (!token) return
        set({ loading: true })
        try {
          const res = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!res.ok) {
            set({ user: null, token: null })
            return
          }
          const data = await res.json()
          set({ user: data.user, loading: false })
        } catch {
          set({ loading: false })
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'exam-maker-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
)
```

- [ ] **Step 2: 验证编译**

```bash
cd web && npx tsc --noEmit
```
预期：编译无错误。

- [ ] **Step 3: Commit**

```bash
git add web/src/store/authStore.ts
git commit -m "feat: add authStore with login/register/logout/fetchMe"
```

---

### Task 5: AuthLayout + 登录/注册页面

**Files:**
- Create: `web/src/components/layout/AuthLayout.tsx`
- Create: `web/src/routes/Login.tsx`
- Create: `web/src/routes/Register.tsx`

**Interfaces:**
- Consumes: `useAuthStore` from Task 4
- Produces: 纯 UI，无导出接口

- [ ] **Step 1: 创建 `web/src/components/layout/AuthLayout.tsx`**

```typescript
import { Outlet } from 'react-router-dom'

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-600">📝 exam-maker</h1>
          <p className="text-gray-500 mt-2 text-sm">在线组卷与考试平台</p>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 创建 `web/src/routes/Login.tsx`**

```typescript
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function Login() {
  const navigate = useNavigate()
  const { login, loading, error, clearError } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await login(email, password)
      const role = useAuthStore.getState().user?.role
      navigate(role === 'teacher' ? '/' : '/student/dashboard')
    } catch { /* error is set in store */ }
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
      <h2 className="text-xl font-semibold text-gray-900 text-center mb-6">登录</h2>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={clearError} className="text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            placeholder="请输入邮箱"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            placeholder="请输入密码"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-indigo-500 text-white rounded-lg font-medium text-sm hover:bg-indigo-600 disabled:opacity-50 transition-colors"
        >
          {loading ? '登录中...' : '登录'}
        </button>
      </form>

      <p className="text-center text-sm text-gray-400 mt-4">
        还没有账号？<Link to="/register" className="text-indigo-600 hover:text-indigo-800">立即注册 →</Link>
      </p>
    </div>
  )
}
```

- [ ] **Step 3: 创建 `web/src/routes/Register.tsx`**

```typescript
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function Register() {
  const navigate = useNavigate()
  const { register, loading, error, clearError } = useAuthStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'teacher' | 'student'>('student')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await register(email, password, name, role)
      const userRole = useAuthStore.getState().user?.role
      navigate(userRole === 'teacher' ? '/' : '/student/dashboard')
    } catch { /* error is set in store */ }
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
      <h2 className="text-xl font-semibold text-gray-900 text-center mb-6">注册</h2>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={clearError} className="text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            placeholder="请输入姓名"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            placeholder="请输入邮箱"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            placeholder="至少 6 位"
            required
            minLength={6}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">角色</label>
          <div className="flex gap-2">
            {[
              { value: 'teacher' as const, label: '🧑‍🏫 教师', desc: '管理题库、发布试卷' },
              { value: 'student' as const, label: '🎓 学生', desc: '参加考试、查看成绩' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRole(opt.value)}
                className={`flex-1 p-3 rounded-lg border-2 text-sm transition-colors ${
                  role === opt.value
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium">{opt.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-indigo-500 text-white rounded-lg font-medium text-sm hover:bg-indigo-600 disabled:opacity-50 transition-colors"
        >
          {loading ? '注册中...' : '注册'}
        </button>
      </form>

      <p className="text-center text-sm text-gray-400 mt-4">
        已有账号？<Link to="/login" className="text-indigo-600 hover:text-indigo-800">立即登录 →</Link>
      </p>
    </div>
  )
}
```

- [ ] **Step 4: 验证编译**

```bash
cd web && npx tsc --noEmit
```
预期：编译无错误。

- [ ] **Step 5: Commit**

```bash
git add web/src/components/layout/AuthLayout.tsx web/src/routes/Login.tsx web/src/routes/Register.tsx
git commit -m "feat: add AuthLayout, Login and Register pages"
```

---

### Task 6: ProtectedRoute 组件

**Files:**
- Create: `web/src/components/auth/ProtectedRoute.tsx`

**Interfaces:**
- Consumes: `useAuthStore` from Task 4
- Produces: `<ProtectedRoute role="teacher"><Outlet /></ProtectedRoute>` 组件

- [ ] **Step 1: 创建 `web/src/components/auth/ProtectedRoute.tsx`**

```typescript
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

interface ProtectedRouteProps {
  children: React.ReactNode
  role?: 'teacher' | 'student'
}

export default function ProtectedRoute({ children, role }: ProtectedRouteProps) {
  const { token, user } = useAuthStore()

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  if (role && user.role !== role) {
    const redirectTo = user.role === 'teacher' ? '/' : '/student/dashboard'
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}
```

- [ ] **Step 2: 验证编译**

```bash
cd web && npx tsc --noEmit
```
预期：编译无错误。

- [ ] **Step 3: Commit**

```bash
git add web/src/components/auth/ProtectedRoute.tsx
git commit -m "feat: add ProtectedRoute with role guard"
```

---

### Task 7: 拆分 Layout + 更新 App.tsx 路由

**Files:**
- Modify: `web/src/App.tsx` — 拆分为三组路由
- Create: `web/src/components/layout/TeacherLayout.tsx`
- Create: `web/src/components/layout/StudentLayout.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (Task 4), `ProtectedRoute` (Task 6), `AuthLayout` (Task 5)

- [ ] **Step 1: 创建 `web/src/components/layout/TeacherLayout.tsx`**

```typescript
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const navItems = [
  { to: '/', label: '🤖 AI 命题' },
  { to: '/questions', label: '📚 题库' },
  { to: '/generator', label: '✏️ 组卷' },
  { to: '/exams', label: '📄 试卷' },
  { to: '/history', label: '📜 历史' },
]

export default function TeacherLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-1">
        <span className="text-xl font-bold text-indigo-600 mr-6">📝 exam-maker</span>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{user?.name}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-red-500 transition-colors"
          >
            退出
          </button>
        </div>
      </nav>
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 2: 创建 `web/src/components/layout/StudentLayout.tsx`**

```typescript
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

export default function StudentLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-1">
        <span className="text-xl font-bold text-indigo-600 mr-6">📝 exam-maker</span>
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{user?.name}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-red-500 transition-colors"
          >
            退出
          </button>
        </div>
      </nav>
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 3: 更新 `web/src/App.tsx`**

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AuthLayout from './components/layout/AuthLayout'
import TeacherLayout from './components/layout/TeacherLayout'
import StudentLayout from './components/layout/StudentLayout'
import ProtectedRoute from './components/auth/ProtectedRoute'
import Login from './routes/Login'
import Register from './routes/Register'
import Dashboard from './routes/Dashboard'
import QuestionBank from './routes/QuestionBank'
import ExamGenerator from './routes/ExamGenerator'
import ExamList from './routes/ExamList'
import ExamViewer from './routes/ExamViewer'
import History from './routes/History'
import SessionView from './routes/SessionView'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth routes — no nav */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        {/* Teacher routes */}
        <Route
          element={
            <ProtectedRoute role="teacher">
              <TeacherLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/questions" element={<QuestionBank />} />
          <Route path="/generator" element={<ExamGenerator />} />
          <Route path="/exams" element={<ExamList />} />
          <Route path="/exams/:id" element={<ExamViewer />} />
          <Route path="/session/:id" element={<SessionView />} />
          <Route path="/history" element={<History />} />
        </Route>

        {/* Student routes — placeholder for Phase 3 */}
        <Route
          element={
            <ProtectedRoute role="student">
              <StudentLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/student/dashboard" element={<StudentPlaceholder />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

function StudentPlaceholder() {
  return (
    <div className="text-center py-24 text-gray-400 text-sm">
      🎓 学生端即将上线
    </div>
  )
}
```

- [ ] **Step 4: 验证编译**

```bash
cd web && npx tsc --noEmit
```
预期：编译无错误。

- [ ] **Step 5: Commit**

```bash
git add web/src/App.tsx web/src/components/layout/TeacherLayout.tsx web/src/components/layout/StudentLayout.tsx
git commit -m "feat: split routes into Auth/Teacher/Student with ProtectedRoute"
```

---

### Task 8: 端到端验证

- [ ] **Step 1: 重启 API 服务器并验证编译**

```bash
kill $(lsof -ti :3001) 2>/dev/null
cd api && npx tsx watch src/index.ts &
sleep 3
curl -s http://localhost:3001/api/health
```
预期：`{"status":"ok"}`

- [ ] **Step 2: 测试注册**

```bash
curl -s -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"teacher@test.com","password":"123456","name":"张老师","role":"teacher"}' | python3 -m json.tool
```
预期：返回 `{ token, user }`，user.role 为 "teacher"

- [ ] **Step 3: 测试登录**

```bash
curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"teacher@test.com","password":"123456"}' | python3 -m json.tool
```
预期：返回 `{ token, user }`

- [ ] **Step 4: 测试 me 端点（用上一步的 token）**

```bash
TOKEN="<从登录响应中获取的token>"
curl -s http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
预期：返回用户信息，不含 password 字段

- [ ] **Step 5: 测试未登录访问受保护路由**

```bash
curl -s http://localhost:3001/api/auth/me
```
预期：`{"error":"未登录"}` 状态码 401

- [ ] **Step 6: 前端验证**

打开 http://localhost:5173：
- 应自动跳转到 `/login`
- 用 `teacher@test.com` / `123456` 登录 → 应跳转到教师首页
- 导航栏显示 "张老师" + "退出" 按钮
- 注册一个新学生账号 → 应跳转到学生占位页
- 学生访问 `/` → 应重定向到 `/student/dashboard`
- 教师访问 `/student/dashboard` → 应重定向到 `/`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: end-to-end verification of auth system"
```
