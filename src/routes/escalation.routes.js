import express from 'express'
import { escalateToHuman } from '../controllers/escalation.controller.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = express.Router()

/**
 * Escalation Routes
 * Handles escalation to human agents
 */

// POST /api/escalate - Escalate conversation to human
router.post('/', asyncHandler(escalateToHuman))

export default router
