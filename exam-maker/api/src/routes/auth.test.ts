import { describe, it, expect, beforeAll } from 'vitest'
import { createApp, body } from '../test/helpers'

const app = createApp()

beforeAll(async () => { await app.ready() })

describe('POST /api/auth/register', () => {
  it('registers a teacher', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 't@test.com', password: '123456', name: 'Teacher', role: 'teacher' },
    })
    expect(res.statusCode).toBe(201)
    const d = body(res)
    expect(d.token).toBeDefined()
    expect(d.user.role).toBe('teacher')
    expect(d.user.password).toBeUndefined()
  })

  it('registers a student', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 's@test.com', password: '123456', name: 'Student', role: 'student' },
    })
    expect(res.statusCode).toBe(201)
    const d = body(res)
    expect(d.user.role).toBe('student')
  })

  it('rejects duplicate email', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 't@test.com', password: '123456', name: 'Dup', role: 'teacher' },
    })
    expect(res.statusCode).toBe(409)
    expect(body(res).error).toBe('该邮箱已被注册')
  })

  it('rejects duplicate username', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'teacher-alias@test.com', password: '123456', name: 'Teacher', role: 'teacher' },
    })
    expect(res.statusCode).toBe(409)
    expect(body(res).error).toBe('该用户名已被注册')
  })

  it('rejects short password', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'x@test.com', password: '12', name: 'X', role: 'student' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects invalid role', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'y@test.com', password: '123456', name: 'Y', role: 'admin' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { username: 'Teacher', password: '123456' },
    })
    expect(res.statusCode).toBe(200)
    expect(body(res).token).toBeDefined()
    expect(body(res).user.email).toBe('t@test.com')
  })

  it('rejects wrong password', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { username: 'Teacher', password: 'wrong' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects unknown username', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { username: 'Nobody', password: '123456' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /api/auth/me', () => {
  it('returns user with valid token', async () => {
    const login = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { username: 'Teacher', password: '123456' },
    })
    const token = body(login).token
    const res = await app.inject({
      method: 'GET', url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(body(res).user.email).toBe('t@test.com')
  })

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 with invalid token', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/auth/me',
      headers: { authorization: 'Bearer garbage' },
    })
    expect(res.statusCode).toBe(401)
  })
})
