import { expect, test } from '@playwright/test'
import {
  expectStudentDashboard,
  expectTeacherDashboard,
  registerUser,
  testPassword,
  uniqueEmail,
} from './helpers'

test.describe('authentication and role routing', () => {
  test('redirects anonymous users from protected teacher pages to login', async ({ page }) => {
    await page.goto('/questions')

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible()
  })

  test('shows a useful error when login credentials are invalid', async ({ page }) => {
    await page.goto('/login')

    await page.getByPlaceholder('请输入邮箱').fill(uniqueEmail('student'))
    await page.getByPlaceholder('请输入密码').fill('wrong-password')
    await page.getByRole('button', { name: /^登录$/ }).click()

    await expect(page.getByText('邮箱或密码错误')).toBeVisible()
  })

  test('registers a teacher through the UI and opens the teacher dashboard', async ({ page }) => {
    await registerUser(page, 'teacher', { name: 'E2E Teacher' })

    await expectTeacherDashboard(page)
  })

  test('registers a student through the UI and opens the student dashboard', async ({ page }) => {
    await registerUser(page, 'student', { name: 'E2E Student' })

    await expectStudentDashboard(page)
  })

  test('routes a logged-in student away from teacher-only pages', async ({ page }) => {
    await registerUser(page, 'student', { name: 'E2E Student Redirect' })

    await page.goto('/questions')

    await expectStudentDashboard(page)
  })

  test('allows a registered teacher to log in from a fresh browser session', async ({ browser }) => {
    const email = uniqueEmail('teacher')

    const setupPage = await browser.newPage()
    await registerUser(setupPage, 'teacher', { email, password: testPassword, name: 'E2E Login Teacher' })
    await setupPage.close()

    const page = await browser.newPage()
    await page.goto('/login')
    await page.getByPlaceholder('请输入邮箱').fill(email)
    await page.getByPlaceholder('请输入密码').fill(testPassword)
    await page.getByRole('button', { name: /^登录$/ }).click()

    await expectTeacherDashboard(page)
    await page.close()
  })
})
