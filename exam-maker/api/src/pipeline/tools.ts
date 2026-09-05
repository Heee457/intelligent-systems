import type { ClaudeTool } from '../shared/types'

export const BASH_TOOL: ClaudeTool = {
  name: 'execute_bash',
  description: 'Execute a shell command in the session working directory. Use for pandoc, python, xelatex.',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to run' },
    },
    required: ['command'],
  },
}

export const READ_FILE_TOOL: ClaudeTool = {
  name: 'read_file',
  description: 'Read a file from the session build directory.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to build directory' },
    },
    required: ['path'],
  },
}

export const WRITE_FILE_TOOL: ClaudeTool = {
  name: 'write_file',
  description: 'Write content to a file in the session build directory.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to build directory' },
      content: { type: 'string', description: 'Content to write' },
    },
    required: ['path', 'content'],
  },
}

export const REQUEST_CONFIRM_TOOL: ClaudeTool = {
  name: 'request_confirmation',
  description: 'Pause and request teacher confirmation. Used at blueprint, template, and selection points.',
  input_schema: {
    type: 'object',
    properties: {
      point: { type: 'string', enum: ['blueprint', 'template', 'selection'] },
      summary: { type: 'string', description: 'Summary of what needs confirmation' },
      data: { type: 'object', description: 'Structured data for the confirmation UI' },
    },
    required: ['point', 'summary', 'data'],
  },
}

export const COMMON_TOOLS = [BASH_TOOL, READ_FILE_TOOL, WRITE_FILE_TOOL, REQUEST_CONFIRM_TOOL]

import path from 'path'
import fs from 'fs/promises'

/** Resolve a file path that might be absolute or relative to buildDir */
export function resolvePath(buildDir: string, filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath
  return path.join(buildDir, filePath)
}

/** Standard handler for read_file tool */
export async function handleReadFile(buildDir: string, filePath: string): Promise<string> {
  const resolved = resolvePath(buildDir, filePath)
  try {
    return await fs.readFile(resolved, 'utf-8')
  } catch (e: any) {
    return `Error reading ${resolved}: ${e.message}`
  }
}

/** Standard handler for write_file tool */
export async function handleWriteFile(buildDir: string, filePath: string, content: string): Promise<string> {
  const resolved = resolvePath(buildDir, filePath)
  await fs.mkdir(path.dirname(resolved), { recursive: true })
  await fs.writeFile(resolved, content, 'utf-8')
  return `Written: ${resolved}`
}
