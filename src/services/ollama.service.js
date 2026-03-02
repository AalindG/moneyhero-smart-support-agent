import { OLLAMA } from '../config/constants.js'
import { validateStreamingToken, validateOutput } from '../middleware/outputValidation.js'

/**
 * Ollama Service
 * Handles streaming responses from Ollama API with output validation
 */

/**
 * Streams LLM response from Ollama API
 * @param {string} prompt - Complete prompt with context
 * @param {object} res - Express response object for streaming
 * @returns {Promise<string>} Full accumulated response
 * @throws {Error} If Ollama API call fails
 */
export async function streamResponse(prompt, res) {
  const ollamaUrl = `${process.env.OLLAMA_BASE_URL}/api/generate`
  const streamStart = Date.now()
  console.log(`  [ollama] url          : ${ollamaUrl}`)
  console.log(`  [ollama] model        : ${process.env.OLLAMA_MODEL}`)
  console.log(`  [ollama] prompt length: ${prompt.length} chars`)

  try {
    const response = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL,
        prompt: prompt,
        stream: true,
        options: {
          temperature: OLLAMA.TEMPERATURE,
          num_predict: 900
        }
      })
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText)
      throw new Error(`Ollama API error (${response.status}): ${errorText}`)
    }

    console.log(`  [ollama] HTTP response OK — streaming tokens...`)

    let fullResponse = ''
    let tokenCount = 0
    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n').filter(line => line.trim())

      for (const line of lines) {
        try {
          const data = JSON.parse(line)
          if (data.response) {
            // Validate streaming token before sending
            const validation = validateStreamingToken(data.response)
            if (!validation.valid) {
              console.error(`  [ollama] blocked invalid token at position ${fullResponse.length}`)
              continue // Skip this token
            }

            fullResponse += data.response
            tokenCount++
            try {
              res.write(`data: ${JSON.stringify({ token: data.response })}\n\n`)
              if (res.flush) {
                res.flush()
              }
            } catch (writeError) {
              // Client disconnected, but continue to accumulate response for DB
              console.log('  [ollama] write error (client may have disconnected):', writeError.message)
            }
          }
        } catch (e) {
          console.error('  [ollama] failed to parse line:', line)
        }
      }
    }

    const elapsed = Date.now() - streamStart
    console.log(`  [ollama] stream done — ${tokenCount} tokens, ${fullResponse.length} chars, ${elapsed}ms`)
    if (fullResponse.length > 0) {
      console.log(`  [ollama] response preview: "${fullResponse.slice(0, 120).replace(/\n/g, ' ')}${fullResponse.length > 120 ? '…' : ''}"`)
    }

    // Validate complete response before returning
    const validation = validateOutput(fullResponse)
    if (!validation.valid) {
      console.error(`  [ollama] VALIDATION FAILED: ${validation.error}`)
      // Notify client to discard streamed tokens and show sanitized fallback instead
      try {
        res.write(`data: ${JSON.stringify({ error: 'response_filtered', message: validation.sanitized })}\n\n`)
        if (res.flush) res.flush()
      } catch (e) { /* client disconnected */ }
      return validation.sanitized
    }

    return validation.text || fullResponse
  } catch (error) {
    console.error('  [ollama] streaming error:', error.message)
    throw new Error(`Failed to stream from Ollama: ${error.message}`)
  }
}
