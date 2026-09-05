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

function createUniqueIndexIfNoDuplicates(
  db: Database.Database,
  table: 'users',
  column: 'email' | 'name',
  indexName: string,
  label: string,
) {
  const duplicate = db.prepare(`
    SELECT ${column} AS value, COUNT(*) AS count
    FROM ${table}
    WHERE ${column} IS NOT NULL AND TRIM(${column}) <> ''
    GROUP BY ${column}
    HAVING COUNT(*) > 1
    LIMIT 1
  `).get() as { value: string; count: number } | undefined

  if (duplicate) {
    console.warn(`[exam-maker] ${label}存在重复值“${duplicate.value}”，唯一索引暂未创建，请先人工处理旧数据。`)
    return
  }

  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${indexName} ON ${table}(${column})`)
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
      quality_issues  TEXT,
      quality_checked_at INTEGER,
      difficulty_suggestion TEXT,
      difficulty_suggestion_reason TEXT,
      is_key_question INTEGER DEFAULT 0,
      is_error_prone INTEGER DEFAULT 0,
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
      source      TEXT DEFAULT 'manual',
      session_id  TEXT,
      paper_index INTEGER,
      is_recommended INTEGER DEFAULT 0,
      scope       TEXT,
      knowledge_points TEXT,
      version_group_id TEXT,
      version_number INTEGER DEFAULT 1,
      parent_exam_id TEXT,
      locked_at INTEGER,
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
      allow_late_submit INTEGER DEFAULT 0,
      score_release_time INTEGER,
      answer_release_time INTEGER,
      anti_cheat_level TEXT DEFAULT 'record',
      max_violations INTEGER DEFAULT 3,
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
      submitted_late INTEGER DEFAULT 0,
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
      graded_by       TEXT DEFAULT 'auto',
      teacher_notes   TEXT,
      ai_score        REAL,
      ai_feedback     TEXT,
      ai_confidence   REAL
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

    CREATE TABLE IF NOT EXISTS exam_events (
      id            TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id),
      publish_id    TEXT NOT NULL REFERENCES exam_publish(id),
      student_id    TEXT NOT NULL REFERENCES users(id),
      type          TEXT NOT NULL,
      detail        TEXT,
      created_at    INTEGER NOT NULL
    );
  `)

  createUniqueIndexIfNoDuplicates(db, 'users', 'email', 'idx_users_email_unique', '用户邮箱')
  createUniqueIndexIfNoDuplicates(db, 'users', 'name', 'idx_users_name_unique', '用户名')

  // Migration: add metadata columns to exams for AI-synced and smart-generated papers.
  const examCols = db.prepare('PRAGMA table_info(exams)').all() as { name: string }[]
  const examColNames = new Set(examCols.map((c) => c.name))
  const examColumns: Array<[string, string]> = [
    ['source', "TEXT DEFAULT 'manual'"],
    ['session_id', 'TEXT'],
    ['paper_index', 'INTEGER'],
    ['is_recommended', 'INTEGER DEFAULT 0'],
    ['scope', 'TEXT'],
    ['knowledge_points', 'TEXT'],
    ['version_group_id', 'TEXT'],
    ['version_number', 'INTEGER DEFAULT 1'],
    ['parent_exam_id', 'TEXT'],
    ['locked_at', 'INTEGER'],
  ]
  for (const [name, definition] of examColumns) {
    if (!examColNames.has(name)) {
      db.exec('ALTER TABLE exams ADD COLUMN ' + name + ' ' + definition)
    }
  }
  db.prepare('UPDATE exams SET version_group_id = id WHERE version_group_id IS NULL OR version_group_id = ?').run('')
  db.prepare('UPDATE exams SET version_number = 1 WHERE version_number IS NULL OR version_number <= 0').run()

  const questionCols = db.prepare('PRAGMA table_info(questions)').all() as { name: string }[]
  const questionColNames = new Set(questionCols.map((c) => c.name))
  const questionColumns: Array<[string, string]> = [
    ['quality_issues', 'TEXT'],
    ['quality_checked_at', 'INTEGER'],
    ['difficulty_suggestion', 'TEXT'],
    ['difficulty_suggestion_reason', 'TEXT'],
    ['is_key_question', 'INTEGER DEFAULT 0'],
    ['is_error_prone', 'INTEGER DEFAULT 0'],
  ]
  for (const [name, definition] of questionColumns) {
    if (!questionColNames.has(name)) {
      db.exec('ALTER TABLE questions ADD COLUMN ' + name + ' ' + definition)
    }
  }

  // Migration: add `variant` column to exam_publish for pre-existing databases
  // (CREATE TABLE IF NOT EXISTS does not alter existing tables)
  const publishCols = db.prepare('PRAGMA table_info(exam_publish)').all() as { name: string }[]
  const publishColNames = new Set(publishCols.map((c) => c.name))
  const publishColumns: Array<[string, string]> = [
    ['variant', 'TEXT'],
    ['allow_late_submit', 'INTEGER DEFAULT 0'],
    ['score_release_time', 'INTEGER'],
    ['answer_release_time', 'INTEGER'],
    ['anti_cheat_level', "TEXT DEFAULT 'record'"],
    ['max_violations', 'INTEGER DEFAULT 3'],
  ]
  for (const [name, definition] of publishColumns) {
    if (!publishColNames.has(name)) {
      db.exec('ALTER TABLE exam_publish ADD COLUMN ' + name + ' ' + definition)
    }
  }

  const submissionCols = db.prepare('PRAGMA table_info(submissions)').all() as { name: string }[]
  const submissionColNames = new Set(submissionCols.map((c) => c.name))
  if (!submissionColNames.has('submitted_late')) {
    db.exec('ALTER TABLE submissions ADD COLUMN submitted_late INTEGER DEFAULT 0')
  }

  const answerCols = db.prepare('PRAGMA table_info(submission_answers)').all() as { name: string }[]
  const answerColNames = new Set(answerCols.map((c) => c.name))
  const answerColumns: Array<[string, string]> = [
    ['teacher_notes', 'TEXT'],
    ['ai_score', 'REAL'],
    ['ai_feedback', 'TEXT'],
    ['ai_confidence', 'REAL'],
  ]
  for (const [name, definition] of answerColumns) {
    if (!answerColNames.has(name)) {
      db.exec('ALTER TABLE submission_answers ADD COLUMN ' + name + ' ' + definition)
    }
  }
}
