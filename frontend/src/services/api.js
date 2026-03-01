const BASE = '/api'

export async function createSession() {
  const res = await fetch(`${BASE}/session`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to create session')
  return res.json()
}

export async function getHistory(sessionId) {
  const res = await fetch(`${BASE}/history/${sessionId}`)
  if (!res.ok) throw new Error('Failed to load history')
  return res.json()
}

export async function escalate(sessionId, reason) {
  const res = await fetch(`${BASE}/escalate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, reason }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Failed to escalate')
  }
  return res.json()
}

/**
 * Stream a chat message. Returns an abort function.
 */
export function streamChat(message, sessionId, { onToken, onDone, onError }) {
  const controller = new AbortController()

  ;(async () => {
    try {
      const res = await fetch(`${BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId }),
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(l => l.startsWith('data:'))

        for (const line of lines) {
          const raw = line.slice(5).trim()
          if (raw === '[DONE]') {
            onDone()
            return
          }
          try {
            const parsed = JSON.parse(raw)
            if (parsed.error) {
              onError(parsed.error)
              return
            }
            if (parsed.token) onToken(parsed.token)
          } catch {
            // Partial JSON — skip
          }
        }
      }

      onDone()
    } catch (err) {
      if (err.name !== 'AbortError') onError(err.message)
    }
  })()

  return () => controller.abort()
}
