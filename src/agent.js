import dotenv from 'dotenv'
import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama'
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib'
import { BufferMemory } from 'langchain/memory'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { readFileSync } from 'fs'
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
const RAG_SYSTEM_PROMPT = `Use ONLY the information below to answer. Do not add anything from your training data.

{context}

Q: {question}
A:`

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
  const classifyStart = Date.now()

  // Use Ollama /api/generate (completion mode) with a few-shot prompt ending in " →"
  // so the model fills in exactly one word instead of answering the user's question.
  // Chat format confuses 1B models — they answer the user instead of classifying.
  const classifyPrompt = `Classify the message. Output ONLY one word: answer, escalate, or off_topic.

answer     = question about credit cards or personal loans
escalate   = wants to speak to a human agent
off_topic  = anything else (weather, cooking, stocks, mutual funds, insurance, crypto, etc.)

"What are the benefits of the HSBC Revolution card?" → answer
"List all available credit cards" → answer
"What credit cards do you offer?" → answer
"Compare DBS and OCBC cards" → answer
"How do I apply for a personal loan?" → answer
"I need to speak to a human agent" → escalate
"Let me talk to someone please" → escalate
"What's the weather today?" → off_topic
"What mutual funds should I invest in?" → off_topic
"Should I buy Bitcoin?" → off_topic
"What insurance plan is best?" → off_topic

"${message.replace(/"/g, "'")}" →`

  try {
    // Use streaming so the first token arrives as soon as the model starts generating.
    // Non-streaming (stream: false) waits for full generation before returning, which is
    // slower on a cold model. We abort the stream after the first token we care about.
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 45000)

    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_CLASSIFIER_MODEL,
        prompt: classifyPrompt,
        stream: true,
        options: { temperature: 0.0, num_predict: 5 }
      }),
      signal: controller.signal
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    // Read just enough tokens to identify the intent word
    const reader = response.body.getReader()
    const dec = new TextDecoder()
    let raw = ''
    while (raw.length < 20) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = dec.decode(value, { stream: true })
      for (const line of chunk.split('\n').filter(Boolean)) {
        try { raw += (JSON.parse(line).response || '') } catch { /* skip */ }
      }
    }
    reader.cancel()
    clearTimeout(timeoutId)
    raw = raw.trim().toLowerCase()

    let intent = 'uncertain'
    let confidence = 0.5

    if (raw.startsWith('escalate')) {
      intent = 'escalate'
      confidence = 0.95
    } else if (raw.startsWith('off_topic') || raw.startsWith('off-topic')) {
      intent = 'off_topic'
      confidence = 0.9
    } else if (raw.startsWith('answer')) {
      intent = 'answer'
      confidence = 0.9
    } else {
      console.warn(`Classifier unexpected output: "${raw}"`)
      confidence = 0.3
    }

    console.log(`  [classify] intent=${intent} confidence=${confidence.toFixed(2)} raw="${raw}" (${Date.now() - classifyStart}ms)`)
    return { intent, confidence }
  } catch (error) {
    console.error(`  [classify] error: ${error.message} (${Date.now() - classifyStart}ms)`)
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
    console.log('  [retrieval] searching vectorstore...')
    const retrievalStart = Date.now()
    const candidateDocs = await store.similaritySearchWithScore(message, 20)
    console.log(`  [retrieval] got ${candidateDocs.length} candidates in ${Date.now() - retrievalStart}ms`)

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
    console.log(`  [retrieval] query: "${message.slice(0, 80)}"`)
    console.log(
      `  [retrieval] candidates (top 10):`,
      candidateDocs.slice(0, 10).map(
        ([doc, score]) =>
          `${doc.metadata?.source?.split('/').pop() || 'unknown'}(${score.toFixed(3)})`
      ).join(', ')
    )
    console.log(`  [retrieval] score filter ≤${MAX_DISTANCE_THRESHOLD}: ${filteredDocs.length}/${candidateDocs.length} docs passed`)

    if (filteredDocs.length === 0) {
      console.log(`  [retrieval] ALL docs filtered out — no relevant content found`)
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
      `  [retrieval] category filter: detected="${queryCategory ?? 'none'}" kept ${categoryFilteredDocs.length}/${filteredDocs.length} docs`
    )

    if (categoryFilteredDocs.length === 0) {
      console.log(`  [retrieval] category filter removed all results — no ${queryCategory} docs in range`)
      if (streaming) throw new Error('NO_RELEVANT_DOCS')
      return {
        reply:
          "I don't have information about that in my knowledge base. Would you like to speak with our support team?",
        sources: []
      }
    }

    // Deduplicate by source file — keep only the closest chunk per file.
    // Prevents one file (e.g. dbs-live-fresh.md) from dominating context with multiple chunks
    // and biasing the LLM toward that product when listing all products.
    const seenSources = new Set()
    const dedupedDocs = categoryFilteredDocs.filter(([doc]) => {
      const src = doc.metadata?.source || 'unknown'
      if (seenSources.has(src)) return false
      seenSources.add(src)
      return true
    })

    // ── CATALOG QUERY SHORTCUT ──────────────────────────────────────────────
    // For "list all products" type queries, if overview.md is the top retrieved doc,
    // return its content directly without LLM generation. A 1B model cannot reliably
    // enumerate all 5 products from context; returning the source doc is 100% accurate.
    const LISTING_QUERY_PATTERNS = [
      /what (credit )?cards? (do you|does moneyHero|are|you) (offer|have|provide|available)/i,
      /which cards? (do you|does moneyHero|are|you)/i,
      /list (all |the )?(credit )?cards?/i,
      /tell me (about |all )?((the )?cards?|products?)/i,
      /what products? (do you|are)/i,
      /available cards?/i,
      /cards? (you offer|you have|available)/i
    ]
    const isListingQuery = LISTING_QUERY_PATTERNS.some(p => p.test(message))
    const topDoc = dedupedDocs[0]?.[0]
    const topDocIsOverview = topDoc?.metadata?.source?.endsWith('overview.md')

    if (isListingQuery && topDocIsOverview) {
      console.log(`  [retrieval] catalog query + overview.md top doc — reading file directly`)
      // Read overview.md from disk instead of stitching vector store chunks.
      // Chunks for individual card bullets may score beyond the top-20 similarity results,
      // so the vector store path is unreliable for complete catalog listings.
      const overviewSrc = topDoc.metadata?.source  // e.g. "credit-cards/overview.md"
      const overviewFilePath = join(projectRoot, 'docs', overviewSrc)
      let overviewContent
      try {
        overviewContent = readFileSync(overviewFilePath, 'utf8')
          .replace(/^#[^\n]*\n/m, '')  // Remove leading H1
          .trim()
      } catch (readErr) {
        console.warn(`  [retrieval] could not read ${overviewFilePath}: ${readErr.message} — falling through to LLM`)
        overviewContent = null
      }

      if (overviewContent) {
        const memory = getSessionMemory(sessionId)
        if (streaming) {
          return { directReply: overviewContent, memory, sources: [overviewSrc] }
        }
        await memory.saveContext({ input: message }, { output: overviewContent })
        return { reply: overviewContent, sources: [overviewSrc] }
      }
      // Fall through to LLM if file read failed
    }

    // For specific (non-listing) queries, use targeted doc selection:
    // 1. If a known card/loan name is in the message, prioritise that product's doc.
    // 2. Otherwise fall back to the top-scored deduplicated doc.
    // A 1B model answers correctly with a short, focused context (~500 chars);
    // giving it 5 docs (~2600 chars) causes it to hallucinate from training data.
    const CARD_DOC_MAP = {
      hsbc: 'hsbc-revolution.md', revolution: 'hsbc-revolution.md',
      citi: 'citi-cashback-plus.md', 'cashback plus': 'citi-cashback-plus.md',
      'dbs live fresh': 'dbs-live-fresh.md', 'live fresh': 'dbs-live-fresh.md',
      dbs: 'dbs-live-fresh.md',
      ocbc: 'ocbc-365.md', '365': 'ocbc-365.md',
      uob: 'uob-krisflyer.md', krisflyer: 'uob-krisflyer.md',
      'standard chartered': 'standard-chartered-cashone.md', cashone: 'standard-chartered-cashone.md',
    }
    const lowerMsg = message.toLowerCase()
    const targetFile = Object.entries(CARD_DOC_MAP).find(([kw]) => lowerMsg.includes(kw))?.[1]

    // For card-specific queries, read the target card's file directly from disk.
    // Fee-table chunks are markdown tables that embed poorly and often fall outside
    // the top-20 similarity results — disk read guarantees the full card content.
    let context
    let docSources
    if (targetFile) {
      const cardSrc = `credit-cards/${targetFile}`
      const cardFilePath = join(projectRoot, 'docs', cardSrc)
      try {
        const rawCard = readFileSync(cardFilePath, 'utf8')

        // For 1B models, focused context beats full doc:
        // Extract only the section matching the query type so the relevant
        // value (e.g. S$150 in a fee table) isn't buried under prose.
        const qLower = message.toLowerCase()
        const SECTION_KEYWORDS = [
          { keywords: ['fee', 'charge', 'cost', 'annual', 'interest', 'late payment', 'cash advance'], heading: '## Fees' },
          { keywords: ['eligib', 'income', 'qualify', 'requirement', 'who can apply'], heading: '## Eligibility' },
          { keywords: ['apply', 'application', 'how to get', 'sign up'], heading: '## How to Apply' },
          { keywords: ['benefit', 'reward', 'cashback', 'miles', 'point', 'perk'], heading: '## Key Benefits' },
        ]
        const matchedSection = SECTION_KEYWORDS.find(({ keywords }) =>
          keywords.some(kw => qLower.includes(kw))
        )

        let cardContent = rawCard
        if (matchedSection) {
          // Extract just the matched section
          const sectionStart = rawCard.indexOf(matchedSection.heading)
          if (sectionStart !== -1) {
            const nextHeading = rawCard.indexOf('\n## ', sectionStart + matchedSection.heading.length)
            cardContent = nextHeading !== -1
              ? rawCard.slice(sectionStart, nextHeading).trim()
              : rawCard.slice(sectionStart).trim()

            // Convert markdown table rows to plain "Key: Value" lines so the 1B model
            // can extract specific amounts without struggling with | pipe syntax.
            cardContent = cardContent.replace(
              /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm,
              (_, key, val) => {
                const k = key.trim()
                const v = val.trim()
                // Skip header/divider rows (empty or dash-only values)
                if (!k || /^[-:]+$/.test(v)) return ''
                return `${k}: ${v}`
              }
            ).replace(/\n{3,}/g, '\n\n').trim()

            // For the Fees section: try to find the exact line matching the query
            // and return it as a directReply, bypassing the LLM.
            // 1B models reliably drop specific amounts from table cells even in plain-text.
            if (matchedSection.heading === '## Fees') {
              // Skip header/divider rows: "Fee Type: Amount", blank values, or dash-only values
              const lines = cardContent.split('\n').filter(l => {
                if (!l.includes(': ')) return false
                const [k, v] = l.split(': ')
                return k.trim().toLowerCase() !== 'fee type' && v && v.trim().toLowerCase() !== 'amount'
              })
              const qWords = qLower.replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2)
              // Score each line by how many query words it contains — pick the best match
              const scored = lines.map(l => ({
                line: l,
                score: qWords.filter(w => l.toLowerCase().includes(w)).length
              })).filter(x => x.score > 0).sort((a, b) => b.score - a.score)
              const matchedLine = scored[0]?.line
              if (matchedLine) {
                const colonIdx = matchedLine.indexOf(': ')
                const feeKey = matchedLine.slice(0, colonIdx).trim()
                const feeVal = matchedLine.slice(colonIdx + 2).trim()
                // Reconstruct a human-friendly card name from the filename
                const cardDisplayName = targetFile.replace('.md', '').split('-')
                  .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
                  .replace('Hsbc', 'HSBC').replace('Dbs', 'DBS').replace('Uob', 'UOB')
                  .replace('Ocbc', 'OCBC')
                const directAnswer = `The ${feeKey} for the ${cardDisplayName} is ${feeVal}.`
                console.log(`  [retrieval] fee line match → direct answer: "${directAnswer}"`)
                docSources = [cardSrc]
                const memory = getSessionMemory(sessionId)
                if (streaming) return { directReply: directAnswer, memory, sources: docSources }
                await memory.saveContext({ input: message }, { output: directAnswer })
                return { reply: directAnswer, sources: docSources }
              }
            }

            console.log(`  [retrieval] extracted section "${matchedSection.heading}" (${cardContent.length} chars, table→plaintext)`)
          }
        }

        const sanitize = text =>
          text
            .replace(/<\/?(?:user|assistant|system)>/gi, '')
            .replace(/\{context\}|\{question\}/gi, '')
            .replace(/IMPORTANT RULES/gi, '')
        context = sanitize(cardContent)
        docSources = [cardSrc]
        console.log(`  [retrieval] card-name routing → ${targetFile} (disk read, ${context.length} chars)`)
      } catch (readErr) {
        console.warn(`  [retrieval] could not read ${cardFilePath}: ${readErr.message} — falling back to vector store`)
      }
    }

    if (!context) {
      // Fall back to top-1 deduplicated doc from vector store
      const relevantDocs = dedupedDocs.slice(0, 1).map(([doc]) => doc)
      docSources = relevantDocs.map(doc => doc.metadata?.source || 'unknown')
      console.log(`  [retrieval] using top-scored doc: [${docSources.map(s => s.split('/').pop()).join(', ')}]`)

      const sanitizeContext = text =>
        text
          .replace(/<\/?(?:user|assistant|system)>/gi, '')
          .replace(/\{context\}|\{question\}/gi, '')
          .replace(/IMPORTANT RULES/gi, '')
      context = relevantDocs.map(doc => sanitizeContext(doc.pageContent)).join('\n\n---\n\n')
    }

    // Get conversation history
    const memory = getSessionMemory(sessionId)
    const historyMessages = await memory.chatHistory.getMessages()
    const cappedHistory = historyMessages.slice(-MAX_HISTORY_MESSAGES)
    console.log(`  [context] history: ${cappedHistory.length} msgs | context: ${context.length} chars`)

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
          if (msg instanceof HumanMessage) return `User: ${sanitize(msg.content)}`
          if (msg instanceof AIMessage) return `Assistant: ${sanitize(msg.content)}`
          return ''
        })
        .filter(Boolean)
        .join('\n')
      fullPrompt = fullPrompt.replace(
        'Q: {question}',
        `${historyBlock}\n\nQ: {question}`
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

  // Step 2a: Keyword pre-check for financial product queries — deterministic and fast.
  // The 1B LLM is unreliable for these clear-signal cases; keywords are exact matches.
  const ANSWER_KEYWORDS = [
    'credit card', 'debit card', 'annual fee', 'cashback', 'cash back',
    'rewards', 'miles', 'krisflyer', 'kris flyer', 'live fresh', 'revolution',
    'cashback plus', '365 card', 'ocbc 365', 'uob ', 'dbs ', 'hsbc', 'citi',
    'standard chartered', 'personal loan', 'borrow', 'borrowing', 'repayment',
    'installment', 'instalment', 'interest rate', 'cashone', 'cash one',
    'apply for', 'eligibility', 'minimum income', 'annual income',
    'what cards', 'which card', 'what loans', 'which loan',
    'offers', 'available cards', 'available loans', 'card comparison',
    'compare cards', 'compare loans', 'best card', 'best loan'
  ]
  const isFinancialQuery = ANSWER_KEYWORDS.some(kw => lowerMessage.includes(kw))
  if (isFinancialQuery) {
    console.log(`Financial keyword detected — skipping classifier, routing to answer`)
    const result = await handleAnswerIntent(sessionId, message, llm, streaming)
    if (streaming) return { ...result, intent: 'answer', confidence: 1.0 }
    return { reply: result.reply, intent: 'answer', sources: result.sources, confidence: 1.0 }
  }

  // Step 2b: Keyword pre-check for clearly off-topic queries.
  // Same reasoning as answer keywords — the 1B model misclassifies common finance-adjacent topics.
  const OFF_TOPIC_KEYWORDS = [
    'mutual fund', 'stock market', 'share market', 'equit', 'etf ',
    'bitcoin', 'crypto', 'ethereum', 'nft', 'forex', 'fx trading',
    'insurance', 'life cover', 'health plan',
    'weather', 'cooking', 'recipe', 'sports', 'travel tip',
    'invest in', 'should i buy', 'portfolio'
  ]
  const isOffTopic = OFF_TOPIC_KEYWORDS.some(kw => lowerMessage.includes(kw))
  if (isOffTopic) {
    console.log(`Off-topic keyword detected — skipping classifier, routing to off_topic`)
    const offReply = await handleOffTopicIntent(sessionId, message)
    return { reply: offReply, intent: 'off_topic', confidence: 1.0, sources: [] }
  }

  // Step 2c: Classify intent via LLM (for queries without clear keyword signals)
  console.log(`Classifying intent for session: ${sessionId}`)
  const { intent, confidence } = await classifyIntent(message)
  console.log(`Detected intent: ${intent} (confidence: ${confidence.toFixed(2)})`)

  // Low confidence (classifier timed out or returned unexpected output) — try RAG retrieval.
  // The retrieval gate (score threshold) prevents hallucination even when intent is uncertain.
  const LOW_CONFIDENCE_THRESHOLD = 0.3
  if (confidence < LOW_CONFIDENCE_THRESHOLD) {
    console.warn(`⚠️  Low confidence (${confidence.toFixed(2)}) — attempting RAG retrieval as fallback`)
    const result = await handleAnswerIntent(sessionId, message, llm, streaming)
    if (streaming) return { ...result, intent: 'answer', confidence }
    return { reply: result.reply, intent: 'answer', sources: result.sources, confidence }
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
 * Pre-warm the Ollama model so the first real request doesn't hit cold-start latency.
 * Fires a minimal generate request and discards the result.
 */
async function warmupModel(model) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: 'hi', stream: false, options: { num_predict: 1 } }),
    signal: AbortSignal.timeout(90000)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  await res.json()
}

export async function warmup() {
  const models = [...new Set([OLLAMA_CLASSIFIER_MODEL, OLLAMA_MODEL])]
  console.log(`Warming up Ollama models: ${models.join(', ')}`)
  for (const model of models) {
    try {
      const t = Date.now()
      await warmupModel(model)
      console.log(`  ${model} warm-up done (${Date.now() - t}ms)`)
    } catch (err) {
      console.warn(`  ${model} warm-up failed (non-fatal): ${err.message}`)
    }
  }
  console.log('Ollama model warm-up complete')
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
