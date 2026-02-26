#!/usr/bin/env node

// Test different scenarios
async function testMultipleScenarios() {
  try {
    // Create session
    const sessionRes = await fetch('http://localhost:3001/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    const { sessionId } = await sessionRes.json()
    console.log(`✅ Created session: ${sessionId}\n`)

    // Test 1: Answer question about credit cards
    console.log('📝 Test 1: Ask about credit cards')
    await testChat(sessionId, 'Tell me about HSBC Revolution')

    // Test 2: Ask for escalation
    console.log('\n📝 Test 2: Request human agent')
    await testChat(sessionId, 'I need to speak to a human agent')

    // Test 3: Ask off-topic question
    console.log('\n📝 Test 3: Ask off-topic question')
    await testChat(sessionId, 'What is the weather today?')

    console.log('\n✅ All tests completed!')
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

async function testChat(sessionId, message) {
  const response = await fetch('http://localhost:3001/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message })
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''

  console.log(`Question: "${message}"`)
  process.stdout.write('Response: ')

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    const lines = chunk.split('\n')

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') {
          break
        }
        try {
          const json = JSON.parse(data)
          if (json.token) {
            process.stdout.write(json.token)
            fullText += json.token
          }
        } catch (e) {
          // Not JSON
        }
      }
    }
  }

  console.log() // New line after response
}

testMultipleScenarios()
