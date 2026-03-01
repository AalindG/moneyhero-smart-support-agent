import db from '../config/database.js'
import crypto from 'crypto'

/**
 * Message Model
 * Handles message data operations
 */

/**
 * Saves a message to the conversation history
 * @param {string} sessionId - Session identifier
 * @param {'user'|'assistant'} role - Message sender role
 * @param {string} content - Message text content
 * @throws {Error} If message save fails or role is invalid
 */
export function create(sessionId, role, content) {
  try {
    if (!['user', 'assistant'].includes(role)) {
      throw new Error(`Invalid role: ${role}. Must be 'user' or 'assistant'`)
    }
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
 * Retrieves complete conversation history for a session, ordered chronologically
 * @param {string} sessionId - Session identifier
 * @returns {Array<{role: string, content: string, timestamp: string}>} Array of message objects
 * @throws {Error} If history retrieval fails
 */
export function findBySessionId(sessionId) {
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
