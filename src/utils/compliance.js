/**
 * Financial Compliance Utilities
 * Ensures all financial product responses include required disclaimers
 * per regulatory requirements (MAS/similar financial authorities)
 */

/**
 * Standard disclaimer for AI-generated financial information
 */
const FINANCIAL_DISCLAIMER = `

---
*This information is provided by an AI assistant for general guidance only and does not constitute financial advice. Product features, rates, and fees are subject to change. Please verify all details directly with the financial institution before applying. Terms and conditions apply. MoneyHero is a comparison platform and does not guarantee loan or credit card approval.*`

/**
 * Short disclaimer for brief responses
 */
const SHORT_DISCLAIMER = `
---
*AI-generated information. Not financial advice. Verify details with institution.*`

/**
 * Known product names and key financial terms to bold in LLM responses.
 * Applied deterministically so the small model doesn't need to do it.
 */
const BOLD_PRODUCTS = [
  'HSBC Revolution Card',
  'HSBC Revolution',
  'Citi Cashback Plus Card',
  'Citi Cashback Plus',
  'DBS Live Fresh Card',
  'DBS Live Fresh',
  'OCBC 365 Card',
  'OCBC 365',
  'UOB KrisFlyer Card',
  'UOB KrisFlyer',
  'DBS CashOne',
  'Standard Chartered CashOne',
  'CashOne'
]

const BOLD_TERMS = [
  /(\d+(?:\.\d+)?%\s*(?:cashback|p\.a\.|per annum|miles?|interest|EIR|APR))/gi,
  /(S\$[\d,]+(?:\.\d+)?)/gi,
  /(\d+x\s+(?:points?|miles?))/gi
]

/**
 * Apply deterministic bold formatting to known product names and key numbers.
 * @param {string} response - LLM generated response
 * @returns {string} Response with bold markers applied
 */
export function applyBoldFormatting(response) {
  let result = response

  // Bold product names (longest first to avoid partial matches)
  const sorted = [...BOLD_PRODUCTS].sort((a, b) => b.length - a.length)
  for (const name of sorted) {
    // Only bold if not already bolded
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(`(?<!\\*\\*)${escaped}(?!\\*\\*)`, 'g'), `**${name}**`)
  }

  // Bold key financial figures (percentages, dollar amounts, multipliers)
  for (const pattern of BOLD_TERMS) {
    result = result.replace(pattern, '**$1**')
  }

  return result
}

/**
 * Add appropriate financial disclaimer to response
 * @param {string} response - LLM generated response
 * @param {string} intent - Intent classification (answer, escalate, off_topic)
 * @param {number} responseLength - Length of response
 * @returns {string} Response with disclaimer appended
 */
export function addFinancialDisclaimer(response, intent, responseLength = 0) {
  // Only add disclaimers to answer intent (actual financial information)
  if (intent !== 'answer') {
    return response
  }

  // If response is already very long, use short disclaimer
  // if (responseLength > 3000) {
  return response + SHORT_DISCLAIMER
  // }

  // Standard disclaimer for all financial product responses
  // return response + FINANCIAL_DISCLAIMER
}

/**
 * Check if response mentions specific products requiring disclaimer
 * @param {string} response - Response text
 * @returns {boolean} True if financial products mentioned
 */
export function mentionsFinancialProducts(response) {
  const productKeywords = [
    /credit card/i,
    /personal loan/i,
    /interest rate/i,
    /annual fee/i,
    /cashback/i,
    /rewards/i,
    /eligibility/i,
    /apply/i,
    /approval/i,
    /HSBC|DBS|OCBC|UOB|Citi|Standard Chartered/i
  ]

  return productKeywords.some(pattern => pattern.test(response))
}

/**
 * Add product-specific warnings if needed
 * @param {string} response - Response text
 * @returns {string} Response with warnings if applicable
 */
export function addRegulatoryWarnings(response) {
  let warned = response

  // Warn about credit card debt if discussing credit cards
  if (/credit card/i.test(response) && /interest/i.test(response)) {
    if (!warned.includes('interest charges')) {
      warned +=
        '\n\n⚠️ *Reminder: Pay your credit card balance in full each month to avoid interest charges.*'
    }
  }

  // Warn about responsible borrowing if discussing loans
  if (/personal loan|borrow/i.test(response)) {
    if (!warned.includes('borrow responsibly')) {
      warned +=
        '\n\n⚠️ *Reminder: Borrow responsibly. Ensure you can afford repayments before applying.*'
    }
  }

  return warned
}
/**
 * Common profanity and offensive term patterns
 * This is a basic filter - consider using a package like 'bad-words' for production
 */
const PROFANITY_PATTERNS = [
  /\bf+u+c+k+/gi,
  /\bs+h+i+t+/gi,
  /\ba+s+s+h+o+l+e+/gi,
  /\bb+i+t+c+h+/gi,
  /\bd+a+m+n+/gi,
  /\bc+r+a+p+/gi,
  /\bh+e+l+l+/gi,
  /\bp+i+s+s+/gi,
  /\bc+o+c+k+/gi,
  /\bd+i+c+k+/gi,
  /\bp+u+s+s+y+/gi,
  /\bs+l+u+t+/gi,
  /\bw+h+o+r+e+/gi,
  /\bf+a+g+/gi,
  /\bn+i+g+g+/gi,
  /\bc+u+n+t+/gi
]

/**
 * Check if text contains profanity or offensive language
 * @param {string} text - Text to check
 * @returns {{hasProfanity: boolean, sanitized: string}}
 */
export function checkProfanity(text) {
  let hasProfanity = false
  let sanitized = text

  for (const pattern of PROFANITY_PATTERNS) {
    if (pattern.test(text)) {
      hasProfanity = true
      // Replace with asterisks, keeping first and last characters
      sanitized = sanitized.replace(pattern, match => {
        if (match.length <= 2) return '*'.repeat(match.length)
        return match[0] + '*'.repeat(match.length - 2) + match[match.length - 1]
      })
    }
  }

  return { hasProfanity, sanitized }
}

/**
 * Filter input message for profanity before processing
 * @param {string} message - User input message
 * @returns {{allowed: boolean, sanitized: string, reason?: string}}
 */
export function filterInputMessage(message) {
  const profanityCheck = checkProfanity(message)

  if (profanityCheck.hasProfanity) {
    return {
      allowed: false,
      sanitized: profanityCheck.sanitized,
      reason: 'PROFANITY_DETECTED'
    }
  }

  return {
    allowed: true,
    sanitized: message
  }
}

/**
 * Sanitize output response if it contains inappropriate content
 * @param {string} response - LLM generated response
 * @returns {{valid: boolean, sanitized: string}}
 */
export function sanitizeOutput(response) {
  const profanityCheck = checkProfanity(response)

  // If LLM somehow generated profanity, return a safe fallback
  if (profanityCheck.hasProfanity) {
    console.error('⚠️ LLM response contained profanity - replacing with safe fallback')
    return {
      valid: false,
      sanitized:
        "I apologize, but I can't provide that response. How can I help you with information about credit cards or personal loans?"
    }
  }

  return {
    valid: true,
    sanitized: response
  }
}
