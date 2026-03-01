import * as SessionModel from '../models/session.model.js'
import * as MessageModel from '../models/message.model.js'
import * as AnalyticsModel from '../models/analytics.model.js'
import { chat } from '../agent.js'
import { streamResponse } from '../services/ollama.service.js'
import { setupSSE } from '../middleware/sse.js'
import { validateRequestParams } from '../middleware/validation.js'
import { addFinancialDisclaimer, addRegulatoryWarnings } from '../utils/compliance.js'

/**
 * Chat Controller
 * Handles chat message processing and streaming with compliance
 */

/**
 * Processes user messages and streams agent response via SSE
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
export async function handleChatMessage(req, res) {
  let sseCleanup = null

  try {
    const { sessionId, message } = req.body

    // Validate inputs
    const validation = validateRequestParams(sessionId, message)
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error })
    }

    // Verify session exists
    let session
    try {
      session = SessionModel.findById(sessionId)
    } catch (dbError) {
      console.error('Database error checking session:', dbError.message)
      return res.status(500).json({ error: 'Database error' })
    }

    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    // Setup SSE streaming
    const sse = setupSSE(res, req)
    sseCleanup = sse.cleanup

    // Track response time for analytics
    const startTime = Date.now()

    try {
      // Get response from RAG agent
      console.log('Getting prompt from chat agent...')
      const result = await chat(sessionId, message, true)
      console.log(`Chat agent returned intent: ${result.intent}`)

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

        try {
          res.write(`data: ${JSON.stringify({ token: disclaimedReply })}\n\n`)
          if (res.flush) {
            res.flush()
          }
          res.write('data: [DONE]\n\n')
          res.end()
        } catch (writeError) {
          console.log('Error writing non-answer response:', writeError.message)
        }
        return
      }

      // Handle answer intent with streaming
      const { prompt, memory } = result
      console.log('Streaming from Ollama API...')

      const fullResponse = await streamResponse(prompt, res)

      console.log(`Ollama streaming complete, received ${fullResponse.length} characters`)

      // Add financial compliance disclaimer and regulatory warnings to answer responses
      const withDisclaimer = addFinancialDisclaimer(fullResponse, result.intent, fullResponse.length)
      const disclaimedResponse = addRegulatoryWarnings(withDisclaimer)

      // Stream any compliance content that was appended (disclaimer + regulatory warnings)
      if (disclaimedResponse !== fullResponse) {
        const complianceContent = disclaimedResponse.slice(fullResponse.length)
        try {
          res.write(`data: ${JSON.stringify({ token: complianceContent })}\n\n`)
          if (res.flush) {
            res.flush()
          }
        } catch (writeError) {
          console.log('Error streaming compliance content:', writeError.message)
        }
      }

      // Persist conversation to database (with compliance content)
      MessageModel.create(sessionId, 'user', message)
      MessageModel.create(sessionId, 'assistant', disclaimedResponse)

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

      // Save raw LLM response to memory (without disclaimer) to avoid polluting future prompts
      await memory.saveContext({ input: message }, { output: fullResponse })

      // Send completion marker
      try {
        res.write('data: [DONE]\n\n')
        res.end()
      } catch (endError) {
        console.log('Error sending completion marker:', endError.message)
      }

      console.log('Streaming completed successfully')
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
