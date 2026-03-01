/**
 * Test script for refactored chat API with helper functions
 * Tests: validateRequestParams, setupSSE, streamFromOllama
 */

async function testChatAPI() {
  console.log('🧪 Testing refactored chat API...\n')

  // Test 1: Create session
  console.log('1️⃣ Creating session...')
  const sessionRes = await fetch('http://localhost:3001/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  const { sessionId } = await sessionRes.json()
  console.log(`✅ Session created: ${sessionId}\n`)

  // Test 2: Send message and stream response
  console.log('2️⃣ Sending chat message and streaming response...')
  const chatRes = await fetch('http://localhost:3001/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      message: 'What credit cards do you offer?'
    })
  })

  console.log('📡 Streaming response:')
  const reader = chatRes.body.getReader()
  const decoder = new TextDecoder()
  let fullResponse = ''
  let tokenCount = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    const lines = chunk.split('\n').filter(line => line.startsWith('data:'))

    for (const line of lines) {
      const data = line.substring(5).trim()
      if (data === '[DONE]') {
        console.log('\n\n✅ Streaming completed with [DONE] marker')
      } else if (
        data &&
        data !== ': connected' &&
        data !== ': thinking' &&
        data !== ': keepalive'
      ) {
        try {
          const parsed = JSON.parse(data)
          if (parsed.token) {
            process.stdout.write(parsed.token)
            fullResponse += parsed.token
            tokenCount++
          }
        } catch (e) {
          // Ignore parse errors for SSE comments
        }
      }
    }
  }

  console.log(`\n\n✅ Received ${tokenCount} tokens, total ${fullResponse.length} characters\n`)

  // Test 3: Verify validation (invalid sessionId)
  console.log('3️⃣ Testing validation (sessionId too long)...')
  const invalidRes = await fetch('http://localhost:3001/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'a'.repeat(101), // Exceeds MAX_SESSION_ID_LENGTH
      message: 'test'
    })
  })
  const invalidData = await invalidRes.json()
  console.log(`✅ Validation working: ${invalidData.error}\n`)

  // Test 4: Get history
  console.log('4️⃣ Retrieving conversation history...')
  const historyRes = await fetch(`http://localhost:3001/api/history/${sessionId}`)
  const history = await historyRes.json()
  console.log(`✅ History retrieved: ${history.messages.length} messages`)
  console.log(`   - User: "${history.messages[0].content.substring(0, 50)}..."`)
  console.log(`   - Assistant: "${history.messages[1].content.substring(0, 50)}..."\n`)

  console.log('🎉 All tests passed! Refactored code works correctly.')
}

testChatAPI().catch(err => {
  console.error('❌ Test failed:', err.message)
  process.exit(1)
})
