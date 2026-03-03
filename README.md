# MoneyHero Smart Support Agent

RAG-powered customer support chatbot for credit cards and personal loans. Built with LangChain.js, Claude Sonnet 4.6 (primary LLM), Ollama (fallback + embeddings), React, and Express.

**Chat interface → http://localhost:3000**
**Backend API → http://localhost:3001**

---

## Quick Start

**Prerequisites:** Docker Desktop running on your machine. Nothing else required.

```bash
git clone https://github.com/AalindG/moneyhero-smart-support-agent.git
cd moneyhero-smart-support-agent
cp .env.example .env
# Optional: open .env and set ANTHROPIC_API_KEY + USE_CLAUDE=true for Claude as primary LLM.
# Without it the system runs entirely on Ollama (llama3.2:3b).
chmod +x scripts/setup.sh
./scripts/setup.sh
```

That's it. The script:
1. Starts Ollama + backend + frontend via Docker Compose
2. Pulls the AI models (`llama3.2:3b` for LLM, `nomic-embed-text` for embeddings) — ~2 GB, one-time only
3. Runs document ingestion to build the vector store
4. Confirms all services are healthy

**First run takes 5–10 minutes** (model download). Subsequent starts take ~30 seconds:

```bash
docker compose up -d
```

Open **http://localhost:3000** to use the chat interface.

---

## Stack

| Layer        | Technology                                        |
| ------------ | ------------------------------------------------- |
| Chat UI      | React 18 + Tailwind CSS + Vite (served via nginx) |
| API server   | Node.js (ESM) + Express                           |
| Primary LLM  | Claude Sonnet 4.6 (Anthropic API)                 |
| Fallback LLM | Ollama `llama3.2:3b` (local Docker)               |
| Embeddings   | `nomic-embed-text` via Ollama (always local)      |
| Vector store | HNSWLib (local, file-based)                       |
| Database     | SQLite via `better-sqlite3`                       |
| Streaming    | Server-Sent Events (SSE)                          |
| Infra        | Docker Compose (3 containers)                     |

---

## How It Works

Every chat message goes through a deterministic pipeline before touching an LLM:

```
User message
    │
    ├─ Escalation keywords?  →  connect to human agent
    ├─ Financial keywords?   →  skip classifier, go to RAG
    ├─ Off-topic keywords?   →  polite redirect
    ├─ Catalog listing?      →  pre-built product list (no LLM)
    │
    └─ LLM intent classifier
           │
           ├─ answer    →  RAG retrieval pipeline
           │                  └─ Claude Sonnet 4.6 (primary)
           │                       └─ Ollama llama3.2:3b (fallback)
           ├─ escalate  →  handoff message
           └─ off_topic →  redirect
```

The RAG pipeline has 5 layers before generating a response:
1. **Catalog shortcut** — listing queries read the source file directly (100% accurate)
2. **Loan shortcut** — loan catalog queries build from all `personal-loans/` docs directly
3. **Comparison shortcut** — "which cards offer X?" scores card bullets by keyword match
4. **Product routing** — specific product mentioned → read that product's doc from disk
5. **Vector fallback** — semantic search with adaptive score threshold

All responses stream word-by-word via SSE.

---

## API Endpoints

| Method | Endpoint                  | Description                        |
| ------ | ------------------------- | ---------------------------------- |
| `POST` | `/api/session`            | Create session → `{ sessionId }`   |
| `POST` | `/api/chat`               | Send message → SSE token stream    |
| `POST` | `/api/escalate`           | Log escalation → `{ ticketId }`    |
| `GET`  | `/api/history/:sessionId` | Conversation history               |
| `GET`  | `/health`                 | Health check                       |

### Admin API (requires Bearer token)

| Method | Endpoint                                    | Description                          |
| ------ | ------------------------------------------- | ------------------------------------ |
| `POST` | `/api/admin/login`                          | Authenticate → `{ token }`           |
| `GET`  | `/api/admin/sessions`                       | All sessions with message counts     |
| `GET`  | `/api/admin/sessions/:sessionId/messages`   | Full message thread for a session    |
| `GET`  | `/api/admin/top-questions?limit=10`         | Top N most-asked questions           |

The Admin Portal is accessible from the chat UI via the **Admin** button in the header. Credentials are set via `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env` (defaults: `admin` / `changeme`).

### Chat SSE format

```
POST /api/chat
{ "sessionId": "abc", "message": "What cards offer cashback?" }

data: {"token":"2"}
data: {"token":" cards"}
data: {"token":" match"}
...
data: [DONE]
```

### Escalate

Returns a daily ticket ID: `TKT-YYYYMMDD-NNN`

---

## Guardrails

- **Input validation**: sessionId ≤ 100 chars, message ≤ 2000 chars
- **Rate limiting**: 100 req/15 min global, 20 req/min on `/api/chat`
- **Escalation cooldown**: 10 min per session (429 if exceeded)
- **Session gate**: 404 if session not found on all endpoints
- **LLM timeout**: 90 s with safe fallback response
- **Profanity filter**: checked before any LLM call
- **Output validation**: blocks prompt leakage patterns before sending to client
- **Retrieval gate**: adaptive score threshold prevents irrelevant docs reaching the LLM
- **Category filter**: credit card docs excluded from loan answers and vice versa
- **History cap**: token-based (≈2000 tokens) to prevent context overflow
- **Vectorstore missing**: safe fallback, no crash

---

## Environment Variables

Core variables — see `.env.example` for the full list.

| Variable                    | Default                  | Notes                                              |
| --------------------------- | ------------------------ | -------------------------------------------------- |
| `PORT`                      | `3001`                   |                                                    |
| `USE_CLAUDE`                | `false`                  | `true` → Claude primary + Ollama fallback          |
| `ANTHROPIC_API_KEY`         | —                        | Required when `USE_CLAUDE=true`                    |
| `CLAUDE_MODEL`              | `claude-sonnet-4-6`      |                                                    |
| `OLLAMA_BASE_URL`           | `http://localhost:11434` | `http://ollama:11434` in Docker                    |
| `OLLAMA_MODEL`              | `llama3.2:3b`            | LLM fallback (or primary if `USE_CLAUDE=false`)    |
| `OLLAMA_EMBED_MODEL`        | `nomic-embed-text`       | Embeddings — always Ollama                         |
| `DB_PATH`                   | `./data/moneyhero.db`    |                                                    |
| `RETRIEVAL_SCORE_THRESHOLD` | `0.75`                   | Cosine similarity cutoff for vector search         |
| `ADMIN_USERNAME`            | `admin`                  | Admin portal login                                 |
| `ADMIN_PASSWORD`            | `changeme`               | Change in production                               |

Copy `.env.example` to `.env` for local development.

---

## Local Development (without Docker)

Requires [Ollama](https://ollama.com) installed and running locally.

```bash
# Terminal 1 — Ollama
ollama pull llama3.2:3b
ollama pull nomic-embed-text
ollama serve

# Terminal 2 — Backend
cp .env.example .env
npm install
npm run ingest          # builds vectorstore/ from docs/ (~30s)
npm start               # http://localhost:3001

# Terminal 3 — Frontend
cd frontend
npm install
npm run dev             # http://localhost:3000
```

---

## Project Structure

```
src/
├── agent.js          # RAG pipeline: retrieval, routing, LLM prompt
├── ingest.js         # Doc chunking → HNSWLib vector store
├── index.js          # Express app, rate limiting, startup
├── config/           # Constants, embedding validation
├── controllers/      # Chat, escalation, history, session handlers
├── middleware/        # Input validation, SSE, output validation
├── models/           # SQLite queries (messages, escalations, sessions)
├── routes/           # Express routers
├── services/         # Ollama streaming service
└── utils/            # Compliance, response validator, logger
docs/
├── credit-cards/     # Per-card markdown docs + overview.md
├── personal-loans/   # Per-loan markdown docs
└── faqs/             # General FAQ docs
vectorstore/          # Generated by npm run ingest — do not commit
data/                 # SQLite DB — do not commit
frontend/             # React + Vite + Tailwind chat UI
```

---

## Commands

```bash
npm start             # production server
npm run dev           # nodemon watch mode
npm run ingest        # rebuild vector store from docs/
npm test              # run all tests
npm run lint          # ESLint
npm run format        # Prettier
```

---

See [REFLECTION.md](REFLECTION.md) for notes on how this was built with AI assistance.

---

## Documentation

Detailed reference docs are in [`documentation/`](documentation/):

| File | Contents |
|---|---|
| [ARCHITECTURE.md](documentation/ARCHITECTURE.md) | Folder structure, request flow, DB schema, guardrails |
| [API_CONTRACT.md](documentation/API_CONTRACT.md) | Full endpoint spec, SSE format, error codes |
| [DOCKER_SETUP.md](documentation/DOCKER_SETUP.md) | Docker services, env vars, troubleshooting |
| [TEST_DOCUMENTATION.md](documentation/TEST_DOCUMENTATION.md) | Test suite overview, running tests, CI/CD |
