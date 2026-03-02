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
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120
    if (nearBottom || streaming) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streaming])

  const lastMsg = messages.at(-1)
  const showTypingIndicator = lastMsg?.streaming && !lastMsg?.content

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-6 gap-5">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center mx-auto mb-3 shadow-md">
            <span className="text-white text-xl font-bold">M</span>
          </div>
          <h2 className="text-base font-semibold text-slate-800">How can I help you?</h2>
          <p className="text-xs text-slate-500 mt-1">Ask about credit cards, loans, or eligibility.</p>
        </div>

        <div className="w-full max-w-sm grid grid-cols-1 gap-1.5">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => onSuggest(s)}
              className="text-left text-xs text-slate-600 bg-slate-50 border border-slate-200 hover:border-slate-400 hover:bg-white rounded-lg px-3.5 py-2.5 transition-all font-medium"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin">
      <div className="max-w-full">
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {showTypingIndicator && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
