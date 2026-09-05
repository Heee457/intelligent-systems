# 登录认证 & 教师/学生双端 设计规范

## 1. 概述

为 exam-maker 添加完整的身份认证系统和角色划分，将现有的单用户本地存储应用升级为多用户 B/S 架构教学平台。

### 1.1 设计目标

- JWT 认证 + 角色路由守卫
- SQLite 持久化所有数据（替代 localStorage）
- 教师端：题库管理、组卷、试卷发布、班级管理、成绩分析、A/B 卷、补考
- 学生端：考试大厅、在线答题（计时/防作弊/自动批改）、成绩查看
- Excel 导出、试卷分析（正确率/区分度）

### 1.2 分阶段实施

| 阶段 | 内容 | 依赖 |
|------|------|------|
| 阶段 1 | 认证系统：注册/登录/JWT/路由守卫 | 无 |
| 阶段 2 | 教师端基础：数据迁移到后端、班级管理、试卷发布 | 阶段 1 |
| 阶段 3 | 学生端：考试大厅、在线答题、自动批改 | 阶段 2 |
| 阶段 4 | 高级功能：AB卷、补考、Excel 导出、试卷分析 | 阶段 3 |

---

## 2. 整体架构

```
┌──────────────────────────────────────────────────────────┐
│                    前端 (React SPA)                       │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ AuthLayout│  │TeacherLayout │  │StudentLayout │       │
│  │ /login    │  │ /, /questions│  │ /student/*   │       │
│  │ /register │  │ /generator,  │  │              │       │
│  │           │  │ /exams,      │  │              │       │
│  │           │  │ /classes,    │  │              │       │
│  │           │  │ /grading,    │  │              │       │
│  │           │  │ /students    │  │              │       │
│  └──────────┘  └──────────────┘  └──────────────┘       │
│       │              │                    │               │
│       └──────────────┼────────────────────┘               │
│                      │ JWT Bearer token                   │
└──────────────────────┼──────────────────────────────────┘
                       │
┌──────────────────────┼──────────────────────────────────┐
│              后端 (Fastify + better-sqlite3)              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ auth     │  │ teacher  │  │ student  │               │
│  │ 路由组   │  │ 路由组    │  │ 路由组    │               │
│  └──────────┘  └──────────┘  └──────────┘               │
│       │              │              │                     │
│       └──────────────┼──────────────┘                     │
│                      │                                    │
│  ┌───────────────────┴───────────────────┐               │
│  │  middleware/auth.ts                   │               │
│  │  - requireAuth (JWT 验证)              │               │
│  │  - requireRole (角色检查)              │               │
│  └───────────────────┬───────────────────┘               │
│                      │                                    │
│  ┌───────────────────┴───────────────────┐               │
│  │  db/index.ts                          │               │
│  │  - better-sqlite3 初始化               │               │
│  │  - 建表迁移                            │               │
│  └───────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────┘
```

### 2.1 技术选型

| 层面 | 选择 | 理由 |
|------|------|------|
| 前端路由 | 三种 Layout 拆分 Auth/Teacher/Student | 职责清晰，导航栏互不干扰 |
| 前端状态 | `authStore`（JWT + user）+ 题库/试卷从 API 获取 | localStorage 无法多用户共享 |
| 数据库 | `better-sqlite3` 同步驱动 | 零配置，与现有代码风格一致 |
| 密码 | bcrypt hash | 行业标准 |
| JWT | `jsonwebtoken` + 24h 过期 | 标准方案 |
| Excel | `exceljs` | 纯 JS，支持样式 |
| 文件上传 | `@fastify/multipart`（已有） | 复用现有依赖 |

---

## 3. 数据库 Schema

### 3.1 所有表 DDL

```sql
-- 用户
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'student',  -- 'teacher' | 'student'
  avatar_url  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- 班级
CREATE TABLE classes (
  id          TEXT PRIMARY KEY,
  teacher_id  TEXT NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL,
  description TEXT,
  join_code   TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL
);

-- 班级-学生关联
CREATE TABLE class_students (
  class_id    TEXT NOT NULL REFERENCES classes(id),
  student_id  TEXT NOT NULL REFERENCES users(id),
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (class_id, student_id)
);

-- 题目（从 localStorage 迁移）
CREATE TABLE questions (
  id            TEXT PRIMARY KEY,
  teacher_id    TEXT NOT NULL REFERENCES users(id),
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  options       TEXT,   -- JSON
  answer        TEXT NOT NULL,  -- JSON
  difficulty    TEXT NOT NULL DEFAULT 'medium',
  knowledge_points TEXT,  -- JSON array
  explanation   TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- 试卷
CREATE TABLE exams (
  id          TEXT PRIMARY KEY,
  teacher_id  TEXT NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  questions   TEXT NOT NULL,  -- JSON: ExamQuestion[]
  total_score REAL NOT NULL,
  status      TEXT DEFAULT 'draft',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- 试卷发布
CREATE TABLE exam_publish (
  id          TEXT PRIMARY KEY,
  exam_id     TEXT NOT NULL,
  teacher_id  TEXT NOT NULL REFERENCES users(id),
  class_id    TEXT REFERENCES classes(id),
  title       TEXT NOT NULL,
  duration    INTEGER NOT NULL,
  start_time  INTEGER,
  end_time    INTEGER,
  shuffle     INTEGER DEFAULT 0,
  retry       INTEGER DEFAULT 0,
  variant     TEXT DEFAULT NULL,   -- 'A' | 'B' | NULL
  status      TEXT DEFAULT 'draft',
  created_at  INTEGER NOT NULL
);

-- 答题记录
CREATE TABLE submissions (
  id            TEXT PRIMARY KEY,
  publish_id    TEXT NOT NULL REFERENCES exam_publish(id),
  student_id    TEXT NOT NULL REFERENCES users(id),
  status        TEXT DEFAULT 'started',
  answers       TEXT,      -- JSON
  total_score   REAL,
  total_points  REAL,
  violations    INTEGER DEFAULT 0,
  started_at    INTEGER NOT NULL,
  submitted_at  INTEGER,
  graded_at     INTEGER,
  grader_id     TEXT REFERENCES users(id),
  grade_notes   TEXT
);

-- 逐题作答
CREATE TABLE submission_answers (
  id              TEXT PRIMARY KEY,
  submission_id   TEXT NOT NULL REFERENCES submissions(id),
  question_id     TEXT NOT NULL,
  question_order  INTEGER NOT NULL,
  answer          TEXT,    -- JSON
  score           REAL,
  max_score       REAL,
  is_correct      INTEGER,
  graded_by       TEXT DEFAULT 'auto'
);

-- 成绩统计缓存
CREATE TABLE exam_stats (
  publish_id     TEXT PRIMARY KEY REFERENCES exam_publish(id),
  student_count  INTEGER NOT NULL,
  avg_score      REAL,
  median_score   REAL,
  max_score      REAL,
  min_score      REAL,
  pass_count     INTEGER,
  pass_rate      REAL,
  score_dist     TEXT,    -- JSON
  computed_at    INTEGER NOT NULL
);

-- 逐题统计
CREATE TABLE question_stats (
  publish_id      TEXT NOT NULL REFERENCES exam_publish(id),
  question_id     TEXT NOT NULL,
  correct_count   INTEGER DEFAULT 0,
  wrong_count     INTEGER DEFAULT 0,
  blank_count     INTEGER DEFAULT 0,
  correct_rate    REAL,
  discrimination  REAL,
  PRIMARY KEY (publish_id, question_id)
);

-- AB卷分配
CREATE TABLE exam_variant_assign (
  publish_id  TEXT NOT NULL REFERENCES exam_publish(id),
  student_id  TEXT NOT NULL REFERENCES users(id),
  variant     TEXT NOT NULL,
  PRIMARY KEY (publish_id, student_id)
);

-- 补考
CREATE TABLE makeup_exams (
  id           TEXT PRIMARY KEY,
  original_publish_id TEXT NOT NULL REFERENCES exam_publish(id),
  student_id   TEXT NOT NULL REFERENCES users(id),
  publish_id   TEXT REFERENCES exam_publish(id),
  reason       TEXT,
  status       TEXT DEFAULT 'pending',
  created_at   INTEGER NOT NULL
);
```

---

## 4. API 设计

### 4.1 认证 API

| 端点 | 方法 | 鉴权 | 请求体 | 响应 |
|------|------|------|--------|------|
| `/api/auth/register` | POST | 无 | `{email, password, name, role}` | `{token, user}` |
| `/api/auth/login` | POST | 无 | `{email, password}` | `{token, user}` |
| `/api/auth/me` | GET | JWT | - | `{user}` |
| `/api/auth/refresh` | POST | JWT | - | `{token}` |

JWT payload: `{ userId, role, iat, exp }`, 24h 过期。
密码: bcrypt 10 rounds。

### 4.2 教师端 — 题库 API

| 端点 | 方法 | 鉴权 | 说明 |
|------|------|------|------|
| `/api/questions` | GET | teacher | 获取题库（支持 ?type=&difficulty=&kp=&keyword=） |
| `/api/questions` | POST | teacher | 创建题目 |
| `/api/questions/:id` | PUT | teacher | 编辑题目 |
| `/api/questions/:id` | DELETE | teacher | 删除题目 |
| `/api/questions/import` | POST | teacher | 批量导入 JSON |
| `/api/questions/export` | GET | teacher | 导出全部题目 JSON |

### 4.3 教师端 — 试卷 API

| 端点 | 方法 | 鉴权 | 说明 |
|------|------|------|------|
| `/api/exams` | GET | teacher | 试卷列表 |
| `/api/exams` | POST | teacher | 创建试卷 |
| `/api/exams/:id` | GET | teacher | 试卷详情 |
| `/api/exams/:id` | PUT | teacher | 编辑试卷 |
| `/api/exams/:id` | DELETE | teacher | 删除试卷 |
| `/api/exams/generate` | POST | teacher | 自动/智能组卷（从题库随机抽） |

### 4.4 教师端 — 班级 API

| 端点 | 方法 | 鉴权 | 说明 |
|------|------|------|------|
| `/api/classes` | GET | teacher | 我的班级列表 |
| `/api/classes` | POST | teacher | 创建班级 |
| `/api/classes/:id` | PUT | teacher | 编辑班级 |
| `/api/classes/:id` | DELETE | teacher | 删除班级 |
| `/api/classes/:id/students` | GET | teacher | 学生列表 |
| `/api/classes/:id/students` | POST | teacher | 批量导入学生（`{emails: string[]}`） |
| `/api/classes/:id/students/:sid` | DELETE | teacher | 移除学生 |

### 4.5 教师端 — 发布 API

| 端点 | 方法 | 鉴权 | 说明 |
|------|------|------|------|
| `/api/publish` | POST | teacher | 发布试卷 |
| `/api/publish` | GET | teacher | 已发布列表 |
| `/api/publish/:id` | PUT | teacher | 修改发布设置 |
| `/api/publish/:id` | DELETE | teacher | 取消发布 |
| `/api/publish/:id/results` | GET | teacher | 查看该次考试所有学生的成绩 |

### 4.6 学生端 API

| 端点 | 方法 | 鉴权 | 说明 |
|------|------|------|------|
| `/api/student/dashboard` | GET | student | 考试大厅 |
| `/api/student/exam/:publishId` | GET | student | 获取试卷题目 |
| `/api/student/exam/:publishId/start` | POST | student | 开始考试 |
| `/api/student/exam/:publishId/answer` | POST | student | 保存答案（实时） |
| `/api/student/exam/:publishId/submit` | POST | student | 交卷 |
| `/api/student/submissions` | GET | student | 我的答题记录 |
| `/api/student/submissions/:id` | GET | student | 答题详情 |
| `/api/student/grades` | GET | student | 成绩汇总 |
| `/api/student/classes/join` | POST | student | 加入班级（join_code） |
| `/api/student/answer/upload` | POST | student | 上传答题图片 |

### 4.7 教师端高级 API

| 端点 | 方法 | 鉴权 | 说明 |
|------|------|------|------|
| `/api/stats/exam/:publishId` | GET | teacher | 考试统计 |
| `/api/stats/exam/:publishId/questions` | GET | teacher | 逐题分析 |
| `/api/stats/class/:classId` | GET | teacher | 班级成绩趋势 |
| `/api/stats/student/:studentId` | GET | teacher | 学生成绩趋势 |
| `/api/grading/pending` | GET | teacher | 待批阅列表 |
| `/api/grading/:answerId` | PUT | teacher | 批阅某题 |
| `/api/export/exam/:publishId/scores` | GET | teacher | 成绩 Excel |
| `/api/export/exam/:publishId/analysis` | GET | teacher | 试卷分析 Excel |
| `/api/export/class/:classId/grades` | GET | teacher | 班级成绩 Excel |
| `/api/publish/:id/variants` | POST | teacher | 生成 A/B 卷 |
| `/api/publish/:id/variant/assign` | PUT | teacher | 分配变体 |
| `/api/makeup` | POST | teacher | 创建补考 |
| `/api/makeup` | GET | teacher | 补考列表 |

### 4.8 鉴权中间件

```typescript
// middleware/auth.ts

// JWT 验证 - 注入 req.user = { userId, role }
export const requireAuth: preHandlerHook

// 角色检查
export const requireRole = (role: 'teacher' | 'student'): preHandlerHook
```

使用方式：
```typescript
app.get('/api/questions', { preHandler: [requireAuth, requireRole('teacher')] }, handler)
app.get('/api/student/dashboard', { preHandler: [requireAuth, requireRole('student')] }, handler)
```

---

## 5. 前端设计

### 5.1 路由结构

```
/login              → AuthLayout
/register           → AuthLayout

/                   → TeacherLayout → Dashboard
/questions          → TeacherLayout → QuestionBank
/generator          → TeacherLayout → ExamGenerator
/exams              → TeacherLayout → ExamList
/exams/:id          → TeacherLayout → ExamViewer
/exams/:id/analysis → TeacherLayout → ExamAnalysis  [阶段4]
/session/:id        → TeacherLayout → SessionView
/history            → TeacherLayout → History
/classes            → TeacherLayout → ClassList     [阶段2]
/classes/:id        → TeacherLayout → ClassDetail   [阶段2]
/classes/:id/stats  → TeacherLayout → ClassStats    [阶段4]
/grading            → TeacherLayout → GradingCenter  [阶段4]
/grading/:id        → TeacherLayout → GradingDetail  [阶段4]
/students/:id       → TeacherLayout → StudentDetail  [阶段4]

/student/dashboard        → StudentLayout → StudentDashboard  [阶段3]
/student/exam/:publishId  → StudentLayout → ExamTaking       [阶段3]
/student/grades           → StudentLayout → StudentGrades    [阶段3]
/student/submission/:id   → StudentLayout → SubmissionDetail [阶段3]
```

### 5.2 路由守卫

```typescript
// ProtectedRoute.tsx
function ProtectedRoute({ children, role }: { children: ReactNode; role?: 'teacher' | 'student' }) {
  const { user, token } = useAuthStore()

  if (!token) return <Navigate to="/login" />
  if (role && user?.role !== role) {
    // 教师访问学生路由 → 重定向到教师首页
    // 学生访问教师路由 → 重定向到学生首页
    return <Navigate to={user?.role === 'teacher' ? '/' : '/student/dashboard'} />
  }

  return <>{children}</>
}
```

### 5.3 三种 Layout

**AuthLayout** — 无导航栏，居中卡片式布局
**TeacherLayout** — 导航栏: `🤖 AI 命题 | 📚 题库 | ✏️ 组卷 | 📄 试卷 | 👥 班级 | 📜 历史 | [用户头像下拉]`
**StudentLayout** — 导航栏: `🏠 考试大厅 | 📊 我的成绩 | 👥 加入班级 | [用户头像下拉]`

### 5.4 关键前端组件

| 组件 | 说明 | 阶段 |
|------|------|------|
| `AuthLayout` | 登录/注册外层 | 1 |
| `LoginPage / RegisterPage` | 登录注册卡片 | 1 |
| `ProtectedRoute` | 路由守卫 | 1 |
| `ClassCard / ClassList` | 班级管理 | 2 |
| `PublishDialog` | 发布试卷弹窗 | 2 |
| `StudentDashboard` | 考试大厅（三栏：进行中/即将开始/已结束） | 3 |
| `ExamTakingPage` | 全屏答题（侧栏导航 + 倒计时 + 切屏检测） | 3 |
| `SubmissionDetail` | 答题结果详情 | 3 |
| `GradingCenter` | 待批阅列表 | 4 |
| `ExamAnalysis` | 试卷分析图表 | 4 |

### 5.5 从 localStorage 到 API 的迁移

阶段 2 实施时，前端 stores 需要改造：

- `questionStore`：不再 persist 到 localStorage，改为每次调用 API 获取
- `examStore`：同上
- 新增 `authStore`：存储 token + user，persist 到 localStorage（token 需要跨会话保持）

---

## 6. 答题引擎详细设计

### 6.1 答题流程

```
学生进入考试大厅
  → 看到发布的考试卡片（进行中 / 即将开始 / 已结束）
  → 点击"开始考试"
  → POST /start → 创建 submission 记录，返回题目（按 shuffle 设置决定顺序）
  → 进入全屏答题界面
  → 每题作答后自动 POST /answer 保存
  → 点击"交卷"或倒计时到 0
  → POST /submit → 服务端标注 submitted_at，触发自动批改
  → 跳转到成绩页
```

### 6.2 自动批改规则

| 题型 | 批改方式 | is_correct |
|------|----------|------------|
| 选择题 | `studentAnswer.selectedOptionId === correctAnswer.selectedOptionId` | 0/1 |
| 判断题 | `studentAnswer.value === correctAnswer.value` | 0/1 |
| 填空题 | 标准化（去空格/去多余标点/小写化）后逐空比较 | 0/1 |
| 问答题/证明题 | 标记为 NULL | NULL（待人工批阅） |
| 匹配题 | `studentAnswer.pairs` 逐对匹配 | 0~1（部分分） |
| 排序题 | `studentAnswer.orderedItems` 数组完全匹配 | 0/1 |

### 6.3 防作弊措施

| 措施 | 前端 | 后端 |
|------|------|------|
| 全屏模式 | `requestFullscreen()`，监听 `fullscreenchange` | 记录违规次数 |
| 切屏检测 | `visibilitychange` → 记录切出 | 提交时附带违规次数 |
| 超时自动交卷 | 前端倒计时到 0 自动 submit | 后端 `started_at + duration` 校验，超时拒绝保存 |
| 断线保护 | 每题自动保存，刷新页面检查已有 submission 并恢复 | `/answer` 接口实时持久化 |
| IP 限制 | 无（不增加复杂度） | - |

### 6.4 数学公式处理

- **渲染**：使用 KaTeX 渲染 LaTeX 公式（试卷中的 `\(...\)` 和 `$$...$$`）
- **学生输入**：
  - 选择题/判断题/排序题：直接选择，不涉及公式输入
  - 填空题：文本框 + 工具栏插入 LaTeX 片段（`\frac`, `\sqrt`, `\int` 等快捷按钮）
  - 问答题：富文本区 + LaTeX 编辑器 + 拍照上传按钮

---

## 7. 试卷分析详细设计

### 7.1 区分度计算

区分度 = (高分组正确率 - 低分组正确率)

1. 按总分排序，取前 27% 为高分组，后 27% 为低分组
2. 对每道题：`discrimination = highGroupCorrectRate - lowGroupCorrectRate`
3. 解读：> 0.4 优秀 / 0.3-0.4 良好 / 0.2-0.3 一般 / < 0.2 需改进

### 7.2 统计触发时机

- 每次有新 submission 被 graded 后，异步重新计算 `exam_stats` 和 `question_stats`
- 提供手动 "重新计算" 按钮

---

## 8. 文件清单

### 8.1 后端新增/修改

| 文件 | 阶段 | 说明 |
|------|------|------|
| `api/src/db/index.ts` | 1 | SQLite 初始化 + 建表 |
| `api/src/db/migrations.ts` | 1 | 迁移脚本 |
| `api/src/middleware/auth.ts` | 1 | JWT + 角色中间件 |
| `api/src/routes/auth.ts` | 1 | 认证端点 |
| `api/src/routes/questions.ts` | 2 | 题库 CRUD |
| `api/src/routes/exams.ts` | 2 | 试卷 CRUD |
| `api/src/routes/classes.ts` | 2 | 班级管理 |
| `api/src/routes/publish.ts` | 2 | 试卷发布 |
| `api/src/routes/student.ts` | 3 | 学生端 |
| `api/src/routes/grading.ts` | 3 | 自动批改引擎 |
| `api/src/routes/stats.ts` | 4 | 统计分析 |
| `api/src/routes/export.ts` | 4 | Excel 导出 |
| `api/src/routes/makeup.ts` | 4 | 补考管理 |
| `api/src/index.ts` | 1-4 | 注册所有路由 |
| `api/package.json` | 1 | 添加 bcrypt, jsonwebtoken, better-sqlite3, exceljs |

### 8.2 前端新增/修改

| 文件 | 阶段 | 说明 |
|------|------|------|
| `web/src/store/authStore.ts` | 1 | JWT + user 状态 |
| `web/src/routes/Login.tsx` | 1 | 登录页 |
| `web/src/routes/Register.tsx` | 1 | 注册页 |
| `web/src/components/layout/AuthLayout.tsx` | 1 | 认证布局 |
| `web/src/components/layout/TeacherLayout.tsx` | 1 | 教师布局 |
| `web/src/components/layout/StudentLayout.tsx` | 1 | 学生布局 |
| `web/src/components/auth/ProtectedRoute.tsx` | 1 | 路由守卫 |
| `web/src/App.tsx` | 1-4 | 更新路由结构 |
| `web/src/store/questionStore.ts` | 2 | 改为 API 调用 |
| `web/src/store/examStore.ts` | 2 | 改为 API 调用 |
| `web/src/routes/ClassList.tsx` | 2 | 班级列表 |
| `web/src/routes/ClassDetail.tsx` | 2 | 班级详情 |
| `web/src/components/exams/PublishDialog.tsx` | 2 | 发布弹窗 |
| `web/src/routes/StudentDashboard.tsx` | 3 | 考试大厅 |
| `web/src/routes/ExamTaking.tsx` | 3 | 答题页 |
| `web/src/routes/StudentGrades.tsx` | 3 | 成绩页 |
| `web/src/routes/SubmissionDetail.tsx` | 3 | 答题详情 |
| `web/src/routes/GradingCenter.tsx` | 4 | 批阅中心 |
| `web/src/routes/ExamAnalysis.tsx` | 4 | 试卷分析 |
| `web/src/routes/StudentDetail.tsx` | 4 | 学生详情 |
| `web/package.json` | 1 | 添加 katex |

---

## 9. 现有功能集成

### 9.1 AI 管道会话

现有的 AI 命题管道（Dashboard → 上传真题 → 自动生成试卷）需要与用户系统集成：

- `sessions` 数据从文件系统迁移到 SQLite `sessions` 表，新增 `teacher_id` 字段
- 管道 API 端点添加 `requireRole('teacher')` 鉴权
- "导入到题库"按钮导入的题目自动关联当前教师 `teacher_id`
- 现有的文件系统存储保持不变（`/data/exams/session-*` 目录用于管道产物文件）

### 9.2 localStorage 数据迁移

阶段 2 实施时：
- 前端 `questionStore` 和 `examStore` 从 zustand persist 改为 API 调用
- 首次加载时，检测 localStorage 中有旧数据则提示用户导入
- 提供 "迁移本地数据" 按钮：读取 localStorage → POST 到 `/api/questions/import` 和 `/api/exams`

---

## 10. 非功能需求

### 9.1 安全

- 密码 bcrypt 10 rounds 加密存储
- JWT 24h 过期，支持刷新
- API 路由全部经过角色鉴权
- SQLite 文件权限 600

### 9.2 性能

- 题库列表分页（每页 20 条）
- 统计分析缓存（`exam_stats` / `question_stats` 表）
- 答题答案实时保存（每题独立 API 调用）

### 9.3 兼容性

- 前端兼容现代浏览器（Chrome/Firefox/Edge/Safari 最近 2 个主版本）
- 后端需要 Node.js ≥ 18

---

## 10. 自检清单

- [x] 无 TBD/TODO 占位符
- [x] 阶段 1-4 所有 API 端点已列举
- [x] 数据库所有表已定义
- [x] 前后端文件清单完整
- [x] 路由守卫逻辑已明确
- [x] 自动批改规则已定义
- [x] 防作弊机制已描述
- [x] 区分度计算公式已给定
- [x] 数据迁移路径（localStorage → SQLite）已说明
