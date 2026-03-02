import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import apiRoutes from './routes/index.js'
import { warmup } from './agent.js'
import { initializeTables, closeDatabase } from './config/database.js'
import { globalErrorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { RATE_LIMIT } from './config/constants.js'
import * as logger from './utils/logger.js'

// Patch console globally so every log across all modules gets a UTC timestamp.
// Must happen before any imports run their module-level code.
const _ts = () => new Date().toISOString().replace('T', ' ').slice(0, -1)
const _origLog = console.log
const _origWarn = console.warn
const _origError = console.error
console.log   = (...a) => _origLog  (`[${_ts()}]`, ...a)
console.warn  = (...a) => _origWarn (`[${_ts()}] WARN:`, ...a)
console.error = (...a) => _origError(`[${_ts()}] ERROR:`, ...a)

// Load environment variables first
dotenv.config()

// Initialize database tables
initializeTables()

// Initialize Express app
const app = express()

// Trust the first proxy (Nginx) so express-rate-limit can read X-Forwarded-For correctly
app.set('trust proxy', 1)

// Configuration
const PORT = process.env.PORT || 3001
const NODE_ENV = process.env.NODE_ENV || 'development'

// CORS configuration - allow frontend origin with credentials
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}

// Global rate limiter
const globalRateLimit = rateLimit({
  windowMs: RATE_LIMIT.GLOBAL.WINDOW_MS,
  max: RATE_LIMIT.GLOBAL.MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
})

// Chat-specific rate limiter
const chatRateLimit = rateLimit({
  windowMs: RATE_LIMIT.CHAT.WINDOW_MS,
  max: RATE_LIMIT.CHAT.MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Chat rate limit exceeded, please wait before sending more messages.' }
})

// Middleware
app.use(cors(corsOptions))
app.use(express.json({ limit: '10kb' }))
app.use(globalRateLimit)

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
})

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    logger.httpRequest(req, res, duration)
  })
  next()
})

// Apply chat-specific rate limiter before the router handles /api/chat
app.post('/api/chat', chatRateLimit)

// Mount API routes under /api
app.use('/api', apiRoutes)

// Health check endpoint with service status
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV
  }
  res.status(200).json(health)
})

// 404 handler for undefined routes
app.use(notFoundHandler)

// Global error handler - must be last middleware
app.use(globalErrorHandler)

// Start server
const server = app.listen(PORT, () => {
  logger.info('MoneyHero backend started successfully', {
    port: PORT,
    environment: NODE_ENV
  })
  // Pre-warm Ollama model in the background so the first user request is fast
  warmup()
})

server.on('error', error => {
  logger.error('Failed to start server', error)
  process.exit(1)
})

// Graceful shutdown handling
const shutdown = signal => {
  logger.info(`${signal} received, starting graceful shutdown...`)
  server.close(() => {
    logger.info('Closing database connections...')
    closeDatabase()
    logger.info('Server closed successfully')
    process.exit(0)
  })

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  logger.error('Uncaught exception', error)
  process.exit(1)
})

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', { reason, promise })
  process.exit(1)
})
