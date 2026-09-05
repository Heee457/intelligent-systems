import { expect, test } from '@playwright/test'
import { loginUser, testPassword, uniqueUsername } from './helpers'

const API = 'http://127.0.0.1:3001'

async function post(request: any, url: string, payload: any, token?: string) {
  const response = await request.post(API + url, {
    data: payload,
    headers: token ? { Authorization: 'Bearer ' + token } : undefined,
  })
  expect(response.ok()).toBeTruthy()
  return response.json()
}

test('teacher generates a remedial draft from weak knowledge analysis', async ({ page, request }) => {
  const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  const teacherEmail = 'remedial-teacher-' + suffix + '@example.com'
  const studentEmail = 'remedial-student-' + suffix + '@example.com'
  const teacherName = uniqueUsername('teacher', 'E2E Remedial Teacher')
  const studentName = uniqueUsername('student', 'E2E Remedial Student')

  const teacherAuth = await post(request, '/api/auth/register', {
    email: teacherEmail,
    password: testPassword,
    name: teacherName,
    role: 'teacher',
  })
  const studentAuth = await post(request, '/api/auth/register', {
    email: studentEmail,
    password: testPassword,
    name: studentName,
    role: 'student',
  })

  const question = await post(request, '/api/questions', {
    type: 'choice',
    title: '闭环薄弱题 ' + suffix,
    content: '矩阵 A 的秩为 2，下列说法正确的是？',
    options: [
      { id: 'a', label: 'A', content: '列向量组一定线性无关' },
      { id: 'b', label: 'B', content: '列向量组可能线性相关' },
    ],
    answer: { type: 'choice', selectedOptionId: 'b' },
    difficulty: 'medium',
    knowledgePoints: ['闭环知识点'],
  }, teacherAuth.token)

  const exam = await post(request, '/api/exams', {
    title: '闭环原始卷 ' + suffix,
    totalScore: 10,
    questions: [{ questionId: question.question.id, score: 10, order: 1 }],
  }, teacherAuth.token)

  const cls = await post(request, '/api/classes', {
    name: '闭环班级 ' + suffix,
    description: '补救闭环测试班级',
  }, teacherAuth.token)
  await post(request, '/api/classes/' + cls.class.id + '/students', {
    emails: [studentEmail],
  }, teacherAuth.token)

  const publish = await post(request, '/api/publish', {
    examId: exam.exam.id,
    title: '闭环发布 ' + suffix,
    duration: 30,
    classId: cls.class.id,
  }, teacherAuth.token)

  const start = await post(request, '/api/student/exam/' + publish.publish.id + '/start', {}, studentAuth.token)
  await post(request, '/api/student/exam/' + publish.publish.id + '/answer', {
    submissionId: start.submissionId,
    questionId: question.question.id,
    questionOrder: 1,
    answer: { type: 'choice', selectedOptionId: 'a' },
    maxScore: 10,
  }, studentAuth.token)
  await post(request, '/api/student/exam/' + publish.publish.id + '/submit', {
    submissionId: start.submissionId,
    violations: 0,
  }, studentAuth.token)

  await loginUser(page, teacherName, testPassword)
  await expect(page.getByText('E2E Remedial Teacher')).toBeVisible()
  await page.goto('/exams/' + publish.publish.id + '/analysis')

  await expect(page.getByRole('heading', { name: '试卷分析' })).toBeVisible()
  await expect(page.getByText('闭环知识点').first()).toBeVisible()
  await page.getByRole('button', { name: '生成补救练习' }).click()

  await expect(page.getByText(/已生成：/)).toBeVisible()
  await page.getByRole('link', { name: '查看试卷' }).click()
  await expect(page.getByRole('heading', { name: /补救练习/ })).toBeVisible()
})
