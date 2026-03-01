import { SSE } from '../config/constants.js'

/**
 * SSE (Server-Sent Events) Middleware
 * Handles SSE connection setup and management
 */

/**
 * Sets up SSE response headers and connection tracking
 * @param {object} res - Express response object
 * @param {object} req - Express request object
 * @returns {{cleanup: Function, isConnected: Function}}
 */
export function setupSSE(res, req) {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  // Track connection state (note: 'close' event may fire prematurely)
  let clientConnected = true

  req.on('close', () => {
    console.log('Client connection closed')
    clientConnected = false
  })

  req.on('error', error => {
    console.log('Request error:', error.message)
    clientConnected = false
  })

  // Send initial signals
  res.write(': connected\n\n')
  if (res.flush) {
    res.flush()
  }

  res.write(': thinking\n\n')
  if (res.flush) {
    res.flush()
  }

  // Start keepalive to prevent timeout during processing
  const keepaliveInterval = setInterval(() => {
    try {
      res.write(': keepalive\n\n')
      if (res.flush) {
        res.flush()
      }
    } catch (e) {
      // Ignore - client disconnected
    }
  }, SSE.KEEPALIVE_INTERVAL_MS)

  return {
    cleanup: () => clearInterval(keepaliveInterval),
    isConnected: () => clientConnected
  }
}
