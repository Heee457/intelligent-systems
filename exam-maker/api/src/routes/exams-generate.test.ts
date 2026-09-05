import { describe, expect, it } from 'vitest'
import { body, createApp, teacherInject } from '../test/helpers'

const app = createApp()

describe('Smart exam generation', () => {
  it('prioritizes selected knowledge points when generating an exam', async () => {
    const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const matrixQuestion = await teacherInject(app, {
      method: 'POST',
      url: '/api/questions',
      payload: {
        type: 'fillblank',
        title: '矩阵智能组卷题 ' + suffix,
        content: '设矩阵 A，求矩阵的秩。',
        answer: { type: 'fillblank', blanks: ['2'] },
        difficulty: 'medium',
        knowledgePoints: ['矩阵的秩'],
      },
    })
    await teacherInject(app, {
      method: 'POST',
      url: '/api/questions',
      payload: {
        type: 'fillblank',
        title: '概率干扰题 ' + suffix,
        content: '计算事件概率。',
        answer: { type: 'fillblank', blanks: ['1/2'] },
        difficulty: 'medium',
        knowledgePoints: ['概率'],
      },
    })

    const qid = body(matrixQuestion).question.id
    const res = await teacherInject(app, {
      method: 'POST',
      url: '/api/exams/generate',
      payload: {
        name: '智能组卷测试 ' + suffix,
        scope: '矩阵 行列式',
        knowledgePoints: ['矩阵的秩'],
        sections: [{ type: 'fillblank', count: 1, scorePerQuestion: 6, difficulty: 'medium' }],
        totalScore: 6,
      },
    })

    expect(res.statusCode).toBe(200)
    const data = body(res)
    expect(data.warnings).toEqual([])
    expect(data.exam.source).toBe('smart')
    expect(data.exam.scope).toBe('矩阵 行列式')
    expect(data.exam.knowledgePoints).toEqual(['矩阵的秩'])
    expect(data.exam.questions).toEqual([{ questionId: qid, score: 6, order: 1 }])
  })

  it('returns readable warnings when a section cannot be filled', async () => {
    const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const email = 'warning-' + suffix + '@test'
    const username = 'Warning Teacher ' + suffix

    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, password: 'test123', name: username, role: 'teacher' },
    })
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username, password: 'test123' },
    })
    const token = body(login).token

    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/generate',
      headers: { authorization: 'Bearer ' + token },
      payload: {
        name: '不足提示测试 ' + suffix,
        sections: [{ type: 'choice', count: 5, scorePerQuestion: 5 }],
        totalScore: 25,
      },
    })

    expect(res.statusCode).toBe(200)
    const data = body(res)
    expect(data.warnings).toEqual(['选择题：需要 5 道，当前题库仅能提供 0 道可用题。'])
    expect(data.exam.totalScore).toBe(0)
  })

  it('auto-supplements missing questions when requested', async () => {
    const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const res = await teacherInject(app, {
      method: 'POST',
      url: '/api/exams/generate',
      payload: {
        name: '自动补题组卷 ' + suffix,
        knowledgePoints: ['特征值'],
        sections: [{ type: 'choice', count: 2, scorePerQuestion: 5, difficulty: 'medium' }],
        totalScore: 10,
        autoSupplement: true,
      },
    })

    expect(res.statusCode).toBe(200)
    const data = body(res)
    expect(data.exam.questions).toHaveLength(2)
    expect(data.exam.totalScore).toBe(10)
    expect(data.warnings[0]).toContain('已自动补题 2 道')
  })

  it('checks exam quality and forces published content into a new version', async () => {
    const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const qRes = await teacherInject(app, {
      method: 'POST', url: '/api/questions', payload: {
        type: 'choice', title: '版本题 ' + suffix, content: '请选择正确项。',
        options: [{ id: 'a', label: 'A', content: '正确' }, { id: 'b', label: 'B', content: '错误' }],
        answer: { type: 'choice', selectedOptionId: 'a' }, difficulty: 'easy', knowledgePoints: ['版本管理'], explanation: 'A 正确。',
      },
    })
    const examRes = await teacherInject(app, {
      method: 'POST', url: '/api/exams', payload: {
        title: '版本锁定试卷 ' + suffix, totalScore: 10,
        questions: [{ questionId: body(qRes).question.id, score: 10, order: 1 }],
      },
    })
    const exam = body(examRes).exam
    const qualityRes = await teacherInject(app, { method: 'GET', url: '/api/exams/' + exam.id + '/quality' })
    expect(qualityRes.statusCode).toBe(200)
    expect(body(qualityRes).report.canPublish).toBe(true)

    const classRes = await teacherInject(app, { method: 'POST', url: '/api/classes', payload: { name: '版本班级 ' + suffix } })
    const publishRes = await teacherInject(app, {
      method: 'POST', url: '/api/publish', payload: { examId: exam.id, title: '版本发布 ' + suffix, duration: 30, classId: body(classRes).class.id },
    })
    expect(publishRes.statusCode).toBe(200)

    const blocked = await teacherInject(app, { method: 'PUT', url: '/api/exams/' + exam.id, payload: { title: '直接修改失败' } })
    expect(blocked.statusCode).toBe(409)

    const versionRes = await teacherInject(app, { method: 'POST', url: '/api/exams/' + exam.id + '/versions', payload: {} })
    expect(versionRes.statusCode).toBe(200)
    expect(body(versionRes).exam.versionNumber).toBe(2)
    expect(body(versionRes).exam.status).toBe('draft')
  })

})
