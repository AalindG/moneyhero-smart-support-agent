import dotenv from 'dotenv'
import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama'
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib'
import { BufferMemory } from 'langchain/memory'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { loadVectorstoreMetadata } from './config/embeddingValidation.js'

// Load environment variables
dotenv.config()

// Get project root directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

// Configuration
const VECTORSTORE_PATH = join(projectRoot, 'vectorstore')
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2'
const OLLAMA_CLASSIFIER_MODEL = process.env.OLLAMA_CLASSIFIER_MODEL || 'llama3.2:1b'
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'

// RAG Configuration Constants
const MAX_MESSAGE_LENGTH = 2000
const MAX_HISTORY_MESSAGES = 20 // Last 10 conversation pairs
const RETRIEVAL_K = 5 // Number of document chunks to retrieve — raised to 5 for comparison queries
const LLM_TIMEOUT_MS = 90000 // 90 seconds — 1b classifier (~5s) + retrieval (<1s) + 7b generation (~60s)
const LLM_TEMPERATURE = 0 // Factual financial Q&A — zero randomness for accuracy

// Layer 1: Customer-friendly RAG prompt that prevents hallucination
// Uses <knowledge_base> XML delimiters to clearly separate retrieved context from instructions,
// preventing the model from confusing retrieved content with system instructions.
const RAG_SYSTEM_PROMPT = `You are a knowledgeable financial support agent for MoneyHero, a comparison platform for credit cards and personal loans in Singapore.

Answer the customer's question using ONLY the product information in the knowledge base below.

<knowledge_base>
{context}
</knowledge_base>

Guidelines:
- Answer naturally and directly — never reference "the knowledge base", "the context", "documents", or use any source meta-language
- Provide specific details: product names, rates, fees, and eligibility criteria exactly as stated in the knowledge base
- When comparing products, clearly list their key differences
- Present options neutrally — do not assume what the customer wants unless they have said so
- Always remind the customer to verify current rates, fees, and eligibility directly with the financial institution before applying
- Never invent, infer, or assume product details not explicitly stated in the knowledge base
- Never guarantee approval or promise outcomes — use phrases like "may be eligible" or "typically requires"

If the knowledge base contains partial information, use it to give the most complete answer possible — never refuse to answer just because the context is incomplete.
Only if the knowledge base contains NO information at all relevant to the question, respond with:
"I don't have detailed information about that. Would you like me to connect you with one of our advisors?"

Customer: {question}
Agent:`

// Global state
let vectorStore = null
const sessionMemories = new Map()
const sessionLastAccess = new Map()
const SESSION_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

// Evict sessions that haven't been accessed within TTL
function evictStaleSessions() {
  const now = Date.now()
  for (const [sessionId, lastAccess] of sessionLastAccess.entries()) {
    if (now - lastAccess > SESSION_TTL_MS) {
      sessionMemories.delete(sessionId)
      sessionLastAccess.delete(sessionId)
      console.log(`Evicted stale session memory: ${sessionId}`)
    }
  }
}

/**
 * Race a promise against a timeout
 * @param {Promise} promise - The promise to race
 * @param {number} ms - Timeout in milliseconds
 * @returns {Promise} Promise that resolves/rejects with the first result
 */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('LLM_TIMEOUT')), ms))
  ])
}

/**
 * Initialize vector store (lazy loading)
 * @returns {Promise<HNSWLib|null>} Vector store instance or null if unavailable
 */
async function getVectorStore() {
  if (vectorStore) return vectorStore

  try {
    console.log(`Loading vector store from: ${VECTORSTORE_PATH}`)

    // Validate embedding model consistency
    loadVectorstoreMetadata(VECTORSTORE_PATH, OLLAMA_EMBED_MODEL)

    const embeddings = new OllamaEmbeddings({
      model: OLLAMA_EMBED_MODEL,
      baseUrl: OLLAMA_BASE_URL
    })

    vectorStore = await HNSWLib.load(VECTORSTORE_PATH, embeddings)
    console.log('Vector store loaded successfully')

    return vectorStore
  } catch (error) {
    console.error('Vectorstore not found. Run "npm run ingest" to create it.')
    return null
  }
}

/**
 * Get or create memory for a session
 * @param {string} sessionId - Unique session identifier
 * @returns {BufferMemory} LangChain BufferMemory instance
 */
function getSessionMemory(sessionId) {
  if (!sessionMemories.has(sessionId)) {
    sessionMemories.set(
      sessionId,
      new BufferMemory({
        returnMessages: true,
        memoryKey: 'history'
      })
    )
  }
  sessionLastAccess.set(sessionId, Date.now())
  evictStaleSessions()
  return sessionMemories.get(sessionId)
}

/**
 * Classify user intent using the dedicated lightweight classifier model.
 * Returns intent and confidence score for monitoring and routing decisions.
 * @param {string} message - User's input message
 * @returns {Promise<{intent: string, confidence: number}>} Intent and confidence (0.0 to 1.0)
 */
async function classifyIntent(message) {
  const classifierLLM = new ChatOllama({
    model: OLLAMA_CLASSIFIER_MODEL,
    baseUrl: OLLAMA_BASE_URL,
    temperature: 0.0,
    timeout: 10000 // 10 second timeout for classification only
  })

  const classificationPrompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an intent classifier for a financial products support agent.

Classify the user's message into ONE of these categories:

1. "answer" - ANY question about credit cards or loans, including features, rates, fees, eligibility, applications, recommendations, comparisons, and listings
2. "escalate" - User EXPLICITLY asks to speak to a human, requests a callback, or expresses frustration with the service
3. "off_topic" - Questions with NO relation to financial products (weather, sports, cooking, general knowledge, coding, etc.)

Respond with ONLY the intent category: answer, escalate, or off_topic

Examples:
User: "What are the benefits of the HSBC Revolution card?" → answer
User: "Which card is best for travel?" → answer
User: "What cards are good for cashback?" → answer
User: "List all available credit cards" → answer
User: "Compare DBS and OCBC cards" → answer
User: "How do I apply for a personal loan?" → answer
User: "I need to speak to a human agent" → escalate
User: "Let me talk to someone please" → escalate
User: "This is taking too long, I want to talk to someone" → escalate
User: "What's the weather today?" → off_topic
User: "Tell me a joke" → off_topic
User: "Write me a Python script" → off_topic`
    ],
    ['user', '{message}']
  ])

  const chain = classificationPrompt.pipe(classifierLLM).pipe(new StringOutputParser())

  try {
    const result = await chain.invoke({ message })
    const normalized = result.trim().toLowerCase()

    // Parse intent and estimate confidence based on response clarity
    let intent = 'uncertain'
    let confidence = 0.5

    if (normalized.includes('escalate')) {
      intent = 'escalate'
      // High confidence for explicit escalations
      confidence = normalized.match(/^escalate\s*$/i) ? 0.95 : 0.85
    } else if (normalized.includes('off_topic')) {
      intent = 'off_topic'
      confidence = normalized.match(/^off_topic\s*$/i) ? 0.9 : 0.75
    } else if (normalized.includes('answer')) {
      intent = 'answer'
      confidence = normalized.match(/^answer\s*$/i) ? 0.9 : 0.75
    } else {
      // Unexpected output - low confidence
      console.warn(`Classifier returned unexpected value: "${result}"`)
      confidence = 0.3
    }

    console.log(`Intent: ${intent} (confidence: ${confidence.toFixed(2)})`)

    return { intent, confidence }
  } catch (error) {
    console.error('Intent classification error:', error.message)
    return { intent: 'uncertain', confidence: 0.0 }
  }
}

/**
 * Detect product category from the message using keyword matching.
 * Returns 'credit-cards', 'personal-loans', or null when ambiguous.
 * FAQs (category 'faqs') are always included regardless of the detected category.
 * @param {string} message - User message
 * @returns {'credit-cards'|'personal-loans'|null}
 */
function detectQueryCategory(message) {
  const lower = message.toLowerCase()

  const isAboutLoans = ['loan', 'borrow', 'repayment', 'instalment', 'installment', 'cashone'].some(
    kw => lower.includes(kw)
  )

  const isAboutCards = ['card', 'cashback', 'miles', 'rewards', 'annual fee', 'krisflyer', 'live fresh', 'revolution'].some(
    kw => lower.includes(kw)
  )

  // Only filter when the signal is unambiguous — mixed or neutral queries get all categories
  if (isAboutLoans && !isAboutCards) return 'personal-loans'
  if (isAboutCards && !isAboutLoans) return 'credit-cards'
  return null
}

/**
 * Handle "answer" intent with four-layer knowledge-base guardrail RAG retrieval.
 *
 * Layer 1 — Strict RAG prompt: {context} and {question} filled before LLM call.
 * Layer 2 — Temperature=0: set on the llm instance passed in (no randomness).
 * Layer 3 — Retrieval gate: blocks LLM call when no relevant docs are found.
 * Layer 4 — Source logging: every request logs query, sources, and response length.
 *
 * @param {string} sessionId - Session identifier
 * @param {string} message - User's message
 * @param {ChatOllama} llm - Initialized LLM instance (temperature=0)
 * @param {boolean} streaming - If true, returns prompt for external streaming
 * @returns {Promise<{reply: string, sources: string[]}|{prompt: string, memory: BufferMemory, sources: string[]}>}
 */
async function handleAnswerIntent(sessionId, message, llm, streaming = false) {
  try {
    console.log('Starting RAG retrieval...')
    const store = await getVectorStore()

    if (!store) {
      console.error('Vector store unavailable — run "npm run ingest" to create it')
      throw new Error('VECTORSTORE_UNAVAILABLE')
    }

    // ── LAYER 3: Retrieval gate ──────────────────────────────────────────────
    // HNSWLib returns cosine DISTANCE: lower = more similar (0 = identical, 1 = orthogonal).
    // Fetch 20 candidates so the score filter has enough docs to choose from.
    console.log('Retrieving relevant documents...')
    const candidateDocs = await store.similaritySearchWithScore(message, 20)

    // Gate 1: vectorstore empty or retrieval failed completely
    if (candidateDocs.length === 0) {
      console.log('No documents found in vector store')
      if (streaming) throw new Error('NO_RELEVANT_DOCS')
      return {
        reply:
          "I don't have information about that in my knowledge base. Would you like to speak with our support team?",
        sources: []
      }
    }

    // Gate 2: score filter — keep only docs close enough to be relevant.
    // 0.55 is intentionally permissive: broad catalog queries ("what cards do you offer")
    // have inherently higher cosine distances from individual product chunks than
    // specific Q&A queries. The LLM's strict prompt guards against hallucination.
    const MAX_DISTANCE_THRESHOLD = 0.55
    const filteredDocs = candidateDocs.filter(([, score]) => score <= MAX_DISTANCE_THRESHOLD)

    // ── LAYER 4: Source logging ───────────────────────────────────────────────
    console.log(`Query: "${message}"`)
    console.log(
      'Candidate docs:',
      candidateDocs.map(
        ([doc, score]) =>
          `${doc.metadata?.source?.split('/').pop() || 'unknown'} (score: ${score.toFixed(3)})`
      )
    )

    if (filteredDocs.length === 0) {
      console.log(`No documents within distance threshold ${MAX_DISTANCE_THRESHOLD} — skipping LLM`)
      if (streaming) throw new Error('NO_RELEVANT_DOCS')
      return {
        reply:
          "I don't have information about that in my knowledge base. Would you like to speak with our support team?",
        sources: []
      }
    }

    // Gate 3: category filter — prevent credit card docs from appearing in loan answers and vice versa.
    // FAQs (category 'faqs') are always included as they cover both product types.
    const queryCategory = detectQueryCategory(message)
    const categoryFilteredDocs = queryCategory
      ? filteredDocs.filter(([doc]) => {
          const cat = doc.metadata?.category
          return cat === queryCategory || cat === 'faqs'
        })
      : filteredDocs

    console.log(
      `Category filter: detected="${queryCategory ?? 'none'}" kept ${categoryFilteredDocs.length}/${filteredDocs.length} docs`
    )

    if (categoryFilteredDocs.length === 0) {
      console.log(`Category filter removed all results — no ${queryCategory} docs in threshold range`)
      if (streaming) throw new Error('NO_RELEVANT_DOCS')
      return {
        reply:
          "I don't have information about that in my knowledge base. Would you like to speak with our support team?",
        sources: []
      }
    }

    // Take top RETRIEVAL_K results (already sorted closest-first by HNSWLib)
    const relevantDocs = categoryFilteredDocs.slice(0, RETRIEVAL_K).map(([doc]) => doc)

    // Extract source filenames for grounding log and return value
    const docSources = relevantDocs.map(doc => doc.metadata?.source || 'unknown')
    console.log(`Sources used (${relevantDocs.length} doc(s)): [${docSources.join(', ')}]`)

    // Build context string — sanitize each chunk to prevent doc-injection attacks
    const sanitizeContext = text =>
      text
        .replace(/<\/?(?:user|assistant|system)>/gi, '')
        .replace(/\{context\}|\{question\}/gi, '')
        .replace(/IMPORTANT RULES/gi, '')
    const context = relevantDocs.map(doc => sanitizeContext(doc.pageContent)).join('\n\n---\n\n')

    // Get conversation history
    console.log('Loading conversation history...')
    const memory = getSessionMemory(sessionId)
    const historyMessages = await memory.chatHistory.getMessages()
    const cappedHistory = historyMessages.slice(-MAX_HISTORY_MESSAGES)
    console.log(`Loaded ${cappedHistory.length} history messages`)

    // ── LAYER 1: Fill {context} and {question} in strict RAG prompt ──────────
    // Enhanced sanitization to prevent prompt injection attacks
    const sanitize = text =>
      text
        .replace(/\n/g, ' ') // Remove newlines
        .replace(/<\/?(?:user|assistant|system|knowledge_base)>/gi, '') // Remove role and context delimiter tags
        .replace(/---+/g, '—') // Replace delimiters with em-dash
        .replace(/\{context\}|\{question\}/gi, '') // Remove template variables
        .replace(/IMPORTANT RULES/gi, '') // Block instruction override
        .replace(/ignore.*previous.*instructions?/gi, '') // Block jailbreak attempts
        .replace(/pretend you are/gi, '') // Block role manipulation
        .replace(/new context:/gi, '') // Block context injection
        .trim()
        .slice(0, MAX_MESSAGE_LENGTH) // Enforce max length

    // Start with the context block filled in
    let fullPrompt = RAG_SYSTEM_PROMPT.replace('{context}', context)

    // Insert sanitized conversation history before the Question line
    if (cappedHistory.length > 0) {
      const historyBlock = cappedHistory
        .map(msg => {
          if (msg instanceof HumanMessage) return `Customer: ${sanitize(msg.content)}`
          if (msg instanceof AIMessage) return `Agent: ${sanitize(msg.content)}`
          return ''
        })
        .filter(Boolean)
        .join('\n')
      fullPrompt = fullPrompt.replace(
        'Customer: {question}',
        `${historyBlock}\n\nCustomer: {question}`
      )
    }

    // Fill question placeholder with injection-safe sanitized input
    fullPrompt = fullPrompt.replace('{question}', sanitize(message))

    if (streaming) {
      return { prompt: fullPrompt, memory, sources: docSources }
    }

    // Non-streaming: invoke LLM with the fully-grounded prompt
    // Layer 2 (temperature=0) is already set on the llm instance passed in
    console.log('Generating response with LLM...')
    const rawReply = await llm.invoke(fullPrompt)
    const reply = typeof rawReply === 'string' ? rawReply : (rawReply.content ?? String(rawReply))

    console.log(`Response generated successfully (${reply.length} chars)`)
    console.log(`Sources: [${docSources.join(', ')}]`)

    // Save conversation to memory
    await memory.saveContext({ input: message }, { output: reply })

    return { reply, sources: docSources }
  } catch (error) {
    console.error('RAG retrieval error:', error.message)
    throw error
  }
}

/**
 * Handle "escalate" intent
 * @param {string} sessionId - Session identifier
 * @param {string} message - User's message
 * @returns {Promise<string>} Escalation response message
 */
async function handleEscalateIntent(sessionId, message) {
  const memory = getSessionMemory(sessionId)
  const reply =
    "I understand you'd like to speak with a specialist. Let me connect you to one of our expert advisors who can provide personalized assistance. Please hold on for a moment."

  // Save to memory
  await memory.saveContext({ input: message }, { output: reply })

  return reply
}

/**
 * Handle "off_topic" intent
 * @param {string} sessionId - Session identifier
 * @param {string} message - User's message
 * @returns {Promise<string>} Redirect response message
 */
async function handleOffTopicIntent(sessionId, message) {
  const memory = getSessionMemory(sessionId)
  const reply =
    "I'm MoneyHero's support assistant, specialized in credit cards and personal loans in Hong Kong. I'm not able to help with that topic, but I'd love to help you find the right financial product! Ask me about credit card rewards, personal loan rates, eligibility requirements, or how to apply."

  // Save to memory
  await memory.saveContext({ input: message }, { output: reply })

  return reply
}

/**
 * Core chat processing logic
 * @param {string} sessionId - Session identifier
 * @param {string} message - User's message
 * @param {boolean} streaming - If true, returns prompt for external streaming
 * @returns {Promise<{reply: string, intent: string}|{prompt: string, memory: BufferMemory, intent: string}>}
 */
async function processChat(sessionId, message, streaming) {
  // Initialize LLM
  const llm = new ChatOllama({
    model: OLLAMA_MODEL,
    baseUrl: OLLAMA_BASE_URL,
    temperature: LLM_TEMPERATURE,
    timeout: LLM_TIMEOUT_MS
  })

  // Step 1: Keyword pre-check for escalation — runs before the LLM classifier.
  // Small models (1B) are unreliable for safety-critical routing; keywords are deterministic.
  // Single-word keywords use word-boundary matching to avoid false positives (e.g. 'person' in 'personal loan').
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
    "doesn't work",
    "isn't working"
  ]
  const lowerMessage = message.toLowerCase()
  const isEscalationKeyword = ESCALATION_KEYWORDS.some(kw =>
    kw.includes(' ') ? lowerMessage.includes(kw) : new RegExp(`\\b${kw}\\b`).test(lowerMessage)
  )
  if (isEscalationKeyword) {
    console.log(`Escalation keyword detected — bypassing classifier`)
    const escReply = await handleEscalateIntent(sessionId, message)
    return { reply: escReply, intent: 'escalate', sources: [] }
  }

  // Step 2: Classify intent via LLM
  console.log(`Classifying intent for session: ${sessionId}`)
  const { intent, confidence } = await classifyIntent(message)
  console.log(`Detected intent: ${intent} (confidence: ${confidence.toFixed(2)})`)

  // Low confidence threshold - route to human for safety
  const LOW_CONFIDENCE_THRESHOLD = 0.3
  if (confidence < LOW_CONFIDENCE_THRESHOLD) {
    console.warn(`⚠️  Low confidence (${confidence.toFixed(2)}) - routing to human`)
    const escReply = await handleEscalateIntent(sessionId, message)
    return { reply: escReply, intent: 'escalate', sources: [], confidence }
  }

  let result

  // Step 3: Route to appropriate handler
  switch (intent) {
    case 'answer':
      result = await handleAnswerIntent(sessionId, message, llm, streaming)
      if (streaming) {
        return { ...result, intent, confidence } // { prompt, memory, sources, intent, confidence }
      }
      return { reply: result.reply, intent, sources: result.sources, confidence }

    case 'escalate': {
      const escReply = await handleEscalateIntent(sessionId, message)
      return { reply: escReply, intent, sources: [], confidence }
    }

    case 'off_topic': {
      const offReply = await handleOffTopicIntent(sessionId, message)
      return { reply: offReply, intent, sources: [], confidence }
    }

    case 'uncertain':
      // Classifier was unsure — attempt RAG retrieval and let the LLM decide based on context.
      // If no relevant docs are found the distance threshold will still prevent hallucination.
      console.log('Intent uncertain — attempting RAG retrieval')
      result = await handleAnswerIntent(sessionId, message, llm, streaming)
      if (streaming) {
        return { ...result, intent: 'answer', confidence }
      }
      return { reply: result.reply, intent: 'answer', sources: result.sources, confidence }

    default:
      result = await handleAnswerIntent(sessionId, message, llm, streaming)
      if (streaming) {
        return { ...result, intent, confidence }
      }
      return { reply: result.reply, intent, sources: result.sources, confidence }
  }
}

/**
 * Main chat function - processes user message with intent routing
 * @param {string} sessionId - Session identifier for conversation context
 * @param {string} message - User's message
 * @param {boolean} streaming - If true, returns prompt for external streaming
 * @returns {Promise<{reply: string, intent: string, sources: string[]}>
 *   | Promise<{prompt: string, intent: string, memory: object, sources: string[]}>}
 */
export async function chat(sessionId, message, streaming = false) {
  if (!sessionId || !message) {
    throw new Error('sessionId and message are required')
  }

  // Truncate extremely long messages to prevent context overflow
  const truncatedMessage =
    message.length > MAX_MESSAGE_LENGTH ? message.slice(0, MAX_MESSAGE_LENGTH) : message

  try {
    return await withTimeout(processChat(sessionId, truncatedMessage, streaming), LLM_TIMEOUT_MS)
  } catch (error) {
    // Get session memory for saving error context
    const memory = getSessionMemory(sessionId)

    if (error.message === 'LLM_TIMEOUT') {
      console.error(`LLM timeout after ${LLM_TIMEOUT_MS / 1000} seconds`)
      const result = {
        reply: "I'm sorry, the request took too long to process. Please try again in a moment.",
        intent: 'escalate', // Route to human due to system error
        sources: []
      }
      // Save error response to memory for conversation continuity
      await memory.saveContext({ input: truncatedMessage }, { output: result.reply })
      return streaming ? { ...result, memory } : result
    }
    if (error.message === 'NO_RELEVANT_DOCS') {
      const result = {
        reply:
          "I don't have information about that in my knowledge base. Would you like to speak with our support team?",
        intent: 'off_topic',
        sources: []
      }
      // Save error response to memory for conversation continuity
      await memory.saveContext({ input: truncatedMessage }, { output: result.reply })
      return streaming ? { ...result, memory } : result
    }
    if (error.message === 'VECTORSTORE_UNAVAILABLE') {
      const result = {
        reply:
          "I'm having trouble accessing my knowledge base right now. Please try again in a few moments, or contact support if this persists.",
        intent: 'escalate',
        sources: []
      }
      // Save error response to memory for conversation continuity
      await memory.saveContext({ input: truncatedMessage }, { output: result.reply })
      return streaming ? { ...result, memory } : result
    }
    console.error('Chat error:', error.message)
    throw new Error(`Failed to process chat: ${error.message}`)
  }
}

/**
 * Clear memory for a specific session (for testing or cleanup)
 * @param {string} sessionId - Session identifier to clear
 */
export function clearSessionMemory(sessionId) {
  if (sessionMemories.has(sessionId)) {
    sessionMemories.delete(sessionId)
    sessionLastAccess.delete(sessionId)
    console.log(`Cleared memory for session: ${sessionId}`)
  }
}
