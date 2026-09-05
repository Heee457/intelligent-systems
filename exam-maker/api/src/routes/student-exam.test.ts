import { describe, it, expect } from 'vitest'
import { createApp, teacherInject, studentInject, body } from '../test/helpers'

const app = createApp()

// Set up: teacher creates question → exam → publish
let publishId = ''
let questionId = ''

async function createClassForStudent(name = 'Test Class') {
  const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  const classRes = await teacherInject(app, {
    method: 'POST', url: '/api/classes', payload: { name: name + ' ' + suffix, description: 'test class' },
  })
  const cls = body(classRes).class
  await teacherInject(app, {
    method: 'POST', url: '/api/classes/' + cls.id + '/students', payload: { emails: ['__student@test'] },
  })
  return cls
}

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

    const cls = await createClassForStudent('Student Flow Class')
    const res2 = await teacherInject(app, {
      method: 'POST', url: '/api/publish', payload: {
        examId, title: 'Test Publish', duration: 60, classId: cls.id,
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


describe('Student fillblank allocation', () => {
  it('allocates fillblank inputs from visible blanks instead of answer array length', async () => {
    const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const qRes = await teacherInject(app, {
      method: 'POST', url: '/api/questions', payload: {
        type: 'fillblank',
        title: 'Fillblank Allocation ' + suffix,
        content: '已知二次型正定，则参数 t 应满足条件 ________。',
        answer: { type: 'fillblank', blanks: ['t > 36', '多余答案1', '多余答案2', '多余答案3'] },
        difficulty: 'medium',
      },
    })
    const fillQuestionId = body(qRes).question.id
    const examRes = await teacherInject(app, {
      method: 'POST', url: '/api/exams', payload: {
        title: 'Fillblank Allocation Exam ' + suffix,
        totalScore: 6,
        questions: [{ questionId: fillQuestionId, score: 6, order: 1 }],
      },
    })
    const cls = await createClassForStudent('Fillblank Allocation Class')
    const publishRes = await teacherInject(app, {
      method: 'POST', url: '/api/publish', payload: {
        examId: body(examRes).exam.id,
        title: 'Fillblank Allocation Publish ' + suffix,
        duration: 30,
        classId: cls.id,
      },
    })
    const fillPublishId = body(publishRes).publish.id

    const getRes = await studentInject(app, { method: 'GET', url: '/api/student/exam/' + fillPublishId })
    expect(getRes.statusCode).toBe(200)
    const question = body(getRes).questions[0]
    expect(question.answer).toBeUndefined()
    expect(question.blankCount).toBe(1)

    const startRes = await studentInject(app, { method: 'POST', url: '/api/student/exam/' + fillPublishId + '/start' })
    const sid = body(startRes).submissionId
    await studentInject(app, {
      method: 'POST', url: '/api/student/exam/' + fillPublishId + '/answer', payload: {
        submissionId: sid,
        questionId: fillQuestionId,
        questionOrder: 1,
        answer: { type: 'fillblank', blanks: ['t > 36'] },
        maxScore: 6,
      },
    })
    const submitRes = await studentInject(app, {
      method: 'POST', url: '/api/student/exam/' + fillPublishId + '/submit', payload: { submissionId: sid, violations: 0 },
    })
    expect(body(submitRes).submission.total_score).toBe(6)
  })
})

describe('Class publishing rules', () => {
  async function createExamForPublishRule(suffix: string) {
    const qRes = await teacherInject(app, {
      method: 'POST', url: '/api/questions', payload: {
        type: 'choice', title: 'Class Publish Q ' + suffix, content: '1+1=?',
        options: [{ id: 'a', label: 'A', content: '1' }, { id: 'b', label: 'B', content: '2' }],
        answer: { type: 'choice', selectedOptionId: 'b' }, difficulty: 'easy', knowledgePoints: ['发布规则'],
      },
    })
    const examRes = await teacherInject(app, {
      method: 'POST', url: '/api/exams', payload: {
        title: 'Class Publish Exam ' + suffix,
        totalScore: 10,
        questions: [{ questionId: body(qRes).question.id, score: 10, order: 1 }],
      },
    })
    return body(examRes).exam.id
  }

  it('requires at least one class when publishing an exam', async () => {
    const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const examId = await createExamForPublishRule(suffix)
    const res = await teacherInject(app, {
      method: 'POST', url: '/api/publish', payload: {
        examId,
        title: 'No Class Publish ' + suffix,
        duration: 30,
      },
    })
    expect(res.statusCode).toBe(400)
    expect(body(res).error).toBe('请选择至少一个班级')
  })

  it('creates one publish record for each selected class', async () => {
    const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const examId = await createExamForPublishRule(suffix)
    const first = await createClassForStudent('Multi Class A')
    const second = await createClassForStudent('Multi Class B')
    const res = await teacherInject(app, {
      method: 'POST', url: '/api/publish', payload: {
        examId,
        title: 'Multi Class Publish ' + suffix,
        duration: 30,
        classIds: [first.id, second.id],
      },
    })
    expect(res.statusCode).toBe(200)
    const data = body(res)
    expect(data.publishes).toHaveLength(2)
    expect(data.publishes.map((item: any) => item.class_id).sort()).toEqual([first.id, second.id].sort())
  })
})

describe('Publish rules', () => {
  async function createPublishedExam(payload: Record<string, any> = {}) {
    const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const qRes = await teacherInject(app, {
      method: 'POST', url: '/api/questions', payload: {
        type: 'choice', title: 'Rule Q ' + suffix, content: '1+1=?',
        options: [{ id: 'a', label: 'A', content: '1' }, { id: 'b', label: 'B', content: '2' }],
        answer: { type: 'choice', selectedOptionId: 'b' }, difficulty: 'easy',
      },
    })
    const qid = body(qRes).question.id
    const examRes = await teacherInject(app, {
      method: 'POST', url: '/api/exams', payload: {
        title: 'Rule Exam ' + suffix, totalScore: 10,
        questions: [{ questionId: qid, score: 10, order: 1 }],
      },
    })
    const cls = await createClassForStudent('Rule Class')
    const pubRes = await teacherInject(app, {
      method: 'POST', url: '/api/publish', payload: {
        examId: body(examRes).exam.id, title: 'Rule Publish ' + suffix, duration: 60, classId: cls.id, ...payload,
      },
    })
    return { publishId: body(pubRes).publish.id, questionId: qid }
  }

  it('blocks students before the configured start time', async () => {
    const future = Date.now() + 60 * 60 * 1000
    const item = await createPublishedExam({ startTime: future })

    const getRes = await studentInject(app, { method: 'GET', url: '/api/student/exam/' + item.publishId })
    expect(getRes.statusCode).toBe(403)
    expect(body(getRes).error).toBe('考试尚未开始')

    const startRes = await studentInject(app, { method: 'POST', url: '/api/student/exam/' + item.publishId + '/start' })
    expect(startRes.statusCode).toBe(403)
    expect(body(startRes).error).toBe('考试尚未开始')
  })

  it('hides scores and answers until release time', async () => {
    const future = Date.now() + 60 * 60 * 1000
    const item = await createPublishedExam({ scoreReleaseTime: future, answerReleaseTime: future })

    const startRes = await studentInject(app, { method: 'POST', url: '/api/student/exam/' + item.publishId + '/start' })
    const sid = body(startRes).submissionId
    await studentInject(app, {
      method: 'POST', url: '/api/student/exam/' + item.publishId + '/answer', payload: {
        submissionId: sid, questionId: item.questionId, questionOrder: 1,
        answer: { type: 'choice', selectedOptionId: 'b' }, maxScore: 10,
      },
    })
    await studentInject(app, { method: 'POST', url: '/api/student/exam/' + item.publishId + '/submit', payload: { submissionId: sid, violations: 0 } })

    const detail = body(await studentInject(app, { method: 'GET', url: '/api/student/submissions/' + sid }))
    expect(detail.scoreVisible).toBe(false)
    expect(detail.answerVisible).toBe(false)
    expect(detail.submission.total_score).toBeNull()
    expect(detail.answers[0].score).toBeNull()
    expect(detail.answers[0].question.answer).toBeUndefined()
  })

  it('records abnormal events and asks strict exams to submit at the limit', async () => {
    const item = await createPublishedExam({ antiCheatLevel: 'strict', maxViolations: 2 })
    const startRes = await studentInject(app, { method: 'POST', url: '/api/student/exam/' + item.publishId + '/start' })
    const sid = body(startRes).submissionId

    const eventRes = await studentInject(app, {
      method: 'POST', url: '/api/student/exam/' + item.publishId + '/events',
      payload: { submissionId: sid, type: 'tab_hidden', violations: 2 },
    })
    expect(eventRes.statusCode).toBe(200)
    expect(body(eventRes).shouldSubmit).toBe(true)
  })
})

describe('Manual grading center', () => {
  it('returns review context with AI suggestion and saves teacher grading', async () => {
    const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const qRes = await teacherInject(app, {
      method: 'POST', url: '/api/questions', payload: {
        type: 'essay',
        title: 'Essay ' + suffix,
        content: '说明矩阵秩的含义。',
        answer: { type: 'essay', referenceAnswer: '矩阵秩表示矩阵行向量或列向量组中极大线性无关组的向量个数。' },
        explanation: '应说明线性无关组和向量个数。',
        difficulty: 'medium',
        knowledgePoints: ['矩阵的秩'],
      },
    })
    const essayQuestionId = body(qRes).question.id
    const examRes = await teacherInject(app, {
      method: 'POST', url: '/api/exams', payload: {
        title: 'Essay Exam ' + suffix,
        totalScore: 10,
        questions: [{ questionId: essayQuestionId, score: 10, order: 1 }],
      },
    })
    const cls = await createClassForStudent('Essay Class')
    const publishRes = await teacherInject(app, {
      method: 'POST', url: '/api/publish', payload: {
        examId: body(examRes).exam.id,
        title: 'Essay Publish ' + suffix,
        duration: 60,
        classId: cls.id,
      },
    })
    const essayPublishId = body(publishRes).publish.id
    const startRes = await studentInject(app, { method: 'POST', url: '/api/student/exam/' + essayPublishId + '/start' })
    const submissionId = body(startRes).submissionId

    await studentInject(app, {
      method: 'POST', url: '/api/student/exam/' + essayPublishId + '/answer', payload: {
        submissionId,
        questionId: essayQuestionId,
        questionOrder: 1,
        answer: { type: 'essay', referenceAnswer: '矩阵的秩是极大线性无关组中向量的个数。' },
        maxScore: 10,
      },
    })
    await studentInject(app, { method: 'POST', url: '/api/student/exam/' + essayPublishId + '/submit', payload: { submissionId, violations: 0 } })

    const pendingRes = await teacherInject(app, { method: 'GET', url: '/api/grading/pending' })
    expect(pendingRes.statusCode).toBe(200)
    const pending = body(pendingRes).pending
    const item = pending.find((row: any) => row.submissionId === submissionId && row.questionId === essayQuestionId)
    expect(item).toBeTruthy()
    expect(item.question.content).toBe('说明矩阵秩的含义。')
    expect(item.referenceAnswerText).toContain('极大线性无关组')
    expect(item.studentAnswerText).toContain('矩阵的秩')
    expect(item.aiSuggestion.score).toBeGreaterThan(0)
    expect(item.aiSuggestion.feedback).toBeTruthy()

    const gradeRes = await teacherInject(app, {
      method: 'PUT', url: '/api/grading/' + item.id, payload: {
        score: 4,
        isCorrect: 0,
        notes: '概念基本正确，表述略简。',
        useAiSuggestion: true,
      },
    })
    expect(gradeRes.statusCode).toBe(200)
    expect(body(gradeRes).score).toBe(4)

    const afterPending = body(await teacherInject(app, { method: 'GET', url: '/api/grading/pending' })).pending
    expect(afterPending.some((row: any) => row.id === item.id)).toBe(false)

    const detail = body(await studentInject(app, { method: 'GET', url: '/api/student/submissions/' + submissionId }))
    expect(detail.submission.total_score).toBe(4)
    expect(detail.answers[0].teacher_notes).toBe('概念基本正确，表述略简。')
    expect(detail.answers[0].studentAnswerText).toContain('矩阵的秩')
    expect(detail.answers[0].referenceAnswerText).toContain('极大线性无关组')

    const mistakes = body(await studentInject(app, { method: 'GET', url: '/api/student/mistakes' }))
    const mistake = mistakes.mistakes.find((row: any) => row.submissionId === submissionId && row.questionId === essayQuestionId)
    expect(mistake).toBeTruthy()
    expect(mistake.teacherNotes).toBe('概念基本正确，表述略简。')
    const weakPoint = mistakes.weakPoints.find((row: any) => row.knowledgePoint === '矩阵的秩')
    expect(weakPoint.masteryRate).toBe(40)

    const knowledge = body(await teacherInject(app, { method: 'GET', url: '/api/stats/exam/' + essayPublishId + '/knowledge' }))
    const kp = knowledge.knowledgePoints.find((row: any) => row.knowledgePoint === '矩阵的秩')
    expect(kp.avgScoreRate).toBe(40)
    expect(kp.level).toBe('weak')

    const questionStats = body(await teacherInject(app, { method: 'GET', url: '/api/stats/exam/' + essayPublishId + '/questions' }))
    expect(questionStats.questions[0].title).toContain('Essay')
    expect(questionStats.questions[0].score_rate).toBe(40)

    const quality = body(await teacherInject(app, { method: 'POST', url: '/api/questions/quality/recompute' })).report
    const suggestion = quality.difficultySuggestions.find((row: any) => row.id === essayQuestionId)
    expect(suggestion.difficultySuggestion).toBe('hard')
    expect(suggestion.scoreRate).toBe(40)
    const errorProne = quality.errorProneQuestions.find((row: any) => row.id === essayQuestionId)
    expect(errorProne.isErrorProne).toBe(true)

    const questionDetail = body(await teacherInject(app, { method: 'GET', url: '/api/questions/' + essayQuestionId })).question
    expect(questionDetail.difficultySuggestion).toBe('hard')
    expect(questionDetail.isErrorProne).toBe(true)
    expect(questionDetail.isKeyQuestion).toBe(true)

    const remedialRes = await teacherInject(app, {
      method: 'POST', url: '/api/exams/remedial', payload: {
        publishId: essayPublishId,
        mode: 'practice',
        knowledgePoints: ['矩阵的秩'],
        maxQuestions: 4,
      },
    })
    expect(remedialRes.statusCode).toBe(200)
    const remedial = body(remedialRes)
    expect(remedial.exam.source).toBe('remedial')
    expect(remedial.exam.status).toBe('draft')
    expect(remedial.exam.knowledgePoints).toEqual(['矩阵的秩'])
    expect(remedial.exam.questions.some((q: any) => q.questionId === essayQuestionId)).toBe(true)

    const retakeRes = await teacherInject(app, {
      method: 'POST', url: '/api/exams/remedial', payload: {
        publishId: essayPublishId,
        mode: 'retake',
        knowledgePoints: ['矩阵的秩'],
        maxQuestions: 4,
      },
    })
    expect(retakeRes.statusCode).toBe(200)
    const retake = body(retakeRes)
    expect(retake.exam.source).toBe('retake')
    expect(retake.exam.title).toContain('重测试卷')
    expect(retake.exam.questions.length).toBeGreaterThan(0)
  })
})

describe('Role isolation', () => {
  it('teacher cannot access student endpoints', async () => {
    const res = await teacherInject(app, { method: 'GET', url: '/api/student/dashboard' })
    expect(res.statusCode).toBe(403)
  })
})
