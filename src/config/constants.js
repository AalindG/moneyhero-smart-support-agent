import dotenv from 'dotenv'
dotenv.config()

/**
 * Application-wide constants — all tuneable values read from environment variables
 * with safe fallback defaults so the server starts without a .env file.
 */

export const VALIDATION = {
  MAX_SESSION_ID_LENGTH: 100,
  MAX_MESSAGE_LENGTH: 2000,
  MAX_REASON_LENGTH: 2000
}

export const ESCALATION = {
  COOLDOWN_MINUTES: parseInt(process.env.ESCALATION_COOLDOWN_MINUTES) || 10
}

export const SSE = {
  KEEPALIVE_INTERVAL_MS: parseInt(process.env.SSE_KEEPALIVE_INTERVAL_MS) || 2000
}

export const OLLAMA = {
  TEMPERATURE: parseFloat(process.env.OLLAMA_TEMPERATURE ?? '0')
}

export const RATE_LIMIT = {
  GLOBAL: {
    WINDOW_MS: parseInt(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX) || 100
  },
  CHAT: {
    WINDOW_MS: parseInt(process.env.RATE_LIMIT_CHAT_WINDOW_MS) || 60 * 1000, // 1 minute
    MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_CHAT_MAX) || 20
  }
}
