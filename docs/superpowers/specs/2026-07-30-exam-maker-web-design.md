# exam-maker 网页应用 — 设计文档

**日期：** 2026-07-30  
**状态：** 待实现

## 1. 概述

为 exam-maker 构建一个纯前端 SPA 网页，用户可以在浏览器中创建、编辑和管理考试题目，并支持手动组卷、自动随机组卷和智能组卷。

## 2. 技术方案

- **框架：** React 18 + TypeScript + Vite
- **路由：** React Router v6
- **状态管理：** Zustand + persist 中间件（localStorage 持久化）
- **样式：** Tailwind CSS，响应式设计
- **存储：** localStorage（初期），后续可升级到 IndexedDB

## 3. 项目结构

```
exam-maker/
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes/
│   │   ├── QuestionBank.tsx    # 题库管理
│   │   ├── ExamList.tsx        # 试卷列表
│   │   ├── ExamGenerator.tsx   # 组卷工具
│   │   ├── ExamViewer.tsx      # 试卷查看/导出
│   │   └── History.tsx         # 历史记录
│   ├── store/
│   │   ├── questionStore.ts
│   │   ├── examStore.ts
│   │   └── uiStore.ts
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   ├── id.ts
│   │   ├── storage.ts
│   │   └── examGenerator.ts
│   └── components/
│       ├── layout/
│       ├── questions/
│       ├── exams/
│       └── shared/
```

### 路由表

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | 重定向 | → `/questions` |
| `/questions` | QuestionBank | 题库管理（创建、编辑、浏览、搜索、筛选） |
| `/exams` | ExamList | 试卷列表 |
| `/exams/:id` | ExamViewer | 试卷查看、编辑、导出（打印/PDF） |
| `/generator` | ExamGenerator | 组卷工具（手动 + 自动 + 智能三种 Tab） |
| `/history` | History | 操作历史记录 |

## 4. 数据模型

### 4.1 题目 (Question)

```typescript
type Difficulty = 'easy' | 'medium' | 'hard'

interface Question {
  id: string
  type: 'choice' | 'truefalse' | 'fillblank' | 'essay' | 'match' | 'ordering'
  title: string
  content: string                    // 题干
  options?: ChoiceOption[]           // 选择题专用
  matchPairs?: MatchPair[]           // 匹配题专用
  orderingItems?: string[]           // 排序题专用
  answer: Answer                     // 答案（按题型变化）
  difficulty: Difficulty
  knowledgePoints: string[]          // 扁平标签，如 ['数学','函数','二次函数']
  explanation?: string               // 解析
  createdAt: number
  updatedAt: number
}
```

### 4.2 试卷 (Exam)

```typescript
interface Exam {
  id: string
  title: string
  questions: ExamQuestion[]          // 有序题目列表
  totalScore: number
  status: 'draft' | 'published'
  createdAt: number
  updatedAt: number
}

interface ExamQuestion {
  questionId: string
  score: number
  order: number
}
```

### 4.3 组卷规则 (GenerationRule)

```typescript
interface GenerationRule {
  name: string                       // 规则名，如"期末模拟卷"
  sections: RuleSection[]
  totalScore: number
}

interface RuleSection {
  type: QuestionType
  count: number
  scorePerQuestion: number
  difficulty?: Difficulty            // 可选，不指定则不限
  knowledgePoints?: string[]         // 可选，不指定则不限
}
```

## 5. 页面功能

### 5.1 题库管理 (`/questions`)

- 左侧列表区：题目列表，支持按题型、难度、知识点筛选，关键词搜索
- 右侧编辑区：创建/编辑题目表单，按题型动态切换表单字段
- 批量操作：多选后批量删除、批量修改难度/知识点
- 导入导出：JSON 格式批量导入导出题库

### 5.2 组卷工具 (`/generator`)

三种模式用顶部 Tab 切换：

| 模式 | 流程 |
|------|------|
| 手动组卷 | 左侧题库（可筛选拖拽）→ 右侧试卷区，排序、设分值、总分实时显示 |
| 自动组卷 | 填写规则（题型 × 数量 × 分值）→ 点击生成 → 随机抽题 → 可手动微调 |
| 智能组卷 | 在自动基础上加难度配比和知识点范围 → 先筛选再随机抽取 |

### 5.3 试卷管理 (`/exams`)

- 列表展示所有试卷（草稿/已发布），支持删除、复制
- 点击进入 `/exams/:id` 查看详情、编辑题目和分值、导出打印/PDF

### 5.4 历史记录 (`/history`)

- 记录组卷操作历史（何时生成了哪份试卷、用了什么规则）
- 支持清除历史

## 6. 答案类型 (Answer) 按题型

| 题型 | Answer 类型 | 示例 |
|------|------------|------|
| choice | `{ selectedOptionId: string }` | 单选 |
| truefalse | `{ value: boolean }` | 对/错 |
| fillblank | `{ blanks: string[] }` | 多个填空位置 |
| essay | `{ referenceAnswer: string }` | 参考答案文本 |
| match | `{ pairs: Array<{ left: string; right: string }> }` | 配对连线 |
| ordering | `{ orderedItems: string[] }` | 排序后的列表 |

## 7. 状态管理

三个 Zustand store，均使用 `persist` 中间件自动写入 localStorage：

- **questionStore**：questions 数组 + CRUD 操作 + 筛选搜索方法
- **examStore**：exams 数组 + 创建/删除/更新试卷 + 组卷逻辑
- **uiStore**：侧栏折叠状态、当前选中题目 ID 等 UI 状态

## 8. 非功能需求

- **响应式**：桌面端为主，平板和手机可用（列表/表单自适应）
- **数据安全**：localStorage 数据危险，提供 JSON 导出备份功能
- **性能**：题库 <1000 题时搜索筛选在内存中完成，无需索引
- **无后端依赖**：所有数据存在浏览器中，纯静态文件部署
