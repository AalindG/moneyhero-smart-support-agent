/**
 * Response Validation Layer
 * Validates LLM outputs to prevent hallucination, fabricated data, and inappropriate advice
 */

// Known product names from knowledge base
const VALID_PRODUCTS = [
  'HSBC Revolution',
  'HSBC Revolution Card',
  'Citi Cashback Plus',
  'Citi Cashback Plus Card',
  'DBS Live Fresh',
  'DBS Live Fresh Card',
  'OCBC 365',
  'OCBC 365 Card',
  'UOB KrisFlyer',
  'UOB KrisFlyer Card',
  'DBS Personal Loan',
  'Standard Chartered CashOne',
  'CashOne'
]

// Prohibited advice patterns
const PROHIBITED_PATTERNS = [
  /guaranteed? approval/gi,
  /you will (definitely )?qualify/gi,
  /you should (definitely )?apply/gi,
  /best investment/gi,
  /recommend you invest/gi,
  /tax advice/gi,
  /legal advice/gi,
  /you must apply/gi,
  /guaranteed? (to get|acceptance)/gi
]

/**
 * Extract product names mentioned in text
 * @param {string} text - Text to analyze
 * @returns {string[]} Product names found
 */
function extractProductNames(text) {
  const found = []
  for (const product of VALID_PRODUCTS) {
    const pattern = new RegExp(product.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    if (pattern.test(text)) {
      found.push(product)
    }
  }
  return [...new Set(found)]
}

/**
 * Extract financial numbers from text (rates, fees, amounts)
 * @param {string} text - Text to analyze
 * @returns {number[]} Numbers found
 */
function extractFinancialNumbers(text) {
  const numbers = []
  
  // Match percentages: 8%, 25.9% p.a.
  const percentMatches = text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)
  for (const match of percentMatches) {
    numbers.push(parseFloat(match[1]))
  }
  
  // Match dollar amounts: S$30,000, $100
  const dollarMatches = text.matchAll(/[S$]\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?)/g)
  for (const match of dollarMatches) {
    const cleaned = match[1].replace(/,/g, '')
    numbers.push(parseFloat(cleaned))
  }
  
  // Match multipliers: 10x points
  const multiplierMatches = text.matchAll(/(\d+)x\s+(?:points?|miles?)/gi)
  for (const match of multiplierMatches) {
    numbers.push(parseInt(match[1]))
  }
  
  return numbers
}

/**
 * Check if response contains hallucinated products not in context
 * @param {string} response - LLM response
 * @param {string} context - Retrieved documents
 * @returns {{valid: boolean, hallucinated: string[]}}
 */
function checkProductHallucination(response, context) {
  const responseProducts = extractProductNames(response)
  const contextProducts = extractProductNames(context)
  
  const hallucinated = responseProducts.filter(
    rp => !contextProducts.some(cp => cp.toLowerCase() === rp.toLowerCase())
  )
  
  return {
    valid: hallucinated.length === 0,
    hallucinated
  }
}

/**
 * Check if response contains fabricated numbers not in context
 * @param {string} response - LLM response
 * @param {string} context - Retrieved documents
 * @returns {{valid: boolean, suspicious: number[]}}
 */
function checkNumberFabrication(response, context) {
  const responseNumbers = extractFinancialNumbers(response)
  const contextNumbers = extractFinancialNumbers(context)
  
  // Allow small variations due to rounding
  const suspicious = responseNumbers.filter(rn => {
    return !contextNumbers.some(cn => Math.abs(cn - rn) < 0.1)
  })
  
  return {
    valid: suspicious.length === 0,
    suspicious
  }
}

/**
 * Check for prohibited advice language
 * @param {string} response - LLM response
 * @returns {{valid: boolean, matches: string[]}}
 */
function checkProhibitedAdvice(response) {
  const matches = []
  
  for (const pattern of PROHIBITED_PATTERNS) {
    const found = response.match(pattern)
    if (found) {
      matches.push(...found)
    }
  }
  
  return {
    valid: matches.length === 0,
    matches
  }
}

/**
 * Validate LLM response for hallucination, fabrication, and inappropriate advice
 * @param {string} response - LLM generated response
 * @param {string} context - Retrieved documents used as context
 * @returns {{valid: boolean, reason?: string, details?: object}}
 */
export function validateFinancialResponse(response, context) {
  // Check 1: Product hallucination
  const productCheck = checkProductHallucination(response, context)
  if (!productCheck.valid) {
    console.error(`❌ Validation failed: Hallucinated products: ${productCheck.hallucinated.join(', ')}`)
    return {
      valid: false,
      reason: 'HALLUCINATED_PRODUCTS',
      details: { products: productCheck.hallucinated }
    }
  }
  
  // Check 2: Fabricated numbers
  const numberCheck = checkNumberFabrication(response, context)
  if (!numberCheck.valid && numberCheck.suspicious.length > 0) {
    console.warn(`⚠️  Validation warning: Suspicious numbers: ${numberCheck.suspicious.join(', ')}`)
    // Warning only - don't block, as some numbers might be reformatted (e.g., "30000" vs "30,000")
  }
  
  // Check 3: Prohibited advice
  const adviceCheck = checkProhibitedAdvice(response)
  if (!adviceCheck.valid) {
    console.error(`❌ Validation failed: Prohibited advice detected: ${adviceCheck.matches.join(', ')}`)
    return {
      valid: false,
      reason: 'INAPPROPRIATE_ADVICE',
      details: { matches: adviceCheck.matches }
    }
  }
  
  return { valid: true }
}

/**
 * Sanitize response if validation fails by returning a safe fallback
 * @param {string} response - Original response
 * @param {string} failureReason - Why validation failed
 * @returns {string} Safe fallback response
 */
export function getSafeFallback(response, failureReason) {
  console.log(`Returning safe fallback due to: ${failureReason}`)
  
  if (failureReason === 'HALLUCINATED_PRODUCTS') {
    return "I apologize, but I'm not confident in the accuracy of my response. Would you like me to connect you with an advisor who can provide verified information?"
  }
  
  if (failureReason === 'INAPPROPRIATE_ADVICE') {
    return "I can provide information about our credit cards and personal loans, but I'm not able to make recommendations about eligibility or approval. Would you like to speak with our team for personalized advice?"
  }
  
  return "I'm having trouble generating an accurate response. Let me connect you with our support team for assistance."
}
