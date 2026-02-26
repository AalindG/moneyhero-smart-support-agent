import express from 'express'
import { createSession, saveMessage, getHistory, logEscalation } from '../db.js'
import { chat } from '../agent.js'

const router = express.Router()

/**
 * POST /api/session
 * Creates a new chat session
 */
router.post('/session', async (req, res) => {
  try {
    const { sessionId } = createSession()
    res.status(200).json({ sessionId })
  } catch (error) {
    console.error('Error creating session:', error)
    res.status(500).json({ error: 'Failed to create session' })
  }
})

/**
 * POST /api/chat
 * Handles user messages and streams agent response via SSE
 */
router.post('/chat', async (req, res) => {
  try {
    const { sessionId, message } = req.body

    // Validate inputs
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' })
    }

    if (!message) {
      return res.status(400).json({ error: 'message is required' })
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering

    // Track client connection (note: close event may fire prematurely)
    let clientConnected = true
    req.on('close', () => {
      console.log('⚠️ Client connection closed')
      clientConnected = false
    })

    req.on('error', error => {
      console.log('❌ Request error:', error.message)
      clientConnected = false
    })

    // Send connected confirmation
    res.write(': connected\n\n')
    if (res.flush) res.flush()

    // Show thinking indicator
    res.write(': thinking\n\n')
    if (res.flush) res.flush()

    // Start keepalive interval to prevent client timeout
    const keepaliveInterval = setInterval(() => {
      try {
        res.write(': keepalive\n\n')
        if (res.flush) res.flush()
      } catch (e) {
        // Ignore write errors - client may have disconnected
      }
    }, 2000) // Send keepalive every 2 seconds

    try {
      // Get prompt and intent from RAG agent
      console.log('🤖 Getting prompt from chat agent...')
      const result = await chat(sessionId, message, true) // streaming=true
      console.log(`✅ Chat agent returned intent: ${result.intent}`)

      // Clear keepalive now that we have the result
      clearInterval(keepaliveInterval)

      // For escalate and off_topic intents, we get reply directly
      if (result.intent !== 'answer') {
        const reply = result.reply || result.prompt // reply for non-answer intents
        saveMessage(sessionId, 'user', message)
        saveMessage(sessionId, 'assistant', reply)

        try {
          res.write(`data: ${JSON.stringify({ token: reply })}\n\n`)
          if (res.flush) res.flush()
          res.write('data: [DONE]\n\n')
          res.end()
        } catch (writeError) {
          console.log(
            '⚠️ Error writing non-answer response:',
            writeError.message
          )
        }
        return
      }

      // For answer intent, stream from Ollama directly
      const { prompt, memory } = result
      console.log('🔄 Streaming from Ollama API...')

      // Call Ollama streaming API
      const ollamaUrl = `${process.env.OLLAMA_BASE_URL}/api/generate`
      console.log(`📡 Calling Ollama at: ${ollamaUrl}`)
      console.log(`🤖 Using model: ${process.env.OLLAMA_MODEL}`)

      const response = await fetch(ollamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OLLAMA_MODEL,
          prompt: prompt,
          stream: true,
          options: {
            temperature: 0.7
          }
        })
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`)
      }

      console.log('✅ Got Ollama response, starting to stream tokens...')

      // Stream tokens from Ollama
      let fullResponse = ''
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(line => line.trim())

        for (const line of lines) {
          try {
            const data = JSON.parse(line)
            if (data.response) {
              fullResponse += data.response
              try {
                res.write(
                  `data: ${JSON.stringify({ token: data.response })}\n\n`
                )
                if (res.flush) res.flush()
              } catch (writeError) {
                // Client likely disconnected, but continue to accumulate response
                console.log(
                  '⚠️ Write error (client may have disconnected):',
                  writeError.message
                )
              }
            }
          } catch (e) {
            console.error('Failed to parse Ollama response:', line)
          }
        }
      }

      console.log(
        `✅ Ollama streaming complete, received ${fullResponse.length} characters`
      )

      // Save conversation to database
      saveMessage(sessionId, 'user', message)
      saveMessage(sessionId, 'assistant', fullResponse)

      // Save assistant reply to memory
      await memory.saveContext({ input: message }, { output: fullResponse })

      // Send completion marker (always try, ignore clientConnected flag)
      try {
        res.write('data: [DONE]\n\n')
        res.end()
      } catch (endError) {
        console.log('⚠️ Error sending completion marker:', endError.message)
      }

      console.log('✅ Streaming completed successfully')
    } catch (streamError) {
      // Make sure to clear the keepalive interval on error
      clearInterval(keepaliveInterval)
      throw streamError
    }
  } catch (error) {
    console.error('❌ Chat error:', error.message, error.stack)
    if (!res.headersSent) {
      res
        .status(500)
        .json({ error: `Failed to process chat: ${error.message}` })
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
      res.end()
    }
  }
})

/**
 * POST /api/escalate
 * Escalates conversation to human agent
 */
router.post('/escalate', async (req, res) => {
  try {
    const { sessionId, reason } = req.body

    // Validate inputs
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' })
    }

    if (!reason) {
      return res.status(400).json({ error: 'reason is required' })
    }

    // Log escalation and get ticket ID
    const { ticketId } = logEscalation(sessionId, reason)

    // Return success response
    res.status(200).json({
      success: true,
      ticketId,
      message: `Your request has been escalated to a human agent. Ticket ID: ${ticketId}`
    })
  } catch (error) {
    console.error('Error escalating:', error)
    res.status(500).json({ error: 'Failed to escalate request' })
  }
})

/**
 * GET /api/history/:sessionId
 * Retrieves conversation history for a session
 */
router.get('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params

    // Get history from database
    const messages = getHistory(sessionId)

    // Check if session exists (if no messages, session might not exist)
    // Note: Empty message array could mean new session or non-existent session
    // For now, we'll return the messages array regardless
    res.status(200).json({
      sessionId,
      messages
    })
  } catch (error) {
    console.error('Error retrieving history:', error)
    res.status(500).json({ error: 'Failed to retrieve conversation history' })
  }
})

export default router
