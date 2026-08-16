import { expect, type Page } from '@playwright/test'

export const testPassword = 'E2E-pass-123'

export function uniqueEmail(role: 'teacher' | 'student') {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return `e2e-${role}-${suffix}@example.com`
}

export async function registerUser(
  page: Page,
  role: 'teacher' | 'student',
  options: { name?: string; email?: string; password?: string } = {},
) {
  const name = options.name ?? `E2E ${role}`
  const email = options.email ?? uniqueEmail(role)
  const password = options.password ?? testPassword

  await page.goto('/register')
  await expect(page.getByRole('heading', { name: '注册' })).toBeVisible()

  await page.getByPlaceholder('请输入姓名').fill(name)
  await page.getByPlaceholder('请输入邮箱').fill(email)
  await page.getByPlaceholder('至少 6 位').fill(password)
  await page.getByRole('button', { name: new RegExp(role === 'teacher' ? '教师' : '学生') }).click()
  await page.getByRole('button', { name: /^注册$/ }).click()
  await expect(page).toHaveURL(role === 'teacher' ? /\/$/ : /\/student\/dashboard$/)

  return { email, password, name, role }
}

export async function expectTeacherDashboard(page: Page) {
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: '智能命题仪表盘' })).toBeVisible()
  await expect(page.getByText('命题配置')).toBeVisible()
}

export async function expectStudentDashboard(page: Page) {
  await expect(page).toHaveURL(/\/student\/dashboard$/)
  await expect(page.getByRole('heading', { name: '考试大厅' })).toBeVisible()
  await expect(page.getByPlaceholder('输入班级邀请码')).toBeVisible()
}

export async function loginUser(page: Page, email: string, password = testPassword) {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: '登录' })).toBeVisible()

  await page.getByPlaceholder('请输入邮箱').fill(email)
  await page.getByPlaceholder('请输入密码').fill(password)
  await page.getByRole('button', { name: /^登录$/ }).click()
}

export async function createChoiceQuestion(
  page: Page,
  question: { title: string; content: string; correctOption?: string }
) {
  const correctOption = question.correctOption ?? '使用带标签样本训练模型'

  await page.getByRole('link', { name: /题库/ }).click()
  await expect(page).toHaveURL(/\/questions$/)

  await page.getByRole('button', { name: /新建/ }).click()
  await expect(page.getByRole('heading', { name: '创建题目' })).toBeVisible()

  await page.getByPlaceholder('简短标题，如：二次函数顶点坐标').fill(question.title)
  await page.getByPlaceholder('题目内容...').fill(question.content)
  await page.getByPlaceholder('选项 A').fill(correctOption)
  await page.getByPlaceholder('选项 B').fill('完全不需要训练数据')
  await page.getByPlaceholder('选项 C').fill('只进行随机搜索')
  await page.getByPlaceholder('选项 D').fill('只处理无标签聚类')
  await page.locator('input[name="correctOption"]').first().check()
  await page.getByRole('button', { name: '简单' }).click()
  await page.getByPlaceholder('输入知识点后按回车').fill('机器学习')
  await page.keyboard.press('Enter')
  await page.getByPlaceholder('题目解析...').fill('监督学习依赖带标签数据建立输入和输出之间的映射。')
  await page.locator('form').getByRole('button', { name: '创建题目' }).click()

  await expect(page.getByText(question.title)).toBeVisible()
  await expect(page.getByText(question.content)).toBeVisible()

  return { ...question, correctOption }
}

export async function buildManualExamFromQuestion(page: Page, questionTitle: string, examTitle: string) {
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
}

export async function publishCurrentExam(
  page: Page,
  title: string,
  durationMinutes = '30',
  options: { className?: string } = {},
) {
  await page.getByRole('button', { name: '发布' }).click()
  await expect(page.getByRole('heading', { name: '发布试卷' })).toBeVisible()

  await page.getByPlaceholder('发布标题').fill(title)
  await page.getByPlaceholder('考试时长（分钟）').fill(durationMinutes)

  const scope = page.getByLabel('发布范围')
  await expect(scope).toBeVisible()
  if (options.className) {
    await expect(scope.locator('option', { hasText: options.className })).toHaveCount(1)
    await scope.selectOption({ label: options.className })
  }

  await page.getByRole('button', { name: '确认发布' }).click()

  await expect(page.getByRole('button', { name: '取消发布' })).toBeVisible()
}
