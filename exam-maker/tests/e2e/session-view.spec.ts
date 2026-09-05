import { expect, test } from '@playwright/test'
import fs from 'fs'
import { expectTeacherDashboard, registerUser } from './helpers'

test.describe('session detail view', () => {
  test('renders generated paper selection when paper metadata is minimal', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const course = `E2E 精简试卷元数据 ${suffix}`

    await page.route('**/api/sessions/*/start', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message: 'Pipeline start stubbed for E2E' }),
      })
    })

    await registerUser(page, 'teacher', { name: 'E2E Minimal Paper Teacher' })
    await expectTeacherDashboard(page)
    await page.getByPlaceholder('如：高等数学').fill(course)
    await page.locator('input[type="file"]').setInputFiles({
      name: 'minimal-paper.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n'),
    })
    const createResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith('/api/sessions') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: '开始命题' }).click()
    const createResponse = await createResponsePromise
    const createPayload = await createResponse.json() as { session: { workDir: string } }
    await expect(page).toHaveURL(/\/session\/.+/)

    const sessionId = new URL(page.url()).pathname.split('/').pop()
    if (!sessionId) throw new Error('Session id was not found in URL')
    const sessionDir = createPayload.session.workDir
    const sessionFile = sessionDir + '/session.json'
    const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'))
    const papers = [{ index: 1, filename: 'paper-1', formats: ['tex', 'pdf'] }]
    session.status = 'AWAIT_SELECTION'
    session.currentStep = 6
    session.stepDetail = '待确认: 编译转换'
    session.papers = papers
    fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2))
    fs.writeFileSync(sessionDir + '/confirm-selection.json', JSON.stringify(papers, null, 2))

    await page.reload()
    await expect(page.getByRole('heading', { name: course })).toBeVisible()
    await expect(page.getByText('试卷列表')).toBeVisible()
    await expect(page.getByText('第 1 套')).toBeVisible()
    await expect(page.getByText('覆盖 未知')).toBeVisible()
    await expect(page.getByText('未验证')).toBeVisible()
    await expect(page.getByRole('button', { name: 'PDF' })).toBeVisible()
  })
})
