import {
  submitFeedback,
  getSessionFeedback,
  getFeedbackSummary,
  getFeedbackWithComments
} from '../models/feedback.model.js'
import { getSessionAnalytics } from '../models/analytics.model.js'
import * as logger from '../utils/logger.js'

/**
 * Submit customer feedback
 * POST /api/feedback
 *
 * Request body:
 * {
 *   sessionId: string (required)
 *   messageId: string (optional)
 *   rating: number 1-5 (optional, required if feedbackType is 'rating')
 *   feedbackType: 'thumbs_up' | 'thumbs_down' | 'rating' | 'comment' (required)
 *   comment: string (optional)
 * }
 */
export async function submitFeedbackHandler(req, res) {
  try {
    const { sessionId, messageId, rating, feedbackType, comment } = req.body

    // Validation
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' })
    }

    if (!feedbackType) {
      return res.status(400).json({ error: 'feedbackType is required' })
    }

    const validTypes = ['thumbs_up', 'thumbs_down', 'rating', 'comment']
    if (!validTypes.includes(feedbackType)) {
      return res.status(400).json({
        error: `feedbackType must be one of: ${validTypes.join(', ')}`
      })
    }

    // If feedbackType is 'rating', rating is required
    if (feedbackType === 'rating' && !rating) {
      return res.status(400).json({ error: 'rating is required when feedbackType is "rating"' })
    }

    // Validate rating range
    if (rating !== undefined && (rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'rating must be between 1 and 5' })
    }

    const feedbackId = submitFeedback({
      sessionId,
      messageId,
      rating,
      feedbackType,
      comment
    })

    logger.info(`Feedback submitted: ${feedbackId} (${feedbackType}) for session ${sessionId}`)

    return res.json({
      success: true,
      feedbackId,
      message: 'Thank you for your feedback!'
    })
  } catch (error) {
    logger.error('Error submitting feedback:', error)
    return res.status(500).json({ error: 'Failed to submit feedback' })
  }
}

/**
 * Get all feedback for a session
 * GET /api/feedback/:sessionId
 */
export async function getSessionFeedbackHandler(req, res) {
  try {
    const { sessionId } = req.params

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' })
    }

    const feedback = getSessionFeedback(sessionId)
    const summary = getFeedbackSummary(sessionId)

    return res.json({
      sessionId,
      feedback,
      summary
    })
  } catch (error) {
    logger.error('Error retrieving session feedback:', error)
    return res.status(500).json({ error: 'Failed to retrieve feedback' })
  }
}

/**
 * Get analytics for a session (Q&A interactions + feedback)
 * GET /api/analytics/:sessionId
 */
export async function getSessionAnalyticsHandler(req, res) {
  try {
    const { sessionId } = req.params

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' })
    }

    const interactions = getSessionAnalytics(sessionId)
    const feedbackSummary = getFeedbackSummary(sessionId)
    const comments = getFeedbackWithComments(sessionId)

    return res.json({
      sessionId,
      interactions,
      feedback: {
        summary: feedbackSummary,
        comments
      }
    })
  } catch (error) {
    logger.error('Error retrieving session analytics:', error)
    return res.status(500).json({ error: 'Failed to retrieve analytics' })
  }
}
