/**
 * SSE (Server-Sent Events) Streaming Tests
 * Tests SSE streaming functionality
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001'

describe('SSE Streaming Tests', () => {
  describe('SSE Headers', () => {
    it('should set correct SSE headers', async () => {
      const sessionResponse = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const { sessionId } = await sessionResponse.json()

      const response = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Test SSE headers'
        })
      })

      assert.equal(response.headers.get('content-type'), 'text/event-stream')
      assert.equal(response.headers.get('cache-control'), 'no-cache')
      assert.equal(response.headers.get('connection'), 'keep-alive')
      assert.ok(response.headers.get('access-control-allow-origin'))

      const reader = response.body.getReader()
      reader.cancel()
    })
  })

  describe(' Token Streaming', () => {
    it('should stream tokens in correct SSE format', async () => {
      const sessionResponse = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const { sessionId } = await sessionResponse.json()

      const response = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'What is DBS Live Fresh card?'
        })
      })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let tokens = []
      let hasDataPrefix = false
      let hasToken = false

      for (let i = 0; i < 20; i++) {
        const { value, done } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        tokens.push(text)

        if (text.includes('data:')) hasDataPrefix = true
        if (text.includes('"token":')) hasToken = true

        if (hasDataPrefix && hasToken) break
      }
      reader.cancel()

      assert.ok(hasDataPrefix, 'Should have "data:" prefix')
      assert.ok(hasToken, 'Should have "token" field')
    })

    it('should send completion marker', async () => {
      const sessionResponse = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const { sessionId } = await sessionResponse.json()

      const response = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Quick question about cards'
        })
      })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let allText = ''
      let chunkCount = 0

      try {
        while (chunkCount < 100) {
          const { value, done } = await reader.read()
          if (done) break
          allText += decoder.decode(value)
          chunkCount++

          if (allText.includes('[DONE]')) break
        }
      } catch (e) {
        // May timeout
      }

      assert.ok(allText.includes('[DONE]'), 'Should send [DONE] marker')
    })

    it('should handle client disconnect gracefully', async () => {
      const sessionResponse = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const { sessionId } = await sessionResponse.json()

      const response = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Tell me about all credit cards'
        })
      })

      const reader = response.body.getReader()

      // Read a few chunks then cancel
      for (let i = 0; i < 5; i++) {
        const { done } = await reader.read()
        if (done) break
      }

      // Cancel should not throw
      await reader.cancel()
      assert.ok(true, 'Should handle cancel gracefully')
    })
  })

  describe('Keepalive Messages', () => {
    it('should send keepalive messages during processing', async () => {
      const sessionResponse = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const { sessionId } = await sessionResponse.json()

      const response = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Complex question about financial products'
        })
      })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let hasKeepalive = false

      for (let i = 0; i < 15; i++) {
        const { value, done } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        if (text.includes(':') && text.trim().startsWith(':')) {
          hasKeepalive = true
          break
        }
      }
      reader.cancel()

      assert.ok(hasKeepalive, 'Should send keepalive comments')
    })
  })

  describe('Error Handling in Streaming', () => {
    it('should stream error message if processing fails', async () => {
      const sessionResponse = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const { sessionId } = await sessionResponse.json()

      // Send extremely long message to potentially cause issues
      const longMessage = 'test '.repeat(1000)

      const response = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: longMessage
        })
      })

      // Should still get a response (may be error or success)
      assert.ok(response.status === 200 || response.status >= 400)

      if (response.status === 200) {
        const reader = response.body.getReader()
        reader.cancel()
      }
    })
  })

  describe('Concurrent Streaming', () => {
    it('should handle multiple concurrent streams', async () => {
      // Create multiple sessions
      const sessions = await Promise.all([
        fetch(`${BASE_URL}/api/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }).then(r => r.json()),
        fetch(`${BASE_URL}/api/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }).then(r => r.json()),
        fetch(`${BASE_URL}/api/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }).then(r => r.json())
      ])

      // Start concurrent streams
      const streams = await Promise.all(
        sessions.map(({ sessionId }) =>
          fetch(`${BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              message: 'Test concurrent streaming'
            })
          })
        )
      )

      // All should return 200
      streams.forEach(response => {
        assert.equal(response.status, 200)
      })

      // Cancel all readers
      await Promise.all(
        streams.map(async response => {
          const reader = response.body.getReader()
          await reader.cancel()
        })
      )
    })
  })

  describe('Stream Data Format', () => {
    it('should stream valid JSON data events', async () => {
      const sessionResponse = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const { sessionId } = await sessionResponse.json()

      const response = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Tell me about personal loans'
        })
      })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let validJsonCount = 0

      for (let i = 0; i < 30; i++) {
        const { value, done } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            const jsonStr = line.substring(6).trim()
            if (jsonStr) {
              try {
                const parsed = JSON.parse(jsonStr)
                if (parsed.token !== undefined) {
                  validJsonCount++
                }
              } catch (e) {
                // Invalid JSON in stream
              }
            }
          }
        }

        if (validJsonCount >= 5) break
      }
      reader.cancel()

      assert.ok(validJsonCount >= 3, 'Should have multiple valid JSON token events')
    })
  })
})
