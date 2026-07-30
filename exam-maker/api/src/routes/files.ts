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
