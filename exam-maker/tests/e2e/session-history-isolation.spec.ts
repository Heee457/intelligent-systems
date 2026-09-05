import { expect, test } from '@playwright/test'
import { expectTeacherDashboard, registerUser } from './helpers'

test.describe('teacher session history isolation', () => {
  test("does not show one teacher's AI history tasks to another teacher", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const course = `E2E 私有历史任务 ${suffix}`

    await page.route('**/api/sessions/*/start', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message: 'Pipeline start stubbed for E2E' }),
      })
    })

    await registerUser(page, 'teacher', { name: 'E2E History Owner' })
    await expectTeacherDashboard(page)
    await page.getByPlaceholder('如：高等数学').fill(course)
    await page.locator('input[type="file"]').setInputFiles({
      name: 'history.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n'),
    })
    await page.getByRole('button', { name: '开始命题' }).click()
    await expect(page).toHaveURL(/\/session\/.+/)
    await expect(page.getByRole('heading', { name: course })).toBeVisible()

    await page.getByRole('button', { name: '退出' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await registerUser(page, 'teacher', { name: 'E2E History Stranger' })
    await expectTeacherDashboard(page)
    await expect(page.getByText(course)).not.toBeVisible()
    await expect(page.getByText('暂无历史任务')).toBeVisible()
  })
})
