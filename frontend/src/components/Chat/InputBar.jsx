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
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  return (
    <div className="border-t border-slate-200 bg-white px-3 pt-2.5 pb-3 flex-shrink-0">
      <div className="flex items-end gap-2">
        {/* Escalate button */}
        <button
          onClick={onEscalate}
          className="flex-shrink-0 flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 border border-slate-200 hover:border-slate-400 rounded-lg px-2 py-2 transition-colors bg-white"
          title="Connect with a human advisor"
        >
          <PhoneCall className="w-3 h-3" />
          <span className="hidden sm:inline">Advisor</span>
        </button>

        {/* Textarea */}
        <div className="flex-1 flex items-end bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-slate-400 focus-within:bg-white transition-all gap-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={streaming ? 'Generating…' : 'Ask about cards, loans, eligibility…'}
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none leading-relaxed min-h-[1.25rem] max-h-28 disabled:opacity-60 scrollbar-thin"
          />
        </div>

        {/* Send / Stop */}
        {streaming ? (
          <button
            onClick={onCancel}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-slate-200 hover:bg-slate-300 rounded-xl transition-colors"
            title="Stop generating"
          >
            <Square className="w-3.5 h-3.5 text-slate-600 fill-slate-600" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim() || disabled}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:bg-slate-200 disabled:cursor-not-allowed rounded-xl transition-colors"
            title="Send (Enter)"
          >
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        )}
      </div>

      <p className="text-[10px] text-slate-400 mt-2 text-center">
        Verify all details with the financial institution before applying.
      </p>
    </div>
  )
}
