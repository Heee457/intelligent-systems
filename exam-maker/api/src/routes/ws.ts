import type { FastifyInstance } from 'fastify'
import websocket from '@fastify/websocket'
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
