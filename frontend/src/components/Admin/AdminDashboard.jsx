import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, LogOut, RefreshCw, ChevronRight, ChevronDown, TrendingUp } from 'lucide-react'
import { adminListSessions, adminGetMessages, adminGetTopQuestions } from '../../services/api'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function MessageThread({ messages }) {
  if (messages.length === 0) {
    return <p className="text-xs text-slate-400 text-center py-3">No messages in this session.</p>
  }
  return (
    <div className="space-y-2">
      {messages.map((msg, i) => (
        <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          {msg.role === 'assistant' && (
            <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-white text-[8px] font-bold">M</span>
            </div>
          )}
          <div
            className={`max-w-[75%] rounded-xl px-3 py-1.5 text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'bg-slate-800 text-white rounded-tr-sm'
                : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm'
            }`}
          >
            {msg.content}
          </div>
        </div>
      ))}
    </div>
  )
}

function TopQuestionsPanel({ token, onAuthError }) {
  const [open, setOpen] = useState(false)
  const [questions, setQuestions] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await adminGetTopQuestions(token)
      setQuestions(data.questions)
    } catch (err) {
      if (err.message === '401') onAuthError()
    } finally {
      setLoading(false)
    }
  }, [token, onAuthError])

  const toggle = () => {
    if (!open && questions === null) load()
    setOpen(o => !o)
  }

  return (
    <div className="border border-slate-200/80 rounded-2xl shadow-xl bg-white overflow-hidden mb-4">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <TrendingUp className="w-4 h-4 text-slate-500 flex-shrink-0" />
        <span className="flex-1 text-sm font-semibold text-slate-700">Top 10 Most Asked Questions</span>
        <span className="text-slate-400 flex-shrink-0">
          {loading ? (
            <span className="w-3.5 h-3.5 border border-slate-300 border-t-slate-600 rounded-full animate-spin inline-block" />
          ) : open ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </span>
      </button>

      {open && !loading && questions !== null && (
        <div className="border-t border-slate-100">
          {questions.length === 0 ? (
            <p className="px-4 py-4 text-xs text-slate-400 text-center">No questions yet.</p>
          ) : (
            <ol className="divide-y divide-slate-100">
              {questions.map((q, i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-xs text-slate-700 leading-relaxed min-w-0 break-words">
                    {q.question}
                  </span>
                  <div className="flex-shrink-0 flex flex-col items-end gap-0.5 ml-2">
                    <span className="text-[10px] font-semibold bg-slate-800 text-white px-1.5 py-0.5 rounded-full">
                      ×{q.count}
                    </span>
                    <span className="text-[9px] text-slate-400">{formatDate(q.last_asked_at)}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}

function SessionRow({ session, token, onAuthError }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState(null)
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    if (open) {
      setOpen(false)
      return
    }
    if (messages !== null) {
      setOpen(true)
      return
    }
    setLoading(true)
    try {
      const data = await adminGetMessages(session.id, token)
      setMessages(data.messages)
      setOpen(true)
    } catch (err) {
      if (err.message === '401') onAuthError()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border-b border-slate-100 last:border-0">
      {/* Row */}
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="text-slate-400 flex-shrink-0">
          {loading ? (
            <span className="w-3.5 h-3.5 border border-slate-300 border-t-slate-600 rounded-full animate-spin inline-block" />
          ) : open ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </span>

        {/* Session ID */}
        <span className="font-mono text-[11px] text-slate-600 flex-1 truncate min-w-0">
          {session.id}
        </span>

        {/* Message count badge */}
        <span className="flex-shrink-0 text-[10px] font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
          {session.message_count} msg{session.message_count !== 1 ? 's' : ''}
        </span>

        {/* Last activity */}
        <span className="flex-shrink-0 text-[10px] text-slate-400 hidden sm:block w-36 text-right">
          {formatDate(session.last_message_at || session.created_at)}
        </span>
      </button>

      {/* Expanded thread */}
      {open && messages !== null && (
        <div className="bg-slate-50/70 border-t border-slate-100 px-4 py-3 max-h-80 overflow-y-auto scrollbar-thin">
          <MessageThread messages={messages} />
        </div>
      )}
    </div>
  )
}

export default function AdminDashboard({ token, onLogout, onBack }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await adminListSessions(token)
      setSessions(data.sessions)
    } catch (err) {
      if (err.message === '401') {
        onLogout()
      } else {
        setError(err.message || 'Failed to load sessions')
      }
    } finally {
      setLoading(false)
    }
  }, [token, onLogout])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <header className="bg-slate-900 text-white px-4 py-2.5 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
              <span className="text-white text-xs font-bold">M</span>
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-wide leading-none">Admin Portal</h1>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-none">Chat history</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onBack}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              <span className="hidden sm:inline">Chat</span>
            </button>
            <button
              onClick={fetchSessions}
              disabled={loading}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white px-2 py-1 rounded-md hover:bg-white/10 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
            >
              <LogOut className="w-3 h-3" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Top questions */}
        <TopQuestionsPanel token={token} onAuthError={onLogout} />

        {/* Content card */}
        <div className="bg-white rounded-b-2xl shadow-xl border border-t-0 border-slate-200/80 overflow-hidden">

          {/* Loading */}
          {loading && sessions.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-400 text-sm">
              <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
              Loading sessions…
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="px-6 py-4 text-sm text-red-600">{error}</p>
          )}

          {/* Empty state */}
          {!loading && !error && sessions.length === 0 && (
            <p className="px-6 py-12 text-sm text-slate-400 text-center">No chat sessions yet.</p>
          )}

          {/* Session list */}
          {sessions.length > 0 && (
            <>
              {/* Column headers */}
              <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                <span className="w-3.5 flex-shrink-0" />
                <span className="flex-1">Session ID</span>
                <span className="flex-shrink-0">Messages</span>
                <span className="flex-shrink-0 hidden sm:block w-36 text-right">Last activity</span>
              </div>

              {sessions.map(session => (
                <SessionRow
                  key={session.id}
                  session={session}
                  token={token}
                  onAuthError={onLogout}
                />
              ))}
            </>
          )}
        </div>

        <p className="text-[10px] text-slate-400 text-center mt-3">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
}
