import type { FastifyInstance } from 'fastify'
import { getSession } from '../session/store'
import { convertBlueprintToQuestions, extractQuestionsFromPapers } from '../pipeline/bank-converter'

export async function bankRoutes(app: FastifyInstance) {
  app.get('/api/sessions/:id/bank-questions', async (req, reply) => {
    const { id } = req.params as { id: string }
    const session = await getSession(id)
    if (!session) return reply.status(404).send({ error: 'Session not found' })

    // Prefer blueprint.jsonl conversion (structured metadata)
    let questions = await convertBlueprintToQuestions(session.buildDir)

    // Fall back to paper parsing if blueprint yields nothing
    const source = questions.length > 0 ? 'blueprint' : 'paper'
    if (questions.length === 0) {
      questions = await extractQuestionsFromPapers(session.buildDir)
    }

    return {
      sessionId: id,
      count: questions.length,
      source,
      questions,
    }
  })
}
