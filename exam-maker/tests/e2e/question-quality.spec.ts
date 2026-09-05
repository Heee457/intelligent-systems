import { expect, test } from '@playwright/test'
import { createChoiceQuestion, registerUser } from './helpers'

test('teacher can scan question bank quality and see duplicate groups', async ({ page }) => {
  await registerUser(page, 'teacher', { name: 'E2E Quality Teacher' })

  const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  const firstQuestion = {
    title: '治理相似题 A ' + suffix,
    content: '设矩阵 A 的秩为 2，判断该矩阵列向量组的线性相关性。批次 ' + suffix + ' A',
    correctOption: '列向量组线性相关',
  }
  const secondQuestion = {
    ...firstQuestion,
    title: '治理相似题 B ' + suffix,
    content: '设矩阵 A 的秩为 2，判断该矩阵列向量组的线性相关性。批次 ' + suffix + ' B',
  }

  await createChoiceQuestion(page, firstQuestion)
  await createChoiceQuestion(page, secondQuestion)

  await page.getByRole('button', { name: '治理扫描' }).click()

  await expect(page.getByText('重复/相似')).toBeVisible()
  await expect(page.getByText(/文本相似度|完全重复/)).toBeVisible()
  await expect(page.getByText(firstQuestion.title).first()).toBeVisible()
})
