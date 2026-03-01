/**
 * Database Tests
 * Tests database operations and data persistence
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

const TEST_DB_PATH = join(projectRoot, 'data', 'test-moneyhero.db')

describe('Database Tests', () => {
  let db

  before(() => {
    // Create test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH)
    }
    db = new Database(TEST_DB_PATH)
  })

  after(() => {
    db.close()
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH)
    }
  })

  describe('Schema Tests', () => {
    it('should create sessions table', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      const sessionTable = tables.find(t => t.name === 'sessions')
      assert.ok(sessionTable, 'Sessions table should exist')
    })

    it('should create messages table with foreign key', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES sessions(id)
        )
      `)

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      const messageTable = tables.find(t => t.name === 'messages')
      assert.ok(messageTable, 'Messages table should exist')
    })

    it('should create escalations table', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS escalations (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          ticket_id TEXT NOT NULL UNIQUE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES sessions(id)
        )
      `)

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      const escalationTable = tables.find(t => t.name === 'escalations')
      assert.ok(escalationTable, 'Escalations table should exist')
    })

    it('should create qa_analytics table', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS qa_analytics (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          question TEXT NOT NULL,
          answer TEXT NOT NULL,
          intent TEXT NOT NULL,
          sources TEXT,
          retrieval_count INTEGER,
          response_time_ms INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES sessions(id)
        )
      `)

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      const analyticsTable = tables.find(t => t.name === 'qa_analytics')
      assert.ok(analyticsTable, 'QA Analytics table should exist')
    })

    it('should create quality_metrics table', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS quality_metrics (
          id TEXT PRIMARY KEY,
          interaction_id TEXT NOT NULL,
          response_length INTEGER,
          source_count INTEGER,
          retrieval_score_avg REAL,
          contains_disclaimer BOOLEAN,
          contains_product_names BOOLEAN,
          intent_confidence REAL,
          validation_passed BOOLEAN,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (interaction_id) REFERENCES qa_analytics(id)
        )
      `)

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      const metricsTable = tables.find(t => t.name === 'quality_metrics')
      assert.ok(metricsTable, 'Quality Metrics table should exist')
    })

    it('should create feedback table', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS feedback (
          id TEXT PRIMARY KEY,
          interaction_id TEXT NOT NULL,
          rating INTEGER CHECK(rating BETWEEN 1 AND 5),
          comment TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (interaction_id) REFERENCES qa_analytics(id)
        )
      `)

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      const feedbackTable = tables.find(t => t.name === 'feedback')
      assert.ok(feedbackTable, 'Feedback table should exist')
    })
  })

  describe('Data Operations', () => {
    it('should insert and retrieve session', () => {
      const sessionId = 'test-session-123'
      db.prepare('INSERT INTO sessions (id) VALUES (?)').run(sessionId)

      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
      assert.equal(session.id, sessionId)
      assert.ok(session.created_at)
    })

    it('should insert and retrieve messages', () => {
      const sessionId = 'test-session-messages'
      db.prepare('INSERT INTO sessions (id) VALUES (?)').run(sessionId)

      const messageId = 'msg-001'
      db.prepare('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)').run(
        messageId,
        sessionId,
        'user',
        'Test message'
      )

      const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId)
      assert.equal(message.id, messageId)
      assert.equal(message.session_id, sessionId)
      assert.equal(message.role, 'user')
      assert.equal(message.content, 'Test message')
    })

    it('should enforce role constraint on messages', () => {
      const sessionId = 'test-session-constraint'
      db.prepare('INSERT INTO sessions (id) VALUES (?)').run(sessionId)

      assert.throws(() => {
        db.prepare('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)').run(
          'msg-invalid',
          sessionId,
          'invalid_role',
          'Test'
        )
      }, /CHECK constraint failed/)
    })

    it('should insert escalation with unique ticket ID', () => {
      const sessionId = 'test-session-escalation'
      db.prepare('INSERT INTO sessions (id) VALUES (?)').run(sessionId)

      const escalationId = 'esc-001'
      const ticketId = 'TKT-20260301-001'

      db.prepare(
        'INSERT INTO escalations (id, session_id, reason, ticket_id) VALUES (?, ?, ?, ?)'
      ).run(escalationId, sessionId, 'Test reason', ticketId)

      const escalation = db.prepare('SELECT * FROM escalations WHERE id = ?').get(escalationId)
      assert.equal(escalation.ticket_id, ticketId)

      // Should reject duplicate ticket ID
      assert.throws(() => {
        db.prepare(
          'INSERT INTO escalations (id, session_id, reason, ticket_id) VALUES (?, ?, ?, ?)'
        ).run('esc-002', sessionId, 'Another reason', ticketId)
      }, /UNIQUE constraint failed/)
    })

    it('should insert analytics data', () => {
      const sessionId = 'test-session-analytics'
      db.prepare('INSERT INTO sessions (id) VALUES (?)').run(sessionId)

      const analyticsId = 'analytics-001'
      db.prepare(
        'INSERT INTO qa_analytics (id, session_id, question, answer, intent, response_time_ms) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(analyticsId, sessionId, 'Test question', 'Test answer', 'answer', 1500)

      const analytics = db.prepare('SELECT * FROM qa_analytics WHERE id = ?').get(analyticsId)
      assert.equal(analytics.question, 'Test question')
      assert.equal(analytics.intent, 'answer')
      assert.equal(analytics.response_time_ms, 1500)
    })

    it('should insert quality metrics linked to interaction', () => {
      const sessionId = 'test-session-metrics'
      db.prepare('INSERT INTO sessions (id) VALUES (?)').run(sessionId)

      const interactionId = 'int-001'
      db.prepare(
        'INSERT INTO qa_analytics (id, session_id, question, answer, intent) VALUES (?, ?, ?, ?, ?)'
      ).run(interactionId, sessionId, 'Q', 'A', 'answer')

      const metricId = 'metric-001'
      db.prepare(
        'INSERT INTO quality_metrics (id, interaction_id, response_length, source_count, contains_disclaimer, validation_passed) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(metricId, interactionId, 1200, 3, 1, 1)

      const metric = db.prepare('SELECT * FROM quality_metrics WHERE id = ?').get(metricId)
      assert.equal(metric.response_length, 1200)
      assert.equal(metric.source_count, 3)
      assert.equal(metric.contains_disclaimer, 1)
      assert.equal(metric.validation_passed, 1)
    })

    it('should retrieve messages in chronological order', () => {
      const sessionId = 'test-session-order'
      db.prepare('INSERT INTO sessions (id) VALUES (?)').run(sessionId)

      // Insert messages with slight delays
      db.prepare('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)').run(
        'msg-1',
        sessionId,
        'user',
        'First'
      )
      db.prepare('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)').run(
        'msg-2',
        sessionId,
        'assistant',
        'Second'
      )
      db.prepare('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)').run(
        'msg-3',
        sessionId,
        'user',
        'Third'
      )

      const messages = db
        .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC')
        .all(sessionId)

      assert.equal(messages.length, 3)
      assert.equal(messages[0].content, 'First')
      assert.equal(messages[1].content, 'Second')
      assert.equal(messages[2].content, 'Third')
    })
  })

  describe('Foreign Key Constraints', () => {
    it('should enforce foreign key on messages', () => {
      // Enable foreign keys
      db.pragma('foreign_keys = ON')

      assert.throws(() => {
        db.prepare('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)').run(
          'msg-fk-test',
          'non-existent-session',
          'user',
          'Test'
        )
      }, /FOREIGN KEY constraint failed/)
    })
  })

  describe('Data Integrity', () => {
    it('should maintain data after multiple operations', () => {
      const sessionId = 'test-session-integrity'
      db.prepare('INSERT INTO sessions (id) VALUES (?)').run(sessionId)

      // Add multiple messages
      for (let i = 0; i < 10; i++) {
        db.prepare('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)').run(
          `msg-${i}`,
          sessionId,
          i % 2 === 0 ? 'user' : 'assistant',
          `Message ${i}`
        )
      }

      const count = db
        .prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?')
        .get(sessionId)
      assert.equal(count.count, 10)
    })
  })
})
