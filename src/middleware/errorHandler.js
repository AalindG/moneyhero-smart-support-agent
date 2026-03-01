/**
 * Error Handling Middleware
 */

/**
 * Global error handler - must be last middleware
 * Catches all unhandled errors and returns appropriate responses
 */
export function globalErrorHandler(err, req, res, next) {
  const NODE_ENV = process.env.NODE_ENV || 'development'

  console.error('Unhandled error:', err.message, err.stack)

  if (res.headersSent) {
    return next(err)
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(NODE_ENV === 'development' && { stack: err.stack })
  })
}

/**
 * 404 handler for undefined routes
 */
export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not Found', path: req.path })
}

/**
 * Async route handler wrapper to catch errors
 * Wraps async route handlers to automatically catch and forward errors
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped function with error handling
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
