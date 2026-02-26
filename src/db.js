import Database from 'better-sqlite3'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Database path from environment or default
const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, '../data/moneyhero.db')

// Ensure the data directory exists
const dbDir = path.dirname(DB_PATH)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

// Initialize database connection
const db = new Database(DB_PATH)

// Enable foreign keys
db.pragma('foreign_keys = ON')

// Create tables on startup
function initializeTables() {
  // Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Messages table
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

  // Escalations table
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
}

// Initialize tables when module loads
initializeTables()

/**
 * Creates a new chat session
 * @returns {Object} { sessionId: "uuid-string" }
 */
function createSession() {
  try {
    const sessionId = crypto.randomUUID()
    const timestamp = new Date().toISOString()

    const stmt = db.prepare(
      'INSERT INTO sessions (id, created_at) VALUES (?, ?)'
    )
    stmt.run(sessionId, timestamp)

    return { sessionId }
  } catch (error) {
    console.error('Error creating session:', error)
    throw new Error('Failed to create session')
  }
}

/**
 * Saves a message to the database
 * @param {string} sessionId - Session identifier
 * @param {string} role - Either 'user' or 'assistant'
 * @param {string} content - Message content
 */
function saveMessage(sessionId, role, content) {
  try {
    const messageId = crypto.randomUUID()
    const timestamp = new Date().toISOString()

    const stmt = db.prepare(
      'INSERT INTO messages (id, session_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)'
    )
    stmt.run(messageId, sessionId, role, content, timestamp)
  } catch (error) {
    console.error('Error saving message:', error)
    throw new Error('Failed to save message')
  }
}

/**
 * Retrieves conversation history for a session
 * @param {string} sessionId - Session identifier
 * @returns {Array} Array of message objects with { role, content, timestamp }
 */
function getHistory(sessionId) {
  try {
    const stmt = db.prepare(
      'SELECT role, content, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp ASC'
    )
    const messages = stmt.all(sessionId)

    return messages
  } catch (error) {
    console.error('Error retrieving history:', error)
    throw new Error('Failed to retrieve history')
  }
}

/**
 * Logs an escalation to human agent and generates a ticket ID
 * @param {string} sessionId - Session identifier
 * @param {string} reason - Reason for escalation
 * @returns {Object} { ticketId: "TKT-YYYYMMDD-NNN" }
 */
function logEscalation(sessionId, reason) {
  try {
    const escalationId = crypto.randomUUID()
    const now = new Date()
    const timestamp = now.toISOString()

    // Generate ticket ID: TKT-YYYYMMDD-NNN
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const dateStr = `${year}${month}${day}`

    // Count escalations for today to generate sequential counter
    const countStmt = db.prepare(
      'SELECT COUNT(*) as count FROM escalations WHERE ticket_id LIKE ?'
    )
    const { count } = countStmt.get(`TKT-${dateStr}-%`)
    const counter = String(count + 1).padStart(3, '0')

    const ticketId = `TKT-${dateStr}-${counter}`

    // Insert escalation
    const insertStmt = db.prepare(
      'INSERT INTO escalations (id, session_id, reason, ticket_id, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    insertStmt.run(escalationId, sessionId, reason, ticketId, timestamp)

    return { ticketId }
  } catch (error) {
    console.error('Error logging escalation:', error)
    throw new Error('Failed to log escalation')
  }
}

// Export functions
export { createSession, saveMessage, getHistory, logEscalation }
