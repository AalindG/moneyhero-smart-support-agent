import db from '../config/database.js'
import crypto from 'crypto'

/**
 * Escalation Model
 * Handles escalation data operations
 */

/**
 * Logs an escalation and generates a sequential daily ticket ID
 * Ticket format: TKT-YYYYMMDD-NNN where NNN is the daily counter
 * @param {string} sessionId - Session identifier
 * @param {string} reason - Escalation reason provided by user
 * @returns {{ticketId: string}} Object containing the generated ticket ID
 * @throws {Error} If escalation logging fails
 */
export function create(sessionId, reason) {
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
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM escalations WHERE ticket_id LIKE ?')
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

/**
 * Checks for recent escalations within a time window to prevent spam
 * @param {string} sessionId - Session identifier
 * @param {number} windowMinutes - Minutes to look back (e.g., 10)
 * @returns {{id: string}|null} Escalation object or null if none found
 * @throws {Error} If database query fails
 */
export function findRecentBySessionId(sessionId, windowMinutes) {
  try {
    const stmt = db.prepare(
      `SELECT id FROM escalations WHERE session_id = ? AND created_at > datetime('now', ? || ' minutes') ORDER BY created_at DESC LIMIT 1`
    )
    const row = stmt.get(sessionId, '-' + windowMinutes)
    return row || null
  } catch (error) {
    console.error('Error retrieving recent escalation:', error)
    throw new Error('Failed to retrieve recent escalation')
  }
}
