import crypto from 'crypto'

/**
 * Admin authentication middleware.
 * Tokens are random 32-byte hex strings stored in-memory with an 8-hour TTL.
 * No external dependency required — suitable for a single-instance deployment.
 */

// token → expiresAt (ms)
const validTokens = new Map()

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000 // 8 hours

/** Generate a new admin token and register it. */
export function generateToken() {
  // Prune expired tokens before generating a new one
  const now = Date.now()
  for (const [tok, expiresAt] of validTokens.entries()) {
    if (now > expiresAt) validTokens.delete(tok)
  }

  const token = crypto.randomBytes(32).toString('hex')
  validTokens.set(token, now + TOKEN_TTL_MS)
  return token
}

/** Express middleware — validates Bearer token from Authorization header. */
export function adminAuth(req, res, next) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = auth.slice(7)
  const expiresAt = validTokens.get(token)

  if (!expiresAt || Date.now() > expiresAt) {
    validTokens.delete(token)
    return res.status(401).json({ error: 'Token expired or invalid' })
  }

  next()
}
