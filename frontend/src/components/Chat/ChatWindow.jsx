import { useEffect, useRef } from 'react'
import { MessageBubble } from './MessageBubble'
import { TypingIndicator } from './TypingIndicator'

const SUGGESTIONS = [
  'What credit cards do you offer?',
  'How do I apply for a personal loan?',
  'What are the eligibility requirements?',
  'Compare cashback and miles cards',
]

export function ChatWindow({ messages, streaming, onSuggest }) {
  const bottomRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 150
    if (nearBottom || streaming) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streaming])

  // Show typing dots only when waiting for first token of a streaming response
  const lastMsg = messages.at(-1)
  const showTypingIndicator = lastMsg?.streaming && !lastMsg?.content

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 gap-8">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-5 shadow-lg">
            <span className="text-white text-3xl font-bold">M</span>
          </div>
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight">
            How can I help you today?
          </h2>
          <p className="text-sm text-slate-500 mt-1.5">
            Ask about credit cards, personal loans, or eligibility.
          </p>
        </div>

        <div className="w-full max-w-md grid grid-cols-1 gap-2">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => onSuggest(s)}
              className="text-left text-sm text-slate-700 bg-white border border-slate-200 hover:border-slate-400 hover:bg-slate-50 rounded-xl px-4 py-3 transition-all shadow-sm font-medium"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin">
      <div className="max-w-2xl mx-auto">
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {showTypingIndicator && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
