import { useState, useRef, useCallback } from 'react'
import { Send, PhoneCall, Square } from 'lucide-react'

export function InputBar({ onSend, onEscalate, disabled, streaming, onCancel }) {
  const [text, setText] = useState('')
  const textareaRef = useRef(null)

  const handleSend = useCallback(() => {
    if (!text.trim() || disabled) return
    onSend(text)
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.focus()
    }
  }, [text, disabled, onSend])

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = e => {
    setText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
  }

  return (
    <div className="border-t border-slate-200 bg-white px-4 pt-3 pb-4 flex-shrink-0">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-end gap-2">
          {/* Escalate button */}
          <button
            onClick={onEscalate}
            className="flex-shrink-0 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-400 rounded-xl px-3 py-2.5 transition-colors bg-white"
            title="Connect with a human advisor"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-medium">Advisor</span>
          </button>

          {/* Textarea wrapper */}
          <div className="flex-1 flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-slate-400 focus-within:bg-white transition-all">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={
                streaming ? 'Generating response…' : 'Ask about credit cards, loans, eligibility…'
              }
              disabled={disabled}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none leading-relaxed min-h-[1.375rem] max-h-40 disabled:opacity-60 scrollbar-thin"
            />
          </div>

          {/* Send / Stop button */}
          {streaming ? (
            <button
              onClick={onCancel}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-slate-200 hover:bg-slate-300 rounded-xl transition-colors"
              title="Stop generating"
            >
              <Square className="w-4 h-4 text-slate-600 fill-slate-600" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!text.trim() || disabled}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:bg-slate-200 disabled:cursor-not-allowed rounded-xl transition-colors"
              title="Send message (Enter)"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          )}
        </div>

        <p className="text-xs text-slate-400 mt-2.5 text-center">
          Always verify details directly with the financial institution before applying.
        </p>
      </div>
    </div>
  )
}
