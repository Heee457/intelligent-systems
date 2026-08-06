import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DATA_ROOT = process.env.EXAM_DATA_ROOT || '/data/exams'
const DB_PATH = path.join(DATA_ROOT, 'exam-maker.db')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(DATA_ROOT, { recursive: true })
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
  }
  return db
}

export function initDatabase(): Database.Database {
  return getDb()
}

function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      email       TEXT NOT NULL UNIQUE,
      password    TEXT NOT NULL,
      name        TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'student',
      avatar_url  TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
  `)
}
