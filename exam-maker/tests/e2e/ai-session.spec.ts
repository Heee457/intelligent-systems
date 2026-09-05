import { expect, test } from '@playwright/test'
import { expectTeacherDashboard, registerUser } from './helpers'

test.describe('AI generation session', () => {
  test('creates a session from the dashboard without invoking the external AI pipeline', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const course = `E2E 智能系统 ${suffix}`
    const coverage = '监督学习基础'
    const extra = '偏重概念辨析'

    await page.route('**/api/sessions/*/start', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message: 'Pipeline start stubbed for E2E' }),
      })
    })

    await registerUser(page, 'teacher', { name: 'E2E AI Teacher' })
    await expectTeacherDashboard(page)

    await page.getByPlaceholder('如：高等数学').fill(course)
    await expect(page.getByText('考试范围（可选）')).not.toBeVisible()
    await expect(page.getByText('命题依据')).toBeVisible()
    await expect(page.getByText('覆盖内容')).toBeVisible()
    await page.getByPlaceholder('手动添加知识点，如：矩阵的秩').fill(coverage)
    await page.keyboard.press('Enter')
    await page.getByText('高级设置').click()
    await page.getByPlaceholder('如：只考第二章矩阵；不要行列式计算；偏重证明题').fill(extra)
    await page.locator('select').first().selectOption('1')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'sample.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n'),
    })
    await expect(page.getByText('sample.pdf')).toBeVisible()

    await page.getByRole('button', { name: '开始命题' }).click()

    await expect(page).toHaveURL(/\/session\/.+/)
    await expect(page.getByRole('heading', { name: course })).toBeVisible()
    await expect(page.getByText(coverage)).toBeVisible()
    await expect(page.getByText(extra)).toBeVisible()
    await expect(page.getByText('1 套')).toBeVisible()
    await expect(page.locator('main').getByText(/已创建|运行中/)).toBeVisible()
    await expect(page.getByText('等待启动')).toBeVisible()
    await expect(page.getByText('sample.pdf')).toBeVisible()
  })

  test('validates that a course name is required before creating a session', async ({ page }) => {
    await registerUser(page, 'teacher', { name: 'E2E AI Validation Teacher' })
    await expectTeacherDashboard(page)

    await page.getByRole('button', { name: '开始命题' }).click()

    await expect(page.getByText('请输入课程名称')).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
  })
})
