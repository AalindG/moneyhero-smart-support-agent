# MoneyHero Backend

RAG-powered customer support API. Answers questions about credit cards and personal loans using LangChain.js, Ollama, and intent-based routing with SSE streaming.

## Stack

| Layer        | Technology                            |
| ------------ | ------------------------------------- |
| Runtime      | Node.js (ESM) + Express               |
| AI / RAG     | LangChain.js + Ollama (`llama3.2:1b`) |
| Embeddings   | `nomic-embed-text` via Ollama         |
| Vector store | HNSWLib (local)                       |
| Database     | SQLite via `better-sqlite3`           |
| Streaming    | Server-Sent Events                    |

## Setup

### Docker (recommended)

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

Starts Ollama and backend, pulls models (~4 GB first run), runs ingestion.

### Local

```bash
cp .env.example .env
npm install
npm run ingest     # builds vectorstore/ from docs/
npm start          # http://localhost:3001
```

Requires Ollama running locally (`ollama serve`).

## Environment Variables

| Variable             | Default                  | Notes                           |
| -------------------- | ------------------------ | ------------------------------- |
| `PORT`               | `3001`                   |                                 |
| `OLLAMA_BASE_URL`    | `http://localhost:11434` | `http://ollama:11434` in Docker |
| `OLLAMA_MODEL`       | `llama3.2`               | Use `llama3.2:1b` in Docker     |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text`       |                                 |
| `DB_PATH`            | `./data/moneyhero.db`    |                                 |

## API

| Method | Endpoint                  | Description                        |
| ------ | ------------------------- | ---------------------------------- |
| `POST` | `/api/session`            | Create session → `{ sessionId }`   |
| `POST` | `/api/chat`               | Send message → SSE token stream    |
| `POST` | `/api/escalate`           | Escalate to human → `{ ticketId }` |
| `GET`  | `/api/history/:sessionId` | Conversation history               |
| `GET`  | `/health`                 | Health check                       |

**Chat** streams SSE:

```
data: {"token":"Hello"}
data: [DONE]
```

**Escalate** returns a daily ticket ID: `TKT-YYYYMMDD-NNN`

## Guardrails

- Input validation: `sessionId` ≤ 100 chars, `message`/`reason` ≤ 2000 chars
- Session existence check on all endpoints (404 if missing)
- Rate limits: 100 req/15 min global, 20 req/min on `/api/chat`
- Escalation cooldown: 10 min per session (429 if exceeded)
- Message truncated at 1500 chars before LLM
- LLM timeout: 30 s with safe fallback
- Conversation history capped at 10 pairs
- Vectorstore missing → safe fallback, no crash
- Profanity check before any LLM call

## Commands

```bash
npm start          # production
npm run dev        # nodemon watch mode
npm run ingest     # rebuild vector store
npm run lint       # ESLint
npm run format     # Prettier
```

## Project Structure

```
src/
├── agent.js          # RAG pipeline, intent routing (answer/escalate/off_topic)
├── ingest.js         # Doc chunking → HNSWLib vector store
├── index.js          # Express app, rate limiting, middleware
├── config/           # Constants, DB init
├── controllers/      # Request handlers
├── models/           # SQLite queries
├── routes/           # Express routers
├── middleware/       # Validation, SSE setup, error handling
├── services/         # Ollama streaming
└── utils/            # Structured logger
docs/                 # Markdown source docs for RAG
vectorstore/          # Generated — do not commit
data/                 # SQLite DB — do not commit
```

See [REFLECTION.md](REFLECTION.md) for a notes on how this was built.
