import { describe, it, expect } from 'vitest'
import { createApp, teacherInject, studentInject, body } from '../test/helpers'

const app = createApp()

const sampleQuestion = {
  type: 'choice', title: 'Test Q', content: '1+1=?',
  options: [{ id: 'a', label: 'A', content: '1' }, { id: 'b', label: 'B', content: '2' }],
  answer: { type: 'choice', selectedOptionId: 'b' },
  difficulty: 'easy', knowledgePoints: ['math'],
}

describe('Question CRUD', () => {
  let qid = ''

  it('POST /api/questions — creates', async () => {
    const res = await teacherInject(app, { method: 'POST', url: '/api/questions', payload: sampleQuestion })
    expect(res.statusCode).toBe(200)
    const q = body(res).question
    expect(q.type).toBe('choice')
    expect(q.title).toBe('Test Q')
    qid = q.id
  })

  it('GET /api/questions — lists with pagination', async () => {
    const res = await teacherInject(app, { method: 'GET', url: '/api/questions?limit=10' })
    expect(res.statusCode).toBe(200)
    expect(body(res).total).toBeGreaterThanOrEqual(1)
  })

  it('GET /api/questions — filters by type', async () => {
    // Create a fillblank question too
    await teacherInject(app, { method: 'POST', url: '/api/questions', payload: { type: 'fillblank', title: 'FB', content: '___', answer: { type: 'fillblank', blanks: ['x'] }, difficulty: 'medium' } })
    const res = await teacherInject(app, { method: 'GET', url: '/api/questions?type=choice' })
    const questions = body(res).questions
    expect(questions.every((q: any) => q.type === 'choice')).toBe(true)
  })

  it('GET /api/questions/:id — gets one', async () => {
    const res = await teacherInject(app, { method: 'GET', url: `/api/questions/${qid}` })
    expect(res.statusCode).toBe(200)
    expect(body(res).question.id).toBe(qid)
  })

  it('PUT /api/questions/:id — updates', async () => {
    const res = await teacherInject(app, { method: 'PUT', url: `/api/questions/${qid}`, payload: { ...sampleQuestion, title: 'Updated' } })
    expect(res.statusCode).toBe(200)
    expect(body(res).question.title).toBe('Updated')
  })

  it('DELETE /api/questions/:id — deletes', async () => {
    const res = await teacherInject(app, { method: 'DELETE', url: `/api/questions/${qid}` })
    expect(res.statusCode).toBe(200)
  })

  it('POST /api/questions/import — batch import', async () => {
    const res = await teacherInject(app, { method: 'POST', url: '/api/questions/import', payload: { questions: [sampleQuestion, sampleQuestion] } })
    expect(res.statusCode).toBe(200)
    expect(body(res).imported).toBe(2)
  })

  it('GET /api/questions/export — exports all', async () => {
    const res = await teacherInject(app, { method: 'GET', url: '/api/questions/export' })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(body(res))).toBe(true)
  })
})

describe('Role isolation', () => {
  it('student cannot access question CRUD', async () => {
    const res = await studentInject(app, { method: 'GET', url: '/api/questions' })
    expect(res.statusCode).toBe(403)
  })

  it('unauthenticated cannot access', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/questions' })
    expect(res.statusCode).toBe(401)
  })
})
