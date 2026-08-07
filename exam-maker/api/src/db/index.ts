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

    CREATE TABLE IF NOT EXISTS questions (
      id              TEXT PRIMARY KEY,
      teacher_id      TEXT NOT NULL REFERENCES users(id),
      type            TEXT NOT NULL,
      title           TEXT NOT NULL,
      content         TEXT NOT NULL,
      options         TEXT,
      answer          TEXT NOT NULL,
      difficulty      TEXT NOT NULL DEFAULT 'medium',
      knowledge_points TEXT,
      explanation     TEXT,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exams (
      id          TEXT PRIMARY KEY,
      teacher_id  TEXT NOT NULL REFERENCES users(id),
      title       TEXT NOT NULL,
      questions   TEXT NOT NULL,
      total_score REAL NOT NULL,
      status      TEXT DEFAULT 'draft',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS classes (
      id          TEXT PRIMARY KEY,
      teacher_id  TEXT NOT NULL REFERENCES users(id),
      name        TEXT NOT NULL,
      description TEXT,
      join_code   TEXT NOT NULL UNIQUE,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS class_students (
      class_id    TEXT NOT NULL REFERENCES classes(id),
      student_id  TEXT NOT NULL REFERENCES users(id),
      joined_at   INTEGER NOT NULL,
      PRIMARY KEY (class_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS exam_publish (
      id          TEXT PRIMARY KEY,
      exam_id     TEXT NOT NULL,
      teacher_id  TEXT NOT NULL REFERENCES users(id),
      class_id    TEXT REFERENCES classes(id),
      title       TEXT NOT NULL,
      duration    INTEGER NOT NULL,
      start_time  INTEGER,
      end_time    INTEGER,
      shuffle     INTEGER DEFAULT 0,
      retry       INTEGER DEFAULT 0,
      status      TEXT DEFAULT 'draft',
      created_at  INTEGER NOT NULL
    );
  `)
}
