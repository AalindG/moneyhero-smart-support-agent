import { useState } from 'react'
import { RotateCcw, X, ShieldCheck } from 'lucide-react'
import { useSession } from './hooks/useSession'
import { useHistory } from './hooks/useHistory'
import { useChat } from './hooks/useChat'
import { escalate } from './services/api'
import { ChatWindow } from './components/Chat/ChatWindow'
import { InputBar } from './components/Chat/InputBar'
import AdminPortal from './components/Admin/AdminPortal'

export default function App() {
  const { sessionId, loading: sessionLoading, newSession } = useSession()
  const { messages, setMessages, historyLoaded } = useHistory(sessionId)
  const { sendMessage, streaming, cancel } = useChat(sessionId, setMessages)

  // 'idle' | 'confirm' | 'loading' | { ticketId } | { error }
  const [escalateState, setEscalateState] = useState('idle')

  // 'chat' | 'admin'
  const [page, setPage] = useState('chat')

  const handleEscalate = async () => {
    if (escalateState === 'confirm') {
      setEscalateState('loading')
      try {
        const res = await escalate(sessionId, 'Customer requested human advisor')
        setEscalateState({ ticketId: res.ticketId })
      } catch (err) {
        setEscalateState({ error: err.message })
      }
    } else {
      setEscalateState('confirm')
    }
  }

  const handleNewChat = () => {
    newSession()
    setEscalateState('idle')
  }

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          Connecting…
        </div>
      </div>
    )
  }

  if (page === 'admin') {
    return <AdminPortal onBack={() => setPage('chat')} />
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-0 sm:p-6">
      {/* Chat card — full screen on mobile, centered card on sm+ */}
      <div className="w-full sm:max-w-xl md:max-w-2xl h-screen sm:h-[680px] flex flex-col bg-white overflow-hidden sm:rounded-2xl sm:shadow-xl sm:border sm:border-slate-200/80">

        {/* Header */}
        <header className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
              <span className="text-white text-xs font-bold">M</span>
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-wide leading-none">MoneyHero</h1>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-none">Smart Support Agent</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage('admin')}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-white/10"
              title="Admin portal"
            >
              <ShieldCheck className="w-3 h-3" />
              <span>Admin</span>
            </button>

            <button
              onClick={handleNewChat}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-white/10"
              title="Start a new conversation"
            >
              <RotateCcw className="w-3 h-3" />
              <span>New chat</span>
            </button>
          </div>
        </header>

        {/* Escalation banners */}
        {escalateState === 'confirm' && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between flex-shrink-0">
            <p className="text-xs text-amber-800 font-medium">Connect with a human advisor?</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setEscalateState('idle')}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleEscalate}
                className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded-md transition-colors font-medium"
              >
                Confirm
              </button>
            </div>
          </div>
        )}

        {escalateState === 'loading' && (
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center gap-2 flex-shrink-0">
            <span className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
            <p className="text-xs text-blue-700">Connecting you with an advisor…</p>
          </div>
        )}

        {escalateState?.ticketId && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 flex items-center justify-between flex-shrink-0">
            <p className="text-xs text-emerald-800">
              Ticket <span className="font-mono font-semibold">{escalateState.ticketId}</span> created. An advisor will contact you shortly.
            </p>
            <button onClick={() => setEscalateState('idle')} className="text-emerald-600 hover:text-emerald-800 ml-3 flex-shrink-0">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {escalateState?.error && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between flex-shrink-0">
            <p className="text-xs text-red-700">{escalateState.error}</p>
            <button onClick={() => setEscalateState('idle')} className="text-red-500 hover:text-red-700 ml-3 flex-shrink-0">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Chat area */}
        <ChatWindow messages={messages} streaming={streaming} onSuggest={sendMessage} />

        {/* Input */}
        <InputBar
          onSend={sendMessage}
          onEscalate={handleEscalate}
          onCancel={cancel}
          disabled={streaming || !historyLoaded}
          streaming={streaming}
        />
      </div>
    </div>
  )
}
