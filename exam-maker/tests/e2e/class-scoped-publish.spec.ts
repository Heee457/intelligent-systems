import { expect, test } from '@playwright/test'
import {
  buildManualExamFromQuestion,
  createChoiceQuestion,
  expectStudentDashboard,
  expectTeacherDashboard,
  publishCurrentExam,
  registerUser,
} from './helpers'

test.describe('class-scoped publishing', () => {
  test('shows a class-scoped exam only to students who joined that class', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const className = `E2E 定向班级 ${suffix}`
    const questionTitle = `E2E 定向题 ${suffix}`
    const questionContent = '班级定向发布的考试题目'
    const examTitle = `E2E 定向考试 ${suffix}`

    await registerUser(page, 'teacher', { name: 'E2E Scoped Teacher' })
    await expectTeacherDashboard(page)

    await page.getByRole('link', { name: /班级/ }).click()
    await expect(page).toHaveURL(/\/classes$/)
    await page.getByRole('button', { name: /创建班级/ }).click()
    await page.locator('form input').nth(0).fill(className)
    await page.locator('form input').nth(1).fill('只给目标班级发布')
    await page.locator('form').getByRole('button', { name: '创建' }).click()
    await expect(page.getByRole('link', { name: className })).toBeVisible()
    const joinCode = (await page.locator('code').first().innerText()).trim()

    await createChoiceQuestion(page, { title: questionTitle, content: questionContent })
    await buildManualExamFromQuestion(page, questionTitle, examTitle)
    await publishCurrentExam(page, examTitle, '30', { className })
    await expect(page.getByRole('heading', { name: '发布管理' })).toBeVisible()
    const detailPublishRow = page.locator('section').filter({ hasText: className }).first()
    await expect(detailPublishRow.getByText('可见学生')).toBeVisible()
    await expect(detailPublishRow.getByText('已开始')).toBeVisible()
    await expect(detailPublishRow.getByText('已提交')).toBeVisible()
    await expect(detailPublishRow.getByRole('button', { name: '撤回发布' })).toBeVisible()
    await expect(detailPublishRow.getByRole('button', { name: '截止延后 1 天' })).toBeVisible()
    await expect(detailPublishRow.getByRole('button', { name: '成绩自动公布' })).toBeVisible()

    await page.getByRole('link', { name: /试卷/ }).click()
    await expect(page).toHaveURL(/\/exams$/)
    await expect(page.getByRole('heading', { name: '发布管理' })).toBeVisible()
    const listPublishRow = page.locator('section').filter({ hasText: className }).first()
    await expect(listPublishRow.getByText(className)).toBeVisible()
    await listPublishRow.getByRole('button', { name: '撤回发布' }).click()
    await expect(listPublishRow.getByText('已撤回')).toBeVisible()
    await listPublishRow.getByRole('button', { name: '恢复发布' }).click()
    await expect(listPublishRow.getByText('发布中')).toBeVisible()

    await page.getByRole('button', { name: '退出' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await registerUser(page, 'student', { name: 'E2E Scoped Student' })
    await expectStudentDashboard(page)
    await expect(page.getByText(examTitle)).not.toBeVisible()
    await page.getByPlaceholder('输入班级邀请码').fill(joinCode)
    await page.getByRole('button', { name: '加入班级' }).click()
    await expect(page.getByText(`已加入：${className}`)).toBeVisible()
    await expect(page.getByText(examTitle)).toBeVisible()

    await page.getByRole('button', { name: '退出' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await registerUser(page, 'student', { name: 'E2E Outside Student' })
    await expectStudentDashboard(page)
    await expect(page.getByText(examTitle)).not.toBeVisible()
  })
})
