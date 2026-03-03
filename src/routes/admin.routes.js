import express from 'express'
import { login, listSessions, getSessionMessages, getTopQuestions } from '../controllers/admin.controller.js'
import { adminAuth } from '../middleware/adminAuth.js'

const router = express.Router()

// Public — no auth required
router.post('/login', login)

// Protected — require valid admin Bearer token
router.get('/sessions', adminAuth, listSessions)
router.get('/sessions/:sessionId/messages', adminAuth, getSessionMessages)
router.get('/top-questions', adminAuth, getTopQuestions)

export default router
