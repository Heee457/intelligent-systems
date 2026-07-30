# exam-maker 网页应用 — 实施计划

> **For agentic workers:** 按任务顺序依次实现，每步勾选后进入下一步。Steps 使用 checkbox (`- [ ]`) 语法追踪进度。

**Goal:** 构建 exam-maker 纯前端 SPA，支持创建/编辑/管理六种题型、手动/自动/智能组卷、试卷管理和导出。

**Architecture:** React 18 + TypeScript + Vite 单页应用，Zustand 管理全局状态并通过 persist 中间件持久化到 localStorage，Tailwind CSS 处理样式，React Router v6 管理路由。

**Tech Stack:** React 18, TypeScript, Vite, React Router v6, Zustand, Tailwind CSS

## Global Constraints

- 纯前端，无后端依赖，数据存储在 localStorage
- 支持六种题型：choice, truefalse, fillblank, essay, match, ordering
- 支持三种组卷模式：手动拖拽、自动随机、智能（难度+知识点）
- 响应式设计，桌面为主移动端可用
- JSON 格式导入导出题库
- TypeScript 严格模式

---

### Task 1: 项目脚手架

**Files:**
- Create: `exam-maker/package.json`
- Create: `exam-maker/index.html`
- Create: `exam-maker/vite.config.ts`
- Create: `exam-maker/tsconfig.json`
- Create: `exam-maker/tsconfig.node.json`
- Create: `exam-maker/tailwind.config.js`
- Create: `exam-maker/postcss.config.js`
- Create: `exam-maker/src/main.tsx`
- Create: `exam-maker/src/index.css`
- Create: `exam-maker/.gitignore`

**Interfaces:**
- Produces: Vite + React + TypeScript 项目骨架，`npm run dev` 可启动空白页
- Produces: Tailwind CSS 已配置并生效

- [ ] **Step 1: 创建 package.json**

在 `exam-maker/package.json`：

```json
{
  "name": "exam-maker",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "zustand": "^4.5.4"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.6",
    "typescript": "^5.5.3",
    "vite": "^5.3.4"
  }
}
```

- [ ] **Step 2: 安装依赖**

```bash
cd exam-maker && npm install
```

- [ ] **Step 3: 创建 index.html**

在 `exam-maker/index.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>exam-maker - 在线组卷工具</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: 创建 vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

- [ ] **Step 5: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 6: 创建 tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 7: 创建 tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

- [ ] **Step 8: 创建 postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 9: 创建 src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-gray-50 text-gray-900 min-h-screen;
}
```

- [ ] **Step 10: 创建 src/main.tsx**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div className="p-8 text-3xl font-bold">exam-maker</div>
  </React.StrictMode>,
)
```

- [ ] **Step 11: 验证项目可启动**

```bash
cd exam-maker && npm run dev
```

打开浏览器确认显示 "exam-maker" 字样，有 Tailwind 样式生效。

- [ ] **Step 12: 创建 .gitignore**

```
node_modules/
dist/
.vite/
```

- [ ] **Step 13: 提交**

```bash
git add exam-maker/ && git commit -m "feat: scaffold exam-maker project with Vite + React + TS + Tailwind"
```

---

### Task 2: 类型定义

**Files:**
- Create: `exam-maker/src/types/index.ts`

**Interfaces:**
- Produces: 所有核心类型定义，供后续所有 task 引用

- [ ] **Step 1: 创建类型文件**

在 `exam-maker/src/types/index.ts`：

```typescript
// —— 基础枚举类型 ——
export type Difficulty = 'easy' | 'medium' | 'hard'

export type QuestionType =
  | 'choice'
  | 'truefalse'
  | 'fillblank'
  | 'essay'
  | 'match'
  | 'ordering'

// —— 题目相关 ——
export interface ChoiceOption {
  id: string
  label: string // A, B, C, D
  content: string
}

export interface MatchPair {
  id: string
  left: string
  right: string
}

export type Answer =
  | { type: 'choice'; selectedOptionId: string }
  | { type: 'truefalse'; value: boolean }
  | { type: 'fillblank'; blanks: string[] }
  | { type: 'essay'; referenceAnswer: string }
  | { type: 'match'; pairs: Array<{ left: string; right: string }> }
  | { type: 'ordering'; orderedItems: string[] }

export interface Question {
  id: string
  type: QuestionType
  title: string // 简短标题，列表展示用
  content: string // 题干内容
  options?: ChoiceOption[] // choice 专用
  matchPairs?: MatchPair[] // match 专用
  orderingItems?: string[] // ordering 专用
  answer: Answer
  difficulty: Difficulty
  knowledgePoints: string[] // 扁平标签
  explanation?: string // 解析
  createdAt: number
  updatedAt: number
}

// —— 试卷相关 ——
export interface ExamQuestion {
  questionId: string
  score: number
  order: number
}

export interface Exam {
  id: string
  title: string
  questions: ExamQuestion[]
  totalScore: number
  status: 'draft' | 'published'
  createdAt: number
  updatedAt: number
}

// —— 组卷规则 ——
export interface RuleSection {
  type: QuestionType
  count: number
  scorePerQuestion: number
  difficulty?: Difficulty
  knowledgePoints?: string[]
}

export interface GenerationRule {
  name: string
  sections: RuleSection[]
  totalScore: number
}

// —— 历史记录 ——
export interface HistoryEntry {
  id: string
  examTitle: string
  rule: GenerationRule
  createdAt: number
}
```

- [ ] **Step 2: 验证编译**

```bash
cd exam-maker && npx tsc --noEmit
```

- [ ] **Step 3: 提交**

```bash
git add exam-maker/src/types/ && git commit -m "feat: add core type definitions"
```

---

### Task 3: 工具函数

**Files:**
- Create: `exam-maker/src/utils/id.ts`
- Create: `exam-maker/src/utils/storage.ts`
- Create: `exam-maker/src/utils/examGenerator.ts`

**Interfaces:**
- Consumes: `types/index.ts` 中的 `Question`, `Exam`, `GenerationRule`, `RuleSection`, `ExamQuestion`, `HistoryEntry`
- Produces: `generateId(): string`
- Produces: `loadFromStorage<T>(key: string, fallback: T): T`
- Produces: `saveToStorage<T>(key: string, data: T): void`
- Produces: `generateExam(rule, questions): { examQuestions, totalScore }`

- [ ] **Step 1: 创建 ID 生成器**

在 `exam-maker/src/utils/id.ts`：

```typescript
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}
```

- [ ] **Step 2: 创建 storage 封装**

在 `exam-maker/src/utils/storage.ts`：

```typescript
export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveToStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (e) {
    console.error(`Failed to save to localStorage key="${key}"`, e)
  }
}
```

- [ ] **Step 3: 创建组卷逻辑**

在 `exam-maker/src/utils/examGenerator.ts`：

```typescript
import type { Question, GenerationRule, ExamQuestion, RuleSection } from '../types'

// Fisher-Yates 洗牌
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function matchSection(pool: Question[], section: RuleSection): Question[] {
  let filtered = pool.filter((q) => q.type === section.type)

  if (section.difficulty) {
    filtered = filtered.filter((q) => q.difficulty === section.difficulty)
  }

  if (section.knowledgePoints && section.knowledgePoints.length > 0) {
    filtered = filtered.filter((q) =>
      section.knowledgePoints!.some((kp) =>
        q.knowledgePoints.some((qkp) => qkp.includes(kp)),
      ),
    )
  }

  return shuffle(filtered).slice(0, section.count)
}

export function generateExam(
  rule: GenerationRule,
  pool: Question[],
): { examQuestions: ExamQuestion[]; totalScore: number } {
  let order = 1
  const examQuestions: ExamQuestion[] = []

  for (const section of rule.sections) {
    const matched = matchSection(pool, section)
    for (const q of matched) {
      examQuestions.push({
        questionId: q.id,
        score: section.scorePerQuestion,
        order: order++,
      })
    }
  }

  const totalScore = examQuestions.reduce((sum, eq) => sum + eq.score, 0)

  return { examQuestions, totalScore }
}
```

- [ ] **Step 4: 验证编译**

```bash
cd exam-maker && npx tsc --noEmit
```

- [ ] **Step 5: 提交**

```bash
git add exam-maker/src/utils/ && git commit -m "feat: add utility functions - ID, storage, exam generator"
```

---

### Task 4: Zustand 状态管理

**Files:**
- Create: `exam-maker/src/store/questionStore.ts`
- Create: `exam-maker/src/store/examStore.ts`
- Create: `exam-maker/src/store/uiStore.ts`

**Interfaces:**
- Consumes: `types/index.ts` 全部类型, `utils/id.ts`, `utils/storage.ts`, `utils/examGenerator.ts`
- Produces: `useQuestionStore` — questions 数组 CRUD + 筛选搜索
- Produces: `useExamStore` — exams 数组 CRUD + 组卷 + 历史
- Produces: `useUIStore` — 侧栏折叠、选中题目 ID、搜索筛选状态

- [ ] **Step 1: 创建 questionStore**

在 `exam-maker/src/store/questionStore.ts`：

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Question, QuestionType, Difficulty } from '../types'
import { generateId } from '../utils/id'

interface QuestionFilter {
  type?: QuestionType
  difficulty?: Difficulty
  knowledgePoint?: string
  keyword?: string
}

interface QuestionState {
  questions: Question[]

  // CRUD
  addQuestion: (q: Omit<Question, 'id' | 'createdAt' | 'updatedAt'>) => Question
  updateQuestion: (id: string, data: Partial<Question>) => void
  deleteQuestion: (id: string) => void
  deleteQuestions: (ids: string[]) => void
  getQuestion: (id: string) => Question | undefined

  // 批量修改
  batchSetDifficulty: (ids: string[], difficulty: Difficulty) => void
  batchAddKnowledgePoint: (ids: string[], kp: string) => void
  batchRemoveKnowledgePoint: (ids: string[], kp: string) => void

  // 过滤搜索
  getFilteredQuestions: (filter: QuestionFilter) => Question[]

  // 导入导出
  exportQuestions: () => string
  importQuestions: (json: string) => number
}

export const useQuestionStore = create<QuestionState>()(
  persist(
    (set, get) => ({
      questions: [],

      addQuestion: (q) => {
        const now = Date.now()
        const question: Question = { ...q, id: generateId(), createdAt: now, updatedAt: now }
        set((s) => ({ questions: [...s.questions, question] }))
        return question
      },

      updateQuestion: (id, data) =>
        set((s) => ({
          questions: s.questions.map((q) =>
            q.id === id ? { ...q, ...data, updatedAt: Date.now() } : q,
          ),
        })),

      deleteQuestion: (id) =>
        set((s) => ({ questions: s.questions.filter((q) => q.id !== id) })),

      deleteQuestions: (ids) =>
        set((s) => ({ questions: s.questions.filter((q) => !ids.includes(q.id)) })),

      getQuestion: (id) => get().questions.find((q) => q.id === id),

      batchSetDifficulty: (ids, difficulty) =>
        set((s) => ({
          questions: s.questions.map((q) =>
            ids.includes(q.id) ? { ...q, difficulty, updatedAt: Date.now() } : q,
          ),
        })),

      batchAddKnowledgePoint: (ids, kp) =>
        set((s) => ({
          questions: s.questions.map((q) =>
            ids.includes(q.id) && !q.knowledgePoints.includes(kp)
              ? { ...q, knowledgePoints: [...q.knowledgePoints, kp], updatedAt: Date.now() }
              : q,
          ),
        })),

      batchRemoveKnowledgePoint: (ids, kp) =>
        set((s) => ({
          questions: s.questions.map((q) =>
            ids.includes(q.id)
              ? { ...q, knowledgePoints: q.knowledgePoints.filter((p) => p !== kp), updatedAt: Date.now() }
              : q,
          ),
        })),

      getFilteredQuestions: (filter) => {
        let result = get().questions
        if (filter.type) result = result.filter((q) => q.type === filter.type)
        if (filter.difficulty) result = result.filter((q) => q.difficulty === filter.difficulty)
        if (filter.knowledgePoint)
          result = result.filter((q) =>
            q.knowledgePoints.some((kp) => kp.includes(filter.knowledgePoint!)),
          )
        if (filter.keyword) {
          const kw = filter.keyword.toLowerCase()
          result = result.filter(
            (q) =>
              q.title.toLowerCase().includes(kw) || q.content.toLowerCase().includes(kw),
          )
        }
        return result
      },

      exportQuestions: () => JSON.stringify(get().questions, null, 2),

      importQuestions: (json) => {
        const parsed = JSON.parse(json) as Question[]
        set((s) => {
          const existingIds = new Set(s.questions.map((q) => q.id))
          const newQuestions = parsed.filter((q) => !existingIds.has(q.id))
          return { questions: [...s.questions, ...newQuestions] }
        })
        return parsed.filter((q) => !get().questions.map((x) => x.id).includes(q.id)).length
      },
    }),
    { name: 'exam-maker-questions' },
  ),
)
```

- [ ] **Step 2: 创建 examStore**

在 `exam-maker/src/store/examStore.ts`：

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Exam, ExamQuestion, GenerationRule, HistoryEntry } from '../types'
import { generateId } from '../utils/id'
import { generateExam } from '../utils/examGenerator'
import { useQuestionStore } from './questionStore'

interface ExamState {
  exams: Exam[]
  history: HistoryEntry[]

  createExam: (title: string) => Exam
  deleteExam: (id: string) => void
  duplicateExam: (id: string) => Exam | undefined
  updateExam: (id: string, data: Partial<Exam>) => void

  addQuestionToExam: (examId: string, questionId: string, score: number) => void
  removeQuestionFromExam: (examId: string, questionId: string) => void
  reorderExamQuestions: (examId: string, questionIds: string[]) => void
  setQuestionScore: (examId: string, questionId: string, score: number) => void

  generateExamFromRule: (rule: GenerationRule) => Exam

  clearHistory: () => void
}

export const useExamStore = create<ExamState>()(
  persist(
    (set, get) => ({
      exams: [],
      history: [],

      createExam: (title) => {
        const now = Date.now()
        const exam: Exam = {
          id: generateId(),
          title,
          questions: [],
          totalScore: 0,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ exams: [...s.exams, exam] }))
        return exam
      },

      deleteExam: (id) =>
        set((s) => ({ exams: s.exams.filter((e) => e.id !== id) })),

      duplicateExam: (id) => {
        const existing = get().exams.find((e) => e.id === id)
        if (!existing) return undefined
        const now = Date.now()
        const copy: Exam = {
          ...existing,
          id: generateId(),
          title: existing.title + ' (副本)',
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ exams: [...s.exams, copy] }))
        return copy
      },

      updateExam: (id, data) =>
        set((s) => ({
          exams: s.exams.map((e) =>
            e.id === id ? { ...e, ...data, updatedAt: Date.now() } : e,
          ),
        })),

      addQuestionToExam: (examId, questionId, score) =>
        set((s) => ({
          exams: s.exams.map((e) => {
            if (e.id !== examId) return e
            const eq: ExamQuestion = {
              questionId,
              score,
              order: e.questions.length + 1,
            }
            const questions = [...e.questions, eq]
            return {
              ...e,
              questions,
              totalScore: questions.reduce((sum, q) => sum + q.score, 0),
              updatedAt: Date.now(),
            }
          }),
        })),

      removeQuestionFromExam: (examId, questionId) =>
        set((s) => ({
          exams: s.exams.map((e) => {
            if (e.id !== examId) return e
            const questions = e.questions
              .filter((q) => q.questionId !== questionId)
              .map((q, i) => ({ ...q, order: i + 1 }))
            return {
              ...e,
              questions,
              totalScore: questions.reduce((sum, q) => sum + q.score, 0),
              updatedAt: Date.now(),
            }
          }),
        })),

      reorderExamQuestions: (examId, questionIds) =>
        set((s) => ({
          exams: s.exams.map((e) => {
            if (e.id !== examId) return e
            const questions = questionIds
              .map((qid, i) => {
                const eq = e.questions.find((q) => q.questionId === qid)
                return eq ? { ...eq, order: i + 1 } : null
              })
              .filter(Boolean) as ExamQuestion[]
            return { ...e, questions, updatedAt: Date.now() }
          }),
        })),

      setQuestionScore: (examId, questionId, score) =>
        set((s) => ({
          exams: s.exams.map((e) => {
            if (e.id !== examId) return e
            const questions = e.questions.map((q) =>
              q.questionId === questionId ? { ...q, score } : q,
            )
            return {
              ...e,
              questions,
              totalScore: questions.reduce((sum, q) => sum + q.score, 0),
              updatedAt: Date.now(),
            }
          }),
        })),

      generateExamFromRule: (rule) => {
        const pool = useQuestionStore.getState().questions
        const { examQuestions, totalScore } = generateExam(rule, pool)
        const now = Date.now()
        const exam: Exam = {
          id: generateId(),
          title: rule.name,
          questions: examQuestions,
          totalScore,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        }
        const entry: HistoryEntry = {
          id: generateId(),
          examTitle: rule.name,
          rule,
          createdAt: now,
        }
        set((s) => ({
          exams: [...s.exams, exam],
          history: [...s.history, entry],
        }))
        return exam
      },

      clearHistory: () => set({ history: [] }),
    }),
    { name: 'exam-maker-exams' },
  ),
)
```

- [ ] **Step 3: 创建 uiStore**

在 `exam-maker/src/store/uiStore.ts`：

```typescript
import { create } from 'zustand'

interface UIState {
  sidebarOpen: boolean
  selectedQuestionId: string | null
  selectedExamId: string | null

  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  selectQuestion: (id: string | null) => void
  selectExam: (id: string | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  selectedQuestionId: null,
  selectedExamId: null,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  selectQuestion: (id) => set({ selectedQuestionId: id }),
  selectExam: (id) => set({ selectedExamId: id }),
}))
```

- [ ] **Step 4: 验证编译**

```bash
cd exam-maker && npx tsc --noEmit
```

- [ ] **Step 5: 提交**

```bash
git add exam-maker/src/store/ && git commit -m "feat: add Zustand stores - question, exam, ui"
```

---

### Task 5: 布局组件

**Files:**
- Create: `exam-maker/src/components/layout/Navbar.tsx`
- Create: `exam-maker/src/components/layout/Sidebar.tsx`
- Create: `exam-maker/src/components/layout/Layout.tsx`

**Interfaces:**
- Produces: `<Layout>` 组件包裹页面内容，提供导航和侧栏

- [ ] **Step 1: 创建 Navbar 组件**

在 `exam-maker/src/components/layout/Navbar.tsx`：

```tsx
import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/questions', label: '题库' },
  { to: '/generator', label: '组卷' },
  { to: '/exams', label: '试卷' },
  { to: '/history', label: '历史' },
]

export default function Navbar() {
  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-1">
      <span className="text-xl font-bold text-indigo-600 mr-6">📝 exam-maker</span>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
```

- [ ] **Step 2: 创建 Layout 组件**

在 `exam-maker/src/components/layout/Layout.tsx`：

```tsx
import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 3: 验证编译**

```bash
cd exam-maker && npx tsc --noEmit
```

- [ ] **Step 4: 提交**

```bash
git add exam-maker/src/components/layout/ && git commit -m "feat: add layout components - Navbar, Layout"
```

---

### Task 6: 共享组件

**Files:**
- Create: `exam-maker/src/components/shared/Modal.tsx`
- Create: `exam-maker/src/components/shared/EmptyState.tsx`
- Create: `exam-maker/src/components/shared/ConfirmDialog.tsx`
- Create: `exam-maker/src/components/shared/TagInput.tsx`

**Interfaces:**
- Produces: `<Modal>` — 通用弹窗
- Produces: `<EmptyState>` — 空状态提示
- Produces: `<ConfirmDialog>` — 确认对话框
- Produces: `<TagInput>` — 标签输入组件（用于知识点输入）

- [ ] **Step 1: 创建 Modal 组件**

在 `exam-maker/src/components/shared/Modal.tsx`：

```tsx
import { useEffect, useRef } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: string
}

export default function Modal({ open, onClose, title, children, width = 'max-w-lg' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      <div className={`bg-white rounded-xl shadow-xl ${width} w-full mx-4 max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-4 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 创建 EmptyState 组件**

在 `exam-maker/src/components/shared/EmptyState.tsx`：

```tsx
interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: React.ReactNode
}

export default function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <span className="text-5xl mb-4">{icon}</span>
      <h3 className="text-lg font-medium text-gray-500 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-400 mb-4">{description}</p>}
      {action}
    </div>
  )
}
```

- [ ] **Step 3: 创建 ConfirmDialog 组件**

在 `exam-maker/src/components/shared/ConfirmDialog.tsx`：

```tsx
import Modal from './Modal'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}

export default function ConfirmDialog({
  open, onClose, onConfirm, title, message, confirmLabel = '确认', danger = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-sm">
      <p className="text-gray-600 mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          取消
        </button>
        <button
          onClick={() => { onConfirm(); onClose() }}
          className={`px-4 py-2 text-sm rounded-lg text-white ${
            danger ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-500 hover:bg-indigo-600'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4: 创建 TagInput 组件**

在 `exam-maker/src/components/shared/TagInput.tsx`：

```tsx
import { useState, type KeyboardEvent } from 'react'

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}

export default function TagInput({ tags, onChange, placeholder = '输入后按回车添加' }: TagInputProps) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const trimmed = input.trim()
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed])
    }
    setInput('')
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 p-2 border border-gray-200 rounded-lg bg-white min-h-[42px] items-center focus-within:ring-2 focus-within:ring-indigo-200 focus-within:border-indigo-400">
      {tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-sm rounded-md">
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="text-indigo-400 hover:text-indigo-600"
          >
            &times;
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addTag}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] outline-none text-sm bg-transparent"
      />
    </div>
  )
}
```

- [ ] **Step 5: 验证编译**

```bash
cd exam-maker && npx tsc --noEmit
```

- [ ] **Step 6: 提交**

```bash
git add exam-maker/src/components/shared/ && git commit -m "feat: add shared components - Modal, EmptyState, ConfirmDialog, TagInput"
```

---

### Task 7: 题目编辑表单组件

**Files:**
- Create: `exam-maker/src/components/questions/QuestionForm.tsx`

**Interfaces:**
- Consumes: 类型定义, `useQuestionStore`, `TagInput`
- Produces: `<QuestionForm>` 创建/编辑题目表单，按题型动态切换字段

- [ ] **Step 1: 创建 QuestionForm 组件**

在 `exam-maker/src/components/questions/QuestionForm.tsx`：

```tsx
import { useState, useEffect } from 'react'
import type { Question, QuestionType, Difficulty, ChoiceOption, MatchPair, Answer } from '../../types'
import { useQuestionStore } from '../../store/questionStore'
import TagInput from '../shared/TagInput'
import { generateId } from '../../utils/id'

interface QuestionFormProps {
  question?: Question | null
  onSaved: () => void
  onCancel: () => void
}

const TYPE_LABELS: Record<QuestionType, string> = {
  choice: '选择题',
  truefalse: '判断题',
  fillblank: '填空题',
  essay: '问答题',
  match: '匹配题',
  ordering: '排序题',
}

function defaultAnswer(type: QuestionType): Answer {
  switch (type) {
    case 'choice': return { type: 'choice', selectedOptionId: '' }
    case 'truefalse': return { type: 'truefalse', value: true }
    case 'fillblank': return { type: 'fillblank', blanks: [''] }
    case 'essay': return { type: 'essay', referenceAnswer: '' }
    case 'match': return { type: 'match', pairs: [] }
    case 'ordering': return { type: 'ordering', orderedItems: [] }
  }
}

export default function QuestionForm({ question, onSaved, onCancel }: QuestionFormProps) {
  const { addQuestion, updateQuestion } = useQuestionStore()
  const isEdit = !!question

  const [type, setType] = useState<QuestionType>(question?.type ?? 'choice')
  const [title, setTitle] = useState(question?.title ?? '')
  const [content, setContent] = useState(question?.content ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty>(question?.difficulty ?? 'medium')
  const [knowledgePoints, setKnowledgePoints] = useState<string[]>(question?.knowledgePoints ?? [])
  const [explanation, setExplanation] = useState(question?.explanation ?? '')
  const [answer, setAnswer] = useState<Answer>(question?.answer ?? defaultAnswer(type))

  // 选择题选项
  const [options, setOptions] = useState<ChoiceOption[]>(
    question?.options ?? [
      { id: generateId(), label: 'A', content: '' },
      { id: generateId(), label: 'B', content: '' },
      { id: generateId(), label: 'C', content: '' },
      { id: generateId(), label: 'D', content: '' },
    ],
  )
  // 匹配题配对
  const [matchPairs, setMatchPairs] = useState<MatchPair[]>(
    question?.matchPairs ?? [{ id: generateId(), left: '', right: '' }],
  )
  // 排序题项
  const [orderingItems, setOrderingItems] = useState<string[]>(
    question?.orderingItems ?? ['', '', ''],
  )

  // 切换题型时重置答案
  useEffect(() => {
    if (!isEdit) {
      setAnswer(defaultAnswer(type))
    }
  }, [type, isEdit])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const base = { type, title, content, difficulty, knowledgePoints, explanation }

    if (isEdit && question) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = { ...base, answer }
      if (type === 'choice') data.options = options
      if (type === 'match') data.matchPairs = matchPairs
      if (type === 'ordering') data.orderingItems = orderingItems
      updateQuestion(question.id, data)
    } else {
      addQuestion({ ...base, answer, options: type === 'choice' ? options : undefined, matchPairs: type === 'match' ? matchPairs : undefined, orderingItems: type === 'ordering' ? orderingItems : undefined })
    }
    onSaved()
  }

  const LABEL_CLS = 'block text-sm font-medium text-gray-700 mb-1'
  const INPUT_CLS = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* 题型选择 */}
      <div>
        <label className={LABEL_CLS}>题型</label>
        <select value={type} onChange={(e) => setType(e.target.value as QuestionType)} className={INPUT_CLS}>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* 标题 */}
      <div>
        <label className={LABEL_CLS}>标题</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT_CLS} placeholder="简短标题，如：二次函数顶点坐标" required />
      </div>

      {/* 题干 */}
      <div>
        <label className={LABEL_CLS}>题干</label>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} className={INPUT_CLS} rows={3} placeholder="题目内容..." required />
      </div>

      {/* 选择题：选项 */}
      {type === 'choice' && (
        <div>
          <label className={LABEL_CLS}>选项</label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={opt.id} className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-500 w-6">{opt.label}</span>
                <input
                  value={opt.content}
                  onChange={(e) => {
                    const next = [...options]
                    next[i] = { ...next[i], content: e.target.value }
                    setOptions(next)
                  }}
                  className={INPUT_CLS}
                  placeholder={`选项 ${opt.label}`}
                  required
                />
                <input
                  type="radio"
                  name="correctOption"
                  checked={answer.type === 'choice' && answer.selectedOptionId === opt.id}
                  onChange={() => setAnswer({ type: 'choice', selectedOptionId: opt.id })}
                  className="w-4 h-4 accent-indigo-500"
                  title="设为正确答案"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 判断题：答案 */}
      {type === 'truefalse' && (
        <div>
          <label className={LABEL_CLS}>正确答案</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={answer.type === 'truefalse' && answer.value === true} onChange={() => setAnswer({ type: 'truefalse', value: true })} className="accent-green-500" />
              <span className="text-sm text-green-700 font-medium">✓ 正确</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={answer.type === 'truefalse' && answer.value === false} onChange={() => setAnswer({ type: 'truefalse', value: false })} className="accent-red-500" />
              <span className="text-sm text-red-700 font-medium">✗ 错误</span>
            </label>
          </div>
        </div>
      )}

      {/* 填空题：空格 */}
      {type === 'fillblank' && (
        <div>
          <label className={LABEL_CLS}>填空答案（每个填空用逗号分隔多个可接受答案）</label>
          <div className="space-y-2">
            {(answer.type === 'fillblank' ? answer.blanks : ['']).map((blank, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-sm text-gray-500">空{i + 1}</span>
                <input
                  value={blank}
                  onChange={(e) => {
                    if (answer.type === 'fillblank') {
                      const blanks = [...answer.blanks]
                      blanks[i] = e.target.value
                      setAnswer({ ...answer, blanks })
                    }
                  }}
                  className={INPUT_CLS}
                  placeholder="答案"
                />
                {i > 0 && (
                  <button type="button" onClick={() => {
                    if (answer.type === 'fillblank') {
                      setAnswer({ ...answer, blanks: answer.blanks.filter((_, j) => j !== i) })
                    }
                  }} className="text-red-400 hover:text-red-600 text-sm">删除</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => {
            if (answer.type === 'fillblank') {
              setAnswer({ ...answer, blanks: [...answer.blanks, ''] })
            }
          }} className="mt-2 text-sm text-indigo-600 hover:text-indigo-800">
            + 添加填空
          </button>
        </div>
      )}

      {/* 问答题：参考答案 */}
      {type === 'essay' && (
        <div>
          <label className={LABEL_CLS}>参考答案</label>
          <textarea
            value={answer.type === 'essay' ? answer.referenceAnswer : ''}
            onChange={(e) => setAnswer({ type: 'essay', referenceAnswer: e.target.value })}
            className={INPUT_CLS} rows={4} placeholder="参考答案..."
          />
        </div>
      )}

      {/* 匹配题 */}
      {type === 'match' && (
        <div>
          <label className={LABEL_CLS}>配对项</label>
          <div className="space-y-2">
            {matchPairs.map((pair, i) => (
              <div key={pair.id} className="flex items-center gap-2">
                <input value={pair.left} onChange={(e) => {
                  const next = [...matchPairs]
                  next[i] = { ...next[i], left: e.target.value }
                  setMatchPairs(next)
                }} className={INPUT_CLS} placeholder="左项" />
                <span className="text-gray-400">—</span>
                <input value={pair.right} onChange={(e) => {
                  const next = [...matchPairs]
                  next[i] = { ...next[i], right: e.target.value }
                  setMatchPairs(next)
                }} className={INPUT_CLS} placeholder="右项" />
                {matchPairs.length > 1 && (
                  <button type="button" onClick={() => setMatchPairs(matchPairs.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-sm">删除</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setMatchPairs([...matchPairs, { id: generateId(), left: '', right: '' }])} className="mt-2 text-sm text-indigo-600 hover:text-indigo-800">
            + 添加配对
          </button>
        </div>
      )}

      {/* 排序题 */}
      {type === 'ordering' && (
        <div>
          <label className={LABEL_CLS}>排序项（按正确顺序排列）</label>
          <div className="space-y-2">
            {orderingItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-sm text-gray-400 w-6">{i + 1}.</span>
                <input value={item} onChange={(e) => {
                  const next = [...orderingItems]
                  next[i] = e.target.value
                  setOrderingItems(next)
                }} className={INPUT_CLS} placeholder={`第 ${i + 1} 项`} />
                {orderingItems.length > 2 && (
                  <button type="button" onClick={() => setOrderingItems(orderingItems.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-sm">删除</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setOrderingItems([...orderingItems, ''])} className="mt-2 text-sm text-indigo-600 hover:text-indigo-800">
            + 添加项
          </button>
        </div>
      )}

      {/* 难度 */}
      <div>
        <label className={LABEL_CLS}>难度</label>
        <div className="flex gap-2">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDifficulty(d)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                difficulty === d
                  ? d === 'easy' ? 'bg-green-100 text-green-700 ring-1 ring-green-300'
                  : d === 'medium' ? 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-300'
                  : 'bg-red-100 text-red-700 ring-1 ring-red-300'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {{ easy: '简单', medium: '中等', hard: '困难' }[d]}
            </button>
          ))}
        </div>
      </div>

      {/* 知识点 */}
      <div>
        <label className={LABEL_CLS}>知识点</label>
        <TagInput tags={knowledgePoints} onChange={setKnowledgePoints} placeholder="输入知识点后按回车" />
      </div>

      {/* 解析 */}
      <div>
        <label className={LABEL_CLS}>解析（可选）</label>
        <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} className={INPUT_CLS} rows={2} placeholder="题目解析..." />
      </div>

      {/* 按钮 */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="px-5 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
          取消
        </button>
        <button type="submit" className="px-5 py-2 text-sm rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 font-medium">
          {isEdit ? '保存修改' : '创建题目'}
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: 验证编译**

```bash
cd exam-maker && npx tsc --noEmit
```

- [ ] **Step 3: 提交**

```bash
git add exam-maker/src/components/questions/ && git commit -m "feat: add QuestionForm component with dynamic question types"
```

---

### Task 8: 题库管理页面 (`/questions`)

**Files:**
- Create: `exam-maker/src/components/questions/QuestionList.tsx`
- Create: `exam-maker/src/routes/QuestionBank.tsx`

**Interfaces:**
- Consumes: `useQuestionStore`, `useUIStore`, `QuestionForm`, `Modal`, `ConfirmDialog`, `EmptyState`
- Produces: 完整的题库管理页面 — 左侧列表+筛选，右侧编辑面板

- [ ] **Step 1: 创建 QuestionList 组件**

在 `exam-maker/src/components/questions/QuestionList.tsx`：

```tsx
import type { Question, QuestionType, Difficulty } from '../../types'

interface QuestionListProps {
  questions: Question[]
  selectedId: string | null
  onSelect: (id: string) => void
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
}

const TYPE_BADGES: Record<QuestionType, string> = {
  choice: 'bg-blue-50 text-blue-700',
  truefalse: 'bg-cyan-50 text-cyan-700',
  fillblank: 'bg-amber-50 text-amber-700',
  essay: 'bg-purple-50 text-purple-700',
  match: 'bg-pink-50 text-pink-700',
  ordering: 'bg-teal-50 text-teal-700',
}

const TYPE_LABELS: Record<QuestionType, string> = {
  choice: '选择', truefalse: '判断', fillblank: '填空',
  essay: '问答', match: '匹配', ordering: '排序',
}

const DIFF_LABELS: Record<Difficulty, string> = { easy: '简单', medium: '中等', hard: '困难' }
const DIFF_COLORS: Record<Difficulty, string> = {
  easy: 'text-green-600', medium: 'text-yellow-600', hard: 'text-red-600',
}

export default function QuestionList({
  questions, selectedId, onSelect, selectedIds, onToggleSelect, onSelectAll, onClearSelection,
}: QuestionListProps) {
  return (
    <div>
      {questions.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
          <input
            type="checkbox"
            checked={selectedIds.length === questions.length && questions.length > 0}
            onChange={() => selectedIds.length === questions.length ? onClearSelection() : onSelectAll()}
            className="w-4 h-4 accent-indigo-500"
          />
          <span className="text-xs text-gray-500">
            {selectedIds.length > 0 ? `已选 ${selectedIds.length}/${questions.length}` : `${questions.length} 道题`}
          </span>
        </div>
      )}
      <div className="divide-y divide-gray-50 max-h-[calc(100vh-240px)] overflow-y-auto">
        {questions.map((q) => (
          <div
            key={q.id}
            onClick={() => onSelect(q.id)}
            className={`px-3 py-3 cursor-pointer transition-colors hover:bg-gray-50 flex items-start gap-2 ${
              selectedId === q.id ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : 'border-l-4 border-l-transparent'
            }`}
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(q.id)}
              onChange={(e) => { e.stopPropagation(); onToggleSelect(q.id) }}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 mt-0.5 accent-indigo-500"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`text-xs px-1.5 py-0.5 rounded ${TYPE_BADGES[q.type]}`}>
                  {TYPE_LABELS[q.type]}
                </span>
                <span className={`text-xs ${DIFF_COLORS[q.difficulty]}`}>
                  {DIFF_LABELS[q.difficulty]}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-800 truncate">{q.title}</p>
              <p className="text-xs text-gray-500 truncate mt-0.5">{q.content}</p>
              {q.knowledgePoints.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {q.knowledgePoints.slice(0, 3).map((kp) => (
                    <span key={kp} className="text-xs bg-gray-100 text-gray-500 px-1 py-0.5 rounded">{kp}</span>
                  ))}
                  {q.knowledgePoints.length > 3 && (
                    <span className="text-xs text-gray-400">+{q.knowledgePoints.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 创建 QuestionBank 路由页面**

在 `exam-maker/src/routes/QuestionBank.tsx`：

```tsx
import { useState, useMemo } from 'react'
import { useQuestionStore } from '../store/questionStore'
import type { QuestionType, Difficulty } from '../types'
import QuestionList from '../components/questions/QuestionList'
import QuestionForm from '../components/questions/QuestionForm'
import Modal from '../components/shared/Modal'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import EmptyState from '../components/shared/EmptyState'

export default function QuestionBank() {
  const {
    questions, getFilteredQuestions, deleteQuestion, deleteQuestions,
    exportQuestions, importQuestions, batchSetDifficulty,
  } = useQuestionStore()

  // 筛选状态
  const [filterType, setFilterType] = useState<QuestionType | ''>('')
  const [filterDifficulty, setFilterDifficulty] = useState<Difficulty | ''>('')
  const [filterKeyword, setFilterKeyword] = useState('')
  const [filterKnowledgePoint, setFilterKnowledgePoint] = useState('')

  // 选择状态
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // 弹窗状态
  const [formOpen, setFormOpen] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // 计算过滤后的题目
  const filteredQuestions = useMemo(
    () => getFilteredQuestions({
      type: filterType || undefined,
      difficulty: filterDifficulty || undefined,
      knowledgePoint: filterKnowledgePoint || undefined,
      keyword: filterKeyword || undefined,
    }),
    [questions, filterType, filterDifficulty, filterKeyword, filterKnowledgePoint, getFilteredQuestions],
  )

  const selectedQuestion = editingQuestion
    ? questions.find((q) => q.id === editingQuestion) ?? null
    : null

  // 所有知识点（从题库中提取）
  const allKnowledgePoints = useMemo(
    () => [...new Set(questions.flatMap((q) => q.knowledgePoints))].sort(),
    [questions],
  )

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const count = importQuestions(reader.result as string)
        alert(`成功导入 ${count} 道题目`)
      }
      reader.readAsText(file)
    }
    input.click()
  }

  const handleExport = () => {
    const blob = new Blob([exportQuestions()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `exam-maker-questions-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex gap-6">
      {/* 左侧：列表区 */}
      <div className="w-96 shrink-0 bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* 搜索与筛选 */}
        <div className="p-3 space-y-2 border-b border-gray-100">
          <input
            value={filterKeyword}
            onChange={(e) => setFilterKeyword(e.target.value)}
            placeholder="🔍 搜索题目..."
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
          />
          <div className="flex gap-2">
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as QuestionType | '')} className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white">
              <option value="">全部题型</option>
              <option value="choice">选择题</option>
              <option value="truefalse">判断题</option>
              <option value="fillblank">填空题</option>
              <option value="essay">问答题</option>
              <option value="match">匹配题</option>
              <option value="ordering">排序题</option>
            </select>
            <select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value as Difficulty | '')} className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white">
              <option value="">全部难度</option>
              <option value="easy">简单</option>
              <option value="medium">中等</option>
              <option value="hard">困难</option>
            </select>
          </div>
          {allKnowledgePoints.length > 0 && (
            <select value={filterKnowledgePoint} onChange={(e) => setFilterKnowledgePoint(e.target.value)} className="w-full text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white">
              <option value="">全部知识点</option>
              {allKnowledgePoints.map((kp) => (
                <option key={kp} value={kp}>{kp}</option>
              ))}
            </select>
          )}
        </div>

        {/* 工具栏 */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 bg-gray-50">
          <button onClick={() => { setEditingQuestion(null); setFormOpen(true) }} className="text-xs px-3 py-1 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 font-medium">
            + 新建
          </button>
          {selectedIds.length > 0 && (
            <>
              <button
                onClick={() => { deleteQuestions(selectedIds); setSelectedIds([]); setSelectedId(null) }}
                className="text-xs px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                删除选中 ({selectedIds.length})
              </button>
              <select
                onChange={(e) => {
                  if (e.target.value) batchSetDifficulty(selectedIds, e.target.value as Difficulty)
                  e.target.value = ''
                }}
                className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white"
              >
                <option value="">批量改难度</option>
                <option value="easy">简单</option>
                <option value="medium">中等</option>
                <option value="hard">困难</option>
              </select>
            </>
          )}
          <div className="flex-1" />
          <button onClick={handleImport} className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded">导入</button>
          <button onClick={handleExport} className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded">导出</button>
        </div>

        {/* 题目列表 */}
        {filteredQuestions.length === 0 ? (
          <EmptyState
            icon="📝"
            title={questions.length === 0 ? '还没有题目' : '没有匹配的题目'}
            description={questions.length === 0 ? '点击"新建"创建第一道题目' : '尝试调整筛选条件'}
            action={questions.length === 0 ? (
              <button onClick={() => { setEditingQuestion(null); setFormOpen(true) }} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm hover:bg-indigo-600">
                创建题目
              </button>
            ) : undefined}
          />
        ) : (
          <QuestionList
            questions={filteredQuestions}
            selectedId={selectedId}
            onSelect={(id) => { setSelectedId(id); setEditingQuestion(null) }}
            selectedIds={selectedIds}
            onToggleSelect={(id) => {
              setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
            }}
            onSelectAll={() => setSelectedIds(filteredQuestions.map((q) => q.id))}
            onClearSelection={() => setSelectedIds([])}
          />
        )}
      </div>

      {/* 右侧：编辑区 */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6">
        {selectedId && !formOpen ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">题目详情</h2>
              <div className="flex gap-2">
                <button onClick={() => { setEditingQuestion(selectedId); setFormOpen(true) }} className="px-4 py-1.5 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600">
                  编辑
                </button>
                <button onClick={() => setDeleteConfirm(selectedId)} className="px-4 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                  删除
                </button>
              </div>
            </div>
            <QuestionDetail question={questions.find((q) => q.id === selectedId)!} />
          </div>
        ) : (
          <EmptyState icon="👈" title="选择左侧题目查看详情" description="或点击"新建"创建题目" />
        )}
      </div>

      {/* 创建/编辑弹窗 */}
      <Modal open={formOpen} onClose={() => { setFormOpen(false); setEditingQuestion(null) }} title={editingQuestion ? '编辑题目' : '创建题目'} width="max-w-2xl">
        <QuestionForm
          question={selectedQuestion}
          onSaved={() => { setFormOpen(false); setEditingQuestion(null); setSelectedId(selectedQuestion?.id ?? null) }}
          onCancel={() => { setFormOpen(false); setEditingQuestion(null) }}
        />
      </Modal>

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => { if (deleteConfirm) deleteQuestion(deleteConfirm); setDeleteConfirm(null); setSelectedId(null) }}
        title="删除题目"
        message="确定要删除这道题目吗？此操作不可撤销。"
        confirmLabel="删除"
        danger
      />
    </div>
  )
}

// 题目详情展示
function QuestionDetail({ question }: { question: import('../types').Question }) {
  if (!question) return null
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-1 rounded ${
          { choice:'bg-blue-50 text-blue-700', truefalse:'bg-cyan-50 text-cyan-700', fillblank:'bg-amber-50 text-amber-700', essay:'bg-purple-50 text-purple-700', match:'bg-pink-50 text-pink-700', ordering:'bg-teal-50 text-teal-700' }[question.type]
        }`}>
          {{choice:'选择题',truefalse:'判断题',fillblank:'填空题',essay:'问答题',match:'匹配题',ordering:'排序题'}[question.type]}
        </span>
        <span className={`text-xs ${question.difficulty === 'easy' ? 'text-green-600' : question.difficulty === 'medium' ? 'text-yellow-600' : 'text-red-600'}`}>
          {{easy:'简单',medium:'中等',hard:'困难'}[question.difficulty]}
        </span>
      </div>
      <h3 className="text-lg font-semibold">{question.title}</h3>
      <p className="text-gray-700 whitespace-pre-wrap">{question.content}</p>

      {question.type === 'choice' && question.options && (
        <div className="space-y-2">
          {question.options.map((opt) => (
            <div key={opt.id} className={`px-4 py-2 rounded-lg border ${
              question.answer.type === 'choice' && question.answer.selectedOptionId === opt.id
                ? 'border-green-300 bg-green-50'
                : 'border-gray-200'
            }`}>
              <span className="font-medium text-gray-500 mr-2">{opt.label}.</span>
              {opt.content}
              {question.answer.type === 'choice' && question.answer.selectedOptionId === opt.id && (
                <span className="ml-2 text-green-600 text-sm">✓ 正确答案</span>
              )}
            </div>
          ))}
        </div>
      )}

      {question.knowledgePoints.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {question.knowledgePoints.map((kp) => (
            <span key={kp} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">{kp}</span>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 验证编译**

```bash
cd exam-maker && npx tsc --noEmit
```

- [ ] **Step 3: 提交**

```bash
git add exam-maker/src/components/questions/QuestionList.tsx exam-maker/src/routes/QuestionBank.tsx && git commit -m "feat: add QuestionBank route with list, filter, CRUD, import/export"
```

---

### Task 9: 组卷工具页面 (`/generator`)

**Files:**
- Create: `exam-maker/src/routes/ExamGenerator.tsx`
- Create: `exam-maker/src/components/exams/ManualSelector.tsx`
- Create: `exam-maker/src/components/exams/AutoGenerator.tsx`
- Create: `exam-maker/src/components/exams/SmartGenerator.tsx`

**Interfaces:**
- Consumes: `useQuestionStore`, `useExamStore`, 类型定义
- Produces: 组卷工具页面，三个 Tab 切换

- [ ] **Step 1: 创建 ManualSelector 组件**

在 `exam-maker/src/components/exams/ManualSelector.tsx`：

```tsx
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuestionStore } from '../../store/questionStore'
import { useExamStore } from '../../store/examStore'
import type { QuestionType, Difficulty } from '../../types'

export default function ManualSelector() {
  const navigate = useNavigate()
  const { questions, getFilteredQuestions } = useQuestionStore()
  const { createExam, addQuestionToExam } = useExamStore()

  const [title, setTitle] = useState('')
  const [filterType, setFilterType] = useState<QuestionType | ''>('')
  const [filterDifficulty, setFilterDifficulty] = useState<Difficulty | ''>('')
  const [filterKeyword, setFilterKeyword] = useState('')

  // 正在组装的试卷
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([])
  const [scores, setScores] = useState<Record<string, number>>({})

  const filtered = useMemo(
    () => getFilteredQuestions({ type: filterType || undefined, difficulty: filterDifficulty || undefined, keyword: filterKeyword || undefined }),
    [questions, filterType, filterDifficulty, filterKeyword, getFilteredQuestions],
  )

  const totalScore = selectedQuestionIds.reduce((sum, id) => sum + (scores[id] ?? 10), 0)
  const availableQuestions = filtered.filter((q) => !selectedQuestionIds.includes(q.id))

  const handleAdd = (id: string) => {
    setSelectedQuestionIds([...selectedQuestionIds, id])
    setScores({ ...scores, [id]: 10 })
  }

  const handleRemove = (id: string) => {
    setSelectedQuestionIds(selectedQuestionIds.filter((x) => x !== id))
    const next = { ...scores }
    delete next[id]
    setScores(next)
  }

  const handleMoveUp = (id: string) => {
    const idx = selectedQuestionIds.indexOf(id)
    if (idx <= 0) return
    const next = [...selectedQuestionIds]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setSelectedQuestionIds(next)
  }

  const handleMoveDown = (id: string) => {
    const idx = selectedQuestionIds.indexOf(id)
    if (idx < 0 || idx >= selectedQuestionIds.length - 1) return
    const next = [...selectedQuestionIds]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    setSelectedQuestionIds(next)
  }

  const handleSave = () => {
    if (!title.trim() || selectedQuestionIds.length === 0) return
    const exam = createExam(title)
    selectedQuestionIds.forEach((qid) => {
      addQuestionToExam(exam.id, qid, scores[qid] ?? 10)
    })
    navigate(`/exams/${exam.id}`)
  }

  const TYPE_LABELS: Record<string, string> = { choice: '选择', truefalse: '判断', fillblank: '填空', essay: '问答', match: '匹配', ordering: '排序' }

  return (
    <div className="flex gap-6">
      {/* 左：题库 */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold mb-3">可用题目</h3>
        <div className="flex gap-2 mb-3">
          <input value={filterKeyword} onChange={(e) => setFilterKeyword(e.target.value)} placeholder="搜索..." className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value as QuestionType | '')} className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white">
            <option value="">全部题型</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value as Difficulty | '')} className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white">
            <option value="">全部难度</option>
            <option value="easy">简单</option>
            <option value="medium">中等</option>
            <option value="hard">困难</option>
          </select>
        </div>
        <div className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto border rounded-lg">
          {availableQuestions.map((q) => (
            <div key={q.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{q.title}</p>
                <div className="flex gap-1">
                  <span className="text-xs text-gray-400">{TYPE_LABELS[q.type]}</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-400">{{easy:'简单',medium:'中等',hard:'困难'}[q.difficulty]}</span>
                </div>
              </div>
              <button onClick={() => handleAdd(q.id)} className="shrink-0 text-xs px-3 py-1 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600">
                + 添加
              </button>
            </div>
          ))}
          {availableQuestions.length === 0 && <p className="text-center text-gray-400 text-sm py-8">没有可用的题目</p>}
        </div>
      </div>

      {/* 右：试卷预览 */}
      <div className="w-96 bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold mb-3">试卷预览</h3>
        <div className="mb-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="试卷标题..." className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <div className="divide-y divide-gray-50 max-h-[50vh] overflow-y-auto border rounded-lg mb-4">
          {selectedQuestionIds.map((id, idx) => {
            const q = questions.find((x) => x.id === id)
            if (!q) return null
            return (
              <div key={id} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-400">{idx + 1}.</span>
                  <span className="text-sm flex-1 truncate">{q.title}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    value={scores[id] ?? 10}
                    onChange={(e) => setScores({ ...scores, [id]: Math.max(0, Number(e.target.value)) })}
                    className="w-16 text-xs px-2 py-0.5 border border-gray-200 rounded outline-none"
                    min={0}
                  />
                  <span className="text-xs text-gray-400">分</span>
                  <div className="flex-1" />
                  <button onClick={() => handleMoveUp(id)} className="text-xs text-gray-400 hover:text-gray-600" title="上移">↑</button>
                  <button onClick={() => handleMoveDown(id)} className="text-xs text-gray-400 hover:text-gray-600" title="下移">↓</button>
                  <button onClick={() => handleRemove(id)} className="text-xs text-red-400 hover:text-red-600">×</button>
                </div>
              </div>
            )
          })}
          {selectedQuestionIds.length === 0 && <p className="text-center text-gray-400 text-sm py-8">从左侧添加题目</p>}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">总分: {totalScore}</span>
          <button
            onClick={handleSave}
            disabled={!title.trim() || selectedQuestionIds.length === 0}
            className="px-4 py-1.5 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            保存试卷
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 创建 AutoGenerator 组件**

在 `exam-maker/src/components/exams/AutoGenerator.tsx`：

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExamStore } from '../../store/examStore'
import type { QuestionType, RuleSection } from '../../types'

const TYPES: { value: QuestionType; label: string }[] = [
  { value: 'choice', label: '选择题' },
  { value: 'truefalse', label: '判断题' },
  { value: 'fillblank', label: '填空题' },
  { value: 'essay', label: '问答题' },
  { value: 'match', label: '匹配题' },
  { value: 'ordering', label: '排序题' },
]

export default function AutoGenerator() {
  const navigate = useNavigate()
  const { generateExamFromRule } = useExamStore()
  const [name, setName] = useState('')
  const [sections, setSections] = useState<RuleSection[]>([
    { type: 'choice', count: 10, scorePerQuestion: 5 },
  ])

  const totalScore = sections.reduce((sum, s) => sum + s.count * s.scorePerQuestion, 0)

  const updateSection = (i: number, data: Partial<RuleSection>) => {
    const next = [...sections]
    next[i] = { ...next[i], ...data }
    setSections(next)
  }

  const removeSection = (i: number) => {
    if (sections.length <= 1) return
    setSections(sections.filter((_, j) => j !== i))
  }

  const handleGenerate = () => {
    if (!name.trim() || sections.length === 0) return
    const exam = generateExamFromRule({ name, sections, totalScore })
    navigate(`/exams/${exam.id}`)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">规则名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：期末模拟卷" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" />
      </div>

      <h3 className="font-semibold mb-3">规则配置</h3>
      <div className="space-y-3 mb-6">
        {sections.map((sec, i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <select value={sec.type} onChange={(e) => updateSection(i, { type: e.target.value as QuestionType })} className="text-sm px-2 py-1.5 border border-gray-200 rounded-lg bg-white">
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input type="number" value={sec.count} onChange={(e) => updateSection(i, { count: Math.max(1, Number(e.target.value)) })} className="w-20 text-sm px-2 py-1.5 border border-gray-200 rounded-lg outline-none" min={1} placeholder="数量" />
            <span className="text-xs text-gray-500">道 ×</span>
            <input type="number" value={sec.scorePerQuestion} onChange={(e) => updateSection(i, { scorePerQuestion: Math.max(1, Number(e.target.value)) })} className="w-20 text-sm px-2 py-1.5 border border-gray-200 rounded-lg outline-none" min={1} placeholder="分值" />
            <span className="text-xs text-gray-500">分/题</span>
            <span className="text-sm text-gray-500">= {sec.count * sec.scorePerQuestion}分</span>
            {sections.length > 1 && (
              <button onClick={() => removeSection(i)} className="text-red-400 hover:text-red-600 text-sm">删除</button>
            )}
          </div>
        ))}
      </div>

      <button onClick={() => setSections([...sections, { type: 'choice', count: 5, scorePerQuestion: 5 }])} className="text-sm text-indigo-600 hover:text-indigo-800 mb-6 inline-block">
        + 添加规则
      </button>

      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <span className="text-lg font-semibold">总分: {totalScore}</span>
        <button onClick={handleGenerate} disabled={!name.trim()} className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed">
          自动生成试卷
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 创建 SmartGenerator 组件**

在 `exam-maker/src/components/exams/SmartGenerator.tsx`：

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExamStore } from '../../store/examStore'
import type { QuestionType, Difficulty, RuleSection } from '../../types'

const TYPES: { value: QuestionType; label: string }[] = [
  { value: 'choice', label: '选择题' },
  { value: 'truefalse', label: '判断题' },
  { value: 'fillblank', label: '填空题' },
  { value: 'essay', label: '问答题' },
  { value: 'match', label: '匹配题' },
  { value: 'ordering', label: '排序题' },
]

const DIFFICULTIES: { value: Difficulty | ''; label: string }[] = [
  { value: '', label: '不限' },
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
]

export default function SmartGenerator() {
  const navigate = useNavigate()
  const { generateExamFromRule } = useExamStore()
  const [name, setName] = useState('')
  const [sections, setSections] = useState<RuleSection[]>([
    { type: 'choice', count: 10, scorePerQuestion: 5, difficulty: 'medium' },
  ])

  const totalScore = sections.reduce((sum, s) => sum + s.count * s.scorePerQuestion, 0)

  const updateSection = (i: number, data: Partial<RuleSection>) => {
    const next = [...sections]
    next[i] = { ...next[i], ...data }
    setSections(next)
  }

  const removeSection = (i: number) => {
    if (sections.length <= 1) return
    setSections(sections.filter((_, j) => j !== i))
  }

  const handleGenerate = () => {
    if (!name.trim()) return
    const cleanSections = sections.map((s) => {
      const sec = { ...s }
      if (!sec.difficulty) delete sec.difficulty
      if (!sec.knowledgePoints?.length) delete sec.knowledgePoints
      return sec
    })
    const exam = generateExamFromRule({ name, sections: cleanSections, totalScore })
    navigate(`/exams/${exam.id}`)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">规则名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：高难度期末卷" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" />
      </div>

      <h3 className="font-semibold mb-3">智能规则配置</h3>
      <div className="space-y-3 mb-6">
        {sections.map((sec, i) => (
          <div key={i} className="p-3 bg-gray-50 rounded-lg space-y-2">
            <div className="flex items-center gap-3">
              <select value={sec.type} onChange={(e) => updateSection(i, { type: e.target.value as QuestionType })} className="text-sm px-2 py-1.5 border border-gray-200 rounded-lg bg-white">
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input type="number" value={sec.count} onChange={(e) => updateSection(i, { count: Math.max(1, Number(e.target.value)) })} className="w-20 text-sm px-2 py-1.5 border border-gray-200 rounded-lg outline-none" min={1} placeholder="数量" />
              <span className="text-xs text-gray-500">道 ×</span>
              <input type="number" value={sec.scorePerQuestion} onChange={(e) => updateSection(i, { scorePerQuestion: Math.max(1, Number(e.target.value)) })} className="w-20 text-sm px-2 py-1.5 border border-gray-200 rounded-lg outline-none" min={1} placeholder="分值" />
              <span className="text-xs text-gray-500">分/题</span>
              <div className="flex-1" />
              <span className="text-sm text-gray-500">= {sec.count * sec.scorePerQuestion}分</span>
              {sections.length > 1 && (
                <button onClick={() => removeSection(i)} className="text-red-400 hover:text-red-600 text-sm">删除</button>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-500">难度:</span>
              <select value={sec.difficulty ?? ''} onChange={(e) => updateSection(i, { difficulty: (e.target.value || undefined) as Difficulty | undefined })} className="px-2 py-1 border border-gray-200 rounded-lg bg-white text-xs">
                {DIFFICULTIES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              <span className="text-gray-500">知识点:</span>
              <input
                value={sec.knowledgePoints?.join(', ') ?? ''}
                onChange={(e) => updateSection(i, { knowledgePoints: e.target.value ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean) : undefined })}
                placeholder="逗号分隔，如：函数,几何"
                className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-200"
              />
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => setSections([...sections, { type: 'choice', count: 5, scorePerQuestion: 5 }])} className="text-sm text-indigo-600 hover:text-indigo-800 mb-6 inline-block">
        + 添加规则
      </button>

      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <span className="text-lg font-semibold">总分: {totalScore}</span>
        <button onClick={handleGenerate} disabled={!name.trim()} className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed">
          智能生成试卷
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 创建 ExamGenerator 路由页面**

在 `exam-maker/src/routes/ExamGenerator.tsx`：

```tsx
import { useState } from 'react'
import ManualSelector from '../components/exams/ManualSelector'
import AutoGenerator from '../components/exams/AutoGenerator'
import SmartGenerator from '../components/exams/SmartGenerator'

type Tab = 'manual' | 'auto' | 'smart'

const TABS: { key: Tab; label: string; desc: string }[] = [
  { key: 'manual', label: '手动组卷', desc: '从题库中手动挑选题目，自由排序' },
  { key: 'auto', label: '自动组卷', desc: '设置题型数量和分值，系统随机抽取' },
  { key: 'smart', label: '智能组卷', desc: '按难度和知识点精确筛选后抽取' },
]

export default function ExamGenerator() {
  const [tab, setTab] = useState<Tab>('manual')

  return (
    <div>
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 inline-flex">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-gray-500 -mt-4 mb-6">{TABS.find((t) => t.key === tab)!.desc}</p>

      {tab === 'manual' && <ManualSelector />}
      {tab === 'auto' && <AutoGenerator />}
      {tab === 'smart' && <SmartGenerator />}
    </div>
  )
}
```

- [ ] **Step 5: 验证编译**

```bash
cd exam-maker && npx tsc --noEmit
```

- [ ] **Step 6: 提交**

```bash
git add exam-maker/src/routes/ExamGenerator.tsx exam-maker/src/components/exams/ && git commit -m "feat: add ExamGenerator route with manual/auto/smart modes"
```

---

### Task 10: 试卷管理和查看页面 (`/exams`, `/exams/:id`)

**Files:**
- Create: `exam-maker/src/routes/ExamList.tsx`
- Create: `exam-maker/src/routes/ExamViewer.tsx`

**Interfaces:**
- Consumes: `useExamStore`, `useQuestionStore`
- Produces: 试卷列表页面 + 试卷查看/编辑页面

- [ ] **Step 1: 创建 ExamList 路由**

在 `exam-maker/src/routes/ExamList.tsx`：

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExamStore } from '../store/examStore'
import EmptyState from '../components/shared/EmptyState'
import ConfirmDialog from '../components/shared/ConfirmDialog'

export default function ExamList() {
  const navigate = useNavigate()
  const { exams, deleteExam, duplicateExam } = useExamStore()
  const [deleteId, setDeleteId] = useState<string | null>(null)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">试卷管理</h1>
        <button onClick={() => navigate('/generator')} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm hover:bg-indigo-600 font-medium">
          + 新建试卷
        </button>
      </div>

      {exams.length === 0 ? (
        <EmptyState
          icon="📄"
          title="还没有试卷"
          description="前往组卷工具创建第一份试卷"
          action={
            <button onClick={() => navigate('/generator')} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm hover:bg-indigo-600">
              去组卷
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {exams.map((exam) => (
            <div
              key={exam.id}
              className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/exams/${exam.id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-800">{exam.title}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  exam.status === 'published'
                    ? 'bg-green-50 text-green-600'
                    : 'bg-yellow-50 text-yellow-600'
                }`}>
                  {exam.status === 'published' ? '已发布' : '草稿'}
                </span>
              </div>
              <div className="text-sm text-gray-500 space-y-1">
                <p>{exam.questions.length} 道题 · 总分 {exam.totalScore}</p>
                <p>更新于 {new Date(exam.updatedAt).toLocaleDateString('zh-CN')}</p>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={(e) => { e.stopPropagation(); duplicateExam(exam.id) }}
                  className="text-xs px-3 py-1 text-gray-500 hover:bg-gray-100 rounded-lg"
                >
                  复制
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteId(exam.id) }}
                  className="text-xs px-3 py-1 text-red-500 hover:bg-red-50 rounded-lg"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) deleteExam(deleteId); setDeleteId(null) }}
        title="删除试卷"
        message="确定要删除这份试卷吗？此操作不可撤销。"
        confirmLabel="删除"
        danger
      />
    </div>
  )
}
```

- [ ] **Step 2: 创建 ExamViewer 路由**

在 `exam-maker/src/routes/ExamViewer.tsx`：

```tsx
import { useParams, useNavigate } from 'react-router-dom'
import { useExamStore } from '../store/examStore'
import { useQuestionStore } from '../store/questionStore'
import { useState } from 'react'
import Modal from '../components/shared/Modal'
import QuestionForm from '../components/questions/QuestionForm'
import type { ExamQuestion } from '../types'

export default function ExamViewer() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { exams, updateExam, removeQuestionFromExam, setQuestionScore, reorderExamQuestions } = useExamStore()
  const { questions } = useQuestionStore()

  const exam = exams.find((e) => e.id === id)

  const [editTitle, setEditTitle] = useState(false)
  const [title, setTitle] = useState(exam?.title ?? '')
  const [editingQId, setEditingQId] = useState<string | null>(null)

  if (!exam) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-lg">试卷不存在</p>
        <button onClick={() => navigate('/exams')} className="mt-4 text-indigo-500 hover:text-indigo-700 text-sm">返回试卷列表</button>
      </div>
    )
  }

  const questionMap = new Map(questions.map((q) => [q.id, q]))

  const handleTitleSave = () => {
    if (title.trim()) {
      updateExam(exam.id, { title: title.trim() })
    }
    setEditTitle(false)
  }

  const handleMoveUp = (qid: string) => {
    const ids = [...exam.questions].sort((a, b) => a.order - b.order).map((q) => q.questionId)
    const idx = ids.indexOf(qid)
    if (idx <= 0) return
    ;[ids[idx - 1], ids[idx]] = [ids[idx], ids[idx]]
    reorderExamQuestions(exam.id, ids)
  }

  const handleMoveDown = (qid: string) => {
    const ids = [...exam.questions].sort((a, b) => a.order - b.order).map((q) => q.questionId)
    const idx = ids.indexOf(qid)
    if (idx < 0 || idx >= ids.length - 1) return
    ;[ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]]
    reorderExamQuestions(exam.id, ids)
  }

  const handlePrint = () => {
    window.print()
  }

  const sortedQuestions = [...exam.questions].sort((a, b) => a.order - b.order)

  const DIFF_LABELS: Record<string, string> = { easy: '简单', medium: '中等', hard: '困难' }
  const DIFF_COLORS: Record<string, string> = { easy: 'text-green-600', medium: 'text-yellow-600', hard: 'text-red-600' }
  const TYPE_LABELS: Record<string, string> = { choice: '选择题', truefalse: '判断题', fillblank: '填空题', essay: '问答题', match: '匹配题', ordering: '排序题' }

  return (
    <div className="max-w-3xl mx-auto">
      {/* 标题区 */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/exams')} className="text-gray-400 hover:text-gray-600 text-sm">&larr; 返回</button>
        {editTitle ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 px-3 py-1.5 text-lg font-bold border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') { setEditTitle(false); setTitle(exam.title) } }}
            />
            <button onClick={handleTitleSave} className="px-3 py-1.5 text-sm bg-indigo-500 text-white rounded-lg">保存</button>
          </div>
        ) : (
          <h1 className="text-2xl font-bold flex-1" onDoubleClick={() => { setEditTitle(true); setTitle(exam.title) }}>{exam.title}</h1>
        )}
        <div className="flex gap-2">
          {exam.status === 'draft' ? (
            <button onClick={() => updateExam(exam.id, { status: 'published' })} className="px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600">
              发布
            </button>
          ) : (
            <button onClick={() => updateExam(exam.id, { status: 'draft' })} className="px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
              取消发布
            </button>
          )}
          <button onClick={handlePrint} className="px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
            打印
          </button>
        </div>
      </div>

      {/* 试卷信息 */}
      <div className="flex items-center gap-4 text-sm text-gray-500 mb-6">
        <span>{sortedQuestions.length} 道题</span>
        <span>总分: {exam.totalScore} 分</span>
        <span>创建于 {new Date(exam.createdAt).toLocaleDateString('zh-CN')}</span>
      </div>

      {/* 题目列表 */}
      <div className="space-y-4">
        {sortedQuestions.map((eq: ExamQuestion, i: number) => {
          const q = questionMap.get(eq.questionId)
          if (!q) return null
          return (
            <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-indigo-600">{i + 1}.</span>
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">{TYPE_LABELS[q.type]}</span>
                  <span className={`text-xs ${DIFF_COLORS[q.difficulty]}`}>{DIFF_LABELS[q.difficulty]}</span>
                  <span className="text-xs text-gray-400">({eq.score}分)</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleMoveUp(q.id)} className="text-xs text-gray-400 hover:text-gray-600 px-1" title="上移">↑</button>
                  <button onClick={() => handleMoveDown(q.id)} className="text-xs text-gray-400 hover:text-gray-600 px-1" title="下移">↓</button>
                  <button onClick={() => setEditingQId(q.id)} className="text-xs text-indigo-400 hover:text-indigo-600 px-1" title="编辑题目">✎</button>
                  <button onClick={() => removeQuestionFromExam(exam.id, q.id)} className="text-xs text-red-400 hover:text-red-600 px-1" title="从试卷移除">×</button>
                </div>
              </div>

              <h3 className="font-semibold text-gray-800 mb-1">{q.title}</h3>
              <p className="text-gray-600 text-sm whitespace-pre-wrap">{q.content}</p>

              {/* 选择题选项 */}
              {q.type === 'choice' && q.options && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {q.options.map((opt) => (
                    <div key={opt.id} className={`text-sm px-3 py-1.5 rounded-lg border ${
                      q.answer.type === 'choice' && q.answer.selectedOptionId === opt.id
                        ? 'border-green-300 bg-green-50'
                        : 'border-gray-100 bg-gray-50'
                    }`}>
                      <span className="font-medium text-gray-500">{opt.label}.</span> {opt.content}
                    </div>
                  ))}
                </div>
              )}

              {/* 分值修改 */}
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-gray-400">分值:</span>
                <input
                  type="number"
                  value={eq.score}
                  onChange={(e) => setQuestionScore(exam.id, q.id, Math.max(0, Number(e.target.value)))}
                  className="w-16 text-xs px-2 py-0.5 border border-gray-200 rounded outline-none"
                  min={0}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* 编辑题目弹窗 */}
      <Modal open={editingQId !== null} onClose={() => setEditingQId(null)} title="编辑题目" width="max-w-2xl">
        {editingQId && (
          <QuestionForm
            question={questionMap.get(editingQId) ?? null}
            onSaved={() => setEditingQId(null)}
            onCancel={() => setEditingQId(null)}
          />
        )}
      </Modal>
    </div>
  )
}
```

- [ ] **Step 3: 验证编译**

```bash
cd exam-maker && npx tsc --noEmit
```

- [ ] **Step 4: 提交**

```bash
git add exam-maker/src/routes/ExamList.tsx exam-maker/src/routes/ExamViewer.tsx && git commit -m "feat: add ExamList and ExamViewer routes"
```

---

### Task 11: 历史记录页面 + 路由配置

**Files:**
- Create: `exam-maker/src/routes/History.tsx`
- Modify: `exam-maker/src/main.tsx` — 替换为带路由的入口
- Create: `exam-maker/src/App.tsx`

**Interfaces:**
- Consumes: `useExamStore`
- Produces: 历史记录页面 + 完整路由配置

- [ ] **Step 1: 创建 History 路由**

在 `exam-maker/src/routes/History.tsx`：

```tsx
import { useExamStore } from '../store/examStore'
import EmptyState from '../components/shared/EmptyState'

export default function History() {
  const { history, clearHistory } = useExamStore()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">组卷历史</h1>
        {history.length > 0 && (
          <button onClick={clearHistory} className="px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
            清除历史
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <EmptyState icon="📋" title="暂无组卷记录" description="当你使用自动或智能组卷功能时，记录会出现在这里" />
      ) : (
        <div className="space-y-3">
          {[...history].reverse().map((entry) => (
            <div key={entry.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">{entry.examTitle}</h3>
                <span className="text-xs text-gray-400">
                  {new Date(entry.createdAt).toLocaleString('zh-CN')}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {entry.rule.sections.map((sec, i) => (
                  <span key={i} className="text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded border border-gray-100">
                    {sec.type} × {sec.count}道 ({sec.scorePerQuestion}分/题)
                    {sec.difficulty ? ` · ${sec.difficulty}` : ''}
                  </span>
                ))}
              </div>
              <p className="text-sm text-gray-500 mt-2">总分: {entry.rule.totalScore}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 创建 App.tsx 路由配置**

在 `exam-maker/src/App.tsx`：

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import QuestionBank from './routes/QuestionBank'
import ExamGenerator from './routes/ExamGenerator'
import ExamList from './routes/ExamList'
import ExamViewer from './routes/ExamViewer'
import History from './routes/History'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/questions" replace />} />
          <Route path="/questions" element={<QuestionBank />} />
          <Route path="/generator" element={<ExamGenerator />} />
          <Route path="/exams" element={<ExamList />} />
          <Route path="/exams/:id" element={<ExamViewer />} />
          <Route path="/history" element={<History />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 3: 更新 main.tsx**

在 `exam-maker/src/main.tsx`，替换为：

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 4: 验证编译**

```bash
cd exam-maker && npx tsc --noEmit
```

- [ ] **Step 5: 测试 dev 启动**

```bash
cd exam-maker && npm run dev
```

确认所有页面可访问、路由跳转正常。

- [ ] **Step 6: 提交**

```bash
git add exam-maker/src/App.tsx exam-maker/src/main.tsx exam-maker/src/routes/History.tsx && git commit -m "feat: add History route and wire up all routes in App.tsx"
```

---

### Task 12: 集成测试和最终验证

**Files:**
- 无新增文件

**Interfaces:**
- 全部功能集成验证

- [ ] **Step 1: TypeScript 编译检查**

```bash
cd exam-maker && npx tsc --noEmit
```

期望：零错误。

- [ ] **Step 2: 生产构建**

```bash
cd exam-maker && npm run build
```

期望：构建成功，dist/ 目录生成。

- [ ] **Step 3: 手动测试清单**

启动 `npm run dev`，逐项验证：

1. **题库** — 创建六种题型的题目各一题，筛选搜索正常，编辑和删除正常
2. **题库** — 批量选择和批量删除、批量改难度
3. **题库** — JSON 导出再导入，题目不重复
4. **手动组卷** — 从题库选几道题，调整排序和分值，保存后跳转试卷页
5. **自动组卷** — 设置规则生成试卷，确认题目数量和分值正确
6. **智能组卷** — 设置难度+知识点规则生成试卷
7. **试卷管理** — 查看列表、复制试卷、删除试卷
8. **试卷查看** — 查看题目详情、调整题目排序、修改分值、发布/取消发布
9. **历史记录** — 确认自动/智能组卷的记录已保存，清除历史正常
10. **导航** — 所有页面间路由跳转正常

- [ ] **Step 4: 提交（如有修改）**

```bash
git add -A && git commit -m "chore: final integration verification"
```
