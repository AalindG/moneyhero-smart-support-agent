import { Router } from 'express'
import {
  submitFeedbackHandler,
  getSessionFeedbackHandler,
  getSessionAnalyticsHandler
} from '../controllers/feedback.controller.js'

const router = Router()

/**
 * POST /api/feedback
 * Submit customer feedback for a response
 *
 * Body:
 * {
 *   sessionId: string (required)
 *   messageId: string (optional)
 *   rating: number 1-5 (optional, required if feedbackType is 'rating')
 *   feedbackType: 'thumbs_up' | 'thumbs_down' | 'rating' | 'comment' (required)
 *   comment: string (optional)
 * }
 */
router.post('/', submitFeedbackHandler)

/**
 * GET /api/feedback/:sessionId
 * Get all feedback for a specific session
 */
router.get('/:sessionId', getSessionFeedbackHandler)

/**
 * GET /api/analytics/:sessionId
 * Get detailed analytics for a session (Q&A interactions + feedback)
 */
router.get('/analytics/:sessionId', getSessionAnalyticsHandler)

export default router
