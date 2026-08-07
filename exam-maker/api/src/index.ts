import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { sessionRoutes } from './routes/sessions'
import { fileRoutes } from './routes/files'
import { pipelineRoutes } from './routes/pipeline'
import { bankRoutes } from './routes/bank'
import { wsRoutes } from './routes/ws'
import { authRoutes } from './routes/auth'
import { orchestrator } from './pipeline/orchestrator'
import { createClaudeClient } from './pipeline/claude-client'
import { getDb } from './db/index'

const API_KEY = process.env.ANTHROPIC_API_KEY
if (!API_KEY) {
  console.warn('WARNING: ANTHROPIC_API_KEY not set. AI pipeline will not work.')
}

// Initialize database
getDb()
console.log('SQLite database initialized')

const app = Fastify({ logger: true })

await app.register(cors, { origin: 'http://localhost:5173' })

app.get('/api/health', async () => ({ status: 'ok' }))

// Register all route modules
await app.register(authRoutes)
await app.register(sessionRoutes)
await app.register(fileRoutes)
await app.register(pipelineRoutes)
await app.register(bankRoutes)
await app.register(wsRoutes)

// Initialize Claude client if API key is set
if (API_KEY) {
  orchestrator.setClaudeClient(createClaudeClient(API_KEY))
  console.log('Claude API client initialized')
} else {
  console.warn('ANTHROPIC_API_KEY not set — pipeline will fail at runtime')
}

try {
  await app.listen({ port: 3001, host: '0.0.0.0' })
  console.log('API server running on http://localhost:3001')
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
