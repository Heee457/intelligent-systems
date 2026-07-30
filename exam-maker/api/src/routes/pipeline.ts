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

  app.post('/api/sessions/:id/confirm', async (req, _reply) => {
    const { id } = req.params as { id: string }
    const { action, point, feedback } = req.body as {
      action: 'approve' | 'reject' | 'modify'
      point: 'blueprint' | 'template' | 'selection'
      feedback?: string
    }

    await orchestrator.confirm(id, point, action, feedback)
    return { ok: true }
  })

  app.post('/api/sessions/:id/cancel', async (req, _reply) => {
    const { id } = req.params as { id: string }
    await orchestrator.cancel(id)
    return { ok: true }
  })
}
