#!/usr/bin/env node
/**
 * Clear Database Script
 * Deletes all sessions, conversations, escalations, analytics, and metrics from the database
 */

import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Database path
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/moneyhero.db')

console.log('🗑️  MoneyHero Database Cleanup Script')
console.log('=====================================')
console.log(`Database: ${DB_PATH}`)
console.log('')

try {
  const db = new Database(DB_PATH)
  db.pragma('foreign_keys = ON')

  // Get counts before deletion
  const beforeCounts = {
    sessions: db.prepare('SELECT COUNT(*) as count FROM sessions').get().count,
    messages: db.prepare('SELECT COUNT(*) as count FROM messages').get().count,
    escalations: db.prepare('SELECT COUNT(*) as count FROM escalations').get().count,
    qa_analytics: db.prepare('SELECT COUNT(*) as count FROM qa_analytics').get().count,
    feedback: db.prepare('SELECT COUNT(*) as count FROM feedback').get().count,
    quality_metrics: db.prepare('SELECT COUNT(*) as count FROM quality_metrics').get().count
  }

  console.log('Current database contents:')
  console.log(`  Sessions: ${beforeCounts.sessions}`)
  console.log(`  Messages: ${beforeCounts.messages}`)
  console.log(`  Escalations: ${beforeCounts.escalations}`)
  console.log(`  QA Analytics: ${beforeCounts.qa_analytics}`)
  console.log(`  Feedback: ${beforeCounts.feedback}`)
  console.log(`  Quality Metrics: ${beforeCounts.quality_metrics}`)
  console.log('')

  if (
    beforeCounts.sessions === 0 &&
    beforeCounts.messages === 0 &&
    beforeCounts.escalations === 0 &&
    beforeCounts.qa_analytics === 0 &&
    beforeCounts.feedback === 0 &&
    beforeCounts.quality_metrics === 0
  ) {
    console.log('✅ Database is already empty. Nothing to delete.')
    process.exit(0)
  }

  console.log('⚠️  WARNING: This will permanently delete all data!')
  console.log('')

  // Delete all data (respecting foreign key constraints - delete child tables first)
  console.log('Deleting data...')

  // Delete child tables first
  db.prepare('DELETE FROM quality_metrics').run()
  console.log('  ✓ Deleted quality_metrics')

  db.prepare('DELETE FROM feedback').run()
  console.log('  ✓ Deleted feedback')

  db.prepare('DELETE FROM qa_analytics').run()
  console.log('  ✓ Deleted qa_analytics')

  db.prepare('DELETE FROM escalations').run()
  console.log('  ✓ Deleted escalations')

  db.prepare('DELETE FROM messages').run()
  console.log('  ✓ Deleted messages')

  // Delete parent table last
  db.prepare('DELETE FROM sessions').run()
  console.log('  ✓ Deleted sessions')

  console.log('')

  // Verify deletion
  const afterCounts = {
    sessions: db.prepare('SELECT COUNT(*) as count FROM sessions').get().count,
    messages: db.prepare('SELECT COUNT(*) as count FROM messages').get().count,
    escalations: db.prepare('SELECT COUNT(*) as count FROM escalations').get().count,
    qa_analytics: db.prepare('SELECT COUNT(*) as count FROM qa_analytics').get().count,
    feedback: db.prepare('SELECT COUNT(*) as count FROM feedback').get().count,
    quality_metrics: db.prepare('SELECT COUNT(*) as count FROM quality_metrics').get().count
  }

  console.log('Database cleared successfully:')
  console.log(`  Sessions: ${beforeCounts.sessions} → ${afterCounts.sessions}`)
  console.log(`  Messages: ${beforeCounts.messages} → ${afterCounts.messages}`)
  console.log(`  Escalations: ${beforeCounts.escalations} → ${afterCounts.escalations}`)
  console.log(`  QA Analytics: ${beforeCounts.qa_analytics} → ${afterCounts.qa_analytics}`)
  console.log(`  Feedback: ${beforeCounts.feedback} → ${afterCounts.feedback}`)
  console.log(`  Quality Metrics: ${beforeCounts.quality_metrics} → ${afterCounts.quality_metrics}`)
  console.log('')
  console.log('✅ All sessions and conversations have been deleted!')

  db.close()
} catch (error) {
  console.error('❌ Error clearing database:', error.message)
  process.exit(1)
}
