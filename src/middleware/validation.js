import { VALIDATION } from '../config/constants.js'

/**
 * Validation Middleware
 * Provides input validation for API requests
 */

/**
 * Validates common request parameters
 * @param {string} sessionId - Session identifier
 * @param {string|null} message - Optional message content
 * @returns {{valid: boolean, error: string|null}}
 */
export function validateRequestParams(sessionId, message = null, fieldName = 'message') {
  if (!sessionId) {
    return { valid: false, error: 'sessionId is required' }
  }

  if (sessionId.length > VALIDATION.MAX_SESSION_ID_LENGTH) {
    return {
      valid: false,
      error: `sessionId must be ${VALIDATION.MAX_SESSION_ID_LENGTH} characters or fewer`
    }
  }

  if (message !== null) {
    if (!message) {
      return { valid: false, error: `${fieldName} is required` }
    }

    if (message.length > VALIDATION.MAX_MESSAGE_LENGTH) {
      return {
        valid: false,
        error: `${fieldName} must be ${VALIDATION.MAX_MESSAGE_LENGTH} characters or fewer`
      }
    }
  }

  return { valid: true, error: null }
}

/**
 * Express middleware to validate session ID in request body
 */
export function validateSessionId(req, res, next) {
  const { sessionId } = req.body || req.params

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' })
  }

  if (sessionId.length > VALIDATION.MAX_SESSION_ID_LENGTH) {
    return res.status(400).json({
      error: `sessionId must be ${VALIDATION.MAX_SESSION_ID_LENGTH} characters or fewer`
    })
  }

  next()
}

/**
 * Express middleware to validate message in request body
 */
export function validateMessage(req, res, next) {
  const { message } = req.body

  if (!message) {
    return res.status(400).json({ error: 'message is required' })
  }

  if (message.length > VALIDATION.MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      error: `message must be ${VALIDATION.MAX_MESSAGE_LENGTH} characters or fewer`
    })
  }

  next()
}
