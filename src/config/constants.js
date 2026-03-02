/**
 * Application-wide constants
 */

export const VALIDATION = {
  MAX_SESSION_ID_LENGTH: 100,
  MAX_MESSAGE_LENGTH: 2000,
  MAX_REASON_LENGTH: 2000
}

export const ESCALATION = {
  COOLDOWN_MINUTES: 10
}

export const SSE = {
  KEEPALIVE_INTERVAL_MS: 2000
}

export const OLLAMA = {
  TEMPERATURE: 0
}

export const RATE_LIMIT = {
  GLOBAL: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 100
  },
  CHAT: {
    WINDOW_MS: 60 * 1000, // 1 minute
    MAX_REQUESTS: 20
  }
}

/**
 * RAG pipeline tuning parameters.
 * Centralised here so agent.js and ollama.service.js stay free of magic numbers.
 */
export const RAG = {
  MAX_HISTORY_MESSAGES: 20,            // Fallback message-count cap if token counting fails
  MAX_HISTORY_TOKENS: 200,             // ~800 chars — keeps total prompt <3000 chars for llama3.2:1b
  RETRIEVAL_K: 5,                      // Candidate docs per vector search (higher for comparison queries)
  LLM_TIMEOUT_MS: 90_000,             // 90 s: 1b classifier (~5 s) + retrieval (<1 s) + generation (~60 s)
  LLM_TEMPERATURE: 0,                  // Zero randomness — factual financial Q&A
  NUM_PREDICT: 900,                    // Max tokens Ollama generates per response
  SESSION_TTL_MS: 2 * 60 * 60 * 1000  // 2-hour in-memory session lifetime before eviction
}
