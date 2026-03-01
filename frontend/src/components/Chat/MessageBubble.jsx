function formatTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function MessageBubble({ message }) {
  const { role, content, timestamp, streaming } = message
  const isUser = role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[78%]">
          <div className="bg-slate-800 text-white rounded-2xl rounded-br-sm px-4 py-3 shadow-sm">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
          </div>
          <p className="text-xs text-slate-400 mt-1 text-right pr-1">{formatTime(timestamp)}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-end gap-2 mb-4">
      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0 mb-5">
        <span className="text-white text-xs font-semibold">M</span>
      </div>
      <div className="max-w-[78%]">
        <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
            {content}
            {streaming && (
              <span className="inline-block w-0.5 h-[1.1em] bg-blue-500 ml-0.5 align-middle animate-pulse" />
            )}
          </p>
        </div>
        {!streaming && (
          <p className="text-xs text-slate-400 mt-1 ml-1">{formatTime(timestamp)}</p>
        )}
      </div>
    </div>
  )
}
