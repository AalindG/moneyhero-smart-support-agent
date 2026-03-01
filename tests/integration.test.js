/**
 * Integration Tests
 * Tests complete workflows and system integration
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001'

describe('Integration Tests', () => {
  describe('Complete Chat Flow', () => {
    it('should handle full conversation lifecycle', async () => {
      // Step 1: Create session
      const sessionResponse = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      assert.equal(sessionResponse.status, 200)
      const { sessionId } = await sessionResponse.json()

      // Step 2: Send first message
      const chat1Response = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Tell me about HSBC Revolution card'
        })
      })
      assert.equal(chat1Response.status, 200)

      // Wait for response to complete
      const reader1 = chat1Response.body.getReader()
      while (true) {
        const { done } = await reader1.read()
        if (done) break
      }

      // Step 3: Send follow-up message (tests memory)
      const chat2Response = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'What are the fees?'
        })
      })
      assert.equal(chat2Response.status, 200)

      const reader2 = chat2Response.body.getReader()
      while (true) {
        const { done } = await reader2.read()
        if (done) break
      }

      // Step 4: Get history
      const historyResponse = await fetch(`${BASE_URL}/api/history/${sessionId}`)
      const history = await historyResponse.json()

      assert.ok(history.messages.length >= 4) // 2 user + 2 assistant messages
      assert.equal(history.messages[0].role, 'user')
      assert.equal(history.messages[2].role, 'user')
    })

    it('should handle escalation flow', async () => {
      // Create session
      const sessionResponse = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const { sessionId } = await sessionResponse.json()

      // Send escalation request
      const escalateResponse = await fetch(`${BASE_URL}/api/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          reason: 'Need to speak with specialist'
        })
      })

      const escalation = await escalateResponse.json()
      assert.ok(escalation.success)
      assert.ok(escalation.ticketId)
    })
  })

  describe('Intent Classification Flow', () => {
    it('should classify product questions as "answer" intent', async () => {
      const sessionResponse = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const { sessionId } = await sessionResponse.json()

      const chatResponse = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'What credit cards offer cashback?'
        })
      })

      assert.equal(chatResponse.status, 200)
      // Should get streaming response with product information
      const reader = chatResponse.body.getReader()
      const decoder = new TextDecoder()
      let hasProductInfo = false

      for (let i = 0; i < 20; i++) {
        const { value, done } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        if (text.match(/credit card|cashback|HSBC|DBS|UOB|OCBC/i)) {
          hasProductInfo = true
          break
        }
      }
      reader.cancel()

      assert.ok(hasProductInfo, 'Response should contain product information')
    })

    it('should detect escalation keywords', async () => {
      const sessionResponse = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const { sessionId } = await sessionResponse.json()

      const chatResponse = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'I need to speak to a human representative'
        })
      })

      const reader = chatResponse.body.getReader()
      const decoder = new TextDecoder()
      let response = ''

      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          response += decoder.decode(value)
        }
      } catch (e) {
        // May timeout
      }

      // Should contain escalation language
      assert.ok(
        response.match(/specialist|expert|advisor|connect/i),
        'Should offer human escalation'
      )
    })

    it('should handle off-topic questions', async () => {
      const sessionResponse = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const { sessionId } = await sessionResponse.json()

      const chatResponse = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'What is the weather like today?'
        })
      })

      const reader = chatResponse.body.getReader()
      const decoder = new TextDecoder()
      let response = ''

      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          response += decoder.decode(value)
        }
      } catch (e) {
        // May timeout
      }

      // Should redirect to financial products
      assert.ok(
        response.match(/credit card|loan|financial|product/i),
        'Should redirect to financial topics'
      )
    })
  })

  describe('Multi-turn Conversations', () => {
    it('should maintain context across messages', async () => {
      const sessionResponse = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const { sessionId } = await sessionResponse.json()

      // First message establishes context
      const chat1 = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Tell me about Citi Cashback Plus card'
        })
      })

      let reader = chat1.body.getReader()
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }

      // Wait a bit for DB write
      await new Promise(resolve => setTimeout(resolve, 500))

      // Second message references "it" - tests memory
      const chat2 = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'What is the minimum income requirement for it?'
        })
      })

      reader = chat2.body.getReader()
      const decoder = new TextDecoder()
      let response = ''

      for (let i = 0; i < 30; i++) {
        const { value, done } = await reader.read()
        if (done) break
        response += decoder.decode(value)
      }
      reader.cancel()

      // Should reference Citi card in context
      assert.ok(
        response.match(/Citi|income|require/i),
        'Should understand "it" refers to Citi card'
      )
    })
  })

  describe('RAG Pipeline Integration', () => {
    it('should retrieve relevant documents', async () => {
      const sessionResponse = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const { sessionId } = await sessionResponse.json()

      const chatResponse = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'What are the benefits of HSBC Revolution card?'
        })
      })

      const reader = chatResponse.body.getReader()
      const decoder = new TextDecoder()
      let response = ''

      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          response += decoder.decode(value)
        }
      } catch (e) {
        // May timeout
      }

      // Should contain specific product information
      assert.ok(response.match(/HSBC|Revolution/i), 'Should mention HSBC Revolution')
      // Should not contain meta-language
      assert.ok(
        !response.match(/based on the information provided|according to the context/i),
        'Should not contain meta-language'
      )
    })

    it('should include financial disclaimers', async () => {
      const sessionResponse = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const { sessionId } = await sessionResponse.json()

      const chatResponse = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Tell me about credit card interest rates'
        })
      })

      const reader = chatResponse.body.getReader()
      const decoder = new TextDecoder()
      let response = ''

      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          response += decoder.decode(value)
          if (response.length > 2000) break // Enough to check
        }
      } catch (e) {
        // May timeout
      }

      // Should contain disclaimer
      assert.ok(
        response.match(/verify current rates|subject to change|disclaimer/i),
        'Should include financial disclaimer'
      )
    })
  })

  describe('Concurrent Sessions', () => {
    it('should handle multiple sessions independently', async () => {
      // Create two sessions
      const session1Response = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const { sessionId: sessionId1 } = await session1Response.json()

      const session2Response = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const { sessionId: sessionId2 } = await session2Response.json()

      // Send different messages to each
      await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId1,
          message: 'Tell me about DBS cards'
        })
      })

      await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId2,
          message: 'Tell me about HSBC cards'
        })
      })

      await new Promise(resolve => setTimeout(resolve, 2000))

      // Check histories are different
      const history1 = await fetch(`${BASE_URL}/api/history/${sessionId1}`)
      const history2 = await fetch(`${BASE_URL}/api/history/${sessionId2}`)

      const data1 = await history1.json()
      const data2 = await history2.json()

      assert.ok(data1.messages[0].content.includes('DBS'))
      assert.ok(data2.messages[0].content.includes('HSBC'))
      assert.notEqual(data1.sessionId, data2.sessionId)
    })
  })
})
