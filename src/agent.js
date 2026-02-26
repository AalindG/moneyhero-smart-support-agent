import dotenv from 'dotenv'
import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama'
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib'
import { BufferMemory } from 'langchain/memory'
import { ConversationChain } from 'langchain/chains'
import {
  ChatPromptTemplate,
  MessagesPlaceholder
} from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { RunnableSequence } from '@langchain/core/runnables'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

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
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'

// Global state
let vectorStore = null
const sessionMemories = new Map()

/**
 * Initialize vector store (lazy loading)
 */
async function getVectorStore() {
  if (vectorStore) return vectorStore

  try {
    console.log(`📦 Loading vector store from: ${VECTORSTORE_PATH}`)

    const embeddings = new OllamaEmbeddings({
      model: OLLAMA_EMBED_MODEL,
      baseUrl: OLLAMA_BASE_URL
    })

    vectorStore = await HNSWLib.load(VECTORSTORE_PATH, embeddings)
    console.log('✅ Vector store loaded successfully')

    return vectorStore
  } catch (error) {
    console.error('❌ Failed to load vector store:', error.message)
    throw new Error(
      'Vector store not found. Run "npm run ingest" first to create it.'
    )
  }
}

/**
 * Get or create memory for a session
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
  return sessionMemories.get(sessionId)
}

/**
 * Classify user intent using LLM
 * Returns: "answer", "escalate", or "off_topic"
 */
async function classifyIntent(message, llm) {
  const classificationPrompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an intent classifier for a financial products support agent.

Classify the user's message into ONE of these categories:

1. "answer" - Questions about financial products (credit cards, loans, eligibility, features, rates, fees, application process)
2. "escalate" - User explicitly requests human help, complains about service, or asks complex multi-product comparisons requiring expert advice
3. "off_topic" - Questions unrelated to financial products (weather, sports, cooking, general knowledge, etc.)

Respond with ONLY the intent category: answer, escalate, or off_topic

Examples:
User: "What are the benefits of the HSBC Revolution card?" → answer
User: "I need to speak to a human agent" → escalate
User: "What's the weather today?" → off_topic
User: "How do I apply for a personal loan?" → answer
User: "This is taking too long, I want to talk to someone" → escalate`
    ],
    ['user', '{message}']
  ])

  const chain = classificationPrompt.pipe(llm).pipe(new StringOutputParser())

  try {
    const result = await chain.invoke({ message })
    const intent = result.trim().toLowerCase()

    // Validate and normalize
    if (intent.includes('escalate')) return 'escalate'
    if (intent.includes('off_topic')) return 'off_topic'
    return 'answer'
  } catch (error) {
    console.error('Intent classification error:', error.message)
    // Default to answer on error
    return 'answer'
  }
}

/**
 * Handle "answer" intent with RAG retrieval
 * For streaming mode, returns prepared prompt and context
 */
async function handleAnswerIntent(sessionId, message, llm, streaming = false) {
  try {
    console.log('🔍 Starting RAG retrieval...')
    const store = await getVectorStore()
    const retriever = store.asRetriever({
      k: 4 // Retrieve top 4 relevant chunks
    })

    // Retrieve relevant documents
    console.log('📚 Retrieving relevant documents...')
    const relevantDocs = await retriever.invoke(message)
    console.log(`✅ Retrieved ${relevantDocs.length} documents`)

    // Build context from retrieved documents
    const context = relevantDocs
      .map((doc, idx) => `[Document ${idx + 1}]\n${doc.pageContent}`)
      .join('\n\n')

    // Get conversation history
    console.log('💭 Loading conversation history...')
    const memory = getSessionMemory(sessionId)
    const historyMessages = await memory.chatHistory.getMessages()
    console.log(`✅ Loaded ${historyMessages.length} history messages`)

    // Build the full prompt
    let fullPrompt = `You are a helpful financial products expert for MoneyHero, a comparison platform for credit cards and personal loans.

Use the following context from our knowledge base to answer the user's question. Be specific, accurate, and helpful.

If the context doesn't contain enough information to answer fully, say so and provide what information you can.

Always be professional and focus on financial product features, benefits, rates, fees, and application processes.

Context from knowledge base:
${context}

`

    // Add conversation history
    for (const msg of historyMessages) {
      if (msg._getType() === 'human') {
        fullPrompt += `\nUser: ${msg.content}`
      } else if (msg._getType() === 'ai') {
        fullPrompt += `\nAssistant: ${msg.content}`
      }
    }

    // Add current question
    fullPrompt += `\nUser: ${message}\nAssistant:`

    if (streaming) {
      // Return prompt for external streaming
      return { prompt: fullPrompt, memory }
    }

    // Non-streaming: generate complete response
    console.log('🤖 Generating response with LLM...')
    const ragPrompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are a helpful financial products expert for MoneyHero, a comparison platform for credit cards and personal loans.

Use the following context from our knowledge base to answer the user's question. Be specific, accurate, and helpful.

If the context doesn't contain enough information to answer fully, say so and provide what information you can.

Always be professional and focus on financial product features, benefits, rates, fees, and application processes.

Context from knowledge base:
{context}`
      ],
      new MessagesPlaceholder('history'),
      ['user', '{question}']
    ])

    const chain = RunnableSequence.from([
      {
        context: () => context,
        question: input => input.question,
        history: async () => historyMessages
      },
      ragPrompt,
      llm,
      new StringOutputParser()
    ])

    const reply = await chain.invoke({ question: message })
    console.log('✅ Response generated successfully')

    // Save conversation to memory
    await memory.saveContext({ input: message }, { output: reply })

    return reply
  } catch (error) {
    console.error('RAG retrieval error:', error.message)
    throw error
  }
}

/**
 * Handle "escalate" intent
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
 */
async function handleOffTopicIntent(sessionId, message) {
  const memory = getSessionMemory(sessionId)
  const reply =
    'I specialize in helping with financial products like credit cards and personal loans. How can I assist you with finding the right financial product for your needs?'

  // Save to memory
  await memory.saveContext({ input: message }, { output: reply })

  return reply
}

/**
 * Main chat function - processes user message with intent routing
 * @param {string} sessionId - Session identifier for conversation context
 * @param {string} message - User's message
 * @param {boolean} streaming - If true, returns prompt for external streaming
 * @returns {Promise<{reply: string, intent: string}> | Promise<{prompt: string, intent: string, memory: object}>}
 */
export async function chat(sessionId, message, streaming = false) {
  if (!sessionId || !message) {
    throw new Error('sessionId and message are required')
  }

  try {
    // Initialize LLM
    const llm = new ChatOllama({
      model: OLLAMA_MODEL,
      baseUrl: OLLAMA_BASE_URL,
      temperature: 0.7,
      timeout: 30000 // 30 second timeout
    })

    // Step 1: Classify intent
    console.log(`🔍 Classifying intent for session: ${sessionId}`)
    const intent = await classifyIntent(message, llm)
    console.log(`📋 Detected intent: ${intent}`)

    let result

    // Step 2: Route to appropriate handler
    switch (intent) {
      case 'answer':
        result = await handleAnswerIntent(sessionId, message, llm, streaming)
        if (streaming) {
          return { ...result, intent } // Returns { prompt, memory, intent }
        }
        return { reply: result, intent }

      case 'escalate':
        const escReply = await handleEscalateIntent(sessionId, message)
        return { reply: escReply, intent }

      case 'off_topic':
        const offReply = await handleOffTopicIntent(sessionId, message)
        return { reply: offReply, intent }

      default:
        // Fallback to answer
        result = await handleAnswerIntent(sessionId, message, llm, streaming)
        if (streaming) {
          return { ...result, intent }
        }
        return { reply: result, intent }
    }
  } catch (error) {
    console.error('❌ Chat error:', error.message)
    throw new Error(`Failed to process chat: ${error.message}`)
  }
}

/**
 * Clear memory for a specific session (for testing or cleanup)
 */
export function clearSessionMemory(sessionId) {
  if (sessionMemories.has(sessionId)) {
    sessionMemories.delete(sessionId)
    console.log(`🧹 Cleared memory for session: ${sessionId}`)
  }
}
