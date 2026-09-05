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

  it('POST /api/questions/quality/recompute — reports quality issues and duplicates', async () => {
    const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const duplicate = {
      type: 'choice', title: 'Duplicate quality ' + suffix, content: '计算矩阵 A 的秩，测试批次 ' + suffix,
      options: [{ id: 'a', label: 'A', content: '1' }, { id: 'b', label: 'B', content: '2' }],
      answer: { type: 'choice', selectedOptionId: 'b' }, difficulty: 'medium', knowledgePoints: ['质量治理'],
    }
    await teacherInject(app, { method: 'POST', url: '/api/questions', payload: duplicate })
    await teacherInject(app, { method: 'POST', url: '/api/questions', payload: duplicate })
    await teacherInject(app, {
      method: 'POST', url: '/api/questions', payload: {
        type: 'essay', title: 'Needs quality ' + suffix, content: '说明线性相关的判定方法。',
        answer: { type: 'essay', referenceAnswer: '' }, difficulty: 'medium', knowledgePoints: [],
      },
    })

    const res = await teacherInject(app, { method: 'POST', url: '/api/questions/quality/recompute' })
    expect(res.statusCode).toBe(200)
    const report = body(res).report
    expect(report.summary.duplicateGroupCount).toBeGreaterThanOrEqual(1)
    expect(report.duplicateGroups.some((group: any) => group.questions.some((q: any) => q.title === duplicate.title))).toBe(true)

    const issueQuestion = report.issueQuestions.find((q: any) => q.title === 'Needs quality ' + suffix)
    expect(issueQuestion.qualityIssues).toEqual(expect.arrayContaining(['缺少答案', '缺少知识点']))

    const listRes = await teacherInject(app, { method: 'GET', url: '/api/questions?keyword=Needs%20quality' })
    const persisted = body(listRes).questions.find((q: any) => q.title === 'Needs quality ' + suffix)
    expect(persisted.qualityIssues).toContain('缺少答案')
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
