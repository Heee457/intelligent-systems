import { expect, test } from '@playwright/test'
import {
  buildManualExamFromQuestion,
  createChoiceQuestion,
  expectStudentDashboard,
  expectTeacherDashboard,
  publishCurrentExam,
  registerUser,
} from './helpers'

async function createFillblankQuestion(
  page: import('@playwright/test').Page,
  question: { title: string; content: string; answer: string }
) {
  await page.getByRole('link', { name: /题库/ }).click()
  await expect(page).toHaveURL(/\/questions$/)

  await page.getByRole('button', { name: /新建/ }).click()
  await expect(page.getByRole('heading', { name: '创建题目' })).toBeVisible()

  await page.locator('form').getByRole('combobox').selectOption('fillblank')
  await page.getByPlaceholder('简短标题，如：二次函数顶点坐标').fill(question.title)
  await page.getByPlaceholder('题目内容...').fill(question.content)
  await page.getByPlaceholder('答案').first().fill(question.answer)
  for (let i = 1; i < 4; i++) {
    await page.getByRole('button', { name: /添加填空/ }).click()
    await page.getByPlaceholder('答案').nth(i).fill('多余答案' + i)
  }
  await page.getByPlaceholder('题目解析...').fill('按二次型正定条件判断参数范围。')
  await page.locator('form').getByRole('button', { name: '创建题目' }).click()

  await expect(page.getByText(question.title)).toBeVisible()
  return question
}

test.describe('student exam taking', () => {
  test('lets a student take a published choice exam and see the auto-graded result', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const questionTitle = `E2E 考试题 ${suffix}`
    const questionContent = '以下哪一项最能体现监督学习的核心特征？'
    const examTitle = `E2E 发布考试 ${suffix}`
    const className = `E2E 发布班级 ${suffix}`
    const correctOption = '使用带标签样本训练模型，学习 $f(x)$'
    let joinCode = ''

    await registerUser(page, 'teacher', { name: 'E2E Publish Teacher' })
    await expectTeacherDashboard(page)
    await page.getByRole('link', { name: /班级/ }).click()
    await page.getByRole('button', { name: /创建班级/ }).click()
    await page.locator('form input').nth(0).fill(className)
    await page.locator('form input').nth(1).fill('发布考试班级')
    await page.locator('form').getByRole('button', { name: '创建' }).click()
    await expect(page.getByRole('link', { name: className })).toBeVisible()
    joinCode = (await page.locator('code').first().innerText()).trim()
    await createChoiceQuestion(page, { title: questionTitle, content: questionContent, correctOption })
    await buildManualExamFromQuestion(page, questionTitle, examTitle)
    await expect(page.getByText(questionTitle)).toBeVisible()
    await expect(page.getByText(questionContent)).toBeVisible()
    await publishCurrentExam(page, examTitle, '30', { className })

    await page.getByRole('button', { name: '退出' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await registerUser(page, 'student', { name: 'E2E Exam Student' })
    await expectStudentDashboard(page)
    await page.getByPlaceholder('输入班级邀请码').fill(joinCode)
    await page.getByRole('button', { name: '加入班级' }).click()
    await expect(page.getByText(`已加入：${className}`)).toBeVisible()
    await expect(page.getByText(examTitle)).toBeVisible()
    await page.getByRole('button', { name: '开始考试' }).click()

    await expect(page).toHaveURL(/\/student\/exam\/.+sid=.+/)
    await expect(page.getByText(questionTitle)).toBeVisible()
    await expect(page.getByText(questionContent)).toBeVisible()
    const inlineFormula = page.locator('.student-exam-latex .latex-inline').first()
    await expect(inlineFormula).toBeVisible()
    await expect(inlineFormula).toHaveCSS('overflow-x', 'visible')
    await expect(inlineFormula).toHaveCSS('display', 'inline')
    await page.getByText('使用带标签样本训练模型').click()
    await expect(page.getByText('1/1 已答')).toBeVisible()
    await page.getByRole('button', { name: '交卷' }).click()

    await expect(page).toHaveURL(/\/student\/submission\/.+/)
    await expect(page.getByRole('heading', { name: examTitle })).toBeVisible()
    await expect(page.getByText('10 / 10', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('已批阅')).toBeVisible()
    await expect(page.getByText(questionTitle)).toBeVisible()
    await expect(page.getByText('正确答案', { exact: true }).first()).toBeVisible()

    await page.getByRole('link', { name: /我的成绩/ }).click()
    await expect(page.getByRole('heading', { name: '我的成绩' })).toBeVisible()
    await expect(page.getByText(examTitle)).toBeVisible()
    await expect(page.getByText('10 / 10', { exact: true }).first()).toBeVisible()
  })

  test('shows one fillblank input when the stem has one visible blank', async ({ page }) => {
    const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const questionTitle = 'E2E 填空数量题 ' + suffix
    const questionContent = '已知二次型 $f(x_1,x_2)$ 正定，则参数 $t$ 应满足条件 ________。'
    const examTitle = 'E2E 填空发布考试 ' + suffix
    const className = 'E2E 填空班级 ' + suffix
    let joinCode = ''

    await registerUser(page, 'teacher', { name: 'E2E Fillblank Teacher' })
    await expectTeacherDashboard(page)
    await page.getByRole('link', { name: /班级/ }).click()
    await page.getByRole('button', { name: /创建班级/ }).click()
    await page.locator('form input').nth(0).fill(className)
    await page.locator('form input').nth(1).fill('填空题发布班级')
    await page.locator('form').getByRole('button', { name: '创建' }).click()
    await expect(page.getByRole('link', { name: className })).toBeVisible()
    joinCode = (await page.locator('code').first().innerText()).trim()

    await createFillblankQuestion(page, { title: questionTitle, content: questionContent, answer: 't > 36' })
    await buildManualExamFromQuestion(page, questionTitle, examTitle)
    await publishCurrentExam(page, examTitle, '30', { className })

    await page.getByRole('button', { name: '退出' }).click()
    await registerUser(page, 'student', { name: 'E2E Fillblank Student' })
    await expectStudentDashboard(page)
    await page.getByPlaceholder('输入班级邀请码').fill(joinCode)
    await page.getByRole('button', { name: '加入班级' }).click()
    await expect(page.getByText('已加入：' + className)).toBeVisible()
    await page.getByRole('button', { name: '开始考试' }).click()

    await expect(page).toHaveURL(/\/student\/exam\/.+sid=.+/)
    await expect(page.getByText(questionTitle)).toBeVisible()
    await expect(page.getByPlaceholder('答案')).toHaveCount(1)
    await page.getByPlaceholder('答案').fill('t > 36')
    await expect(page.getByText('1/1 已答')).toBeVisible()
  })
})
