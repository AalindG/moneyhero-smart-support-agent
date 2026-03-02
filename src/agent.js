/**
 * MoneyHero RAG Agent - Simplified Version
 * Answers customer questions using ONLY information from the docs/ folder
 * 
 * Core Flow:
 * 1. Detect escalation keywords → handoff to human
 * 2. Detect off-topic keywords → polite redirect  
 * 3. Check for catalog listing query → return overview.md
 * 4. Check for comparison query → smart bullet matching
 * 5. Retrieve relevant docs → generate answer with LLM
 */

import dotenv from 'dotenv'
import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama'
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib'
import { BufferMemory } from 'langchain/memory'
import { readFileSync, readdirSync } from 'fs'
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
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2'
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'

// Limits
const MAX_MESSAGE_LENGTH = 2000
const MAX_HISTORY_TOKENS = 2000
const LLM_TIMEOUT_MS = 90000
const SESSION_TTL_MS = 2 * 60 * 60 * 1000

// ═══════════════════════════════════════════════════════════════════════════
// PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

const RAG_SYSTEM_PROMPT = `You are MoneyHero's AI assistant for credit cards and personal loans in Singapore.

<documents>
{context}
</documents>

RULES:
1. Answer ONLY using information from <documents> above
2. If documents don't have the answer, say: "I don't have that information. Would you like me to connect you with an advisor?"
3. Include exact product names, rates, and fees from the documents
4. Never guarantee approval — say "may be eligible" or "typically requires"
5. Always add: "Verify current terms with [bank name] before applying"
6. For comparisons, list facts objectively without saying which is "best"

Question: {question}

Answer:`

// ═══════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

let vectorStore = null
const sessionMemories = new Map()
const sessionLastAccess = new Map()

function evictStaleSessions() {
  const now = Date.now()
  for (const [sessionId, lastAccess] of sessionLastAccess.entries()) {
    if (now - lastAccess > SESSION_TTL_MS) {
      sessionMemories.delete(sessionId)
      sessionLastAccess.delete(sessionId)
      console.log(`Evicted stale session: ${sessionId}`)
    }
  }
}

function getSessionMemory(sessionId) {
  if (!sessionMemories.has(sessionId)) {
    sessionMemories.set(sessionId, new BufferMemory({ returnMessages: true, memoryKey: 'history' }))
  }
  sessionLastAccess.set(sessionId, Date.now())
  evictStaleSessions()
  return sessionMemories.get(sessionId)
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

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function estimateTokens(text) {
  return Math.ceil(text.length / 4)
}

function sanitizeContext(text) {
  return text
    .replace(/<\/?(?:user|assistant|system)>/gi, '')
    .replace(/\{context\}|\{question\}/gi, '')
    .replace(/IMPORTANT RULES/gi, '')
}

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
  'portfolio'
]

const LISTING_PATTERNS = [
  /what (credit )?cards? (do you|does moneyHero) (offer|have|provide)/i,
  /which cards? (do you|does moneyHero) (offer|have|provide)/i,
  /list (all |the |your )?(credit )?cards?/i,
  /tell me (about |all )?(your |the )?(cards?|products?)/i,
  /available cards?/i,
  /^what (are )?((your|the) )?cards?$/i
]

const COMPARISON_PATTERNS = [
  /which cards? (have|offer|come with|include|give|provide|support)/i,
  /what cards? (have|offer|come with|include|give|provide)/i,
  /which card(s)? (is|are) (best|good|great|ideal|perfect|suitable|recommended)/i,
  /what card(s)? (is|are) (best|good|great|ideal|perfect|suitable)/i,
  /best card(s)? for/i,
  /cards? for (travel|dining|cashback|miles|rewards|online|petrol|groceries)/i,
  /which ones? (are|have|offer)/i,
  /ones? (good|great|best|ideal) for/i
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

function detectListing(message) {
  return LISTING_PATTERNS.some(p => p.test(message))
}

function detectComparison(message) {
  return COMPARISON_PATTERNS.some(p => p.test(message))
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

async function handleEscalation(sessionId, message) {
  const reply =
    "I understand you'd like to speak with a human advisor. I'm connecting you now. A team member will reach out shortly."
  await getSessionMemory(sessionId).saveContext({ input: message }, { output: reply })
  return { reply, intent: 'escalate', sources: [] }
}

async function handleOffTopic(sessionId, message) {
  const reply =
    "I specialize in credit cards and personal loans. For other topics, please visit our main website or contact general support."
  await getSessionMemory(sessionId).saveContext({ input: message }, { output: reply })
  return { reply, intent: 'off_topic', sources: [] }
}

async function handleCatalogListing(sessionId, message, streaming) {
  console.log('  [retrieval] catalog query → reading all card files')
  try {
    const cardsDir = join(projectRoot, 'docs', 'credit-cards')
    const cardFiles = readdirSync(cardsDir).filter(f => f.endsWith('.md'))
    
    const summaries = []
    for (const file of cardFiles) {
      const content = readFileSync(join(cardsDir, file), 'utf8')
      const titleMatch = content.match(/^# (.+)$/m)
      const title = titleMatch?.[1]?.trim() || file.replace('.md', '')
      
      // Extract overview/key benefits
      const overviewMatch = content.match(/## Overview\s+(.*?)(?=\n##)/s)
      const keyBenefitsMatch = content.match(/## Key Benefits\s+(.*?)(?=\n##)/s)
      
      let snippet = overviewMatch?.[1]?.trim() || ''
      if (keyBenefitsMatch) {
        const benefits = keyBenefitsMatch[1].trim().split('\n').slice(0, 2).join('; ')
        snippet += (snippet ? ' ' : '') + benefits
      }
      
      summaries.push(`**${title}**\n${snippet}`)
    }
    
    const catalog = `We offer ${summaries.length} credit cards:\n\n${summaries.join('\n\n')}`
    
    const memory = getSessionMemory(sessionId)
    const sources = cardFiles.map(f => `credit-cards/${f}`)
    
    if (streaming) {
      return { directReply: catalog, memory, sources }
    }
    await memory.saveContext({ input: message }, { output: catalog })
    return { reply: catalog, sources }
  } catch (error) {
    console.warn(`Could not read card files: ${error.message}`)
    return null // Fall through to RAG
  }
}

async function handleComparisonQuery(sessionId, message, streaming) {
  console.log('  [retrieval] comparison query detected')
  try {
    const cardsDir = join(projectRoot, 'docs', 'credit-cards')
    const cardFiles = readdirSync(cardsDir).filter(f => f.endsWith('.md'))
    
    // Build card summaries from individual files
    const cardBullets = []
    for (const file of cardFiles) {
      const content = readFileSync(join(cardsDir, file), 'utf8')
      const titleMatch = content.match(/^# (.+)$/m)
      const title = titleMatch?.[1]?.trim() || file.replace('.md', '')
      
      const overviewMatch = content.match(/## Overview\s+(.*?)(?=\n##)/s)
      const keyBenefitsMatch = content.match(/## Key Benefits\s+(.*?)(?=\n##)/s)
      
      let snippet = overviewMatch?.[1]?.trim() || ''
      if (keyBenefitsMatch) {
        const benefits = keyBenefitsMatch[1].trim().split('\n').slice(0, 3).join(' ')
        snippet += (snippet ? ' ' : '') + benefits
      }
      
      cardBullets.push(`- **${title}** — ${snippet}`)
    }

    // Extract keywords from query
    const lower = message.toLowerCase()
    const STOP_WORDS = new Set([
      'what',
      'which',
      'card',
      'cards',
      'come',
      'with',
      'offer',
      'have',
      'does',
      'do',
      'you',
      'the',
      'that',
      'for',
      'are',
      'give',
      'best',
      'most',
      'any',
      'can',
      'ones',
      'one',
      'good',
      'great',
      'ideal',
      'perfect'
    ])

    const featureWords = lower
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))

    // Synonym expansion
    const SYNONYMS = {
      travel: ['miles', 'airline', 'flyer', 'flight', 'krisflyer'],
      dining: ['restaurant', 'food', 'eating', 'meal'],
      shopping: ['retail', 'purchase', 'buying'],
      cashback: ['rebate', 'refund', 'cash', 'back'],
      online: ['internet', 'ecommerce', 'digital']
    }

    const expandedWords = new Set(featureWords)
    for (const word of featureWords) {
      if (SYNONYMS[word]) {
        SYNONYMS[word].forEach(syn => expandedWords.add(syn))
      }
    }
    const matchWords = Array.from(expandedWords)

    // Score each bullet
    const scoredBullets = cardBullets
      .map(bullet => ({
        bullet,
        score: matchWords.filter(w => bullet.toLowerCase().includes(w)).length
      }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)

    // Return bullets with score >= 50% of max
    const maxScore = scoredBullets[0]?.score ?? 0
    const threshold = Math.max(2, Math.floor(maxScore * 0.5))
    const topBullets = scoredBullets.filter(x => x.score >= threshold)

    if (topBullets.length > 0) {
      const matchedCards = topBullets.map(x => x.bullet).join('\n\n')
      const intro =
        topBullets.length === 1
          ? 'One card matches your query:'
          : `${topBullets.length} cards match your query:`
      const directAnswer = `${intro}\n\n${matchedCards}`

      console.log(`  [retrieval] comparison match → ${topBullets.length} card(s)`)
      const memory = getSessionMemory(sessionId)
      const sources = cardFiles.map(f => `credit-cards/${f}`)
      
      if (streaming) {
        return { directReply: directAnswer, memory, sources }
      }
      await memory.saveContext({ input: message }, { output: directAnswer })
      return { reply: directAnswer, sources }
    }
  } catch (error) {
    console.warn(`Comparison query failed: ${error.message}`)
  }
  return null // Fall through to RAG
}

async function handleRAGRetrieval(sessionId, message, streaming) {
  console.log('Starting RAG retrieval...')
  const store = await getVectorStore()

  if (!store) {
    throw new Error('VECTORSTORE_UNAVAILABLE')
  }

  // Retrieve similar documents
  console.log('  [retrieval] searching vectorstore...')
  const candidateDocs = await store.similaritySearchWithScore(message, 20)

  if (candidateDocs.length === 0) {
    throw new Error('NO_RELEVANT_DOCS')
  }

  // Adaptive threshold
  const lower = message.toLowerCase()
  const isSpecific = /\b(what is|how much|fee|rate|income|requirement)\b/i.test(message)
  const isBroad = /\b(all|list|available|offer|have)\b/i.test(message)
  const isComparison = /\b(compare|difference|vs|versus|which|better)\b/i.test(message)

  let threshold
  if (isBroad) threshold = 0.55
  else if (isSpecific) threshold = 0.35
  else if (isComparison) threshold = 0.45
  else threshold = 0.4

  console.log(`  [retrieval] threshold: ${threshold} (type: ${isBroad ? 'broad' : isSpecific ? 'specific' : isComparison ? 'comparison' : 'default'})`)

  const filteredDocs = candidateDocs.filter(([, score]) => score <= threshold)

  if (filteredDocs.length === 0) {
    throw new Error('NO_RELEVANT_DOCS')
  }

  // Category filter
  const category = detectCategory(message)
  const categoryFilteredDocs = category
    ? filteredDocs.filter(([doc]) => {
        const cat = doc.metadata?.category
        return cat === category || cat === 'faqs'
      })
    : filteredDocs

  console.log(`  [retrieval] category: ${category || 'all'}, kept ${categoryFilteredDocs.length}/${filteredDocs.length} docs`)

  if (categoryFilteredDocs.length === 0) {
    throw new Error('NO_RELEVANT_DOCS')
  }

  // Deduplicate by source
  const seenSources = new Set()
  const dedupedDocs = categoryFilteredDocs.filter(([doc]) => {
    const src = doc.metadata?.source || 'unknown'
    if (seenSources.has(src)) return false
    seenSources.add(src)
    return true
  })

  // Build context
  const topDocs = dedupedDocs.slice(0, 5)
  const context = topDocs.map(([doc]) => doc.pageContent).join('\n\n---\n\n')
  const sources = topDocs.map(([doc]) => doc.metadata?.source || 'unknown')

  console.log(`  [retrieval] using ${topDocs.length} docs`)
  console.log(`  [retrieval] sources:`, sources.join(', '))

  // Get history
  const memory = getSessionMemory(sessionId)
  const { history } = await memory.loadMemoryVariables({})
  const messages = Array.isArray(history) ? history : []

  // Truncate history to fit token budget
  let totalTokens = estimateTokens(context) + estimateTokens(message)
  const includedHistory = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(messages[i].content || '')
    if (totalTokens + msgTokens > MAX_HISTORY_TOKENS) break
    includedHistory.unshift(messages[i])
    totalTokens += msgTokens
  }

  console.log(`  [context] history: ${includedHistory.length} msgs (~${totalTokens} tokens)`)

  // Build prompt
  const sanitizedContext = sanitizeContext(context)
  const prompt = RAG_SYSTEM_PROMPT.replace('{context}', sanitizedContext).replace(
    '{question}',
    message
  )

  // For streaming, return prompt for controller to handle
  if (streaming) {
    return { prompt, memory, sources, context: sanitizedContext }
  }

  // For non-streaming, generate full response
  const llm = new ChatOllama({
    model: OLLAMA_MODEL,
    baseUrl: OLLAMA_BASE_URL,
    temperature: 0
  })

  console.log('  [llm] generating response...')
  const response = await llm.invoke(prompt)
  const reply = response.content

  // Validate output
  const validation = validateFinancialResponse(reply, sanitizedContext)
  if (!validation.valid) {
    console.warn(`  [validation] failed: ${validation.reason}`)
    const fallback = getSafeFallback(validation.reason)
    await memory.saveContext({ input: message }, { output: fallback })
    return { reply: fallback, sources }
  }

  console.log(`  [llm] response: ${reply.length} chars`)
  await memory.saveContext({ input: message }, { output: reply })

  return { reply, sources }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CHAT FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

async function processChat(sessionId, message, streaming) {
  // 1. Check escalation
  if (detectEscalation(message)) {
    console.log('Escalation detected')
    return await handleEscalation(sessionId, message)
  }

  // 2. Check off-topic
  if (detectOffTopic(message)) {
    console.log('Off-topic detected')
    return await handleOffTopic(sessionId, message)
  }

  // 3. Check catalog listing
  if (detectListing(message)) {
    const result = await handleCatalogListing(sessionId, message, streaming)
    if (result) return { ...result, intent: 'answer' }
  }

  // 4. Check comparison query
  if (detectComparison(message)) {
    const result = await handleComparisonQuery(sessionId, message, streaming)
    if (result) return { ...result, intent: 'answer' }
  }

  // 5. RAG retrieval
  const result = await handleRAGRetrieval(sessionId, message, streaming)
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
        reply:
          "I'm having trouble accessing my knowledge base. Please contact support.",
        intent: 'escalate',
        sources: []
      }
      await memory.saveContext({ input: truncatedMessage }, { output: result.reply })
      return streaming ? { ...result, memory } : result
    }

    console.error('Chat error:', error.message)
    throw error
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export function clearSessionMemory(sessionId) {
  sessionMemories.delete(sessionId)
  sessionLastAccess.delete(sessionId)
  console.log(`Cleared session: ${sessionId}`)
}

export async function warmup() {
  console.log(`Warming up Ollama model: ${OLLAMA_MODEL}`)
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: 'hi',
        stream: false,
        options: { num_predict: 1 }
      })
    })
    if (res.ok) console.log('Ollama warm-up complete')
  } catch (err) {
    console.warn(`Warm-up failed: ${err.message}`)
  }
}
