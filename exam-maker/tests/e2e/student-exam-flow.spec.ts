import { expect, test } from '@playwright/test'
import {
  buildManualExamFromQuestion,
  createChoiceQuestion,
  expectStudentDashboard,
  expectTeacherDashboard,
  publishCurrentExam,
  registerUser,
} from './helpers'

test.describe('student exam taking', () => {
  test('lets a student take a published choice exam and see the auto-graded result', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const questionTitle = `E2E 考试题 ${suffix}`
    const questionContent = '以下哪一项最能体现监督学习的核心特征？'
    const examTitle = `E2E 发布考试 ${suffix}`
    const correctOption = '使用带标签样本训练模型'

    await registerUser(page, 'teacher', { name: 'E2E Publish Teacher' })
    await expectTeacherDashboard(page)
    await createChoiceQuestion(page, { title: questionTitle, content: questionContent, correctOption })
    await buildManualExamFromQuestion(page, questionTitle, examTitle)
    await expect(page.getByText(questionTitle)).toBeVisible()
    await expect(page.getByText(questionContent)).toBeVisible()
    await publishCurrentExam(page, examTitle)

    await page.getByRole('button', { name: '退出' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await registerUser(page, 'student', { name: 'E2E Exam Student' })
    await expectStudentDashboard(page)
    await expect(page.getByText(examTitle)).toBeVisible()
    await page.getByRole('button', { name: '开始考试' }).click()

    await expect(page).toHaveURL(/\/student\/exam\/.+sid=.+/)
    await expect(page.getByText(questionTitle)).toBeVisible()
    await expect(page.getByText(questionContent)).toBeVisible()
    await page.getByText(correctOption).click()
    await expect(page.getByText('1/1 已答')).toBeVisible()
    await page.getByRole('button', { name: '交卷' }).click()

    await expect(page).toHaveURL(/\/student\/submission\/.+/)
    await expect(page.getByRole('heading', { name: examTitle })).toBeVisible()
    await expect(page.getByText('10 / 10', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('已批阅')).toBeVisible()
    await expect(page.getByText(questionTitle)).toBeVisible()
    await expect(page.getByText('← 正确答案')).toBeVisible()

    await page.getByRole('link', { name: /我的成绩/ }).click()
    await expect(page.getByRole('heading', { name: '我的成绩' })).toBeVisible()
    await expect(page.getByText(examTitle)).toBeVisible()
    await expect(page.getByText('10 / 10', { exact: true }).first()).toBeVisible()
  })
})
