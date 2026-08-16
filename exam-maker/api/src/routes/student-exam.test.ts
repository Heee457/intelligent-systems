import { describe, it, expect } from 'vitest'
import { createApp, teacherInject, studentInject, body } from '../test/helpers'

const app = createApp()

// Set up: teacher creates question → exam → publish
let publishId = ''
let questionId = ''

describe('Student exam flow (setup)', () => {
  it('teacher creates question', async () => {
    const res = await teacherInject(app, {
      method: 'POST', url: '/api/questions', payload: {
        type: 'choice', title: 'Math', content: '2+2=?',
        options: [{ id: 'a', label: 'A', content: '3' }, { id: 'b', label: 'B', content: '4' }],
        answer: { type: 'choice', selectedOptionId: 'b' }, difficulty: 'easy',
      },
    })
    questionId = body(res).question.id
    expect(questionId).toBeTruthy()
  })

  it('teacher creates exam', async () => {
    const res = await teacherInject(app, {
      method: 'POST', url: '/api/exams', payload: {
        title: 'Test Exam', totalScore: 10,
        questions: [{ questionId, score: 10, order: 1 }],
      },
    })
    const examId = body(res).exam.id
    expect(examId).toBeTruthy()

    const res2 = await teacherInject(app, {
      method: 'POST', url: '/api/publish', payload: {
        examId, title: 'Test Publish', duration: 60,
      },
    })
    publishId = body(res2).publish.id
    expect(publishId).toBeTruthy()
  })
})

describe('Student exam flow', () => {
  let submissionId = ''

  it('GET /api/student/dashboard — shows publishes', async () => {
    const res = await studentInject(app, { method: 'GET', url: '/api/student/dashboard' })
    expect(res.statusCode).toBe(200)
    const pubs = body(res).publishes
    expect(pubs.length).toBeGreaterThanOrEqual(1)
    expect(pubs[0].id).toBe(publishId)
  })

  it('GET /api/student/exam/:id — returns questions without answers', async () => {
    const res = await studentInject(app, { method: 'GET', url: `/api/student/exam/${publishId}` })
    expect(res.statusCode).toBe(200)
    const qs = body(res).questions
    expect(qs.length).toBe(1)
    expect(qs[0].answer).toBeUndefined() // answers must not leak
  })

  it('POST /api/student/exam/:id/start — creates submission', async () => {
    const res = await studentInject(app, { method: 'POST', url: `/api/student/exam/${publishId}/start` })
    expect(res.statusCode).toBe(200)
    submissionId = body(res).submissionId
    expect(submissionId).toBeTruthy()
  })

  it('POST /api/student/exam/:id/answer — saves answer', async () => {
    const res = await studentInject(app, {
      method: 'POST', url: `/api/student/exam/${publishId}/answer`, payload: {
        submissionId, questionId, questionOrder: 1,
        answer: { type: 'choice', selectedOptionId: 'b' }, maxScore: 10,
      },
    })
    expect(res.statusCode).toBe(200)
    expect(body(res).ok).toBe(true)
  })

  it('POST /api/student/exam/:id/submit — submits and auto-grades', async () => {
    const res = await studentInject(app, {
      method: 'POST', url: `/api/student/exam/${publishId}/submit`, payload: {
        submissionId, violations: 0,
      },
    })
    expect(res.statusCode).toBe(200)
    const sub = body(res).submission
    expect(sub.total_score).toBe(10)  // correct answer → full marks
    expect(sub.total_points).toBe(10)
    expect(sub.status).toBe('graded') // auto-graded (no essay questions)
  })

  it('GET /api/student/submissions — lists submissions', async () => {
    const res = await studentInject(app, { method: 'GET', url: '/api/student/submissions' })
    expect(body(res).submissions.length).toBeGreaterThanOrEqual(1)
  })

  it('GET /api/student/submissions/:id — shows detail with correct answer', async () => {
    const res = await studentInject(app, { method: 'GET', url: `/api/student/submissions/${submissionId}` })
    expect(res.statusCode).toBe(200)
    const d = body(res)
    expect(d.submission.id).toBe(submissionId)
    expect(d.answers.length).toBe(1)
    expect(d.answers[0].is_correct).toBe(1)
    expect(d.answers[0].score).toBe(10)
  })
})

describe('Role isolation', () => {
  it('teacher cannot access student endpoints', async () => {
    const res = await teacherInject(app, { method: 'GET', url: '/api/student/dashboard' })
    expect(res.statusCode).toBe(403)
  })
})
