import crypto from 'crypto'
import { generateToken } from '../middleware/adminAuth.js'
import * as SessionModel from '../models/session.model.js'
import * as MessageModel from '../models/message.model.js'

/**
 * Admin Controller
 * Endpoints: POST /api/admin/login, GET /api/admin/sessions,
 *            GET /api/admin/sessions/:sessionId/messages
 */

/** Constant-time string comparison to prevent timing attacks. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a), 'utf8')
  const bufB = Buffer.from(String(b), 'utf8')
  if (bufA.length !== bufB.length) {
    // Still run timingSafeEqual on equal-length buffers to avoid short-circuiting
    crypto.timingSafeEqual(bufA, bufA)
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}

/**
 * POST /api/admin/login
 * Body: { username, password }
 * Response: { token }
 */
export function login(req, res) {
  const { username, password } = req.body || {}

  const expectedUser = process.env.ADMIN_USERNAME || 'admin'
  const expectedPass = process.env.ADMIN_PASSWORD || 'changeme'

  const userMatch = safeEqual(username ?? '', expectedUser)
  const passMatch = safeEqual(password ?? '', expectedPass)

  if (!userMatch || !passMatch) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const token = generateToken()
  return res.json({ token })
}

/**
 * GET /api/admin/sessions
 * Returns all sessions with message counts, newest first.
 * Response: { sessions: [{ id, created_at, message_count, last_message_at }] }
 */
export function listSessions(req, res) {
  try {
    const sessions = SessionModel.findAll()
    return res.json({ sessions })
  } catch (error) {
    console.error('Admin listSessions error:', error.message)
    return res.status(500).json({ error: 'Failed to retrieve sessions' })
  }
}

/**
 * GET /api/admin/top-questions?limit=10
 * Returns the top N most-asked user questions across all sessions.
 * Response: { questions: [{ question, count, last_asked_at }] }
 */
export function getTopQuestions(req, res) {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50)
  try {
    const questions = MessageModel.findTopQuestions(limit)
    return res.json({ questions })
  } catch (error) {
    console.error('Admin getTopQuestions error:', error.message)
    return res.status(500).json({ error: 'Failed to retrieve top questions' })
  }
}

/**
 * GET /api/admin/sessions/:sessionId/messages
 * Returns all messages for a session.
 * Response: { sessionId, messages: [{ role, content, timestamp }] }
 */
export function getSessionMessages(req, res) {
  const { sessionId } = req.params

  try {
    const session = SessionModel.findById(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }
    const messages = MessageModel.findBySessionId(sessionId)
    return res.json({ sessionId, messages })
  } catch (error) {
    console.error('Admin getSessionMessages error:', error.message)
    return res.status(500).json({ error: 'Failed to retrieve messages' })
  }
}
