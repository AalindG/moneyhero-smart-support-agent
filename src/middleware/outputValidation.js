/**
 * Output Validation Middleware
 * Validates LLM responses before sending to users to prevent:
 * - Prompt leakage
 * - Prohibited financial advice
 * - Template variable exposure
 */

// Prohibited patterns that should never appear in user-facing responses
// NOTE: Only block genuine prompt-leakage signals — not natural grounded LLM phrasing.
//       Patterns like "based on the information provided" are normal and were removed
//       because they produced false positives that blocked valid responses.
const FORBIDDEN_PHRASES = [
  /IMPORTANT RULES/i,
  /\bthe context below\b/i,
  /system prompt/i,
  /I recommend you invest/i,
  /guaranteed returns?/i,
  /you should definitely/i,
  /\{context\}/,
  /\{question\}/,
  /Layer \d+:/i,
  /RAG_SYSTEM_PROMPT/i,
  /sanitize\(/i,
  /<\/?(?:user|assistant|system|context|examples|guidelines)>/i,  // Prompt structure tags
  /---\s*(START|END)\s*(DOCUMENTS|QUESTION|ANSWER)/i,  // Old prompt delimiters
  /^EXAMPLES:/mi,  // Examples section header
  /^RULES:/mi,     // Rules section header
  /Answer \(1-2 paragraphs/i,  // Output format instruction
  /<guidelines>/i,  // Guidelines section start
  /<\/guidelines>/i,  // Guidelines section end
  /→/,  // Arrow character used in examples section (unique to prompt)
  /For travel rewards questions:/i,  // Example prefix from prompt
  /For approval guarantee questions:/i,  // Example prefix from prompt
  /For off-topic questions:/i,  // Example prefix from prompt
  /UOB KrisFlyer Card.*provides 1\.4 miles/i,  // Specific example content
  /Would you like me to connect you with an advisor\?.*For off-topic/i  // Multiple examples in sequence
]

// Prohibited financial advice patterns
const PROHIBITED_ADVICE = [
  /guarantee.*approval/i,
  /you will be approved/i,
  /certain(?:ly)? get approved/i,
  /promise.*approval/i,
  /we can guarantee/i,
  /you should borrow/i,
  /I advise you to apply/i
]

/**
 * Validate LLM output before sending to user
 * @param {string} text - LLM generated response
 * @returns {{valid: boolean, text?: string, error?: string, sanitized?: string}}
 */
export function validateOutput(text) {
  if (!text || typeof text !== 'string') {
    return {
      valid: false,
      error: 'Invalid output format',
      sanitized:
        'I apologize, but I encountered an error generating that response. Could you please try again?'
    }
  }

  // Check for forbidden phrases (prompt leakage)
  for (const pattern of FORBIDDEN_PHRASES) {
    if (pattern.test(text)) {
      console.error(`🚨 Output validation failed: forbidden phrase detected - ${pattern}`)
      return {
        valid: false,
        error: `Forbidden phrase detected: ${pattern}`,
        sanitized:
          'I apologize, but I need to rephrase that response. Could you ask your question again?'
      }
    }
  }

  // Check for prohibited financial advice
  for (const pattern of PROHIBITED_ADVICE) {
    if (pattern.test(text)) {
      console.error(`🚨 Output validation failed: prohibited financial advice - ${pattern}`)
      return {
        valid: false,
        error: `Prohibited advice detected: ${pattern}`,
        sanitized:
          'I can provide information about our products, but I cannot guarantee approvals or provide personalized financial advice. Would you like me to connect you with a specialist who can review your specific situation?'
      }
    }
  }

  // Check response length (suspiciously short or long)
  if (text.length < 20) {
    console.warn(`⚠️ Suspiciously short response: ${text.length} chars`)
    return {
      valid: false,
      error: 'Response too short',
      sanitized:
        "I don't have enough information to answer that properly. Could you rephrase your question or provide more details?"
    }
  }

  if (text.length > 5000) {
    console.warn(`⚠️ Suspiciously long response: ${text.length} chars - truncating`)
    // Truncate but still allow
    return {
      valid: true,
      text:
        text.slice(0, 4500) +
        '...\n\n*[Response truncated for length. Would you like me to continue or provide more specific information?]*'
    }
  }

  // Validation passed
  return { valid: true, text }
}

/**
 * Validate streaming token before sending
 * Lighter validation for real-time streaming
 * @param {string} token - Individual token/chunk
 * @returns {{valid: boolean, token?: string}}
 */
export function validateStreamingToken(token) {
  // Block suspicious patterns immediately — covers prompt leakage and prohibited financial advice
  const criticalPatterns = [
    /\{context\}/,
    /\{question\}/,
    /IMPORTANT RULES/i,
    /RAG_SYSTEM_PROMPT/i,
    /system prompt/i,
    /sanitize\(/i,
    /guarantee.*approval/i,
    /you will be approved/i,
    /certain(?:ly)? get approved/i,
    /promise.*approval/i,
    /we can guarantee/i,
    /you should borrow/i,
    /I advise you to apply/i
  ]

  for (const pattern of criticalPatterns) {
    if (pattern.test(token)) {
      console.error(`🚨 Streaming validation failed: ${pattern}`)
      return { valid: false }
    }
  }

  return { valid: true, token }
}
