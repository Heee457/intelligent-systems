import Fastify from 'fastify'
import cors from '@fastify/cors'

const API_KEY = process.env.ANTHROPIC_API_KEY
if (!API_KEY) {
  console.warn('WARNING: ANTHROPIC_API_KEY not set. AI pipeline will not work.')
}

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
