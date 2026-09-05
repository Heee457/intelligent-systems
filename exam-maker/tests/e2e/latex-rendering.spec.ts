import { expect, test } from '@playwright/test'
import { expectTeacherDashboard, registerUser } from './helpers'

test.describe('latex rendering', () => {
  test('renders question content and options as KaTeX in the question bank', async ({ page }) => {
    const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const title = 'E2E LaTeX 矩阵题 ' + suffix

    await registerUser(page, 'teacher', { name: 'E2E Latex Teacher' })
    await expectTeacherDashboard(page)

    await page.getByRole('link', { name: /题库/ }).click()
    await expect(page).toHaveURL(/\/questions$/)

    await page.getByRole('button', { name: /新建/ }).click()
    await expect(page.getByRole('heading', { name: '创建题目' })).toBeVisible()

    await page.getByPlaceholder('简短标题，如：二次函数顶点坐标').fill(title)
    await page.getByPlaceholder('题目内容...').fill([
      '设矩阵',
      '\\[',
      'A=\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}',
      '\\]',
      '求 $A^2$。',
    ].join('\n'))
    await page.getByPlaceholder('选项 A').fill('$\\begin{bmatrix}7&10\\\\15&22\\end{bmatrix}$')
    await page.getByPlaceholder('选项 B').fill('$\\begin{bmatrix}1&0\\\\0&1\\end{bmatrix}$')
    await page.getByPlaceholder('选项 C').fill('$0$')
    await page.getByPlaceholder('选项 D').fill('$A$')
    await page.locator('input[name="correctOption"]').first().check()
    await page.getByPlaceholder('输入知识点后按回车').fill('矩阵乘法')
    await page.keyboard.press('Enter')
    await page.locator('form').getByRole('button', { name: '创建题目' }).click()

    await expect(page.getByText(title)).toBeVisible()
    await page.getByText(title).click()

    await expect(page.locator('.latex-renderer .katex').first()).toBeVisible()
    await expect(page.locator('.latex-renderer .katex-display').first()).toBeVisible()
  })
})
