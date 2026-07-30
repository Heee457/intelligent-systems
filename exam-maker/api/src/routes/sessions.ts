import type { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import fs from 'fs/promises'
import path from 'path'
import { createSession, listSessions, getSession, deleteSession, updateSession } from '../session/store'
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
    await updateSession(session.id, { files: session.files })

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
  app.delete('/api/sessions/:id', async (req, _reply) => {
    const { id } = req.params as { id: string }
    await deleteSession(id)
    return { ok: true }
  })
}
