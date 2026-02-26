#!/usr/bin/env node

// Quick test script for SSE streaming
async function testStreaming() {
  try {
    // Create session first
    const sessionRes = await fetch('http://localhost:3001/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    const { sessionId } = await sessionRes.json()
    console.log(`✅ Created session: ${sessionId}\n`)

    // Send chat message and stream response
    const response = await fetch('http://localhost:3001/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        message: 'What cashback cards do you have?'
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    console.log('📡 Streaming response:\n')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6) // Remove 'data: ' prefix

          if (data === '[DONE]') {
            console.log('\n\n✅ Stream completed')
            break
          }

          try {
            const json = JSON.parse(data)
            if (json.token) {
              process.stdout.write(json.token)
              fullText += json.token
            }
          } catch (e) {
            // Not JSON, might be keepalive comment
          }
        }
      }
    }

    console.log(`\n\n📊 Total characters received: ${fullText.length}`)
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

testStreaming()
