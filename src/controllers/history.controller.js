import * as SessionModel from '../models/session.model.js'
import * as MessageModel from '../models/message.model.js'
import { VALIDATION } from '../config/constants.js'

/**
 * History Controller
 * Handles conversation history retrieval
 */

/**
 * Retrieves conversation history for a session
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
export async function getConversationHistory(req, res) {
  try {
    const { sessionId } = req.params

    // Validate sessionId
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' })
    }

    if (sessionId.length > VALIDATION.MAX_SESSION_ID_LENGTH) {
      return res.status(400).json({
        error: `sessionId must be ${VALIDATION.MAX_SESSION_ID_LENGTH} characters or fewer`
      })
    }

    // Verify session exists
    let session
    try {
      session = SessionModel.findById(sessionId)
    } catch (dbError) {
      console.error('Database error checking session:', dbError.message)
      return res.status(500).json({ error: 'Database error' })
    }

    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    // Get history from database
    let messages
    try {
      messages = MessageModel.findBySessionId(sessionId)
    } catch (dbError) {
      console.error('Database error retrieving history:', dbError.message)
      return res.status(500).json({ error: 'Failed to retrieve conversation history' })
    }

    res.status(200).json({
      sessionId,
      messages
    })
  } catch (error) {
    console.error('Error retrieving history:', error.message, error.stack)
    res.status(500).json({ error: 'Failed to retrieve conversation history' })
  }
}
