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
