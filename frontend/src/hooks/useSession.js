import { useState, useEffect, useCallback } from 'react'
import { createSession, getHistory } from '../services/api'

const KEY = 'moneyhero_session_id'

export function useSession() {
  const [sessionId, setSessionId] = useState(null)
  const [loading, setLoading] = useState(true)

  const initSession = useCallback(async () => {
    try {
      const { sessionId: id } = await createSession()
      localStorage.setItem(KEY, id)
      setSessionId(id)
    } catch (err) {
      console.error('Session init failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem(KEY)
    if (stored) {
      // Validate that the stored session still exists in the DB (handles DB resets)
      getHistory(stored)
        .then(() => {
          setSessionId(stored)
          setLoading(false)
        })
        .catch(() => {
          // Session no longer valid — clear it and create a fresh one
          localStorage.removeItem(KEY)
          initSession()
        })
    } else {
      initSession()
    }
  }, [initSession])

  const newSession = useCallback(() => {
    localStorage.removeItem(KEY)
    setSessionId(null)
    setLoading(true)
    initSession()
  }, [initSession])

  return { sessionId, loading, newSession }
}
