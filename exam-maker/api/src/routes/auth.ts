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
