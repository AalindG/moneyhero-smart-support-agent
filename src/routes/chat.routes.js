import express from 'express'
import { handleChatMessage } from '../controllers/chat.controller.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = express.Router()

/**
 * Chat Routes
 * Handles chat message processing and streaming
 */

// POST /api/chat - Send message and get streaming response
router.post('/', asyncHandler(handleChatMessage))

export default router
