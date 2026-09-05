import type { FastifyInstance, FastifyRequest } from 'fastify'
import { getSession } from '../session/store'
import { extractQuestionsFromBuildDir } from '../pipeline/bank-converter'
import { importGeneratedQuestions } from '../pipeline/bank-importer'
import { requireAuth, requireRole } from '../middleware/auth'

type AuthRequest = FastifyRequest & { user: NonNullable<FastifyRequest['user']> }

export async function bankRoutes(app: FastifyInstance) {
  const auth = { preHandler: [requireAuth, requireRole('teacher')] }

  app.get('/api/sessions/:id/bank-questions', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const session = await getSession(id)
    const userId = (req as AuthRequest).user.userId
    if (!session || session.teacherId !== userId) {
      return reply.status(404).send({ error: 'Session not found' })
    }

    const result = await extractQuestionsFromBuildDir(session.buildDir)

    return {
      sessionId: id,
      count: result.questions.length,
      source: result.source,
      questions: result.questions,
    }
  })

  app.post('/api/sessions/:id/bank-questions/import', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const session = await getSession(id)
    const userId = (req as AuthRequest).user.userId
    if (!session || session.teacherId !== userId) {
      return reply.status(404).send({ error: 'Session not found' })
    }

    return importGeneratedQuestions(session.buildDir, userId)
  })
}
