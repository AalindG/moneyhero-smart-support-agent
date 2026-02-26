# MoneyHero Backend — Smart Support Agent

AI-powered customer support backend using LangChain.js RAG pipeline with Ollama LLM. Provides intelligent responses about financial products (credit cards and personal loans) with intent classification and conversation memory.

---

## Architecture Overview

### Express API Layer

RESTful API built with Express.js exposing 4 endpoints: session creation, chat with SSE streaming, escalation management, and conversation history retrieval. CORS is configured to accept requests from the frontend at `http://localhost:5173`. The chat endpoint uses Server-Sent Events (SSE) to stream responses in real-time, providing a responsive user experience. All requests are validated, and errors return appropriate HTTP status codes (200, 400, 404, 500) with structured JSON error messages.

### LangChain RAG Pipeline

Retrieval-Augmented Generation pipeline built with LangChain.js and Ollama (llama3.2). Documents from `/docs` are ingested, chunked (1000 chars with 200 overlap), and embedded using Ollama's nomic-embed-text model. The vector store (HNSWLib) enables semantic search for retrieving relevant context. Intent classification routes requests into three categories: **answer** (retrieves from knowledge base), **escalate** (hands off to human), and **off_topic** (polite redirection). BufferMemory maintains conversation context per session for multi-turn interactions.

### SQLite Persistence

Lightweight SQLite database (better-sqlite3) stores all session data with three tables: `sessions` (tracks active chats), `messages` (conversation history with role and timestamp), and `escalations` (logged handoffs with ticket IDs). Ticket IDs follow the format TKT-YYYYMMDD-NNN with daily counters. Database operations use prepared statements for security and performance. Foreign key constraints ensure referential integrity across tables.

---

## Prerequisites

- **Node.js 18+** — JavaScript runtime
- **Docker & Docker Compose** — For containerized deployment (recommended)
- **Ollama** — Required for local development without Docker
  - Install: [https://ollama.ai/download](https://ollama.ai/download)
  - Pull models: `ollama pull llama3.2:1b && ollama pull nomic-embed-text`

---

## Local Development (without Docker)

Best for development and debugging.

```bash
# Clone repository
git clone <repository-url>
cd moneyhero-backend

# Install dependencies
npm install

# Create environment configuration
cp .env.example .env

# Start Ollama (in separate terminal)
ollama serve
# Ollama will run on http://localhost:11434

# Ingest documentation into vector store
npm run ingest
# This creates ./vectorstore with embedded documents

# Start backend server
npm start
# Backend running on http://localhost:3001
```

**Test the API:**

```bash
# Create session
curl -X POST http://localhost:3001/api/session

# Chat (returns SSE stream)
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"YOUR_SESSION_ID","message":"What are the benefits of HSBC Revolution?"}'
```

---

## Docker Setup (Recommended)

Simplest way to run the entire stack with Ollama included.

```bash
# Clone repository
git clone <repository-url>
cd moneyhero-backend

# Create environment configuration
cp .env.example .env

# Run setup script (pulls models, builds containers)
chmod +x scripts/setup.sh
./scripts/setup.sh

# Services will be available at:
# Backend API: http://localhost:3001
# Ollama API: http://localhost:11434
```

**Docker Management:**

```bash
# View logs
docker compose logs -f backend
docker compose logs -f ollama

# Restart services
docker compose restart

# Stop services
docker compose down

# Rebuild after code changes
docker compose up -d --build
```

**Important**: First startup takes 2-3 minutes while Ollama downloads models (~4GB).

---

## API Endpoints

All endpoints follow the contract defined in [API_CONTRACT.md](API_CONTRACT.md).

### 1. Create Session

```http
POST /api/session
```

**Response:**

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 2. Chat with Agent (SSE Stream)

```http
POST /api/chat
Content-Type: application/json

{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Tell me about credit cards"
}
```

**Response:** Server-Sent Events stream

```
data: {"token":"I"}

data: {"token":"'d"}

data: {"token":" be"}

...

data: [DONE]

```

### 3. Escalate to Human

```http
POST /api/escalate
Content-Type: application/json

{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "reason": "Complex loan restructuring question"
}
```

**Response:**

```json
{
  "success": true,
  "ticketId": "TKT-20260226-001",
  "message": "Your request has been escalated to a human agent. Ticket ID: TKT-20260226-001"
}
```

### 4. Get Conversation History

```http
GET /api/history/:sessionId
```

**Response:**

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "messages": [
    {
      "role": "user",
      "content": "What is the interest rate?",
      "timestamp": "2026-02-26T10:30:00.000Z"
    },
    {
      "role": "assistant",
      "content": "Interest rates vary by product...",
      "timestamp": "2026-02-26T10:30:02.500Z"
    }
  ]
}
```

---

## Development Commands

```bash
# Start development server
npm start

# Ingest documentation (required before first run)
npm run ingest

# Run tests (if available)
npm test

# Lint code (if configured)
npm run lint
```

---

## Environment Variables

Create a `.env` file based on `.env.example`:

| Variable             | Description                          | Default                  |
| -------------------- | ------------------------------------ | ------------------------ |
| `PORT`               | Backend server port                  | `3001`                   |
| `OLLAMA_BASE_URL`    | Ollama API endpoint                  | `http://localhost:11434` |
| `OLLAMA_MODEL`       | LLM model for generation             | `llama3.2:1b`            |
| `OLLAMA_EMBED_MODEL` | Embedding model for vector store     | `nomic-embed-text`       |
| `DB_PATH`            | SQLite database file path (optional) | `./data/moneyhero.db`    |

**Note:** In Docker, `OLLAMA_BASE_URL` is automatically set to `http://ollama:11434` via docker-compose.yml.

---

## Testing the API

### Using curl

**Create a session and chat:**

```bash
# 1. Create session
SESSION_ID=$(curl -s -X POST http://localhost:3001/api/session | jq -r '.sessionId')
echo "Session ID: $SESSION_ID"

# 2. Send a message (SSE stream)
curl -N -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"message\":\"What are the benefits of OCBC 365 credit card?\"}"

# 3. Get conversation history
curl http://localhost:3001/api/history/$SESSION_ID | jq

# 4. Escalate
curl -X POST http://localhost:3001/api/escalate \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"reason\":\"Need detailed comparison\"}" | jq
```

### Using JavaScript (Frontend)

```javascript
// Create session
const sessionRes = await fetch('http://localhost:3001/api/session', {
  method: 'POST',
  credentials: 'include'
})
const { sessionId } = await sessionRes.json()

// Chat with SSE streaming
const eventSource = new EventSource('http://localhost:3001/api/chat')
const response = await fetch('http://localhost:3001/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ sessionId, message: 'Hello' })
})

const reader = response.body.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break

  const chunk = decoder.decode(value)
  const lines = chunk.split('\n\n')

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6)
      if (data === '[DONE]') {
        console.log('Stream complete')
        break
      }
      const { token } = JSON.parse(data)
      process.stdout.write(token) // Print token
    }
  }
}
```

### Using Node.js Test Script

A test script is included for convenient streaming tests:

```bash
# Test SSE streaming with a simple question
node test-streaming.js
```

The script creates a session, sends a message about cashback cards, and displays the streamed response in the terminal. It demonstrates proper SSE handling including:

- Reading Server-Sent Events with Node.js Fetch API
- Parsing `data:` messages and extracting tokens
- Handling the `[DONE]` completion marker
- Accumulating the full response

Output example:

```
✅ Created session: 06552728-d232-4af3-9387-6bae590bfdb4

📡 Streaming response:

I can help you compare cashback credit cards...
[response streams in real-time]

📊 Total characters received: 1049
```

See [STREAMING_NOTES.md](STREAMING_NOTES.md) for technical details on the streaming implementation.

---

## Troubleshooting

### Ollama not running

**Error:** `Ollama not running. Start it with: ollama serve`

**Solution:**

```bash
# Local development
ollama serve

# Docker
docker compose logs ollama
docker compose restart ollama
```

### Vector store not found

**Error:** `Vector store not found. Run: npm run ingest`

**Solution:**

```bash
# Local development
npm run ingest

# Docker (run inside container)
docker compose exec backend npm run ingest
```

### Port 3001 already in use

**Error:** `EADDRINUSE: address already in use :::3001`

**Solution:**

```bash
# Find process using port 3001
lsof -i :3001

# Kill the process
kill -9 <PID>

# Or change port in .env
PORT=3002
```

### Docker networking issues

**Error:** `connect ECONNREFUSED 172.18.0.2:11434`

**Solution:**

- Ensure Ollama container is running: `docker compose ps`
- Check OLLAMA_BASE_URL is `http://ollama:11434` in docker-compose.yml
- Restart services: `docker compose restart`

### Native module build failures

**Error:** `Error: Cannot find module 'hnswlib-node'`

**Solution:**

```bash
# Rebuild native modules
npm rebuild

# Or reinstall
rm -rf node_modules package-lock.json
npm install
```

---

## Project Structure

```
moneyhero-backend/
├── src/
│   ├── agent.js           # RAG agent with intent classification
│   ├── ingest.js          # Document ingestion pipeline
│   ├── db.js              # SQLite database operations
│   ├── index.js           # Express server setup
│   └── routes/
│       └── chat.js        # API route handlers
├── docs/                  # Markdown documentation (ingested)
│   ├── credit-cards/
│   ├── personal-loans/
│   └── faqs/
├── data/                  # SQLite database storage
├── vectorstore/           # HNSWLib vector store (generated)
├── scripts/
│   └── setup.sh           # Docker setup script
├── tests/                 # Integration tests
├── Dockerfile             # Container build configuration
├── docker-compose.yml     # Multi-container orchestration
├── package.json           # Node.js dependencies
├── .env.example           # Environment variable template
├── API_CONTRACT.md        # API specification
└── README.md              # This file
```

---

## Tech Stack

- **Runtime:** Node.js 18+ (ES Modules)
- **Web Framework:** Express.js
- **RAG Framework:** LangChain.js
- **LLM:** Ollama (llama3.2:1b)
- **Embeddings:** Ollama (nomic-embed-text)
- **Vector Store:** HNSWLib
- **Database:** SQLite (better-sqlite3)
- **Containerization:** Docker + Docker Compose

---

## Contributing

1. Follow the agent structure defined in [CLAUDE.md](CLAUDE.md)
2. RAG changes → rag-engineer agent
3. API/DB changes → principal-backend-dev agent
4. Testing/validation → senior-qa-engineer agent

---

## License

[Add your license here]

---

## Support

For issues or questions:

- Check [API_CONTRACT.md](API_CONTRACT.md) for endpoint specifications
- Review [Troubleshooting](#troubleshooting) section above
- Check Docker logs: `docker compose logs -f`
