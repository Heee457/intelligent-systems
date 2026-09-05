import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { getDb } from '../db/index'
import { requireAuth } from '../middleware/auth'
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

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function authRoutes(app: FastifyInstance) {
  // Register
  app.post('/api/auth/register', async (req, reply) => {
    const body = req.body as {
      email: string; password: string; name: string; role: string
    }
    const email = normalizeText(body.email)
    const name = normalizeText(body.name)
    const { password, role } = body

    if (!email || !password || !name) {
      return reply.status(400).send({ error: '用户名、邮箱、密码为必填项' })
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
    const existingName = db.prepare('SELECT id FROM users WHERE name = ?').get(name)
    if (existingName) {
      return reply.status(409).send({ error: '该用户名已被注册' })
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
    const body = req.body as { username?: string; password?: string }
    const username = normalizeText(body.username)
    const { password } = body

    if (!username || !password) {
      return reply.status(400).send({ error: '用户名和密码为必填项' })
    }

    const db = getDb()
    const users = db.prepare('SELECT * FROM users WHERE name = ?').all(username) as Record<string, unknown>[]
    if (users.length > 1) {
      return reply.status(409).send({ error: '该用户名存在重复，请联系管理员处理' })
    }
    const user = users[0]
    if (!user) {
      return reply.status(401).send({ error: '用户名或密码错误' })
    }

    const valid = await bcrypt.compare(password, user.password as string)
    if (!valid) {
      return reply.status(401).send({ error: '用户名或密码错误' })
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
