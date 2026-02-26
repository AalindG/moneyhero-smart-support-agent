import express from 'express'
import cors from 'cors'
import chatRouter from './routes/chat.js'

// Initialize Express app
const app = express()

// Get port from environment or use default
const PORT = process.env.PORT || 3001

// CORS configuration - allow frontend origin with credentials
const corsOptions = {
  origin: 'http://localhost:5173',
  credentials: true
}

// Middleware
app.use(cors(corsOptions))
app.use(express.json())

// Mount chat router under /api
app.use('/api', chatRouter)

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' })
})

// Start server
app
  .listen(PORT, () => {
    console.log(`MoneyHero backend running on port ${PORT}`)
  })
  .on('error', error => {
    console.error('Failed to start server:', error)
    process.exit(1)
  })
