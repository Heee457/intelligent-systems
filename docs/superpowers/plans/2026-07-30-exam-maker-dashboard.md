# exam-maker Dashboard — 实施计划

> **For agentic workers:** 按任务顺序依次实现，每步勾选后进入下一步。

**Goal:** 在现有 exam-maker-web 基础上，构建 Web Dashboard 支持 AI 命题全流程——配置参数、上传真题、在线审核中间产物、预览下载试卷。后端通过 Claude API tool use 循环执行 SKILL.md 定义的 6 步管道。

**Architecture:** Monorepo（web + api + shared），Fastify 后端调用 Anthropic Messages API 驱动命题管道，WebSocket 推送实时进度，React 前端提供 Dashboard 和 SessionView 两个新页面，保留现有题库管理功能。

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, React Router v6, Zustand, Fastify, `@anthropic-ai/sdk`, ws

## Global Constraints

- 纯 TypeScript 严格模式（前后端统一）
- API key 存服务端 `.env`，不暴露前端
- 真题文件存服务端本地文件系统 `/data/exams/session-{id}/`
- bash 命令在子进程执行，限制在工作目录内
- 前端保留现有 5 个页面不变，新增 Dashboard（`/`）和 SessionView（`/session/:id`）
- pandoc/sympy/xelatex 子进程调用，缺失时降级不阻塞

---

### Task 1: Monorepo 结构重组

**Files:**
- Create: `exam-maker/package.json`（根 workspace 配置）
- Rename: `exam-maker/` → `exam-maker/web/`（移动现有全部文件）
- Create: `exam-maker/api/package.json`
- Create: `exam-maker/api/tsconfig.json`
- Create: `exam-maker/shared/package.json`
- Create: `exam-maker/shared/tsconfig.json`
- Create: `exam-maker/.gitignore`（追加 api 和 shared 相关）

**Interfaces:**
- Produces: 三个子包（web/api/shared），`npm install` 从根目录一键安装
- Produces: `shared/types/` 可从 web 和 api 各自 import

- [ ] **Step 1: 创建根 package.json**

在 `exam-maker/package.json` 替换为新内容：

```json
{
  "name": "exam-maker-monorepo",
  "private": true,
  "workspaces": ["web", "api", "shared"]
}
```

- [ ] **Step 2: 移动现有关键文件**

```bash
# 从 exam-maker/ 目录内部执行
cd /home/user/intelligent-systems/.claude/worktrees/exam-maker-web/exam-maker

# 不需要移动，web/ 子包就是当前的 exam-maker 目录重命名。
# 新的结构：
# exam-maker/           ← monorepo root (package.json with workspaces)
#   web/               ← 现有 exam-maker 项目移入此处
#   api/               ← 新建
#   shared/            ← 新建
```

实际上需要做的是：
1. `exam-maker/` 当前内容作为 `web/` 子包
2. 在 `exam-maker/` 上层创建 workspace root 的 `package.json`

由于 git 已经把文件提交在 `exam-maker/` 路径下，重组方式：

```bash
# 在各子目录创建 package.json:
# web/package.json — 保持现有的，加 name: "exam-maker-web"
# api/package.json — 新建
# shared/package.json — 新建
# 根 exam-maker/package.json — 改为 workspace 声明
```

- [ ] **Step 3: 创建 shared 子包**

在 `exam-maker/shared/package.json`：

```json
{
  "name": "exam-maker-shared",
  "version": "1.0.0",
  "private": true,
  "main": "./types/index.ts",
  "types": "./types/index.ts"
}
```

在 `exam-maker/shared/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": true,
    "outDir": "dist"
  },
  "include": ["types"]
}
```

将 `web/src/types/index.ts` 复制到 `shared/types/index.ts`，并在 `web/src/types/index.ts` 改为：

```typescript
export * from '../../../shared/types/index'
```

- [ ] **Step 4: 创建 api 子包骨架**

在 `exam-maker/api/package.json`：

```json
{
  "name": "exam-maker-api",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0",
    "fastify": "^4.28.0",
    "@fastify/websocket": "^10.0.0",
    "@fastify/multipart": "^8.3.0",
    "@fastify/cors": "^9.0.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/ws": "^8.5.10",
    "tsx": "^4.16.0",
    "typescript": "^5.5.3"
  }
}
```

在 `exam-maker/api/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

创建 `exam-maker/api/src/index.ts`：

```typescript
import Fastify from 'fastify'
import cors from '@fastify/cors'

const app = Fastify({ logger: true })

await app.register(cors, { origin: 'http://localhost:5173' })

app.get('/api/health', async () => ({ status: 'ok' }))

try {
  await app.listen({ port: 3001, host: '0.0.0.0' })
  console.log('API server running on http://localhost:3001')
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
```

- [ ] **Step 5: 更新前端 dev server proxy**

修改 `exam-maker/web/vite.config.ts`，添加 API 代理：

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
})
```

- [ ] **Step 6: 安装依赖并验证**

```bash
cd exam-maker && npm install
cd api && npx tsx src/index.ts  # 验证 API 启动
```

- [ ] **Step 7: 提交**

```bash
git add -A && git commit -m "feat: restructure to monorepo (web + api + shared)"
```

---

### Task 2: 共享类型 + API 类型定义

**Files:**
- Modify: `exam-maker/shared/types/index.ts` — 保留现有类型，新增 API 相关类型
- Create: `exam-maker/api/src/shared/types.ts` — API 专用类型

**Interfaces:**
- Consumes: 现有 `shared/types/index.ts` 的类型
- Produces: `SessionConfig`, `Session`, `SessionStatus`, `WsMessage`, `PipelineStep` 等 API 类型
- Produces: API 请求/响应类型（`CreateSessionRequest`, `ConfirmRequest` 等）

- [ ] **Step 1: 扩展 shared/types/index.ts**

在现有类型之后追加：

```typescript
// —— API: 会话配置 ——
export interface SessionConfig {
  course?: string
  scope?: string
  difficulty: string        // "基础60% 中等30% 难10%"
  nSets: number             // 默认 8
  outputFormat: 'latex' | 'docx' | 'md'
  verifyMode: 'auto' | 'computational' | 'conceptual' | 'mixed'
}

// —— API: 会话状态 ——
export type SessionStatus =
  | 'CREATED' | 'RUNNING' | 'AWAIT_BLUEPRINT'
  | 'AWAIT_TEMPLATE' | 'AWAIT_SELECTION'
  | 'COMPLETED' | 'DONE' | 'FAILED' | 'CANCELLED'

export interface SessionFile {
  name: string
  path: string
  size: number
  createdAt: number
}

export interface BlueprintRow {
  kp: string
  basic: number
  medium: number
  hard: number
  total: number
  frequency: number
  required: boolean
  sampleQuestions: string[]
}

export interface BlueprintData {
  rows: BlueprintRow[]
  difficultySummary: { basic: number; medium: number; hard: number } // 百分比
  totalScore: number
}

export interface TemplateData {
  sections: Array<{
    type: string
    count: number
    scorePer: number
    totalScore: number
    notes?: string
  }>
  totalTime: number
  headerStyle: string
}

export interface PaperData {
  index: number
  filename: string
  formats: string[]  // ['tex','pdf','docx','md']
  verifyPassed: string
  difficulty: { basic: number; medium: number; hard: number }
  coverage: string
  selected: boolean
}

export interface Session {
  id: string
  workDir: string
  buildDir: string
  config: SessionConfig
  status: SessionStatus
  currentStep: number        // 0-6
  stepDetail: string
  files: SessionFile[]
  blueprint?: BlueprintData
  template?: TemplateData
  papers: PaperData[]
  createdAt: number
  updatedAt: number
}

// —— API: WebSocket 消息 ——
export type WsMessage =
  | { type: 'step'; step: number; detail: string }
  | { type: 'log'; message: string }
  | { type: 'artifact'; file: SessionFile }
  | { type: 'confirm'; point: 'blueprint' | 'template' | 'selection'; data: unknown }
  | { type: 'error'; message: string }
  | { type: 'complete'; session: Session }

// —— API: 请求/响应类型 ——
export interface CreateSessionResponse {
  id: string
  session: Session
}

export interface ConfirmRequest {
  action: 'approve' | 'reject' | 'modify'
  point: 'blueprint' | 'template' | 'selection'
  feedback?: string
  modifications?: unknown
}

export interface ApiError {
  error: string
  detail?: string
}
```

- [ ] **Step 2: 创建 api/src/shared/types.ts**

```typescript
import type { Session, WsMessage } from '../../../shared/types/index'

// Pipeline 步骤定义
export interface PipelineStep {
  index: number
  name: string
  description: string
  requiresConfirm: boolean
  confirmPoint?: 'blueprint' | 'template' | 'selection'
  run: (session: Session, ctx: PipelineContext) => Promise<StepResult>
}

export interface PipelineContext {
  sessionDir: string
  buildDir: string
  sendWs: (msg: WsMessage) => void
  claudeClient: ClaudeClient
}

export interface StepResult {
  success: boolean
  artifacts: Array<{ name: string; path: string }>
  confirmData?: unknown
  error?: string
}

// Claude API 工具定义
export interface ClaudeTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export type ClaudeClient = {
  sendMessage: (opts: {
    system: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    tools: ClaudeTool[]
    onToolUse: (name: string, input: unknown) => Promise<string>
    onText: (text: string) => void
  }) => Promise<string>
}
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
cd exam-maker/web && npx tsc --noEmit
cd exam-maker/api && npx tsc --noEmit
```

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "feat: add shared API types and session data models"
```

---

### Task 3: Session Store（后端会话持久化）

**Files:**
- Create: `exam-maker/api/src/session/store.ts`

**Interfaces:**
- Consumes: `shared/types/index.ts` 中的 `Session`, `SessionConfig`, `SessionFile`
- Produces: `createSession(config, files) → Session`, `getSession(id) → Session | undefined`, `listSessions() → Session[]`, `updateSession(id, patch) → Session`, `deleteSession(id)`
- Produces: 会话数据存为磁盘 JSON 文件 `/data/exams/session-{id}/session.json`

- [ ] **Step 1: 创建 store.ts**

```typescript
import fs from 'fs/promises'
import path from 'path'
import type { Session, SessionConfig } from '../../../shared/types/index'
import { generateId } from '../utils/id'

const DATA_ROOT = process.env.EXAM_DATA_ROOT || '/data/exams'

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

function sessionDir(id: string) {
  return path.join(DATA_ROOT, `session-${id}`)
}

function sessionPath(id: string) {
  return path.join(sessionDir(id), 'session.json')
}

export async function createSession(
  config: SessionConfig,
  filenames: string[],
): Promise<Session> {
  const id = generateId()
  const now = Date.now()
  const dir = sessionDir(id)
  await ensureDir(path.join(dir, 'exam-build'))

  const session: Session = {
    id,
    workDir: dir,
    buildDir: path.join(dir, 'exam-build'),
    config,
    status: 'CREATED',
    currentStep: -1,
    stepDetail: '等待启动',
    files: filenames.map((name) => ({
      name,
      path: path.join(dir, name),
      size: 0,
      createdAt: now,
    })),
    papers: [],
    createdAt: now,
    updatedAt: now,
  }

  await fs.writeFile(sessionPath(id), JSON.stringify(session, null, 2))
  return session
}

export async function getSession(id: string): Promise<Session | undefined> {
  try {
    const raw = await fs.readFile(sessionPath(id), 'utf-8')
    return JSON.parse(raw) as Session
  } catch {
    return undefined
  }
}

export async function listSessions(): Promise<Session[]> {
  await ensureDir(DATA_ROOT)
  const entries = await fs.readdir(DATA_ROOT, { withFileTypes: true })
  const sessions: Session[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('session-')) continue
    const s = await getSession(entry.name.replace('session-', ''))
    if (s) sessions.push(s)
  }
  sessions.sort((a, b) => b.createdAt - a.createdAt)
  return sessions
}

export async function updateSession(
  id: string,
  patch: Partial<Session>,
): Promise<Session | undefined> {
  const session = await getSession(id)
  if (!session) return undefined
  const updated: Session = {
    ...session,
    ...patch,
    updatedAt: Date.now(),
    id: session.id, // 不可覆盖
    createdAt: session.createdAt,
  }
  await fs.writeFile(sessionPath(id), JSON.stringify(updated, null, 2))
  return updated
}

export async function deleteSession(id: string): Promise<boolean> {
  try {
    await fs.rm(sessionDir(id), { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 2: 创建 api/src/utils/id.ts**（generateId 工具函数）

```typescript
import crypto from 'crypto'

export function generateId(): string {
  return crypto.randomBytes(12).toString('hex')
}
```

- [ ] **Step 3: 验证编译**

```bash
cd exam-maker/api && npx tsc --noEmit
```

- [ ] **Step 4: 提交**

---

### Task 4: Claude API Client

**Files:**
- Create: `exam-maker/api/src/pipeline/claude-client.ts`

**Interfaces:**
- Consumes: `api/src/shared/types.ts` 中的 `ClaudeClient`, `ClaudeTool`
- Produces: `createClaudeClient(apiKey) → ClaudeClient`
- Produces: `sendMessage()` — 封装 Anthropic Messages API 的 tool use 循环

- [ ] **Step 1: 创建 claude-client.ts**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { ClaudeClient, ClaudeTool } from '../shared/types'

interface SendOpts {
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  tools: ClaudeTool[]
  onToolUse: (name: string, input: Record<string, unknown>) => Promise<string>
  onText: (text: string) => void
  maxTokens?: number
  model?: string
}

export function createClaudeClient(apiKey: string): ClaudeClient {
  const anthropic = new Anthropic({ apiKey })

  return {
    sendMessage: async (opts: SendOpts): Promise<string> => {
      const { system, tools, onToolUse, onText, maxTokens = 8192, model = 'claude-sonnet-5' } = opts

      // Build Anthropic tool definitions
      const anthropicTools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      }))

      // Build messages
      const messages: Anthropic.MessageParam[] = opts.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

      let output = ''
      let done = false

      while (!done) {
        const response = await anthropic.messages.create({
          model,
          max_tokens: maxTokens,
          system,
          tools: anthropicTools,
          messages,
        })

        // Process content blocks
        const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

        for (const block of response.content) {
          if (block.type === 'text') {
            output += block.text
            onText(block.text)
          }
          if (block.type === 'tool_use') {
            toolUses.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> })
          }
        }

        if (toolUses.length === 0) {
          done = true
          break
        }

        // Process tool calls
        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const tu of toolUses) {
          const result = await onToolUse(tu.name, tu.input)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: result,
          })
        }

        // Add assistant response + tool results to messages
        messages.push({ role: 'assistant', content: response.content })
        messages.push({ role: 'user', content: toolResults })
      }

      return output
    },
  }
}
```

- [ ] **Step 2: 创建环境配置**

创建 `exam-maker/api/.env.example`：

```
ANTHROPIC_API_KEY=sk-ant-...
EXAM_DATA_ROOT=/data/exams
```

在 `exam-maker/api/src/index.ts` 追加 dotenv 加载（用 `process.env` 直接读，不需要 dotenv 包）：

```typescript
const API_KEY = process.env.ANTHROPIC_API_KEY
if (!API_KEY) {
  console.warn('WARNING: ANTHROPIC_API_KEY not set. AI pipeline will not work.')
}
```

- [ ] **Step 3: 验证编译**

```bash
cd exam-maker/api && npm install && npx tsc --noEmit
```

- [ ] **Step 4: 提交**

---

### Task 5: 管道 Orchestrator（状态机）

**Files:**
- Create: `exam-maker/api/src/pipeline/orchestrator.ts`

**Interfaces:**
- Consumes: `Session`, `SessionStatus`, `WsMessage`, `PipelineStep`, `PipelineContext`, `ClaudeClient`, `StepResult`
- Produces: `PipelineOrchestrator` 类，管理单个 Session 的管道状态机
- Produces: `start(session)`, `confirm(point, action, feedback)` 方法

- [ ] **Step 1: 创建 orchestrator.ts**

```typescript
import type { Session, SessionStatus, WsMessage } from '../../../shared/types/index'
import type { PipelineStep, PipelineContext, StepResult, ClaudeClient } from '../shared/types'
import { updateSession, getSession } from '../session/store'

interface StepDefinition {
  index: number
  name: string
  requiresConfirm: boolean
  confirmPoint?: 'blueprint' | 'template' | 'selection'
}

const STEPS: StepDefinition[] = [
  { index: 0, name: '环境探测', requiresConfirm: false },
  { index: 1, name: '真题解析', requiresConfirm: false },
  { index: 2, name: '考点分析·双向细目表', requiresConfirm: true, confirmPoint: 'blueprint' },
  { index: 3, name: '模板提取', requiresConfirm: true, confirmPoint: 'template' },
  { index: 4, name: '难度配比', requiresConfirm: false },
  { index: 5, name: '生成试卷', requiresConfirm: false },
  { index: 6, name: '编译转换', requiresConfirm: true, confirmPoint: 'selection' },
]

const STATUS_AFTER_STEP: Record<number, SessionStatus> = {
  0: 'RUNNING',
  1: 'RUNNING',
  2: 'AWAIT_BLUEPRINT',
  3: 'AWAIT_TEMPLATE',
  4: 'RUNNING',
  5: 'RUNNING',
  6: 'AWAIT_SELECTION',
}

type Subscriber = (msg: WsMessage) => void

export class PipelineOrchestrator {
  private active = new Map<string, boolean>()
  private subscribers = new Map<string, Set<Subscriber>>()
  private claudeClient: ClaudeClient | null = null

  setClaudeClient(client: ClaudeClient) {
    this.claudeClient = client
  }

  subscribe(sessionId: string, fn: Subscriber) {
    if (!this.subscribers.has(sessionId)) {
      this.subscribers.set(sessionId, new Set())
    }
    this.subscribers.get(sessionId)!.add(fn)
    return () => { this.subscribers.get(sessionId)?.delete(fn) }
  }

  private broadcast(sessionId: string, msg: WsMessage) {
    this.subscribers.get(sessionId)?.forEach((fn) => fn(msg))
  }

  async start(sessionId: string): Promise<void> {
    const session = await getSession(sessionId)
    if (!session) throw new Error('Session not found')
    if (session.status !== 'CREATED') throw new Error(`Session not in CREATED state: ${session.status}`)
    if (!this.claudeClient) throw new Error('Claude client not configured')

    this.active.set(sessionId, true)
    await updateSession(sessionId, { status: 'RUNNING', currentStep: 0, stepDetail: '启动管道...' })

    const ctx: PipelineContext = {
      sessionDir: session.workDir,
      buildDir: session.buildDir,
      sendWs: (msg) => this.broadcast(sessionId, msg),
      claudeClient: this.claudeClient!,
    }

    for (const step of STEPS) {
      if (!this.active.get(sessionId)) {
        await updateSession(sessionId, { status: 'CANCELLED', stepDetail: '用户取消' })
        return
      }

      await updateSession(sessionId, { currentStep: step.index, stepDetail: `执行中: ${step.name}` })
      this.broadcast(sessionId, { type: 'step', step: step.index, detail: step.name })

      try {
        const result = await this.runStep(step, ctx)

        if (!result.success) {
          await updateSession(sessionId, { status: 'FAILED', stepDetail: `失败: ${step.name} — ${result.error}` })
          this.broadcast(sessionId, { type: 'error', message: result.error || '未知错误' })
          return
        }

        // Record artifacts
        if (result.artifacts.length > 0) {
          const session = (await getSession(sessionId))!
          const newFiles = result.artifacts.map((a) => ({
            name: a.name,
            path: a.path,
            size: 0,
            createdAt: Date.now(),
          }))
          await updateSession(sessionId, {
            files: [...session.files, ...newFiles],
          })
          newFiles.forEach((f) => this.broadcast(sessionId, { type: 'artifact', file: f }))
        }

        // Handle confirmation point
        if (step.requiresConfirm && step.confirmPoint && result.confirmData) {
          const nextStatus = STATUS_AFTER_STEP[step.index]
          await updateSession(sessionId, { status: nextStatus, stepDetail: `待确认: ${step.name}` })
          this.broadcast(sessionId, {
            type: 'confirm',
            point: step.confirmPoint,
            data: result.confirmData,
          })
          return // Pause — wait for confirm call
        }

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await updateSession(sessionId, { status: 'FAILED', stepDetail: `错误: ${message}` })
        this.broadcast(sessionId, { type: 'error', message })
        return
      }
    }

    // All steps complete
    await updateSession(sessionId, { status: 'COMPLETED', stepDetail: '全部完成，请选卷' })
    const session = await getSession(sessionId)
    this.broadcast(sessionId, { type: 'complete', session: session! })
    this.active.delete(sessionId)
  }

  private async runStep(
    step: StepDefinition,
    ctx: PipelineContext,
  ): Promise<StepResult> {
    // Placeholder — actual step implementation comes in Tasks 6-8
    this.broadcast(ctx.sessionDir.split('/').pop()!, {
      type: 'log',
      message: `[Step ${step.index}] ${step.name} — 待实现`,
    })
    return { success: true, artifacts: [] }
  }

  async confirm(
    sessionId: string,
    point: 'blueprint' | 'template' | 'selection',
    action: 'approve' | 'reject' | 'modify',
    feedback?: string,
  ): Promise<void> {
    const session = await getSession(sessionId)
    if (!session) throw new Error('Session not found')

    if (action === 'approve') {
      // Resume pipeline from next step
      await updateSession(sessionId, { status: 'RUNNING' })
      await this.resume(sessionId)
    } else if (action === 'reject' || action === 'modify') {
      // Re-run current step with feedback
      await updateSession(sessionId, { status: 'RUNNING', stepDetail: `根据反馈重新执行: ${feedback || ''}` })
      await this.resume(sessionId)
    }
  }

  private async resume(sessionId: string): Promise<void> {
    // Continue from currentStep
    await this.start(sessionId) // Simplified — full impl tracks position
  }

  async cancel(sessionId: string): Promise<void> {
    this.active.set(sessionId, false)
    await updateSession(sessionId, { status: 'CANCELLED', stepDetail: '用户取消' })
  }
}

// Singleton
export const orchestrator = new PipelineOrchestrator()
```

- [ ] **Step 2: 验证编译**

```bash
cd exam-maker/api && npx tsc --noEmit
```

- [ ] **Step 3: 提交**

---

### Task 6: 管道步骤具体实现（步骤 0-3）

**Files:**
- Create: `exam-maker/api/src/pipeline/steps/step0-detect.ts`
- Create: `exam-maker/api/src/pipeline/steps/step1-parse.ts`
- Create: `exam-maker/api/src/pipeline/steps/step2-blueprint.ts`
- Create: `exam-maker/api/src/pipeline/steps/step3-template.ts`

**Interfaces:**
- Consumes: `PipelineContext`, `StepResult`, `ClaudeClient`
- Produces: 每个步骤的 `run(ctx) → StepResult` 函数
- Produces: 步骤内调用 Claude API，注册对应 tools（execute_bash, read_file, write_file, request_confirmation）

- [ ] **Step 1: 创建步骤骨架 + 通用工具**

创建 `exam-maker/api/src/pipeline/tools.ts`（所有步骤共享的工具定义）：

```typescript
import type { ClaudeTool } from '../shared/types'

export const BASH_TOOL: ClaudeTool = {
  name: 'execute_bash',
  description: 'Execute a shell command in the session working directory. Use for pandoc, python, xelatex.',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to run' },
    },
    required: ['command'],
  },
}

export const READ_FILE_TOOL: ClaudeTool = {
  name: 'read_file',
  description: 'Read a file from the session build directory.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to build directory' },
    },
    required: ['path'],
  },
}

export const WRITE_FILE_TOOL: ClaudeTool = {
  name: 'write_file',
  description: 'Write content to a file in the session build directory.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to build directory' },
      content: { type: 'string', description: 'Content to write' },
    },
    required: ['path', 'content'],
  },
}

export const REQUEST_CONFIRM_TOOL: ClaudeTool = {
  name: 'request_confirmation',
  description: 'Pause and request teacher confirmation. Used at blueprint, template, and selection points.',
  input_schema: {
    type: 'object',
    properties: {
      point: { type: 'string', enum: ['blueprint', 'template', 'selection'] },
      summary: { type: 'string', description: 'Summary of what needs confirmation' },
      data: { type: 'object', description: 'Structured data for the confirmation UI' },
    },
    required: ['point', 'summary', 'data'],
  },
}

export const COMMON_TOOLS = [BASH_TOOL, READ_FILE_TOOL, WRITE_FILE_TOOL, REQUEST_CONFIRM_TOOL]
```

- [ ] **Step 2: 创建 step0-detect.ts（环境探测）**

```typescript
import type { PipelineContext, StepResult } from '../../shared/types'
import { COMMON_TOOLS } from '../tools'
import { execSync } from 'child_process'

export async function runStep0(ctx: PipelineContext): Promise<StepResult> {
  ctx.sendWs({ type: 'log', message: '🔍 探测环境...' })

  // Run detection locally (doesn't need Claude)
  const checks: string[] = []
  const tools = ['pandoc --version', 'python -c "import sympy"', 'xelatex --version']

  for (const cmd of tools) {
    try {
      execSync(cmd, { cwd: ctx.buildDir, timeout: 5000, stdio: 'pipe' })
      checks.push(`${cmd.split(' ')[0]} ✓`)
    } catch {
      checks.push(`${cmd.split(' ')[0]} ✗ (降级)`)
    }
  }

  const report = `环境探测结果:\n${checks.map((c) => `  · ${c}`).join('\n')}`

  await ctx.claudeClient.sendMessage({
    system: '记录环境探测结果，评估降级影响。',
    messages: [{ role: 'user', content: report }],
    tools: [],
    onToolUse: async () => '',
    onText: (text) => ctx.sendWs({ type: 'log', message: text }),
  })

  return { success: true, artifacts: [] }
}
```

- [ ] **Step 3: 创建 step1-parse.ts（真题→LaTeX）**

```typescript
import type { PipelineContext, StepResult } from '../../shared/types'
import { COMMON_TOOLS } from '../tools'
import fs from 'fs/promises'
import path from 'path'

export async function runStep1(ctx: PipelineContext): Promise<StepResult> {
  // List uploaded files in sessionDir
  const files = await fs.readdir(ctx.sessionDir)
  const papers = files.filter((f) => /\.(pdf|docx|doc|tex|md)$/i.test(f) && !f.startsWith('.'))

  if (papers.length === 0) {
    return { success: false, artifacts: [], error: 'No past papers found' }
  }

  const artifacts: Array<{ name: string; path: string }> = []

  for (const file of papers) {
    const ext = path.extname(file).toLowerCase()
    const outName = `source-${path.basename(file, ext)}.tex`
    const outPath = path.join(ctx.buildDir, outName)

    ctx.sendWs({ type: 'log', message: `📄 解析: ${file}` })

    const result = await ctx.claudeClient.sendMessage({
      system: getStep1SystemPrompt(ext),
      messages: [{
        role: 'user',
        content: `解析文件 ${path.join(ctx.sessionDir, file)}，产出 LaTeX 到 ${outPath}。对于 PDF，使用 Read 工具逐页识读并转写；对于 docx，使用 execute_bash 执行 pandoc 转换。`,
      }],
      tools: COMMON_TOOLS,
      maxTokens: 16384,
      onToolUse: async (name, input) => {
        if (name === 'execute_bash') {
          try {
            const { execSync } = require('child_process')
            const output = execSync(input.command as string, {
              cwd: ctx.buildDir, timeout: 30000, maxBuffer: 10 * 1024 * 1024, stdio: 'pipe',
            })
            return output.toString()
          } catch (e: any) {
            return `Error: ${e.message}\n${e.stderr?.toString() || ''}`
          }
        }
        if (name === 'write_file') {
          await fs.writeFile(
            path.join(ctx.buildDir, input.path as string),
            input.content as string,
            'utf-8',
          )
          return `Written: ${input.path}`
        }
        return 'OK'
      },
      onText: (text) => ctx.sendWs({ type: 'log', message: text }),
    })

    artifacts.push({ name: outName, path: outPath })
  }

  return { success: true, artifacts }
}

function getStep1SystemPrompt(ext: string): string {
  if (ext === '.pdf') {
    return '你是学科转写员。使用 Read 工具逐页识读 PDF，忠实转成 LaTeX。公式、表格、分值标注都要保留。模糊处标 % TODO 存疑。'
  }
  return `你是学科转写员。使用 execute_bash 工具执行 pandoc 将 ${ext} 转为 LaTeX，然后核对转换结果。`
}
```

- [ ] **Step 4: 创建 step2-blueprint.ts 和 step3-template.ts**

这两个步骤分别调用 Claude API 执行考点分析和模板提取，使用 `REQUEST_CONFIRM_TOOL` 触发确认点。

step2-blueprint.ts：
```typescript
import type { PipelineContext, StepResult } from '../../shared/types'
import { COMMON_TOOLS } from '../tools'
import fs from 'fs/promises'
import path from 'path'

const SYSTEM = `你是考点分析专家。依据真题 LaTeX 文件逐题判定考点、题型、分值、难度、认知层次，产出双向细目表。

产物：
1. blueprint.jsonl — 每题一行 JSON（src, no, type, points, kp, difficulty, cognition, stem_kind）
2. blueprint.md — 人读细目表（考点×难度分值矩阵 + 考点清单 + 频次）

完成后调用 request_confirmation 等待教师审核。`

export async function runStep2(ctx: PipelineContext): Promise<StepResult> {
  // ... Claude API call with analysis + verification sub-agent pattern
  // Implementation follows the analyzeAndVerify pattern from the design spec
  const result = await analyzeAndVerify(ctx, 'blueprint', SYSTEM)
  return result
}

// analyzeAndVerify: two-round Claude calls (analyze + verify)
async function analyzeAndVerify(
  ctx: PipelineContext,
  point: string,
  system: string,
): Promise<StepResult> {
  let confirmData: unknown = null

  // Round 1: Analysis
  await ctx.claudeClient.sendMessage({
    system,
    messages: [{
      role: 'user',
      content: '分析真题产物，产出分析结果。完成后调用 request_confirmation。',
    }],
    tools: COMMON_TOOLS,
    maxTokens: 16384,
    onToolUse: async (name, input) => {
      if (name === 'request_confirmation') {
        confirmData = input.data
        ctx.sendWs({ type: 'log', message: `⏸ 请求确认: ${input.summary}` })
        return 'CONFIRM_REQUESTED'
      }
      // Handle bash, read, write as in step1
      if (name === 'write_file') {
        await fs.writeFile(path.join(ctx.buildDir, input.path as string), input.content as string)
        return `Written: ${input.path}`
      }
      return 'OK'
    },
    onText: (text) => ctx.sendWs({ type: 'log', message: text }),
  })

  return { success: true, artifacts: [
    { name: 'blueprint.md', path: path.join(ctx.buildDir, 'blueprint.md') },
    { name: 'blueprint.jsonl', path: path.join(ctx.buildDir, 'blueprint.jsonl') },
  ], confirmData }
}
```

step3-template.ts 结构同上，system prompt 改为模板提取。

- [ ] **Step 5: 验证编译**

```bash
cd exam-maker/api && npx tsc --noEmit
```

- [ ] **Step 6: 提交**

---

### Task 7: 管道步骤（步骤 4-6）

**Files:**
- Create: `exam-maker/api/src/pipeline/steps/step4-difficulty.ts`
- Create: `exam-maker/api/src/pipeline/steps/step5-generate.ts`
- Create: `exam-maker/api/src/pipeline/steps/step6-compile.ts`

**Interfaces:**
- Consumes: 同上
- Produces: 难度配比核算、N 套命题生成、编译转换

- [ ] **Step 1-3: 创建 step4, step5, step6**

- step4-difficulty.ts：读取 template.md，按 DIFFICULTY 配比指派难度到每个题位，用 Python 脚本自检，产出难度核算表并入 template.md
- step5-generate.ts：调用命题子代理逐套生成试卷 tex 文件，核验子代理做 sympy/复核校验，更新 ledger.md
- step6-compile.ts：xelatex/pandoc 编译转换，转换核对子代理检查

每个步骤遵循相同模式：Claude API + tools + onToolUse 回调。详细实现遵循 SKILL.md 步骤描述和 references 手册。

- [ ] **Step 4: 验证编译 + 提交**

---

### Task 8: 子代理编排工具

**Files:**
- Create: `exam-maker/api/src/pipeline/sub-agent.ts`

**Interfaces:**
- Consumes: `ClaudeClient`, `ClaudeTool`
- Produces: `analyzeAndVerify(opts) → Promise<VerifyResult>` — 分析+核对双调用模式
- Produces: `runSubAgent(opts) → Promise<string>` — 单次子代理调用

- [ ] **Step 1: 创建 sub-agent.ts**

```typescript
import type { ClaudeClient, ClaudeTool } from '../shared/types'

interface SubAgentOpts {
  label: string
  system: string
  prompt: string
  tools: ClaudeTool[]
  client: ClaudeClient
  onLog: (msg: string) => void
  maxRetries?: number
}

export async function runSubAgent(opts: SubAgentOpts): Promise<string> {
  const { label, system, prompt, tools, client, onLog, maxRetries = 2 } = opts

  onLog(`🤖 子代理启动: ${label}`)

  let lastError = ''
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await client.sendMessage({
        system,
        messages: [{ role: 'user', content: prompt }],
        tools,
        maxTokens: 16384,
        onToolUse: async (name, input) => {
          if (name === 'execute_bash') {
            const { execSync } = require('child_process')
            try {
              return execSync(input.command as string, {
                timeout: 30000, maxBuffer: 5 * 1024 * 1024, stdio: 'pipe',
              }).toString()
            } catch (e: any) {
              return `ERROR: ${e.stderr?.toString() || e.message}`
            }
          }
          return `Tool ${name}: OK`
        },
        onText: (text) => onLog(text),
      })
      onLog(`✅ 子代理完成: ${label}`)
      return result
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      onLog(`⚠️ 子代理失败 (${attempt + 1}/${maxRetries + 1}): ${lastError}`)
    }
  }

  throw new Error(`子代理 ${label} 失败: ${lastError}`)
}

interface AnalyzeAndVerifyOpts {
  label: string
  analyzerSystem: string
  verifierSystem: string
  taskPrompt: string
  analyzerTools: ClaudeTool[]
  verifierTools: ClaudeTool[]
  client: ClaudeClient
  onLog: (msg: string) => void
  maxRounds?: number
}

export async function analyzeAndVerify(opts: AnalyzeAndVerifyOpts): Promise<string> {
  const { label, analyzerSystem, verifierSystem, taskPrompt, analyzerTools, verifierTools, client, onLog, maxRounds = 3 } = opts

  for (let round = 0; round < maxRounds; round++) {
    // Analysis round
    onLog(`🔬 分析轮 ${round + 1}: ${label}`)
    const analysis = await runSubAgent({
      label: `${label}-分析`,
      system: analyzerSystem,
      prompt: taskPrompt,
      tools: analyzerTools,
      client,
      onLog,
    })

    // Verification round
    onLog(`🔍 核验轮 ${round + 1}: ${label}`)
    const verification = await runSubAgent({
      label: `${label}-核对`,
      system: verifierSystem,
      prompt: `这是分析产物，请独立核对:\n\n${analysis}`,
      tools: verifierTools,
      client,
      onLog,
    })

    if (verification.includes('PASS') && !verification.includes('FAIL')) {
      onLog(`✅ 分析+核对通过: ${label}`)
      return analysis
    }

    onLog(`🔄 核验未通过，重新分析 (${round + 1}/${maxRounds})`)
  }

  throw new Error(`${label} 分析+核对: 达到最大轮次 ${maxRounds}`)
}
```

- [ ] **Step 2: 验证编译 + 提交**

---

### Task 9: API 路由（sessions, files）

**Files:**
- Create: `exam-maker/api/src/routes/sessions.ts`
- Create: `exam-maker/api/src/routes/files.ts`

**Interfaces:**
- Produces: `POST /api/sessions` — multipart 上传真题 + 创建会话
- Produces: `GET /api/sessions` — 列表
- Produces: `GET /api/sessions/:id` — 详情
- Produces: `GET /api/sessions/:id/files/:name` — 下载文件

- [ ] **Step 1: 创建 sessions.ts 路由**

```typescript
import type { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import fs from 'fs/promises'
import path from 'path'
import { createSession, listSessions, getSession, deleteSession } from '../session/store'
import type { SessionConfig } from '../../../shared/types/index'

export async function sessionRoutes(app: FastifyInstance) {
  await app.register(multipart)

  // CREATE
  app.post('/api/sessions', async (req, reply) => {
    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'No file uploaded' })

    // Parse config from form fields
    const configJson = (data.fields as any)?.config?.value || '{}'
    const config: SessionConfig = JSON.parse(configJson)

    // TODO: handle multiple files — for now single file
    // Save uploaded file to temp location, then move
    const session = await createSession(config, [data.filename])
    const destPath = path.join(session.workDir, data.filename)
    await fs.writeFile(destPath, await data.toBuffer())

    // Update file size
    const stat = await fs.stat(destPath)
    session.files[0].size = stat.size
    await require('../session/store').updateSession(session.id, { files: session.files })

    return reply.status(201).send({ id: session.id, session })
  })

  // LIST
  app.get('/api/sessions', async () => {
    const sessions = await listSessions()
    return sessions.map((s) => ({
      id: s.id,
      config: s.config,
      status: s.status,
      currentStep: s.currentStep,
      papers: s.papers.length,
      createdAt: s.createdAt,
    }))
  })

  // GET
  app.get('/api/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const session = await getSession(id)
    if (!session) return reply.status(404).send({ error: 'Session not found' })
    return session
  })

  // DELETE
  app.delete('/api/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    await deleteSession(id)
    return { ok: true }
  })
}
```

- [ ] **Step 2: 创建 files.ts 路由**

```typescript
import type { FastifyInstance } from 'fastify'
import fs from 'fs/promises'
import path from 'path'
import { getSession } from '../session/store'

export async function fileRoutes(app: FastifyInstance) {
  app.get('/api/sessions/:id/files/:filename', async (req, reply) => {
    const { id, filename } = req.params as { id: string; filename: string }
    const session = await getSession(id)
    if (!session) return reply.status(404).send({ error: 'Session not found' })

    // Check in workDir and buildDir
    let filePath = path.join(session.workDir, filename)
    try {
      await fs.access(filePath)
    } catch {
      filePath = path.join(session.buildDir, filename)
      try {
        await fs.access(filePath)
      } catch {
        return reply.status(404).send({ error: 'File not found' })
      }
    }

    return reply.type('application/octet-stream').send(await fs.readFile(filePath))
  })
}
```

- [ ] **Step 3: 验证编译 + 提交**

---

### Task 10: Pipeline + WebSocket 路由

**Files:**
- Create: `exam-maker/api/src/routes/pipeline.ts`
- Create: `exam-maker/api/src/routes/ws.ts`

**Interfaces:**
- Produces: `POST /api/sessions/:id/start` — 启动管道
- Produces: `POST /api/sessions/:id/confirm` — 确认点处理
- Produces: `POST /api/sessions/:id/cancel` — 取消
- Produces: `WS /ws/sessions/:id` — WebSocket 连接

- [ ] **Step 1: 创建 pipeline.ts**

```typescript
import type { FastifyInstance } from 'fastify'
import { orchestrator } from '../pipeline/orchestrator'
import { getSession } from '../session/store'

export async function pipelineRoutes(app: FastifyInstance) {
  app.post('/api/sessions/:id/start', async (req, reply) => {
    const { id } = req.params as { id: string }
    const session = await getSession(id)
    if (!session) return reply.status(404).send({ error: 'Session not found' })

    // Fire and forget — pipeline runs async
    orchestrator.start(id).catch((err) => {
      console.error(`Pipeline ${id} error:`, err)
    })

    return { ok: true, message: 'Pipeline started' }
  })

  app.post('/api/sessions/:id/confirm', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { action, point, feedback } = req.body as {
      action: 'approve' | 'reject' | 'modify'
      point: 'blueprint' | 'template' | 'selection'
      feedback?: string
    }

    await orchestrator.confirm(id, point, action, feedback)
    return { ok: true }
  })

  app.post('/api/sessions/:id/cancel', async (req, reply) => {
    const { id } = req.params as { id: string }
    await orchestrator.cancel(id)
    return { ok: true }
  })
}
```

- [ ] **Step 2: 创建 ws.ts**

```typescript
import type { FastifyInstance } from 'fastify'
import websocket from '@fastify/websocket'
import type { WebSocket } from 'ws'
import { orchestrator } from '../pipeline/orchestrator'
import { getSession } from '../session/store'

export async function wsRoutes(app: FastifyInstance) {
  await app.register(websocket)

  app.get('/ws/sessions/:id', { websocket: true }, async (socket, req) => {
    const { id } = (req.params as { id: string })

    // Verify session exists
    const session = await getSession(id)
    if (!session) {
      socket.close(4004, 'Session not found')
      return
    }

    // Subscribe to pipeline events
    const unsubscribe = orchestrator.subscribe(id, (msg) => {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(msg))
      }
    })

    // Send current state
    socket.send(JSON.stringify({
      type: 'step',
      step: session.currentStep,
      detail: session.stepDetail,
    }))

    socket.on('close', () => {
      unsubscribe()
    })
  })
}
```

- [ ] **Step 3: 更新 api/src/index.ts** — 注册所有路由 + 初始化 Claude client

```typescript
import { sessionRoutes } from './routes/sessions'
import { fileRoutes } from './routes/files'
import { pipelineRoutes } from './routes/pipeline'
import { wsRoutes } from './routes/ws'
import { orchestrator } from './pipeline/orchestrator'
import { createClaudeClient } from './pipeline/claude-client'

// ... after app creation ...

await app.register(sessionRoutes)
await app.register(fileRoutes)
await app.register(pipelineRoutes)
await app.register(wsRoutes)

// Initialize Claude client if API key is set
const API_KEY = process.env.ANTHROPIC_API_KEY
if (API_KEY) {
  orchestrator.setClaudeClient(createClaudeClient(API_KEY))
  console.log('Claude API client initialized')
} else {
  console.warn('ANTHROPIC_API_KEY not set — pipeline will fail at runtime')
}
```

- [ ] **Step 4: 验证编译 + 提交**

---

### Task 11: 前端 Dashboard 页面（`/`）

**Files:**
- Create: `exam-maker/web/src/routes/Dashboard.tsx`
- Create: `exam-maker/web/src/components/dashboard/ConfigForm.tsx`
- Create: `exam-maker/web/src/components/dashboard/FileUploader.tsx`
- Create: `exam-maker/web/src/components/dashboard/SessionList.tsx`

**Interfaces:**
- Consumes: API `/api/sessions` (list + create)
- Produces: Dashboard 页面 — 参数配置表单 + 真题上传 + 历史任务列表

- [ ] **Step 1: 创建 ConfigForm.tsx**

表单组件：课程名、范围（可选）、难度配比（预设 + 自定义滑块）、套数下拉、输出格式选择。使用受控组件 + Tailwind 样式。

- [ ] **Step 2: 创建 FileUploader.tsx**

拖拽上传区域：接受 PDF/docx 文件，显示已选文件列表，支持删除单个文件。使用 HTML5 drag & drop API。

- [ ] **Step 3: 创建 SessionList.tsx**

历史任务卡片列表：显示课程名、套数、状态徽章、创建时间。点击进入 SessionView。

- [ ] **Step 4: 创建 Dashboard.tsx 路由页面**

组合 ConfigForm + FileUploader + "开始命题"按钮 + SessionList。
"开始命题"按钮调用 `POST /api/sessions`（multipart form）创建会话 → 调用 `POST /api/sessions/:id/start` 启动管道 → 跳转到 `/session/:id`。

- [ ] **Step 5: 验证编译 + 提交**

---

### Task 12: 前端 SessionView 页面（`/session/:id`）

**Files:**
- Create: `exam-maker/web/src/routes/SessionView.tsx`
- Create: `exam-maker/web/src/components/session/ProgressBar.tsx`
- Create: `exam-maker/web/src/components/session/StepLog.tsx`
- Create: `exam-maker/web/src/components/session/ConfirmPanel.tsx`
- Create: `exam-maker/web/src/components/session/PaperSelector.tsx`

**Interfaces:**
- Consumes: `GET /api/sessions/:id`, `WS /ws/sessions/:id`, `POST /api/sessions/:id/confirm`
- Produces: 完整的命题进度查看 + 确认交互页面

- [ ] **Step 1: 创建 ProgressBar.tsx**

7 步进度条（步骤 0-6），高亮当前步骤，已完成步骤显示 ✓，确认点步骤显示 ⏸。

- [ ] **Step 2: 创建 StepLog.tsx**

实时日志流，从 WebSocket 接收 log/step/artifact 消息并追加显示。使用 `useEffect` + `useRef` 自动滚动到底部。

- [ ] **Step 3: 创建 ConfirmPanel.tsx**

确认点面板：
- blueprint 确认：渲染细目表（表格 + 难度饼图）
- template 确认：渲染模板结构表
- 按钮：确认 / 驳回（带修改意见输入框） / 直接修改

- [ ] **Step 4: 创建 PaperSelector.tsx**

选卷界面（步骤 6 后）：每套一行——考点覆盖、难度构成、验算结果、下载链接、勾选框。"下载选中" / "全部下载"按钮。

- [ ] **Step 5: 创建 SessionView.tsx 路由页面**

组合所有子组件，建立 WebSocket 连接（`useEffect` on mount, cleanup on unmount），根据 `session.status` 决定显示哪个确认面板。

- [ ] **Step 6: 验证编译 + 提交**

---

### Task 13: 前端路由 + Navbar 更新

**Files:**
- Modify: `exam-maker/web/src/App.tsx` — 添加 `/` 和 `/session/:id` 路由
- Modify: `exam-maker/web/src/components/layout/Navbar.tsx` — 添加"AI 命题"导航项

**Interfaces:**
- Produces: 完整路由表

- [ ] **Step 1: 更新 App.tsx**

添加路由：
```tsx
<Route path="/" element={<Dashboard />} />
<Route path="/session/:id" element={<SessionView />} />
```

- [ ] **Step 2: 更新 Navbar.tsx**

在现有项之前添加：
```tsx
{ to: '/', label: '🤖 AI 命题' }
```

- [ ] **Step 3: 验证编译 + dev server 测试 + 提交**

---

### Task 14: 集成测试 + 最终验证

**Files:** 无新增

- [ ] **Step 1: TypeScript 编译检查（前后端）**

```bash
cd exam-maker/web && npx tsc --noEmit
cd exam-maker/api && npx tsc --noEmit
```

- [ ] **Step 2: Web 生产构建**

```bash
cd exam-maker/web && npm run build
```

- [ ] **Step 3: API 启动测试**

```bash
cd exam-maker/api && npx tsx src/index.ts
# 验证: curl http://localhost:3001/api/health → {"status":"ok"}
```

- [ ] **Step 4: 端到端流程验证**

1. 启动 api + web dev server
2. 打开浏览器 Dashboard → 填写参数 + 上传真题 → 点击"开始命题"
3. 验证跳转到 SessionView + WebSocket 连接 + 进度条更新
4. 模拟 API key 场景或使用 mock Claude client 验证管道状态流转

- [ ] **Step 5: 提交最终修改**
