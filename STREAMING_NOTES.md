# SSE Streaming Implementation - Technical Notes

## Problem

The chat API was timing out and clients were disconnecting before receiving streaming responses. Multiple approaches with LangChain's streaming callbacks failed to deliver real-time token streaming.

## Root Cause

1. **Premature connection close events**: Node.js was firing `req.on('close')` events prematurely during long processing, even though clients were still connected and waiting
2. **Client timeouts**: SSE connections were timing out during the 5-10 second RAG processing (intent classification, vector retrieval, prompt preparation)
3. **LangChain streaming limitations**: LangChain's chain.stream() and callback-based streaming didn't provide true token-by-token streaming from Ollama

## Solution

### 1. Direct Ollama API Streaming

Instead of using LangChain's streaming abstractions, we now:

- Have the RAG agent prepare the complete prompt with context and history
- Call Ollama's `/api/generate` endpoint directly with `stream: true`
- Stream tokens in real-time as they arrive from Ollama using the Fetch API's ReadableStream

### 2. Keepalive Comments

Send SSE comment lines (`: keepalive\n\n`) every 2 seconds during processing to prevent client timeouts:

```javascript
const keepaliveInterval = setInterval(() => {
  try {
    res.write(': keepalive\n\n')
    if (res.flush) res.flush()
  } catch (e) {
    // Client disconnected - ignore
  }
}, 2000)
```

### 3. Ignore Premature Close Events

The `req.on('close')` event was firing spuriously during processing. Solution:

- Continue trying to write to the response stream regardless of the close event
- Wrap writes in try-catch - if the client truly disconnected, writes will fail gracefully
- Always accumulate the full response for database persistence, even if writes fail

### 4. Error Handling

```javascript
try {
  res.write(`data: ${JSON.stringify({ token: data.response })}\n\n`)
  if (res.flush) res.flush()
} catch (writeError) {
  // Client likely disconnected, but continue to accumulate response
  console.log(
    '⚠️ Write error (client may have disconnected):',
    writeError.message
  )
}
```

## Architecture Flow

1. Client connects → Send `: connected\n\n`
2. Start keepalive interval (every 2s)
3. Send `: thinking\n\n`
4. Process chat request:
   - Classify intent (2-3s)
   - Load vector store (1-2s if first call)
   - Retrieve relevant documents (1-2s)
   - Build prompt with context + history
5. Call Ollama API with prepared prompt
6. Stream tokens from Ollama→Client in real-time:
   ```
   data: {"token":"Hello"}\n\n
   data: {"token":" world"}\n\n
   ...
   data: [DONE]\n\n
   ```
7. Clear keepalive interval
8. Save complete response to database and memory

## Key Code Changes

### agent.js

- Modified `handleAnswerIntent()` to return `{prompt, memory}` when `streaming=true`
- Agent no longer directly generates LLM response for streaming requests
- Prompt building includes system instructions, retrieved context, conversation history, and current question

### routes/chat.js

- Added keepalive interval before processing
- Call `chat(sessionId, message, true)` to get prepared prompt
- For "answer" intent: fetch from Ollama API directly with streaming enabled
- Process Ollama's NDJSON stream (one JSON object per line)
- Extract `data.response` from each line and send as SSE `data:` message
- Accumulate full response regardless of write errors
- Save to database and memory after streaming completes

## Testing

Successfully tested with:

- ✅ Real-time token streaming (tokens appear as Ollama generates them)
- ✅ No client timeouts during processing
- ✅ Complete responses saved to database
- ✅ Conversation history preserved across turns
- ✅ Multiple consecutive requests in same session

## Performance

- Time to first token: ~8-10 seconds (intent classification + RAG retrieval + Ollama initialization)
- Tokens per second: ~30-50 tokens/sec from Ollama
- Keepalive interval: 2 seconds (no client timeouts observed)
- Model: llama3.2:1b (fast generation, compact size)

## Future Improvements

1. **Faster intent classification**: Cache or optimize the classification LLM call
2. **Vector store warming**: Pre-load vector store on server startup
3. **Streaming from classification**: Stream progress updates during RAG processing
4. **Connection monitoring**: Better detection of actual client disconnections vs spurious events
5. **Backpressure handling**: Pause Ollama stream if client can't keep up (unlikely with SSE)
