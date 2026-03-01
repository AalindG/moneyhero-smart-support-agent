import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Database path from environment or default
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/moneyhero.db')

// Ensure the data directory exists
const dbDir = path.dirname(DB_PATH)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
  console.log(`Created database directory: ${dbDir}`)
}

// Initialize database connection
const db = new Database(DB_PATH)
console.log(`Database initialized: ${DB_PATH}`)

// Enable foreign keys
db.pragma('foreign_keys = ON')

/**
 * Initialize database tables with proper schema and constraints
 */
export function initializeTables() {
  // Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `)

  // Escalations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS escalations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      ticket_id TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `)

  // Q&A Analytics table - stores detailed interaction data for analysis
  db.exec(`
    CREATE TABLE IF NOT EXISTS qa_analytics (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      intent TEXT NOT NULL,
      sources TEXT,
      retrieval_count INTEGER,
      response_time_ms INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `)

  // Feedback table - stores customer feedback on responses
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      message_id TEXT,
      rating INTEGER CHECK(rating BETWEEN 1 AND 5),
      feedback_type TEXT CHECK(feedback_type IN ('thumbs_up', 'thumbs_down', 'rating', 'comment')),
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `)

  // Quality Metrics table - tracks response quality indicators
  db.exec(`
    CREATE TABLE IF NOT EXISTS quality_metrics (
      id TEXT PRIMARY KEY,
      interaction_id TEXT NOT NULL,
      response_length INTEGER,
      source_count INTEGER,
      retrieval_score_avg REAL,
      contains_disclaimer INTEGER CHECK(contains_disclaimer IN (0, 1)),
      contains_product_names INTEGER CHECK(contains_product_names IN (0, 1)),
      intent_confidence REAL,
      validation_passed INTEGER CHECK(validation_passed IN (0, 1)),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (interaction_id) REFERENCES qa_analytics(id)
    )
  `)

  console.log('Database tables initialized')
}

/**
 * Closes the database connection gracefully
 * Should be called during application shutdown
 */
export function closeDatabase() {
  try {
    db.close()
    console.log('Database connection closed')
  } catch (error) {
    console.error('Error closing database:', error.message)
  }
}

// Export database instance
export function getDatabase() {
  return db
}

export default db
