import express from 'express'
import { getConversationHistory } from '../controllers/history.controller.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = express.Router()

/**
 * History Routes
 * Handles conversation history retrieval
 */

// GET /api/history/:sessionId - Get conversation history
router.get('/:sessionId', asyncHandler(getConversationHistory))

export default router
