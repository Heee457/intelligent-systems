import type { SessionStatus, WsMessage } from '../../../shared/types/index'
import type { PipelineContext, StepResult, ClaudeClient } from '../shared/types'
import { updateSession, getSession } from '../session/store'
import { runStep0 } from './steps/step0-detect'
import { runStep1 } from './steps/step1-parse'
import { runStep2 } from './steps/step2-blueprint'
import { runStep3 } from './steps/step3-template'
import { runStep4 } from './steps/step4-difficulty'
import { runStep5 } from './steps/step5-generate'
import { runStep6 } from './steps/step6-compile'

const STEP_RUNNERS: Record<number, (ctx: PipelineContext) => Promise<StepResult>> = {
  0: runStep0,
  1: runStep1,
  2: runStep2,
  3: runStep3,
  4: runStep4,
  5: runStep5,
  6: runStep6,
}

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

  async start(sessionId: string, resumeFromStep: number = 0): Promise<void> {
    const session = await getSession(sessionId)
    if (!session) throw new Error('Session not found')
    if (!this.claudeClient) throw new Error('Claude client not configured')

    this.active.set(sessionId, true)

    const ctx: PipelineContext = {
      sessionDir: session.workDir,
      buildDir: session.buildDir,
      sendWs: (msg) => this.broadcast(sessionId, msg),
      claudeClient: this.claudeClient!,
    }

    const stepsToRun = STEPS.slice(resumeFromStep)
    for (const step of stepsToRun) {
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
          const current = (await getSession(sessionId))!
          const newFiles = result.artifacts.map((a) => ({
            name: a.name,
            path: a.path,
            size: 0,
            createdAt: Date.now(),
          }))
          await updateSession(sessionId, {
            files: [...current.files, ...newFiles],
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
    const finalSession = await getSession(sessionId)
    this.broadcast(sessionId, { type: 'complete', session: finalSession! })
    this.active.delete(sessionId)
  }

  private async runStep(
    step: StepDefinition,
    ctx: PipelineContext,
  ): Promise<StepResult> {
    const runner = STEP_RUNNERS[step.index]
    if (!runner) {
      return { success: false, artifacts: [], error: `No runner for step ${step.index}` }
    }
    return runner(ctx)
  }

  async confirm(
    sessionId: string,
    _point: 'blueprint' | 'template' | 'selection',
    action: 'approve' | 'reject' | 'modify',
    feedback?: string,
  ): Promise<void> {
    const session = await getSession(sessionId)
    if (!session) throw new Error('Session not found')

    if (action === 'approve') {
      // Continue from next step
      await updateSession(sessionId, { status: 'RUNNING' })
      const nextStep = session.currentStep + 1
      await this.start(sessionId, nextStep)
    } else if (action === 'reject' || action === 'modify') {
      // Re-run current step from the beginning
      await updateSession(sessionId, { status: 'RUNNING', stepDetail: `根据反馈重新执行: ${feedback || ''}` })
      await this.start(sessionId, session.currentStep)
    }
  }

  async cancel(sessionId: string): Promise<void> {
    this.active.set(sessionId, false)
    await updateSession(sessionId, { status: 'CANCELLED', stepDetail: '用户取消' })
  }
}

// Singleton
export const orchestrator = new PipelineOrchestrator()
