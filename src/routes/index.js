import express from 'express'
import sessionRoutes from './session.routes.js'
import chatRoutes from './chat.routes.js'
import escalationRoutes from './escalation.routes.js'
import historyRoutes from './history.routes.js'
import feedbackRoutes from './feedback.routes.js'
import analyticsRoutes from './analytics.routes.js'

const router = express.Router()

/**
 * API Routes Index
 * Aggregates all route modules
 */

// Mount route modules
router.use('/session', sessionRoutes)
router.use('/chat', chatRoutes)
router.use('/escalate', escalationRoutes)
router.use('/history', historyRoutes)
router.use('/feedback', feedbackRoutes)
router.use('/analytics', analyticsRoutes)

export default router
