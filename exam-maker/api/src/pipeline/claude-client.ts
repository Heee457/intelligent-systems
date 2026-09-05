import Anthropic from '@anthropic-ai/sdk'
import type { ClaudeClient, ClaudeTool } from '../shared/types'

interface SendOpts {
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  tools: ClaudeTool[]
  onToolUse: (name: string, input: Record<string, unknown>) => Promise<string>
  onText: (text: string) => void
  maxTokens?: number
  model?: string
}

export function createClaudeClient(apiKey: string): ClaudeClient {
  const anthropic = new Anthropic({ apiKey })

  return {
    sendMessage: async (opts: SendOpts): Promise<string> => {
      const { system, tools, onToolUse, onText, maxTokens = 8192, model = 'claude-sonnet-5' } = opts

      // Build Anthropic tool definitions
      const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: { type: 'object', ...t.input_schema } as Anthropic.Tool.InputSchema,
      }))

      // Build messages
      const messages: Anthropic.MessageParam[] = opts.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

      let output = ''
      let done = false

      while (!done) {
        const response = await anthropic.messages.create({
          model,
          max_tokens: maxTokens,
          system,
          tools: anthropicTools,
          messages,
        })

        // Process content blocks
        const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

        for (const block of response.content) {
          if (block.type === 'text') {
            output += block.text
            onText(block.text)
          }
          if (block.type === 'tool_use') {
            toolUses.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> })
          }
        }

        if (toolUses.length === 0) {
          done = true
          break
        }

        // Process tool calls
        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const tu of toolUses) {
          const result = await onToolUse(tu.name, tu.input)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: result,
          })
        }

        // Add assistant response + tool results to messages
        messages.push({ role: 'assistant', content: response.content })
        messages.push({ role: 'user', content: toolResults })
      }

      return output
    },
  }
}
