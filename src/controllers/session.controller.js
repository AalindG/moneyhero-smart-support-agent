import * as SessionModel from '../models/session.model.js'

/**
 * Session Controller
 * Handles session-related business logic
 */

/**
 * Creates a new chat session
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
export async function createSession(req, res) {
  try {
    const { sessionId } = SessionModel.create()
    console.log(`Created new session: ${sessionId}`)
    res.status(200).json({ sessionId })
  } catch (error) {
    console.error('Error creating session:', error.message, error.stack)
    res.status(500).json({ error: 'Failed to create session' })
  }
}
