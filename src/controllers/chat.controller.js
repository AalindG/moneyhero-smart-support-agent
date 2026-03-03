import * as SessionModel from '../models/session.model.js'
import * as MessageModel from '../models/message.model.js'
import * as AnalyticsModel from '../models/analytics.model.js'
import { chat } from '../agent.js'
import { ChatOllama } from '@langchain/ollama'
import { ChatAnthropic } from '@langchain/anthropic'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { setupSSE } from '../middleware/sse.js'
import { validateRequestParams } from '../middleware/validation.js'
import { validateStreamingToken, validateOutput } from '../middleware/outputValidation.js'
import {
  addFinancialDisclaimer,
  addRegulatoryWarnings,
  applyBoldFormatting
} from '../utils/compliance.js'

/**
 * Chat Controller
 * Handles chat message processing and streaming with Claude + Ollama fallback
 */

// LLM initialization
const USE_CLAUDE = process.env.USE_CLAUDE === 'true'
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b'

let primaryLLM = null
let fallbackLLM = null
let primaryLLMName = null
let fallbackLLMName = null

function initializeLLMs() {
  if (primaryLLM && fallbackLLM) return
  console.log('Initializing LLMs...', { USE_CLAUDE, ANTHROPIC_API_KEY: !!ANTHROPIC_API_KEY })

  // Fallback LLM: Ollama (always initialized)
  fallbackLLM = new ChatOllama({
    model: OLLAMA_MODEL,
    baseUrl: OLLAMA_BASE_URL,
    temperature: 0
  })
  fallbackLLMName = `Ollama (${OLLAMA_MODEL})`
  console.log(`✅ Chat Controller: ${fallbackLLMName} (fallback)`)

  // Primary LLM: Claude if configured, else Ollama
  if (USE_CLAUDE && ANTHROPIC_API_KEY) {
    primaryLLM = new ChatAnthropic({
      model: 'claude-sonnet-4-6',
      apiKey: ANTHROPIC_API_KEY,
      maxTokens: 500,
      streaming: true,
      topP: 1, // LangChain defaults topP to -1; claude-sonnet-4-6 rejects that
      temperature: null // null → omit from request (claude-sonnet-4-6 rejects both together)
    })
    primaryLLMName = 'Claude Sonnet 4.6'
    console.log(`✅ Chat Controller: ${primaryLLMName} (primary)`)
    console.log('✅ Using Claude as primary LLM with Ollama fallback')
  } else {
    primaryLLM = fallbackLLM
    primaryLLMName = fallbackLLMName
    console.log(`⚠️  Claude not configured. Using ${primaryLLMName} as primary.`)
  }
}

/**
 * Send pre-computed text as a word-by-word SSE stream.
 * Splits on whitespace boundaries and emits each segment as a `token` event
 * with a small inter-token delay so the client renders progressive output.
 * @param {object} res - Express response object
 * @param {string} text - Text to stream
 * @param {number} [delayMs=20] - Milliseconds between tokens
 */
async function fakeStream(res, text, delayMs = 20) {
  // Split on whitespace, keeping the whitespace segments so spacing is preserved
  const tokens = text.split(/(\s+)/).filter(t => t.length > 0)
  for (const token of tokens) {
    try {
      res.write(`data: ${JSON.stringify({ token })}\n\n`)
      if (res.flush) res.flush()
    } catch {
      break // Client disconnected
    }
    await new Promise(r => setTimeout(r, delayMs))
  }
}

/**
 * Processes user messages and streams agent response via SSE
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
export async function handleChatMessage(req, res) {
  let sseCleanup = null

  try {
    const { sessionId, message } = req.body
    const requestStart = Date.now()

    console.log(`── CHAT REQUEST ──────────────────────────────────────`)
    console.log(`  session : ${sessionId}`)
    console.log(
      `  message : "${(message || '').slice(0, 80)}${(message || '').length > 80 ? '…' : ''}"`
    )
    console.log(`  length  : ${(message || '').length} chars`)

    // Validate inputs
    const validation = validateRequestParams(sessionId, message)
    if (!validation.valid) {
      console.log(`  [validation failed] ${validation.error}`)
      return res.status(400).json({ error: validation.error })
    }

    // Verify session exists
    let session
    const sessionLookupStart = Date.now()
    try {
      session = SessionModel.findById(sessionId)
    } catch (dbError) {
      console.error('Database error checking session:', dbError.message)
      return res.status(500).json({ error: 'Database error' })
    }

    if (!session) {
      console.log(`  [session not found] ${sessionId}`)
      return res.status(404).json({ error: 'Session not found' })
    }
    console.log(`  session lookup  : ${Date.now() - sessionLookupStart}ms`)

    // Setup SSE streaming
    const sse = setupSSE(res, req)
    sseCleanup = sse.cleanup

    // Track response time for analytics
    const startTime = Date.now()

    try {
      // Get response from RAG agent
      console.log(`  [step 1/3] calling chat agent...`)
      const agentStart = Date.now()
      const result = await chat(sessionId, message, true)
      console.log(
        `  [step 1/3] chat agent done — intent="${result.intent}" confidence=${result.confidence?.toFixed(2) ?? 'n/a'} (${Date.now() - agentStart}ms)`
      )

      // Calculate response time
      const responseTimeMs = Date.now() - startTime

      // Clear keepalive once we have the result
      sseCleanup()

      // Handle non-answer intents (escalate, off_topic)
      if (result.intent !== 'answer') {
        const reply = result.reply || result.prompt
        const disclaimedReply = addFinancialDisclaimer(reply, result.intent, reply.length)

        MessageModel.create(sessionId, 'user', message)
        MessageModel.create(sessionId, 'assistant', disclaimedReply)

        // Log interaction to analytics
        const interactionId = AnalyticsModel.logInteraction({
          sessionId,
          question: message,
          answer: disclaimedReply,
          intent: result.intent,
          sources: result.sources || [],
          responseTimeMs
        })

        // Log quality metrics
        AnalyticsModel.logQualityMetrics({
          interactionId,
          responseLength: disclaimedReply.length,
          sourceCount: (result.sources || []).length,
          retrievalScoreAvg: null, // No retrieval for escalate/off_topic
          containsDisclaimer: disclaimedReply.includes('verify current rates'),
          containsProductNames:
            /(?:credit card|loan|HSBC|DBS|UOB|OCBC|Citi|Standard Chartered)/i.test(disclaimedReply),
          intentConfidence: result.confidence || null,
          validationPassed: true
        })

        console.log(`  [non-answer] streaming ${disclaimedReply.length} chars`)
        await fakeStream(res, disclaimedReply)
        try {
          res.write('data: [DONE]\n\n')
          res.end()
        } catch (writeError) {
          console.log('Error writing non-answer response:', writeError.message)
        }
        console.log(`  total request time : ${Date.now() - requestStart}ms`)
        console.log(`── END ───────────────────────────────────────────────`)
        return
      }

      // Handle answer intent — stream from LLM
      const { systemPrompt, sanitizedQuestion, memory } = result

      if (!systemPrompt || !sanitizedQuestion) {
        throw new Error('Invalid agent response: missing systemPrompt or sanitizedQuestion')
      }

      // Initialize LLMs
      initializeLLMs()

      console.log(`  [step 2/3] streaming from LLM... (prompt: ${systemPrompt.length} chars)`)
      const streamStart = Date.now()

      let fullResponse = ''
      let usedFallback = false

      try {
        // Try primary LLM
        console.log(`  [llm] → ${primaryLLMName}`)
        const stream = await primaryLLM.stream([
          new SystemMessage(systemPrompt),
          new HumanMessage(sanitizedQuestion)
        ])

        for await (const chunk of stream) {
          const token = chunk.content
          if (token) {
            // Validate token before streaming
            const validation = validateStreamingToken(token)
            if (!validation.valid) {
              console.error(`  [llm] blocked invalid token`)
              continue
            }

            fullResponse += token
            try {
              res.write(`data: ${JSON.stringify({ token })}\n\n`)
              if (res.flush) res.flush()
            } catch {
              // Client disconnected
              break
            }
          }
        }
        console.log(`  [llm] ✅ ${primaryLLMName} succeeded`)
      } catch (primaryError) {
        console.warn(`  [llm] ⚠️  ${primaryLLMName} failed: ${primaryError.message}`)

        if (primaryLLM !== fallbackLLM) {
          // Try fallback LLM
          console.log(`  [llm] → ${fallbackLLMName} (fallback)`)
          usedFallback = true
          fullResponse = '' // Reset

          try {
            const stream = await fallbackLLM.stream([
              new SystemMessage(systemPrompt),
              new HumanMessage(sanitizedQuestion)
            ])

            for await (const chunk of stream) {
              const token = chunk.content
              if (token) {
                const validation = validateStreamingToken(token)
                if (!validation.valid) {
                  console.error(`  [llm] blocked invalid token`)
                  continue
                }

                fullResponse += token
                try {
                  res.write(`data: ${JSON.stringify({ token })}\n\n`)
                  if (res.flush) res.flush()
                } catch {
                  break
                }
              }
            }
            console.log(`  [llm] ✅ ${fallbackLLMName} succeeded`)
          } catch (fallbackError) {
            console.error(`  [llm] ❌ both LLMs failed (${primaryLLMName} + ${fallbackLLMName})`)
            throw new Error('Both primary and fallback LLMs failed')
          }
        } else {
          throw primaryError
        }
      }

      const activeLLM = usedFallback ? fallbackLLMName : primaryLLMName
      console.log(
        `  [step 2/3] LLM done — ${activeLLM} — ${fullResponse.length} chars in ${Date.now() - streamStart}ms`
      )

      // Validate complete response
      const validation = validateOutput(fullResponse)
      if (!validation.valid) {
        console.error(`  [validation] ❌ failed: ${validation.error}`)
        fullResponse = validation.sanitized
        try {
          res.write(
            `data: ${JSON.stringify({ error: 'response_filtered', message: validation.sanitized })}\n\n`
          )
          if (res.flush) res.flush()
        } catch {
          /* client disconnected */
        }
      }

      // Apply deterministic bold formatting + disclaimer + regulatory warnings.
      // Send a single `bold` SSE event so the client replaces the streamed plain text
      // with the final formatted version (bold markers + disclaimer appended).
      const boldedResponse = applyBoldFormatting(fullResponse)
      const withDisclaimer = addFinancialDisclaimer(
        boldedResponse,
        result.intent,
        boldedResponse.length
      )
      const disclaimedResponse = addRegulatoryWarnings(withDisclaimer)

      try {
        res.write(`data: ${JSON.stringify({ bold: disclaimedResponse })}\n\n`)
        if (res.flush) res.flush()
      } catch {
        /* client disconnected */
      }

      // Persist conversation to database (with compliance content)
      console.log(`  [step 3/3] saving messages to DB...`)
      const dbStart = Date.now()
      MessageModel.create(sessionId, 'user', message)
      MessageModel.create(sessionId, 'assistant', disclaimedResponse)
      console.log(`  [step 3/3] DB save done (${Date.now() - dbStart}ms)`)

      // Log interaction to analytics
      const interactionId = AnalyticsModel.logInteraction({
        sessionId,
        question: message,
        answer: disclaimedResponse,
        intent: result.intent,
        sources: result.sources || [],
        responseTimeMs
      })

      // Calculate retrieval quality metrics
      const sources = result.sources || []
      const retrievalScoreAvg =
        sources.length > 0
          ? sources.reduce((sum, s) => sum + (s.score || 0), 0) / sources.length
          : null

      // Log quality metrics
      AnalyticsModel.logQualityMetrics({
        interactionId,
        responseLength: disclaimedResponse.length,
        sourceCount: sources.length,
        retrievalScoreAvg,
        containsDisclaimer:
          disclaimedResponse.includes('verify current rates') ||
          disclaimedResponse.includes('subject to change'),
        containsProductNames:
          /(?:credit card|loan|HSBC|DBS|UOB|OCBC|Citi|Standard Chartered)/i.test(
            disclaimedResponse
          ),
        intentConfidence: result.confidence || null,
        validationPassed: true
      })

      // Save raw LLM response to memory (plain, no bold/disclaimer) to avoid polluting future prompts
      await memory.saveContext({ input: message }, { output: fullResponse })
      console.log(`  [step 3/3] memory saved`)

      // Send completion marker
      try {
        res.write('data: [DONE]\n\n')
        res.end()
      } catch (endError) {
        console.log('Error sending completion marker:', endError.message)
      }

      console.log(`  total request time : ${Date.now() - requestStart}ms`)
      console.log(`── END ───────────────────────────────────────────────`)
    } catch (streamError) {
      if (sseCleanup) {
        sseCleanup()
      }
      throw streamError
    }
  } catch (error) {
    console.error('Chat error:', error.message, error.stack)
    if (!res.headersSent) {
      res.status(500).json({ error: `Failed to process chat: ${error.message}` })
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
      res.end()
    }
  }
}
