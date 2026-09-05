import { beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import { createSession, listSessions } from './store'
import type { SessionConfig } from '../../../shared/types/index'

function config(course: string): SessionConfig {
  return {
    course,
    scope: 'unit test',
    difficulty: '基础60% 中等30% 难10%',
    nSets: 1,
    outputFormat: 'latex',
    verifyMode: 'auto',
  }
}

async function createLegacySession() {
  const session = await createSession(config('Legacy'), ['legacy.pdf'], 'legacy-teacher')
  const sessionFile = path.join(session.workDir, 'session.json')
  const raw = JSON.parse(await fs.readFile(sessionFile, 'utf8')) as Record<string, unknown>
  delete raw.teacherId
  await fs.writeFile(sessionFile, JSON.stringify(raw, null, 2))
  return session
}

describe('session ownership', () => {
  beforeEach(async () => {
    await fs.rm(process.env.EXAM_DATA_ROOT!, { recursive: true, force: true })
  })

  it('lists only sessions owned by the requested teacher', async () => {
    const mine = await createSession(config('Mine'), ['mine.pdf'], 'teacher-a')
    await createSession(config('Other'), ['other.pdf'], 'teacher-b')
    await createLegacySession()

    const sessions = await listSessions('teacher-a')

    expect(sessions.map((session) => session.id)).toEqual([mine.id])
    expect(sessions[0].config.course).toBe('Mine')
  })
})
