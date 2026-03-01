import express from 'express'
import { createSession } from '../controllers/session.controller.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = express.Router()

/**
 * Session Routes
 * Handles session management endpoints
 */

// POST /api/sessions - Create new chat session
router.post('/', asyncHandler(createSession))

export default router
