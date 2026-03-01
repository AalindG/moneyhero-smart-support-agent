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
