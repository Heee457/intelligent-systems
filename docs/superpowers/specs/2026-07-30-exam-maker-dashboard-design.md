# exam-maker Web Dashboard — 设计文档

**日期：** 2026-07-30  
**状态：** 待实现

## 1. 概述

为 exam-maker Claude Code 技能构建 Web 管理界面。老师通过浏览器上传真题、配置参数、触发 AI 命题流程，在线审核中间产物（双向细目表、试卷模板），最终预览并下载生成的试卷。后端调用 Anthropic Claude API 执行 SKILL.md 定义的 6 步命题管道。

## 2. 技术方案

- **前端：** React 18 + TypeScript + Vite + Tailwind CSS + React Router v6 + Zustand
- **后端：** Node.js + Fastify + TypeScript
- **通信：** REST（CRUD）+ WebSocket（实时进度推送）
- **AI 引擎：** Anthropic Claude Messages API（tool use 循环）
- **存储：** 服务端本地文件系统 `/data/exams/session-{id}/`
- **外部工具：** pandoc（格式转换）、sympy（验算）、xelatex（编译），子进程调用

## 3. 项目结构（Monorepo）

```
exam-maker/
├── package.json              # workspace root
├── web/                      # 前端（现有 exam-maker-web）
│   ├── src/
│   │   ├── routes/
│   │   │   ├── Dashboard.tsx      # 新增：任务仪表盘
│   │   │   ├── SessionView.tsx    # 新增：会话详情（进度+确认+预览）
│   │   │   ├── QuestionBank.tsx   # 保留
│   │   │   ├── ExamGenerator.tsx  # 保留
│   │   │   ├── ExamList.tsx       # 保留
│   │   │   ├── ExamViewer.tsx     # 保留
│   │   │   └── History.tsx        # 保留
│   │   └── ...
├── api/                      # 后端（新增）
│   ├── src/
│   │   ├── index.ts              # Fastify 入口
│   │   ├── routes/
│   │   │   ├── sessions.ts       # 会话 CRUD
│   │   │   ├── pipeline.ts       # 管道控制
│   │   │   ├── files.ts          # 文件上传/下载
│   │   │   └── ws.ts             # WebSocket
│   │   ├── pipeline/
│   │   │   ├── orchestrator.ts   # 步骤状态机
│   │   │   ├── steps/            # 步骤 0-6 实现
│   │   │   ├── claude-client.ts  # Claude API 封装
│   │   │   └── sub-agent.ts      # 子代理编排
│   │   ├── session/store.ts      # 会话状态持久化
│   │   └── shared/types.ts       # API 类型
│   └── package.json
└── shared/                   # 前后端共享类型
    └── types/index.ts
```

## 4. 数据模型

### 4.1 会话配置

```typescript
interface SessionConfig {
  course?: string           // 课程名（可选，从真题推断）
  scope?: string            // 命题范围（可选）
  difficulty: string        // 默认 "基础60% 中等30% 难10%"
  nSets: number             // 默认 8
  outputFormat: 'latex' | 'docx' | 'md'
  verifyMode: 'auto' | 'computational' | 'conceptual' | 'mixed'
}
```

### 4.2 会话状态

```typescript
type SessionStatus =
  | 'CREATED' | 'RUNNING' | 'AWAIT_BLUEPRINT'
  | 'AWAIT_TEMPLATE' | 'AWAIT_SELECTION'
  | 'COMPLETED' | 'DONE' | 'FAILED' | 'CANCELLED'

interface Session {
  id: string
  workDir: string
  buildDir: string
  config: SessionConfig
  status: SessionStatus
  currentStep: number
  stepDetail: string
  files: SessionFile[]
  blueprint?: BlueprintData
  template?: TemplateData
  papers: PaperData[]
  createdAt: number
  updatedAt: number
}
```

### 4.3 WebSocket 消息

```typescript
type WsMessage =
  | { type: 'step'; step: number; detail: string }
  | { type: 'log'; message: string }
  | { type: 'artifact'; file: SessionFile }
  | { type: 'confirm'; point: 'blueprint' | 'template' | 'selection'; data: unknown }
  | { type: 'error'; message: string }
```

## 5. API 端点

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/api/sessions` | 创建会话（multipart: 真题文件 + 配置 JSON） |
| `GET` | `/api/sessions` | 会话列表 |
| `GET` | `/api/sessions/:id` | 获取会话详情 |
| `POST` | `/api/sessions/:id/start` | 启动管道执行 |
| `POST` | `/api/sessions/:id/confirm` | 确认点提交（通过/修改意见/驳回） |
| `POST` | `/api/sessions/:id/cancel` | 取消运行 |
| `GET` | `/api/sessions/:id/files/:path` | 下载产物文件 |
| `WS` | `/api/sessions/:id/ws` | WebSocket 实时进度 |

## 6. 管道实现

### 6.1 状态机

```
CREATED → RUNNING → AWAIT_BLUEPRINT → RUNNING → AWAIT_TEMPLATE
→ RUNNING → COMPLETED → AWAIT_SELECTION → DONE
任何状态 → FAILED / CANCELLED
```

### 6.2 Claude API 调用模式

每步调用 Anthropic Messages API，system prompt = SKILL.md 流程描述 + 对应 reference 手册内容：

1. 注册 tools：`execute_bash`、`read_file`、`write_file`、`report_progress`、`request_confirmation`
2. API 返回 tool_use → 后端执行 tool → 返回 tool_result → 继续循环
3. `request_confirmation` tool 触发管道暂停，WebSocket 推送 confirm 消息
4. 老师确认后，确认数据作为 user message 注入继续

### 6.3 子代理编排

关键步骤（1-5）采用"分析 + 核对"双调用模式：
- 第一轮：分析子代理产出结果
- 第二轮：核对子代理独立比对验证
- 核对 FAIL → 回到分析（最多 3 次）
- 子代理提示词来自 `references/quality-gates.md`

### 6.4 六个步骤

| 步骤 | 内容 | 涉及工具 | 确认点 |
|------|------|----------|--------|
| 0 | 环境探测 | bash: pandoc/sympy/xelatex 版本检查 | 无 |
| 1 | 真题→LaTeX | Read 工具 PDF 识读、pandoc docx→tex | 无 |
| 2 | 考点分析→细目表 | Claude 分析 + 核对子代理 | ⏸ 细目表确认 |
| 3 | 模板提取 | Claude 模板子代理 | ⏸ 模板确认 |
| 4 | 难度配比 | 分值核算（Python 脚本辅助） | 无 |
| 5 | 生成 N 套 | 命题子代理 + 核验子代理（sympy/复核） | 无 |
| 6 | 编译/转换 | xelatex/pandoc 编译转换 | ⏸ 选卷 |

## 7. 前端页面

### 7.1 Dashboard（`/`）

- 参数配置表单（课程名、范围、难度配比、套数、输出格式）
- 拖拽上传真题区域（PDF/docx）
- 历史任务列表（点击进入 SessionView）

### 7.2 SessionView（`/session/:id`）

- 步骤进度条（0-6，高亮当前步骤）
- 步骤日志实时流（WebSocket 推送）
- 确认点面板：细目表/模板的结构化展示 + 确认/驳回/修改按钮
- 选卷面板：每套的考点覆盖、难度构成、验算结果 + 多选下载
- 产物文件列表（可点击预览/下载）

### 7.3 保留页面

- QuestionBank、ExamGenerator、ExamList、ExamViewer、History（路径不变，作为题库管理功能的补充）

## 8. 非功能需求

- **安全**：API key 存服务端 `.env`，不暴露前端；bash 命令在沙箱执行
- **可靠性**：每个步骤产物写入文件后才标记完成；支持中断恢复
- **并发**：单会话顺序执行，多会话可并行（不同 workDir 隔离）
- **响应式**：桌面为主，平板可用
