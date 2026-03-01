import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../config/database.js'

/**
 * Submit feedback for a specific interaction
 * @param {Object} data - Feedback data
 * @param {string} data.sessionId - Session ID
 * @param {string} [data.messageId] - Optional message ID
 * @param {number} [data.rating] - Rating between 1-5
 * @param {string} data.feedbackType - Type: 'thumbs_up', 'thumbs_down', 'rating', 'comment'
 * @param {string} [data.comment] - Optional comment text
 * @returns {string} - Feedback ID
 */
export function submitFeedback(data) {
  const db = getDatabase()
  const id = uuidv4()

  const stmt = db.prepare(`
    INSERT INTO feedback (
      id, session_id, message_id, rating, feedback_type, comment
    ) VALUES (?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    id,
    data.sessionId,
    data.messageId || null,
    data.rating || null,
    data.feedbackType,
    data.comment || null
  )

  return id
}

/**
 * Get all feedback for a session
 * @param {string} sessionId - Session ID
 * @returns {Array<Object>} - Array of feedback entries
 */
export function getSessionFeedback(sessionId) {
  const db = getDatabase()
  const stmt = db.prepare(`
    SELECT * FROM feedback
    WHERE session_id = ?
    ORDER BY created_at DESC
  `)
  return stmt.all(sessionId)
}

/**
 * Get feedback by ID
 * @param {string} feedbackId - Feedback ID
 * @returns {Object|null} - Feedback data
 */
export function getFeedbackById(feedbackId) {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM feedback WHERE id = ?')
  return stmt.get(feedbackId) || null
}

/**
 * Get feedback summary for a session
 * @param {string} sessionId - Session ID
 * @returns {Object} - Summary statistics
 */
export function getFeedbackSummary(sessionId) {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT
      COUNT(*) as total_feedback,
      AVG(rating) as avg_rating,
      SUM(CASE WHEN feedback_type = 'thumbs_up' THEN 1 ELSE 0 END) as thumbs_up_count,
      SUM(CASE WHEN feedback_type = 'thumbs_down' THEN 1 ELSE 0 END) as thumbs_down_count,
      SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) as positive_ratings,
      SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) as negative_ratings
    FROM feedback
    WHERE session_id = ?
  `)

  return stmt.get(sessionId)
}

/**
 * Get all feedback with comments
 * @param {string} sessionId - Session ID
 * @returns {Array<Object>} - Array of feedback entries with comments
 */
export function getFeedbackWithComments(sessionId) {
  const db = getDatabase()
  const stmt = db.prepare(`
    SELECT * FROM feedback
    WHERE session_id = ? AND comment IS NOT NULL
    ORDER BY created_at DESC
  `)
  return stmt.all(sessionId)
}
