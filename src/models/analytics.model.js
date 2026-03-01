import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../config/database.js'

/**
 * Log a Q&A interaction for analytics
 * @param {Object} data - Interaction data
 * @param {string} data.sessionId - Session ID
 * @param {string} data.question - User question
 * @param {string} data.answer - System answer
 * @param {string} data.intent - Detected intent
 * @param {Array<Object>} [data.sources] - Retrieved sources
 * @param {number} [data.responseTimeMs] - Response time in milliseconds
 * @returns {string} - Interaction ID
 */
export function logInteraction(data) {
  const db = getDatabase()
  const id = uuidv4()

  const stmt = db.prepare(`
    INSERT INTO qa_analytics (
      id, session_id, question, answer, intent, sources, retrieval_count, response_time_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const sources = data.sources ? JSON.stringify(data.sources) : null
  const retrievalCount = data.sources ? data.sources.length : 0

  stmt.run(
    id,
    data.sessionId,
    data.question,
    data.answer,
    data.intent,
    sources,
    retrievalCount,
    data.responseTimeMs || null
  )

  return id
}

/**
 * Get interaction by ID
 * @param {string} interactionId - Interaction ID
 * @returns {Object|null} - Interaction data
 */
export function getInteractionById(interactionId) {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM qa_analytics WHERE id = ?')
  const interaction = stmt.get(interactionId)

  if (interaction && interaction.sources) {
    interaction.sources = JSON.parse(interaction.sources)
  }

  return interaction || null
}

/**
 * Get all interactions for a session
 * @param {string} sessionId - Session ID
 * @returns {Array<Object>} - Array of interactions
 */
export function getSessionAnalytics(sessionId) {
  const db = getDatabase()
  const stmt = db.prepare(`
    SELECT * FROM qa_analytics
    WHERE session_id = ?
    ORDER BY created_at ASC
  `)
  const interactions = stmt.all(sessionId)

  return interactions.map(interaction => {
    if (interaction.sources) {
      interaction.sources = JSON.parse(interaction.sources)
    }
    return interaction
  })
}

/**
 * Get analytics summary for a session
 * @param {string} sessionId - Session ID
 * @returns {Object} - Summary statistics
 */
export function getSessionSummary(sessionId) {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT
      COUNT(*) as total_interactions,
      AVG(response_time_ms) as avg_response_time,
      AVG(retrieval_count) as avg_sources,
      SUM(CASE WHEN intent = 'answer' THEN 1 ELSE 0 END) as answered_count,
      SUM(CASE WHEN intent = 'escalate' THEN 1 ELSE 0 END) as escalated_count,
      SUM(CASE WHEN intent = 'off_topic' THEN 1 ELSE 0 END) as off_topic_count
    FROM qa_analytics
    WHERE session_id = ?
  `)

  return stmt.get(sessionId)
}

/**
 * Log quality metrics for a response
 * @param {Object} data - Quality metrics data
 * @param {string} data.interactionId - Interaction ID (FK to qa_analytics)
 * @param {number} data.responseLength - Length of response in characters
 * @param {number} data.sourceCount - Number of sources used
 * @param {number} [data.retrievalScoreAvg] - Average retrieval score
 * @param {boolean} data.containsDisclaimer - Whether response has disclaimer
 * @param {boolean} data.containsProductNames - Whether response mentions products
 * @param {number} [data.intentConfidence] - Intent classification confidence
 * @param {boolean} data.validationPassed - Whether output validation passed
 * @returns {string} - Quality metric ID
 */
export function logQualityMetrics(data) {
  const db = getDatabase()
  const id = uuidv4()

  const stmt = db.prepare(`
    INSERT INTO quality_metrics (
      id, interaction_id, response_length, source_count,
      retrieval_score_avg, contains_disclaimer, contains_product_names,
      intent_confidence, validation_passed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    id,
    data.interactionId,
    data.responseLength,
    data.sourceCount,
    data.retrievalScoreAvg || null,
    data.containsDisclaimer ? 1 : 0,
    data.containsProductNames ? 1 : 0,
    data.intentConfidence || null,
    data.validationPassed ? 1 : 0
  )

  return id
}

/**
 * Get quality metrics summary for a session
 * @param {string} sessionId - Session ID
 * @returns {Object} - Quality metrics summary
 */
export function getQualityMetricsSummary(sessionId) {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT
      AVG(qm.response_length) as avg_response_length,
      AVG(qm.source_count) as avg_sources_used,
      AVG(qm.retrieval_score_avg) as avg_retrieval_score,
      AVG(qm.contains_disclaimer) as disclaimer_compliance_rate,
      AVG(qm.contains_product_names) as product_mention_rate,
      AVG(qm.intent_confidence) as avg_intent_confidence,
      AVG(qm.validation_passed) as validation_pass_rate,
      COUNT(*) as total_responses
    FROM quality_metrics qm
    JOIN qa_analytics qa ON qm.interaction_id = qa.id
    WHERE qa.session_id = ?
  `)

  return stmt.get(sessionId)
}

/**
 * Get overall quality metrics summary (all sessions)
 * @returns {Object} - System-wide quality metrics
 */
export function getOverallQualityMetrics() {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT
      AVG(response_length) as avg_response_length,
      AVG(source_count) as avg_sources_used,
      AVG(retrieval_score_avg) as avg_retrieval_score,
      AVG(contains_disclaimer) as disclaimer_compliance_rate,
      AVG(contains_product_names) as product_mention_rate,
      AVG(intent_confidence) as avg_intent_confidence,
      AVG(validation_passed) as validation_pass_rate,
      COUNT(*) as total_responses,
      MIN(created_at) as first_response,
      MAX(created_at) as last_response
    FROM quality_metrics
  `)

  return stmt.get()
}
