function formatTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

/**
 * Parse a single line of text, converting **bold** markers to <strong> elements.
 */
function parseInline(text, keyPrefix) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-b${i}`}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

/**
 * Render assistant message content with:
 * - **bold** markers converted to <strong>
 * - Disclaimer section (after \n---\n) shown in small muted text
 */
function AssistantContent({ content, streaming }) {
  const SEPARATOR = '\n---\n'
  const sepIndex = content.indexOf(SEPARATOR)

  const main = sepIndex !== -1 ? content.slice(0, sepIndex) : content
  const disclaimer = sepIndex !== -1 ? content.slice(sepIndex + SEPARATOR.length) : null

  // Strip surrounding * from disclaimer (e.g. *AI-generated...*)
  const cleanDisclaimer = disclaimer?.replace(/^\*+|\*+$/g, '').trim()

  const mainLines = main.split('\n')

  return (
    <>
      <p className="text-sm leading-relaxed text-slate-800">
        {mainLines.map((line, lineIdx) => (
          <span key={lineIdx}>
            {parseInline(line, lineIdx)}
            {lineIdx < mainLines.length - 1 && '\n'}
          </span>
        ))}
        {streaming && (
          <span className="inline-block w-0.5 h-[1em] bg-blue-500 ml-0.5 align-middle animate-pulse" />
        )}
      </p>
      {cleanDisclaimer && !streaming && (
        <p className="text-[10px] text-slate-400 mt-2 pt-1.5 border-t border-slate-200 leading-relaxed">
          {cleanDisclaimer}
        </p>
      )}
    </>
  )
}

export function MessageBubble({ message }) {
  const { role, content, timestamp, streaming } = message
  const isUser = role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[80%]">
          <div className="bg-slate-800 text-white rounded-2xl rounded-br-sm px-3.5 py-2.5">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 text-right pr-1">{formatTime(timestamp)}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-end gap-2 mb-3">
      <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0 mb-4">
        <span className="text-white text-[9px] font-bold">M</span>
      </div>
      <div className="max-w-[80%]">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-bl-sm px-3.5 py-2.5 whitespace-pre-wrap">
          <AssistantContent content={content} streaming={streaming} />
        </div>
        {!streaming && (
          <p className="text-[10px] text-slate-400 mt-1 ml-1">{formatTime(timestamp)}</p>
        )}
      </div>
    </div>
  )
}
