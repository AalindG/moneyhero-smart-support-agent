/**
 * Logger Utility
 * Provides structured logging for the application
 */

const NODE_ENV = process.env.NODE_ENV || 'development'

/**
 * Logs informational messages
 * @param {string} message - Log message
 * @param {object} meta - Additional metadata
 */
export function info(message, meta = {}) {
  const log = {
    level: 'info',
    timestamp: new Date().toISOString(),
    message,
    ...meta
  }

  if (NODE_ENV === 'production') {
    console.log(JSON.stringify(log))
  } else {
    console.log(`[INFO] ${log.timestamp} - ${message}`, meta)
  }
}

/**
 * Logs error messages
 * @param {string} message - Error message
 * @param {Error|object} error - Error object or metadata
 */
export function error(message, error = {}) {
  const log = {
    level: 'error',
    timestamp: new Date().toISOString(),
    message,
    ...(error.stack ? { stack: error.stack } : error)
  }

  if (NODE_ENV === 'production') {
    console.error(JSON.stringify(log))
  } else {
    console.error(`[ERROR] ${log.timestamp} - ${message}`, error)
  }
}

/**
 * Logs HTTP request information
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {number} duration - Request duration in milliseconds
 */
export function httpRequest(req, res, duration) {
  const log = {
    level: 'http',
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    status: res.statusCode,
    duration: `${duration}ms`,
    ip: req.ip
  }

  if (NODE_ENV === 'production') {
    console.log(JSON.stringify(log))
  } else {
    console.log(`${log.timestamp} ${log.method} ${log.path} ${log.status} ${log.duration}`)
  }
}
