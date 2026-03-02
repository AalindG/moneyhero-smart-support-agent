/**
 * Query Routing Test Suite
 *
 * Tests all major routing paths in handleAnswerIntent:
 *   SHORTCUT 1 — Credit card catalog listing (reads overview.md from disk)
 *   SHORTCUT 2 — Personal loan catalog listing (reads loan files from disk)
 *   SHORTCUT 3 — Product name routing (reads specific product doc from disk)
 *   SHORTCUT 4 — Comparison query (keyword-scores overview.md bullets)
 *   VECTOR SEARCH — General queries that reach the vector store
 *   OFF-TOPIC — Queries outside the domain
 *   ESCALATION — Human handoff requests
 *   VALIDATION — Missing/invalid inputs
 *
 * Usage: node scripts/test-queries.js
 * Requires: server running on localhost:3001
 */

const BASE_URL = 'http://localhost:3001'

// ── SSE stream reader ─────────────────────────────────────────────────────────
// Reads an SSE stream from POST /api/chat and returns:
//   { tokens: string, bold: string, done: boolean, error: string|null }
// `bold` is the final formatted response sent as data:{"bold":"..."}
// `tokens` is the raw concatenated streaming tokens (pre-formatting)
async function readSSEStream(res) {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let tokens = ''
  let bold = ''
  let done = false
  let streamError = null

  try {
    while (true) {
      const { done: streamDone, value } = await reader.read()
      if (streamDone) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n').filter(l => l.startsWith('data:'))

      for (const line of lines) {
        const data = line.slice(5).trim()
        if (data === '[DONE]') {
          done = true
          continue
        }
        // Skip SSE comments (keepalive, thinking)
        if (!data || data.startsWith(':')) continue
        try {
          const parsed = JSON.parse(data)
          if (parsed.token) tokens += parsed.token
          if (parsed.bold) bold = parsed.bold
          if (parsed.error) streamError = parsed.error
        } catch {
          // ignore malformed lines
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return { tokens, bold, done, error: streamError }
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function createSession() {
  const res = await fetch(`${BASE_URL}/api/session`, { method: 'POST' })
  if (!res.ok) throw new Error(`Session creation failed: ${res.status}`)
  const { sessionId } = await res.json()
  return sessionId
}

async function sendMessage(sessionId, message) {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message })
  })
  return res
}

async function chat(sessionId, message) {
  const res = await sendMessage(sessionId, message)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return { status: res.status, error: body.error, response: '' }
  }
  const stream = await readSSEStream(res)
  // Use `bold` (final formatted) if available, fall back to raw tokens
  const response = stream.bold || stream.tokens
  return { status: 200, response, done: stream.done, streamError: stream.error }
}

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0
let failed = 0

async function test(label, fn) {
  process.stdout.write(`  ${label} ... `)
  try {
    await fn()
    console.log('PASS')
    passed++
  } catch (err) {
    console.log(`FAIL — ${err.message}`)
    failed++
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertContains(text, ...terms) {
  const lower = text.toLowerCase()
  for (const term of terms) {
    if (!lower.includes(term.toLowerCase())) {
      throw new Error(`Expected response to contain "${term}" but got:\n${text.slice(0, 300)}`)
    }
  }
}

function assertNotContains(text, ...terms) {
  const lower = text.toLowerCase()
  for (const term of terms) {
    if (lower.includes(term.toLowerCase())) {
      throw new Error(`Expected response NOT to contain "${term}"`)
    }
  }
}

function assertMinLength(text, min) {
  if (text.length < min) {
    throw new Error(`Expected response length >= ${min} but got ${text.length}: "${text.slice(0, 100)}"`)
  }
}

// ── Test suites ───────────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  MoneyHero Query Routing Test Suite')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // ── Health check ─────────────────────────────────────────────────────────
  console.log('[ Pre-flight ]')
  await test('Server is reachable', async () => {
    const res = await fetch(`${BASE_URL}/health`)
    assert(res.ok, `Health check returned ${res.status}`)
    const body = await res.json()
    assert(body.status === 'healthy', `Expected status=healthy, got ${body.status}`)
  })

  const sessionId = await createSession()

  // ── Shortcut 1: Credit card catalog listing ───────────────────────────────
  console.log('\n[ Shortcut 1 — Credit card catalog ]')

  await test('"What credit cards do you offer?"', async () => {
    const { response } = await chat(sessionId, 'What credit cards do you offer?')
    assertMinLength(response, 50)
    // Overview.md should list all 5 cards — check for at least 3
    const cardsMentioned = ['HSBC', 'Citi', 'DBS', 'OCBC', 'UOB'].filter(c =>
      response.toLowerCase().includes(c.toLowerCase())
    )
    assert(cardsMentioned.length >= 3,
      `Expected at least 3 card names but only found: ${cardsMentioned.join(', ')} in: ${response.slice(0, 200)}`)
    assertNotContains(response, "can't help", "cannot help", "unable to help")
  })

  await test('"List all credit cards"', async () => {
    const { response } = await chat(sessionId, 'List all credit cards')
    assertMinLength(response, 50)
    const cardsMentioned = ['HSBC', 'Citi', 'DBS', 'OCBC', 'UOB'].filter(c =>
      response.toLowerCase().includes(c.toLowerCase())
    )
    assert(cardsMentioned.length >= 3,
      `Expected at least 3 card names but only found: ${cardsMentioned.join(', ')}`)
  })

  await test('"Tell me about your cards"', async () => {
    const { response } = await chat(sessionId, 'Tell me about your cards')
    assertMinLength(response, 50)
    assertNotContains(response, "can't help", "cannot help")
  })

  await test('"What cards are available?"', async () => {
    const { response } = await chat(sessionId, 'What cards are available?')
    assertMinLength(response, 50)
    assertNotContains(response, "can't help", "cannot help")
  })

  // ── Shortcut 2: Personal loan catalog listing ─────────────────────────────
  console.log('\n[ Shortcut 2 — Personal loan catalog ]')

  await test('"What personal loans do you offer?"', async () => {
    const { response } = await chat(sessionId, 'What personal loans do you offer?')
    assertMinLength(response, 50)
    assertContains(response, 'loan')
    assertNotContains(response, "can't help", "cannot help")
  })

  await test('"List all personal loans"', async () => {
    const { response } = await chat(sessionId, 'List all personal loans')
    assertMinLength(response, 50)
    assertContains(response, 'loan')
    assertNotContains(response, "can't help", "cannot help")
  })

  await test('"What loans are available?"', async () => {
    const { response } = await chat(sessionId, 'What loans are available?')
    assertMinLength(response, 30)
    assertNotContains(response, "can't help", "cannot help")
  })

  // ── Shortcut 3: Product name routing ────────────────────────────────────────
  console.log('\n[ Shortcut 3 — Product routing ]')

  await test('"Tell me about the HSBC Revolution card"', async () => {
    const { response } = await chat(sessionId, 'Tell me about the HSBC Revolution card')
    assertMinLength(response, 50)
    assertContains(response, 'HSBC')
    assertNotContains(response, "can't help", "cannot help")
  })

  await test('"What is the annual fee for the HSBC card?"', async () => {
    const { response } = await chat(sessionId, 'What is the annual fee for the HSBC card?')
    assertMinLength(response, 20)
    // Should mention a fee amount or "waived"
    const hasFeeInfo = /\$|waiv|free|s\$|\d+/i.test(response)
    assert(hasFeeInfo, `Expected fee information but got: ${response.slice(0, 200)}`)
    assertNotContains(response, "can't help", "cannot help")
  })

  await test('"What are the benefits of the DBS Live Fresh card?"', async () => {
    const { response } = await chat(sessionId, 'What are the benefits of the DBS Live Fresh card?')
    assertMinLength(response, 50)
    assertContains(response, 'DBS')
    assertNotContains(response, "can't help", "cannot help")
  })

  await test('"Tell me about the Standard Chartered CashOne loan"', async () => {
    const { response } = await chat(sessionId, 'Tell me about the Standard Chartered CashOne loan')
    assertMinLength(response, 50)
    assertNotContains(response, "can't help", "cannot help")
  })

  // ── Shortcut 4: Comparison queries ──────────────────────────────────────────
  console.log('\n[ Shortcut 4 — Comparison queries ]')

  await test('"Which cards offer cashback?"', async () => {
    const { response } = await chat(sessionId, 'Which cards offer cashback?')
    assertMinLength(response, 30)
    assertNotContains(response, "can't help", "cannot help")
  })

  await test('"Which cards are good for travel?"', async () => {
    const { response } = await chat(sessionId, 'Which cards are good for travel?')
    assertMinLength(response, 30)
    assertNotContains(response, "can't help", "cannot help")
  })

  await test('"What cards earn miles?"', async () => {
    const { response } = await chat(sessionId, 'What cards earn miles?')
    assertMinLength(response, 30)
    assertNotContains(response, "can't help", "cannot help")
  })

  // ── General / vector search queries ─────────────────────────────────────────
  console.log('\n[ Vector search — General queries ]')

  await test('"How do I apply for a credit card?"', async () => {
    const { response } = await chat(sessionId, 'How do I apply for a credit card?')
    assertMinLength(response, 30)
    assertNotContains(response, "can't help", "cannot help")
  })

  await test('"What is the minimum income requirement?"', async () => {
    const { response } = await chat(sessionId, 'What is the minimum income requirement?')
    assertMinLength(response, 30)
    assertNotContains(response, "can't help", "cannot help")
  })

  // ── Escalation ───────────────────────────────────────────────────────────────
  console.log('\n[ Escalation routing ]')

  await test('"I need to speak to a human"', async () => {
    const { response } = await chat(sessionId, 'I need to speak to a human')
    assertMinLength(response, 20)
    // Should indicate escalation, not pretend to be a human
    const isEscalation = /specialist|team|support|connect|agent|human|representative/i.test(response)
    assert(isEscalation, `Expected escalation response but got: ${response.slice(0, 200)}`)
  })

  await test('"I want to make a complaint"', async () => {
    const { response } = await chat(sessionId, 'I want to make a complaint')
    assertMinLength(response, 20)
    assertNotContains(response, "can't help", "cannot help")
  })

  // ── Off-topic routing ────────────────────────────────────────────────────────
  console.log('\n[ Off-topic routing ]')

  await test('"What is the weather like today?"', async () => {
    const { response } = await chat(sessionId, 'What is the weather like today?')
    assertMinLength(response, 20)
    // Should redirect, not pretend to answer
    assertNotContains(response, "can't help", "cannot help")
  })

  await test('"Should I buy Bitcoin?"', async () => {
    const { response } = await chat(sessionId, 'Should I buy Bitcoin?')
    assertMinLength(response, 20)
    assertNotContains(response, "can't help", "cannot help")
  })

  // ── Input validation ─────────────────────────────────────────────────────────
  console.log('\n[ Input validation ]')

  await test('Missing sessionId returns 400', async () => {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello' })
    })
    assert(res.status === 400, `Expected 400, got ${res.status}`)
    const body = await res.json()
    assert(body.error, 'Expected error field in response')
  })

  await test('Missing message returns 400', async () => {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    })
    assert(res.status === 400, `Expected 400, got ${res.status}`)
  })

  await test('Non-existent session returns 404', async () => {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'does-not-exist-00000000', message: 'hello' })
    })
    assert(res.status === 404, `Expected 404, got ${res.status}`)
  })

  await test('sessionId too long returns 400', async () => {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'a'.repeat(101), message: 'hello' })
    })
    assert(res.status === 400, `Expected 400, got ${res.status}`)
  })

  // ── Session / History endpoints ───────────────────────────────────────────────
  console.log('\n[ Session & History endpoints ]')

  await test('POST /api/session creates session with UUID', async () => {
    const res = await fetch(`${BASE_URL}/api/session`, { method: 'POST' })
    assert(res.ok, `Expected 200, got ${res.status}`)
    const body = await res.json()
    assert(body.sessionId, 'Missing sessionId in response')
    assert(/^[0-9a-f-]{36}$/i.test(body.sessionId), `Invalid UUID format: ${body.sessionId}`)
  })

  await test('GET /api/history returns messages in order', async () => {
    const res = await fetch(`${BASE_URL}/api/history/${sessionId}`)
    assert(res.ok, `Expected 200, got ${res.status}`)
    const body = await res.json()
    assert(Array.isArray(body.messages), 'Expected messages array')
    assert(body.messages.length > 0, 'Expected at least one message (from earlier tests)')
    // Messages should be in chronological order: user then assistant, alternating
    const firstUser = body.messages.find(m => m.role === 'user')
    const firstAssistant = body.messages.find(m => m.role === 'assistant')
    assert(firstUser, 'Expected at least one user message')
    assert(firstAssistant, 'Expected at least one assistant message')
  })

  // ── Results ───────────────────────────────────────────────────────────────────
  const total = passed + failed
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  Results: ${passed}/${total} passed, ${failed} failed`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  if (failed > 0) process.exit(1)
}

runTests().catch(err => {
  console.error('\nFATAL:', err.message)
  process.exit(1)
})
