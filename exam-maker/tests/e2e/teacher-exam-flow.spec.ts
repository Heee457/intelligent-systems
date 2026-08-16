import { expect, test } from '@playwright/test'
import { expectTeacherDashboard, registerUser } from './helpers'

test.describe('teacher question bank and manual exam creation', () => {
  test('creates a choice question and builds a draft exam from it', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const questionTitle = `E2E 选择题 ${suffix}`
    const questionContent = '以下哪一项最能体现监督学习的核心特征？'
    const examTitle = `E2E 手动组卷 ${suffix}`

    await test.step('register a teacher', async () => {
      await registerUser(page, 'teacher', { name: 'E2E Flow Teacher' })
      await expectTeacherDashboard(page)
    })

    await test.step('create a question in the question bank', async () => {
      await page.getByRole('link', { name: /题库/ }).click()
      await expect(page).toHaveURL(/\/questions$/)

      await page.getByRole('button', { name: /新建/ }).click()
      await expect(page.getByRole('heading', { name: '创建题目' })).toBeVisible()

      await page.getByPlaceholder('简短标题，如：二次函数顶点坐标').fill(questionTitle)
      await page.getByPlaceholder('题目内容...').fill(questionContent)
      await page.getByPlaceholder('选项 A').fill('使用带标签样本训练模型')
      await page.getByPlaceholder('选项 B').fill('完全不需要训练数据')
      await page.getByPlaceholder('选项 C').fill('只进行随机搜索')
      await page.getByPlaceholder('选项 D').fill('只处理无标签聚类')
      await page.locator('input[name="correctOption"]').first().check()
      await page.getByRole('button', { name: '简单' }).click()
      await page.getByPlaceholder('输入知识点后按回车').fill('机器学习')
      await page.keyboard.press('Enter')
      await page.getByPlaceholder('题目解析...').fill('监督学习依赖带标签数据建立输入和输出之间的映射。')
      await page.locator('form').getByRole('button', { name: '创建题目' }).click()

      await expect(page.getByText(questionTitle)).toBeVisible()
      await expect(page.getByText(questionContent)).toBeVisible()
    })

    await test.step('build a manual exam from the new question', async () => {
      await page.getByRole('link', { name: /组卷/ }).click()
      await expect(page).toHaveURL(/\/generator$/)
      await expect(page.getByRole('heading', { name: '可用题目' })).toBeVisible()
      await expect(page.getByText(questionTitle)).toBeVisible()

      await page.getByRole('button', { name: /添加/ }).click()
      await page.getByPlaceholder('试卷标题...').fill(examTitle)
      await expect(page.getByText('总分: 10')).toBeVisible()
      await page.getByRole('button', { name: '保存试卷' }).click()

      await expect(page).toHaveURL(/\/exams\/.+/)
      await expect(page.getByRole('heading', { name: examTitle })).toBeVisible()
      await expect(page.getByText('1 道题')).toBeVisible()
      await expect(page.getByText('总分: 10 分')).toBeVisible()
      await expect(page.getByText(questionTitle)).toBeVisible()
      await expect(page.getByText(questionContent)).toBeVisible()
    })
  })
})
