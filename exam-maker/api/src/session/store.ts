import fs from 'fs/promises'
import path from 'path'
import type { Session, SessionConfig } from '../../../shared/types/index'
import { generateId } from '../utils/id'

const DATA_ROOT = process.env.EXAM_DATA_ROOT || '/data/exams'

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

function sessionDir(id: string) {
  return path.join(DATA_ROOT, `session-${id}`)
}

function sessionPath(id: string) {
  return path.join(sessionDir(id), 'session.json')
}

export async function createSession(
  config: SessionConfig,
  filenames: string[],
  teacherId: string,
): Promise<Session> {
  const id = generateId()
  const now = Date.now()
  const dir = sessionDir(id)
  await ensureDir(path.join(dir, 'exam-build'))

  const session: Session = {
    id,
    teacherId,
    workDir: dir,
    buildDir: path.join(dir, 'exam-build'),
    config,
    status: 'CREATED',
    currentStep: -1,
    stepDetail: '等待启动',
    files: filenames.map((name) => ({
      name,
      path: path.join(dir, name),
      size: 0,
      createdAt: now,
    })),
    papers: [],
    createdAt: now,
    updatedAt: now,
  }

  await fs.writeFile(sessionPath(id), JSON.stringify(session, null, 2))
  return session
}

export async function getSession(id: string): Promise<Session | undefined> {
  try {
    const raw = await fs.readFile(sessionPath(id), 'utf-8')
    return JSON.parse(raw) as Session
  } catch {
    return undefined
  }
}

export async function listSessions(teacherId?: string): Promise<Session[]> {
  await ensureDir(DATA_ROOT)
  const entries = await fs.readdir(DATA_ROOT, { withFileTypes: true })
  const sessions: Session[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('session-')) continue
    const s = await getSession(entry.name.replace('session-', ''))
    if (!s) continue
    // Backward compat: sessions without teacherId are visible to all
    if (teacherId && s.teacherId && s.teacherId !== teacherId) continue
    sessions.push(s)
  }
  sessions.sort((a, b) => b.createdAt - a.createdAt)
  return sessions
}

export async function updateSession(
  id: string,
  patch: Partial<Session>,
): Promise<Session | undefined> {
  const session = await getSession(id)
  if (!session) return undefined
  const updated: Session = {
    ...session,
    ...patch,
    updatedAt: Date.now(),
    id: session.id, // 不可覆盖
    createdAt: session.createdAt,
  }
  await fs.writeFile(sessionPath(id), JSON.stringify(updated, null, 2))
  return updated
}

export async function deleteSession(id: string): Promise<boolean> {
  try {
    await fs.rm(sessionDir(id), { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}
