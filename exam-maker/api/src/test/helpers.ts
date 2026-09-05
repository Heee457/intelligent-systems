import { afterAll, beforeAll } from 'vitest'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import fs from 'fs'
import { authRoutes } from '../routes/auth'
import { questionRoutes } from '../routes/questions'
import { examRoutes } from '../routes/exams'
import { classRoutes } from '../routes/classes'
import { publishRoutes } from '../routes/publish'
import { studentRoutes } from '../routes/student'
import { statsRoutes } from '../routes/stats'
import { exportRoutes } from '../routes/export'
import { variantRoutes } from '../routes/variant'
import { sessionRoutes } from '../routes/sessions'

const TEST_ROOT = process.env.EXAM_DATA_ROOT || '/tmp/exam-maker-test'

let app: ReturnType<typeof Fastify> | null = null
let _teacherToken = ''
let _studentToken = ''

/** Create (or reuse) a Fastify instance with all routes + test DB */
export function createApp() {
  if (app) return app

  fs.rmSync(TEST_ROOT, { recursive: true, force: true })
  fs.mkdirSync(TEST_ROOT, { recursive: true })

  app = Fastify({ logger: false })

  beforeAll(async () => {
    await app!.register(cors, { origin: '*' })
    await app!.register(authRoutes)
    await app!.register(sessionRoutes)
    await app!.register(questionRoutes)
    await app!.register(examRoutes)
    await app!.register(classRoutes)
    await app!.register(publishRoutes)
    await app!.register(studentRoutes)
    await app!.register(statsRoutes)
    await app!.register(exportRoutes)
    await app!.register(variantRoutes)
    await app!.ready()

    // Register test users and cache tokens
    await app!.inject({ method: 'POST', url: '/api/auth/register',
      payload: { email: '__teacher@test', password: 'test123', name: 'T', role: 'teacher' } })
    const tLogin = await app!.inject({ method: 'POST', url: '/api/auth/login',
      payload: { username: 'T', password: 'test123' } })
    _teacherToken = JSON.parse(tLogin.body).token

    await app!.inject({ method: 'POST', url: '/api/auth/register',
      payload: { email: '__student@test', password: 'test123', name: 'S', role: 'student' } })
    const sLogin = await app!.inject({ method: 'POST', url: '/api/auth/login',
      payload: { username: 'S', password: 'test123' } })
    _studentToken = JSON.parse(sLogin.body).token
  })

  afterAll(async () => {
    await app!.close()
    app = null
  })

  return app
}

/** Inject as teacher (uses real registered user) */
export async function teacherInject(
  app: ReturnType<typeof Fastify>,
  opts: { method: string; url: string; payload?: any },
) {
  if (!_teacherToken) throw new Error('Teacher token not ready — call createApp() first')
  const headers: Record<string, string> = { authorization: `Bearer ${_teacherToken}` }
  if (opts.payload) headers['content-type'] = 'application/json'
  return app.inject({
    method: opts.method as any,
    url: opts.url,
    headers,
    payload: opts.payload ? JSON.stringify(opts.payload) : undefined,
  })
}

/** Inject as student (uses real registered user) */
export async function studentInject(
  app: ReturnType<typeof Fastify>,
  opts: { method: string; url: string; payload?: any },
) {
  if (!_studentToken) throw new Error('Student token not ready — call createApp() first')
  const headers: Record<string, string> = { authorization: `Bearer ${_studentToken}` }
  if (opts.payload) headers['content-type'] = 'application/json'
  return app.inject({
    method: opts.method as any,
    url: opts.url,
    headers,
    payload: opts.payload ? JSON.stringify(opts.payload) : undefined,
  })
}

/** Parse response body */
export function body(res: any) { return JSON.parse(res.body) }
