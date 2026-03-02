import { useState, useCallback, useRef } from 'react'
import { streamChat } from '../services/api'

export function useChat(sessionId, setMessages) {
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef(null)

  const sendMessage = useCallback(
    text => {
      if (!sessionId || streaming || !text.trim()) return

      const userMsg = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text.trim(),
        timestamp: new Date().toISOString(),
      }

      const assistantId = crypto.randomUUID()
      const assistantMsg = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        streaming: true,
      }

      setMessages(prev => [...prev, userMsg, assistantMsg])
      setStreaming(true)

      abortRef.current = streamChat(text.trim(), sessionId, {
        onToken: token => {
          setMessages(prev =>
            prev.map(m => (m.id === assistantId ? { ...m, content: m.content + token } : m))
          )
        },
        onBold: bolded => {
          // Replace the streamed plain text with the final bolded+disclaimer version
          setMessages(prev =>
            prev.map(m => (m.id === assistantId ? { ...m, content: bolded } : m))
          )
        },
        onDone: () => {
          setMessages(prev =>
            prev.map(m => (m.id === assistantId ? { ...m, streaming: false } : m))
          )
          setStreaming(false)
        },
        onError: err => {
          const content =
            err === 'NO_RELEVANT_DOCS' || err === 'response_filtered'
              ? "I don't have detailed information about that. Would you like me to connect you with one of our advisors?"
              : 'Something went wrong. Please try again.'
          setMessages(prev =>
            prev.map(m => (m.id === assistantId ? { ...m, content, streaming: false } : m))
          )
          setStreaming(false)
        },
      })
    },
    [sessionId, streaming, setMessages]
  )

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current()
      abortRef.current = null
      setStreaming(false)
      setMessages(prev => prev.map(m => (m.streaming ? { ...m, streaming: false } : m)))
    }
  }, [setMessages])

  return { sendMessage, streaming, cancel }
}
