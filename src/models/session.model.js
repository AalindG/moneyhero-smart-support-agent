import db from '../config/database.js'
import crypto from 'crypto'

/**
 * Session Model
 * Handles session data operations
 */

/**
 * Creates a new chat session with a unique UUID
 * @returns {{sessionId: string}} Object containing the generated session ID
 * @throws {Error} If session creation fails
 */
export function create() {
  try {
    const sessionId = crypto.randomUUID()
    const timestamp = new Date().toISOString()

    const stmt = db.prepare('INSERT INTO sessions (id, created_at) VALUES (?, ?)')
    stmt.run(sessionId, timestamp)

    return { sessionId }
  } catch (error) {
    console.error('Error creating session:', error)
    throw new Error('Failed to create session')
  }
}

/**
 * Retrieves a session by ID to verify existence
 * @param {string} sessionId - Session identifier
 * @returns {{id: string, created_at: string}|null} Session object or null if not found
 * @throws {Error} If database query fails
 */
export function findById(sessionId) {
  try {
    const stmt = db.prepare('SELECT id, created_at FROM sessions WHERE id = ?')
    const row = stmt.get(sessionId)
    return row || null
  } catch (error) {
    console.error('Error retrieving session:', error)
    throw new Error('Failed to retrieve session')
  }
}
