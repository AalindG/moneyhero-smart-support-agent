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

*AI-generated information. Not financial advice. Verify details with institution.*`

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
