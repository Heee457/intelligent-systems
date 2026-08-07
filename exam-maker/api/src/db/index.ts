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
      variant     TEXT,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id            TEXT PRIMARY KEY,
      publish_id    TEXT NOT NULL REFERENCES exam_publish(id),
      student_id    TEXT NOT NULL REFERENCES users(id),
      status        TEXT DEFAULT 'started',
      answers       TEXT,
      total_score   REAL,
      total_points  REAL,
      violations    INTEGER DEFAULT 0,
      started_at    INTEGER NOT NULL,
      submitted_at  INTEGER,
      graded_at     INTEGER,
      grader_id     TEXT REFERENCES users(id),
      grade_notes   TEXT
    );

    CREATE TABLE IF NOT EXISTS submission_answers (
      id              TEXT PRIMARY KEY,
      submission_id   TEXT NOT NULL REFERENCES submissions(id),
      question_id     TEXT NOT NULL,
      question_order  INTEGER NOT NULL,
      answer          TEXT,
      score           REAL,
      max_score       REAL,
      is_correct      INTEGER,
      graded_by       TEXT DEFAULT 'auto'
    );

    CREATE TABLE IF NOT EXISTS exam_stats (
      publish_id     TEXT PRIMARY KEY REFERENCES exam_publish(id),
      student_count  INTEGER NOT NULL,
      avg_score      REAL,
      median_score   REAL,
      max_score      REAL,
      min_score      REAL,
      pass_count     INTEGER,
      pass_rate      REAL,
      score_dist     TEXT,
      computed_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS question_stats (
      publish_id      TEXT NOT NULL REFERENCES exam_publish(id),
      question_id     TEXT NOT NULL,
      correct_count   INTEGER DEFAULT 0,
      wrong_count     INTEGER DEFAULT 0,
      blank_count     INTEGER DEFAULT 0,
      correct_rate    REAL,
      discrimination  REAL,
      PRIMARY KEY (publish_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS exam_variant_assign (
      publish_id  TEXT NOT NULL REFERENCES exam_publish(id),
      student_id  TEXT NOT NULL REFERENCES users(id),
      variant     TEXT NOT NULL,
      PRIMARY KEY (publish_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS makeup_exams (
      id                 TEXT PRIMARY KEY,
      original_publish_id TEXT NOT NULL REFERENCES exam_publish(id),
      student_id         TEXT NOT NULL REFERENCES users(id),
      publish_id         TEXT REFERENCES exam_publish(id),
      reason             TEXT,
      status             TEXT DEFAULT 'pending',
      created_at         INTEGER NOT NULL
    );
  `)

  // Migration: add `variant` column to exam_publish for pre-existing databases
  // (CREATE TABLE IF NOT EXISTS does not alter existing tables)
  const publishCols = db.prepare('PRAGMA table_info(exam_publish)').all() as { name: string }[]
  if (!publishCols.some((c) => c.name === 'variant')) {
    db.exec('ALTER TABLE exam_publish ADD COLUMN variant TEXT')
  }
}
