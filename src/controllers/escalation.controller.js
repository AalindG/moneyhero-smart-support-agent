import * as SessionModel from '../models/session.model.js'
import * as EscalationModel from '../models/escalation.model.js'
import { validateRequestParams } from '../middleware/validation.js'
import { ESCALATION } from '../config/constants.js'

/**
 * Escalation Controller
 * Handles escalation requests to human agents
 */

/**
 * Escalates conversation to human agent
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
export async function escalateToHuman(req, res) {
  try {
    const { sessionId, reason } = req.body

    // Validate inputs
    const validation = validateRequestParams(sessionId, reason, 'reason')
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error })
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

    // Check for recent escalation (cooldown period)
    let recentEscalation
    try {
      recentEscalation = EscalationModel.findRecentBySessionId(
        sessionId,
        ESCALATION.COOLDOWN_MINUTES
      )
    } catch (dbError) {
      console.error('Database error checking recent escalation:', dbError.message)
      return res.status(500).json({ error: 'Database error' })
    }
    if (recentEscalation) {
      return res.status(429).json({
        error: `Please wait before escalating again. A request was already submitted in the last ${ESCALATION.COOLDOWN_MINUTES} minutes.`
      })
    }

    // Log escalation and get ticket ID
    let ticketId
    try {
      const result = EscalationModel.create(sessionId, reason)
      ticketId = result.ticketId
    } catch (dbError) {
      console.error('Database error logging escalation:', dbError.message)
      return res.status(500).json({ error: 'Failed to log escalation' })
    }

    // Return success response
    res.status(200).json({
      success: true,
      ticketId,
      message: `Your request has been escalated to a human agent. Ticket ID: ${ticketId}`
    })
  } catch (error) {
    console.error('Error escalating:', error.message, error.stack)
    res.status(500).json({ error: 'Failed to escalate request' })
  }
}
