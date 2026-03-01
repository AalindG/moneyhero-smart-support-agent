import { Router } from 'express'
import { getSessionAnalyticsHandler } from '../controllers/feedback.controller.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = Router()

// GET /api/analytics/:sessionId - Get session analytics (Q&A interactions + feedback)
router.get('/:sessionId', asyncHandler(getSessionAnalyticsHandler))

export default router
