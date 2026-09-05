import { expect, test } from '@playwright/test'
import { expectStudentDashboard, expectTeacherDashboard, loginUser, registerUser, testPassword } from './helpers'

test.describe('class membership', () => {
  test('lets a teacher create a class and a student join it by invite code', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const className = `E2E 班级 ${suffix}`
    const classDescription = '端到端测试班级'

    const teacher = await registerUser(page, 'teacher', { name: 'E2E Class Teacher' })
    await expectTeacherDashboard(page)

    await page.getByRole('link', { name: /班级/ }).click()
    await expect(page).toHaveURL(/\/classes$/)
    await expect(page.getByRole('heading', { name: '班级管理' })).toBeVisible()

    await page.getByRole('button', { name: /创建班级/ }).click()
    await page.locator('form input').nth(0).fill(className)
    await page.locator('form input').nth(1).fill(classDescription)
    await page.locator('form').getByRole('button', { name: '创建' }).click()

    await expect(page.getByRole('link', { name: className })).toBeVisible()
    const joinCode = (await page.locator('code').first().innerText()).trim()
    expect(joinCode).toMatch(/^[A-Z2-9]{6}$/)

    await page.getByRole('button', { name: '退出' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await registerUser(page, 'student', { name: 'E2E Class Student' })
    await expectStudentDashboard(page)
    await page.getByPlaceholder('输入班级邀请码').fill(joinCode)
    await page.getByRole('button', { name: '加入班级' }).click()
    await expect(page.getByText(`已加入：${className}`)).toBeVisible()

    await page.getByRole('button', { name: '退出' }).click()
    await loginUser(page, teacher.name, testPassword)
    await expectTeacherDashboard(page)

    await page.getByRole('link', { name: /班级/ }).click()
    await expect(page.getByRole('link', { name: className })).toBeVisible()
    await expect(page.getByText('1 名学生')).toBeVisible()
  })
})
