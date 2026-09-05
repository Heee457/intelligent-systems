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
