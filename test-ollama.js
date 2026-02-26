#!/usr/bin/env node

// Test Ollama API directly
async function testOllamaAPI() {
  try {
    console.log('🧪 Testing Ollama API...\n')

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2:1b',
        prompt: 'Say hello in 5 words or less.',
        stream: true,
        options: {
          temperature: 0.7
        }
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    console.log('✅ Got response from Ollama, streaming...\n')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullResponse = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n').filter(line => line.trim())

      for (const line of lines) {
        try {
          const data = JSON.parse(line)
          if (data.response) {
            process.stdout.write(data.response)
            fullResponse += data.response
          }
          if (data.done) {
            console.log('\n\n✅ Stream completed')
            console.log(`📊 Total characters: ${fullResponse.length}`)
            return
          }
        } catch (e) {
          console.error('Failed to parse:', line)
        }
      }
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

testOllamaAPI()
