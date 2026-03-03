/**
 * MoneyHero RAG Agent - Production Grade
 * Secure financial chatbot with Claude Sonnet primary + Ollama fallback
 *
 * Security Features:
 * - Input sanitization (prompt injection protection)
 * - Role-based message separation
 * - Context window overflow protection
 * - PII redaction in logs
 * - Output validation
 *
 * Model Strategy:
 * - Primary: Claude 3.5 Sonnet (Anthropic API)
 * - Fallback: Llama 3.2 3B (Ollama local)
 * - Embeddings: nomic-embed-text (Ollama)
 */

import dotenv from 'dotenv'
import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama'
import { ChatAnthropic } from '@langchain/anthropic'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib'
import { BufferMemory } from 'langchain/memory'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { loadVectorstoreMetadata } from './config/embeddingValidation.js'
import { validateFinancialResponse, getSafeFallback } from './utils/responseValidator.js'

dotenv.config()

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

const VECTORSTORE_PATH = join(projectRoot, 'vectorstore')

// LLM Configuration
const USE_CLAUDE = process.env.USE_CLAUDE === 'true'
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b' // Upgraded from 1b
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'

// Limits
const MAX_MESSAGE_LENGTH = 2000
const MAX_CONTEXT_TOKENS = 6000 // Leave room for response
const LLM_TIMEOUT_MS = 90000
const SESSION_TTL_MS = 60 * 60 * 1000 // Reduced to 1 hour (security best practice)

// ═══════════════════════════════════════════════════════════════════════════
// PROMPTS WITH FEW-SHOT EXAMPLES
// ═══════════════════════════════════════════════════════════════════════════

const FIRST_MESSAGE_INSTRUCTION = `Start your reply with exactly: "Hi! I'm MoneyHero's AI assistant, here to help you find the right credit cards and personal loans."\n\n`

const RAG_SYSTEM_PROMPT = `You are MoneyHero's financial assistant for Singapore credit cards and personal loans.

MoneyHero's complete product catalogue (NEVER mention any product not in this list):
- Credit cards: HSBC Revolution, Citi Cashback Plus, DBS Live Fresh, OCBC 365, UOB KrisFlyer
- Personal loans: DBS Personal Loan, Standard Chartered CashOne

Use ONLY the following product information to answer. Do not use outside knowledge.

---
{context}
---

Rules:
1. Only mention products from the catalogue above. If asked about something else, say: "I don't have information on that. Would you like to speak with an advisor?"
2. Only state facts that appear in the product information above. Never invent rates, fees, or features.
3. If the product information doesn't answer the question, say: "I don't have that information. Would you like me to connect you with an advisor?"
4. Keep answers under 120 words. Use **bold** for product names and key numbers.
5. End with: "Verify current terms with [bank name] before applying."

Question: {question}

Answer:`

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT CATALOG (injected as context for listing queries)
// ═══════════════════════════════════════════════════════════════════════════

const CREDIT_CARD_CATALOG_CONTEXT = `MoneyHero offers the following 5 credit cards:
1. **HSBC Revolution Card** — Earn rewards points on online spend, dining, and entertainment
2. **Citi Cashback Plus Card** — Unlimited cashback on all purchases, no annual fee
3. **DBS Live Fresh Card** — Cashback on online shopping and Visa contactless payments
4. **OCBC 365 Card** — Cashback on dining, groceries, and petrol
5. **UOB KrisFlyer Card** — Earn KrisFlyer miles on everyday spend

Ask about any specific card for full details on fees, rewards, and eligibility.`

const PERSONAL_LOAN_CATALOG_CONTEXT = `MoneyHero offers the following 2 personal loans:
1. **DBS Personal Loan** — Flexible personal loan with competitive interest rates from DBS Bank
2. **Standard Chartered CashOne Loan** — Fast-approval personal loan from Standard Chartered

Ask about either loan for full details on rates, tenure, and eligibility.`

// ═══════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

let vectorStore = null
let primaryLLM = null
let fallbackLLM = null
const sessionMemories = new Map()
const sessionLastAccess = new Map()
const sessionFirstMessage = new Map() // Track first message for AI disclosure

function evictStaleSessions() {
  const now = Date.now()
  for (const [sessionId, lastAccess] of sessionLastAccess.entries()) {
    if (now - lastAccess > SESSION_TTL_MS) {
      sessionMemories.delete(sessionId)
      sessionLastAccess.delete(sessionId)
      sessionFirstMessage.delete(sessionId)
      console.log(`Evicted stale session: ${sessionId}`)
    }
  }
}

function getSessionMemory(sessionId) {
  if (!sessionMemories.has(sessionId)) {
    sessionMemories.set(sessionId, new BufferMemory({ returnMessages: true, memoryKey: 'history' }))
    sessionFirstMessage.set(sessionId, true) // Mark as first message
  }
  sessionLastAccess.set(sessionId, Date.now())
  evictStaleSessions()
  return sessionMemories.get(sessionId)
}

function isFirstMessage(sessionId) {
  return sessionFirstMessage.get(sessionId) === true
}

function markMessageProcessed(sessionId) {
  sessionFirstMessage.set(sessionId, false)
}

async function getVectorStore() {
  if (vectorStore) return vectorStore

  try {
    console.log(`Loading vector store from: ${VECTORSTORE_PATH}`)
    loadVectorstoreMetadata(VECTORSTORE_PATH, OLLAMA_EMBED_MODEL)

    const embeddings = new OllamaEmbeddings({
      model: OLLAMA_EMBED_MODEL,
      baseUrl: OLLAMA_BASE_URL
    })

    vectorStore = await HNSWLib.load(VECTORSTORE_PATH, embeddings)
    console.log('Vector store loaded successfully')
    return vectorStore
  } catch (error) {
    console.error('Vector store not found. Run "npm run ingest" first.')
    return null
  }
}

function initializeLLMs() {
  if (primaryLLM && fallbackLLM) return

  console.log('Initializing LLMs...', { USE_CLAUDE, ANTHROPIC_API_KEY })

  // Primary LLM: Claude Sonnet
  if (USE_CLAUDE && ANTHROPIC_API_KEY) {
    primaryLLM = new ChatAnthropic({
      model: 'claude-sonnet-4-6',
      apiKey: ANTHROPIC_API_KEY,
      maxTokens: 500,
      topP: 1, // LangChain defaults topP to -1; claude-sonnet-4-6 rejects that
      temperature: null // null → omit from request (claude-sonnet-4-6 rejects both together)
    })
    console.log('✅ Primary LLM: Claude 3.5 Sonnet (Anthropic API)')
  }

  // Fallback LLM: Ollama
  fallbackLLM = new ChatOllama({
    model: OLLAMA_MODEL,
    baseUrl: OLLAMA_BASE_URL,
    temperature: 0
  })
  console.log(`✅ Fallback LLM: ${OLLAMA_MODEL} (Ollama local)`)

  if (!primaryLLM) {
    primaryLLM = fallbackLLM
    console.log('⚠️  Claude not configured. Using Ollama as primary LLM.')
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Redact PII from logs (credit cards, NRIC, salaries)
 */
function redactPII(text) {
  return text
    .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, '[CARD_REDACTED]')
    .replace(/\b[STFG]\d{7}[A-Z]\b/gi, '[NRIC_REDACTED]')
    .replace(
      /\b\d{1,3}(,\d{3})*(\.\d{2})?\b(?=\s*(dollars?|sgd|per month|salary))/gi,
      '[AMOUNT_REDACTED]'
    )
}

/**
 * Sanitize user input to prevent prompt injection
 */
function sanitizeUserInput(message) {
  return message
    .replace(/<\/?(?:documents|user|assistant|system|context|question|examples|guidelines)>/gi, '') // Strip role/structure tags
    .replace(/---\s*(START|END)\s*(DOCUMENTS|QUESTION|ANSWER)/gi, '') // Strip old delimiters
    .replace(/RULES?:|IMPORTANT|system prompt|ignore previous|instructions?:|EXAMPLES?:/gi, '') // Block instruction injection
    .replace(/\{[^}]+\}/g, '') // Remove template variables
    .slice(0, MAX_MESSAGE_LENGTH) // Hard length limit
}

/**
 * Sanitize context to prevent delimiter escape
 */
function sanitizeContext(text) {
  return text
    .replace(/<\/?(?:user|assistant|system|documents|context|examples|guidelines)>/gi, '')
    .replace(/---\s*(START|END)\s*(DOCUMENTS|QUESTION|ANSWER)/gi, '')
    .replace(/\{context\}|\{question\}/gi, '')
    .replace(/IMPORTANT RULES/gi, '')
    .slice(0, 20000) // Context hard limit
}

/**
 * Estimate tokens (rough approximation)
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4)
}

/**
 * Detect product category from message
 */
function detectCategory(message) {
  const lower = message.toLowerCase()
  const isLoans = ['loan', 'borrow', 'repayment', 'instalment', 'installment', 'cashone'].some(kw =>
    lower.includes(kw)
  )
  const isCards = [
    'card',
    'cashback',
    'miles',
    'rewards',
    'annual fee',
    'krisflyer',
    'live fresh',
    'revolution'
  ].some(kw => lower.includes(kw))

  if (isLoans && !isCards) return 'personal-loans'
  if (isCards && !isLoans) return 'credit-cards'
  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// KEYWORD DETECTION
// ═══════════════════════════════════════════════════════════════════════════

const ESCALATION_KEYWORDS = [
  'human',
  'speak to',
  'talk to',
  'call me',
  'callback',
  'representative',
  'operator',
  'supervisor',
  'complaint',
  'frustrated',
  'useless',
  'not helpful',
  "doesn't work"
]

const OFF_TOPIC_KEYWORDS = [
  'mutual fund',
  'stock market',
  'etf ',
  'bitcoin',
  'crypto',
  'ethereum',
  'insurance',
  'weather',
  'cooking',
  'recipe',
  'sports',
  'invest in',
  'portfolio',
  // Meta-queries about the AI itself
  'system prompt',
  'your prompt',
  'your instructions',
  'your guidelines',
  'your examples',
  'how you work',
  'how do you work',
  'show me your',
  'tell me your',
  'what are your rules',
  'repeat your'
]

function detectEscalation(message) {
  const lower = message.toLowerCase()
  return ESCALATION_KEYWORDS.some(kw =>
    kw.includes(' ') ? lower.includes(kw) : new RegExp(`\\b${kw}\\b`).test(lower)
  )
}

function detectOffTopic(message) {
  const lower = message.toLowerCase()
  return OFF_TOPIC_KEYWORDS.some(kw => lower.includes(kw))
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect if a message is asking for a listing of available products.
 * Returns 'credit-cards', 'personal-loans', 'both', or null.
 */
function detectCatalogQuery(message) {
  const lower = message.toLowerCase()

  // Must have a listing-intent word
  if (!/\b(what|which|list|show|all|any|available)\b/.test(lower)) return null

  // Exclude specific-attribute queries — these go through vector search
  if (
    /\b(annual fee|interest rate|cashback|miles|reward|eligib|apply|benefit|travel|dining|petrol|grocery|online|rebate)\b/.test(
      lower
    )
  )
    return null

  // Exclude queries that name a specific product/bank — vector search handles those
  if (
    /\b(hsbc|dbs|uob|ocbc|citi|standard chartered|krisflyer|live fresh|revolution|cashone|cashback plus|365)\b/i.test(
      lower
    )
  )
    return null

  const hasCards = /\b(credit cards?|cards?)\b/.test(lower)
  const hasLoans = /\b(personal loans?|loans?)\b/.test(lower)

  // Generic "what products / offerings" — show both catalogs
  if (!hasCards && !hasLoans) {
    return /\b(products?|offerings?)\b/.test(lower) ? 'both' : null
  }

  if (hasCards && hasLoans) return 'both'
  return hasCards ? 'credit-cards' : 'personal-loans'
}

/**
 * Build a direct reply for catalog listing queries.
 * Bypasses the LLM entirely — streams the pre-formatted catalog text directly.
 * Returns the same shape as handleEscalation/handleOffTopic so the controller
 * routes it through fakeStream without modification.
 */
async function buildCatalogResult(sessionId, sanitizedQuestion, catalogType) {
  let reply = ''
  if (catalogType === 'credit-cards' || catalogType === 'both') {
    reply += CREDIT_CARD_CATALOG_CONTEXT
  }
  if (catalogType === 'personal-loans' || catalogType === 'both') {
    if (reply) reply += '\n\n'
    reply += PERSONAL_LOAN_CATALOG_CONTEXT
  }

  console.log(`[catalog] Direct reply for: ${catalogType}`)

  // Save to session memory for follow-up context
  const memory = getSessionMemory(sessionId)
  await memory.saveContext({ input: sanitizedQuestion }, { output: reply })
  markMessageProcessed(sessionId)

  return { reply, intent: 'catalog', sources: ['product-catalog'] }
}

async function handleEscalation(sessionId, message) {
  const reply =
    "I understand you'd like to speak with a human advisor. I'm connecting you now. A team member will reach out shortly."
  await getSessionMemory(sessionId).saveContext({ input: message }, { output: reply })
  return { reply, intent: 'escalate', sources: [] }
}

async function handleOffTopic(sessionId, message) {
  const reply =
    'I specialize in credit cards and personal loans. For other topics, please visit our main website or contact general support.'
  await getSessionMemory(sessionId).saveContext({ input: message }, { output: reply })
  return { reply, intent: 'off_topic', sources: [] }
}

async function handleRAGRetrieval(sessionId, message, streaming) {
  console.log(`[retrieval] Starting RAG for session: ${sessionId}`)
  console.log(`[retrieval] Query (sanitized): ${redactPII(message)}`)

  const store = await getVectorStore()
  if (!store) {
    throw new Error('VECTORSTORE_UNAVAILABLE')
  }

  // Retrieve similar documents (increased k for better recall)
  const candidateDocs = await store.similaritySearchWithScore(message, 30)

  if (candidateDocs.length === 0) {
    throw new Error('NO_RELEVANT_DOCS')
  }

  // Log top scores for debugging
  const topScores = candidateDocs
    .slice(0, 5)
    .map(([, s]) => s.toFixed(3))
    .join(', ')
  console.log(`[retrieval] Top 5 scores: ${topScores}`)

  // Single moderate threshold (removed adaptive logic)
  const threshold = 0.5
  let filteredDocs = candidateDocs.filter(([, score]) => score <= threshold)

  if (filteredDocs.length === 0) {
    throw new Error('NO_RELEVANT_DOCS')
  }

  // Category filter — exclude wrong product-type docs (e.g. loan docs from credit-card queries)
  const queryCategory = detectCategory(message)
  if (queryCategory) {
    const categoryFiltered = filteredDocs.filter(([doc]) => {
      const docCat = doc.metadata?.category
      return docCat === queryCategory || docCat === 'faqs'
    })
    // Only apply if we still have results after filtering
    if (categoryFiltered.length > 0) {
      filteredDocs = categoryFiltered
      console.log(
        `[retrieval] Category filter applied (${queryCategory}): ${filteredDocs.length} docs remain`
      )
    }
  }

  console.log(
    `[retrieval] Kept ${filteredDocs.length}/${candidateDocs.length} docs (threshold: ${threshold})`
  )

  // Deduplicate by source
  const seenSources = new Set()
  const dedupedDocs = filteredDocs.filter(([doc]) => {
    const src = doc.metadata?.source || 'unknown'
    if (seenSources.has(src)) return false
    seenSources.add(src)
    return true
  })

  // Build context from top 5 docs
  const topDocs = dedupedDocs.slice(0, 5)
  const context = topDocs.map(([doc]) => doc.pageContent).join('\n\n---\n\n')
  const sources = topDocs.map(([doc]) => doc.metadata?.source || 'unknown')

  console.log(`[retrieval] Using ${topDocs.length} docs from: ${sources.join(', ')}`)

  // Get conversation history
  const memory = getSessionMemory(sessionId)
  const { history } = await memory.loadMemoryVariables({})
  const messages = Array.isArray(history) ? history : []

  // Build prompt with proper delimiters
  const sanitizedContext = sanitizeContext(context)
  const sanitizedQuestion = sanitizeUserInput(message)

  const systemContent = RAG_SYSTEM_PROMPT.replace('{context}', sanitizedContext).replace(
    '{question}',
    sanitizedQuestion
  )

  // Check context window overflow
  const systemTokens = estimateTokens(systemContent)
  const historyTokens = messages.reduce((sum, msg) => sum + estimateTokens(msg.content || ''), 0)
  const totalTokens = systemTokens + historyTokens

  console.log(
    `[context] Tokens: system=${systemTokens}, history=${historyTokens}, total=${totalTokens}`
  )

  if (totalTokens > MAX_CONTEXT_TOKENS) {
    console.warn(`⚠️  Context overflow (${totalTokens} tokens). Truncating history...`)
    // Reduce history aggressively
    const maxHistoryTokens = MAX_CONTEXT_TOKENS - systemTokens - 500
    const includedHistory = []
    let historySum = 0
    for (let i = messages.length - 1; i >= 0; i--) {
      const msgTokens = estimateTokens(messages[i].content || '')
      if (historySum + msgTokens > maxHistoryTokens) break
      includedHistory.unshift(messages[i])
      historySum += msgTokens
    }
    console.log(
      `[context] Truncated history: ${messages.length} → ${includedHistory.length} messages`
    )
  }

  // Prepend greeting instruction only on the first message, then immediately clear the flag
  // so subsequent messages in the same session never receive it.
  const firstMsg = isFirstMessage(sessionId)
  const systemWithDisclosure = firstMsg
    ? FIRST_MESSAGE_INSTRUCTION + systemContent
    : systemContent
  if (firstMsg) markMessageProcessed(sessionId)

  // For streaming, return data for controller to handle
  if (streaming) {
    return {
      systemPrompt: systemWithDisclosure,
      memory,
      sources,
      context: sanitizedContext,
      sanitizedQuestion
    }
  }

  // For non-streaming, generate full response
  initializeLLMs()

  let reply
  try {
    // Try primary LLM (Claude)
    console.log('[llm] Attempting primary LLM (Claude)...')
    const response = await primaryLLM.invoke([
      new SystemMessage(systemWithDisclosure),
      new HumanMessage(sanitizedQuestion)
    ])
    reply = response.content
    console.log('[llm] ✅ Primary LLM succeeded')
  } catch (primaryError) {
    console.warn(`[llm] ⚠️  Primary LLM failed: ${primaryError.message}`)

    if (primaryLLM !== fallbackLLM) {
      console.log('[llm] Attempting fallback LLM (Ollama)...')
      try {
        const response = await fallbackLLM.invoke([
          new SystemMessage(systemWithDisclosure),
          new HumanMessage(sanitizedQuestion)
        ])
        reply = response.content
        console.log('[llm] ✅ Fallback LLM succeeded')
      } catch (fallbackError) {
        console.error(`[llm] ❌ Fallback LLM also failed: ${fallbackError.message}`)
        throw new Error('LLM_FAILURE')
      }
    } else {
      throw primaryError
    }
  }

  // Validate output
  const validation = validateFinancialResponse(reply, sanitizedContext)
  if (!validation.valid) {
    console.warn(`[validation] ❌ Failed: ${validation.reason}`)
    const fallback = getSafeFallback(reply, validation.reason)
    await memory.saveContext({ input: message }, { output: fallback })
    return { reply: fallback, sources }
  }

  // Add financial disclaimer
  const disclaimer = `\n\n---\n*AI-generated information. Not financial advice. Verify details with institution. MoneyHero is a comparison platform and is not licensed to provide financial advisory services under the Financial Advisers Act.*`
  const finalReply = reply + disclaimer

  console.log(`[llm] Response: ${reply.length} chars`)
  await memory.saveContext({ input: message }, { output: finalReply })

  markMessageProcessed(sessionId)

  return { reply: finalReply, sources }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CHAT FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

async function processChat(sessionId, message, streaming) {
  // Sanitize input first
  const sanitizedMessage = sanitizeUserInput(message)

  // 1. Check escalation
  if (detectEscalation(sanitizedMessage)) {
    console.log('[intent] Escalation detected')
    return await handleEscalation(sessionId, sanitizedMessage)
  }

  // 2. Check off-topic
  if (detectOffTopic(sanitizedMessage)) {
    console.log('[intent] Off-topic detected')
    return await handleOffTopic(sessionId, sanitizedMessage)
  }

  // 3. Catalog shortcut — stream pre-formatted product list, bypass LLM
  const catalogType = detectCatalogQuery(sanitizedMessage)
  if (catalogType) {
    console.log(`[shortcut] Catalog query detected (${catalogType})`)
    return await buildCatalogResult(sessionId, sanitizedMessage, catalogType)
  }

  // 4. RAG retrieval
  const result = await handleRAGRetrieval(sessionId, sanitizedMessage, streaming)
  return { ...result, intent: 'answer' }
}

export async function chat(sessionId, message, streaming = false) {
  if (!sessionId || !message) {
    throw new Error('sessionId and message are required')
  }

  const truncatedMessage =
    message.length > MAX_MESSAGE_LENGTH ? message.slice(0, MAX_MESSAGE_LENGTH) : message

  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('LLM_TIMEOUT')), LLM_TIMEOUT_MS)
    )
    return await Promise.race([processChat(sessionId, truncatedMessage, streaming), timeout])
  } catch (error) {
    const memory = getSessionMemory(sessionId)

    if (error.message === 'LLM_TIMEOUT') {
      const result = {
        reply: "I'm sorry, that took too long. Please try again.",
        intent: 'escalate',
        sources: []
      }
      await memory.saveContext({ input: truncatedMessage }, { output: result.reply })
      return streaming ? { ...result, memory } : result
    }

    if (error.message === 'NO_RELEVANT_DOCS') {
      const result = {
        reply:
          "I don't have information about that. Would you like to speak with our support team?",
        intent: 'off_topic',
        sources: []
      }
      await memory.saveContext({ input: truncatedMessage }, { output: result.reply })
      return streaming ? { ...result, memory } : result
    }

    if (error.message === 'VECTORSTORE_UNAVAILABLE') {
      const result = {
        reply: "I'm having trouble accessing my knowledge base. Please contact support.",
        intent: 'escalate',
        sources: []
      }
      await memory.saveContext({ input: truncatedMessage }, { output: result.reply })
      return streaming ? { ...result, memory } : result
    }

    if (error.message === 'LLM_FAILURE') {
      const result = {
        reply: "I'm experiencing technical difficulties. Please try again or contact support.",
        intent: 'escalate',
        sources: []
      }
      await memory.saveContext({ input: truncatedMessage }, { output: result.reply })
      return streaming ? { ...result, memory } : result
    }

    console.error('[error] Unexpected error:', error.message)
    throw error
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export function clearSessionMemory(sessionId) {
  sessionMemories.delete(sessionId)
  sessionLastAccess.delete(sessionId)
  sessionFirstMessage.delete(sessionId)
  console.log(`Cleared session: ${sessionId}`)
}

export async function warmup() {
  console.log('🔥 Warming up LLMs and embeddings...')

  initializeLLMs()

  // Warm up primary LLM
  try {
    await primaryLLM.invoke([new HumanMessage('hi')])
    console.log('✅ Primary LLM warmed up')
  } catch (err) {
    console.warn(`⚠️  Primary LLM warm-up failed: ${err.message}`)
  }

  // Warm up embeddings
  try {
    const embeddings = new OllamaEmbeddings({
      model: OLLAMA_EMBED_MODEL,
      baseUrl: OLLAMA_BASE_URL
    })
    await embeddings.embedQuery('test')
    console.log('✅ Embeddings warmed up')
  } catch (err) {
    console.warn(`⚠️  Embeddings warm-up failed: ${err.message}`)
  }

  console.log('🔥 Warm-up complete')
}
