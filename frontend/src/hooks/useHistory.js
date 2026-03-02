import { useState, useEffect } from 'react'
import { getHistory } from '../services/api'

export function useHistory(sessionId) {
  const [messages, setMessages] = useState([])
  const [historyLoaded, setHistoryLoaded] = useState(false)

  useEffect(() => {
    if (!sessionId) {
      setMessages([])
      setHistoryLoaded(false)
      return
    }

    setMessages([])
    setHistoryLoaded(false)

    getHistory(sessionId)
      .then(({ messages: hist }) => {
        if (hist && hist.length > 0) {
          setMessages(
            hist.map(m => ({
              id: m.id?.toString() || crypto.randomUUID(),
              role: m.role,
              content: m.content,
              timestamp: m.timestamp || new Date().toISOString(),
            }))
          )
        }
      })
      .catch(() => {
        // Session may not exist yet — treat as empty history
      })
      .finally(() => setHistoryLoaded(true))
  }, [sessionId])

  return { messages, setMessages, historyLoaded }
}
