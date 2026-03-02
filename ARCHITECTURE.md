# MoneyHero Backend — Architecture Documentation

## Folder Structure

```
src/
├── agent.js                      # RAG pipeline: retrieval, routing, LLM prompt
├── ingest.js                     # Doc chunking → HNSWLib vector store
├── index.js                      # Express app entry point, rate limiting, startup
│
├── config/
│   ├── constants.js              # Shared constants (validation limits, rate limits, thresholds)
│   ├── database.js               # SQLite connection, schema init, table creation
│   └── embeddingValidation.js    # Embedding dimension sanity checks
│
├── controllers/
│   ├── chat.controller.js        # POST /api/chat — intent → RAG → SSE stream
│   ├── escalation.controller.js  # POST /api/escalate — log + ticket
│   ├── feedback.controller.js    # POST/GET /api/feedback, GET /api/analytics/:sessionId
│   ├── history.controller.js     # GET /api/history/:sessionId
│   └── session.controller.js     # POST /api/session
│
├── middleware/
│   ├── errorHandler.js           # Global error handler + asyncHandler wrapper
│   ├── outputValidation.js       # Blocks prompt-leakage patterns before SSE flush
│   ├── sse.js                    # SSE response helpers (writeToken, writeDone)
│   └── validation.js             # Input validation (sessionId ≤ 100, message ≤ 2000)
│
├── models/
│   ├── analytics.model.js        # qa_analytics + quality_metrics CRUD
│   ├── escalation.model.js       # escalations CRUD
│   ├── feedback.model.js         # feedback CRUD
│   ├── message.model.js          # messages CRUD
│   └── session.model.js          # sessions CRUD
│
├── routes/
│   ├── index.js                  # Mounts all sub-routers under /api
│   ├── analytics.routes.js       # GET /api/analytics/:sessionId
│   ├── chat.routes.js            # POST /api/chat
│   ├── escalation.routes.js      # POST /api/escalate
│   ├── feedback.routes.js        # POST/GET /api/feedback
│   ├── history.routes.js         # GET /api/history/:sessionId
│   └── session.routes.js         # POST /api/session
│
├── services/
│   └── ollama.service.js         # Ollama streaming wrapper (num_predict, temperature)
│
└── utils/
    ├── compliance.js             # Profanity filter (checked before every LLM call)
    ├── logger.js                 # Structured console logger
    └── responseValidator.js      # Post-generation output checks
```

## Architecture Patterns

### MVC + Service Layer

```
Request
  │
  ├── Rate limiter (index.js)
  ├── Input validation middleware
  │
  ▼
Routes → Controllers → Models (SQLite)
              │
              ├── agent.chat()      ← RAG pipeline (agent.js)
              └── ollama.service    ← LLM streaming
                        │
                        ▼
                  Ollama (Docker)
                  llama3.2:1b / nomic-embed-text
```

### Separation of Concerns

| Layer | Files | Responsibility |
|---|---|---|
| Routes | `routes/*.routes.js` | HTTP method + path → controller mapping |
| Controllers | `controllers/*.controller.js` | Request orchestration, response formatting |
| Models | `models/*.model.js` | SQLite queries only — no business logic |
| Services | `services/ollama.service.js` | External API (Ollama) streaming |
| Middleware | `middleware/` | Cross-cutting: validation, SSE, error handling, output filtering |
| RAG | `agent.js` | All retrieval and generation logic — black box to the API layer |

## Request Flow

### Chat Message (Full Path)

```
POST /api/chat
  │
  ├─ Rate limiter (20 req/min per IP on /api/chat)
  ├─ Input validation (sessionId, message length)
  │
  ▼
chat.controller.js
  ├─ Session exists? → 404 if not
  ├─ Profanity check (compliance.js) → 400 if fails
  ├─ agent.chat(sessionId, message, history)
  │     │
  │     ├─ Escalation keyword? → fakeStream(handoff message)
  │     ├─ Off-topic keyword? → fakeStream(redirect)
  │     ├─ Financial keyword? → skip classifier → RAG
  │     ├─ LLM classifier (llama3.2:1b) → intent: answer | escalate | off_topic
  │     │
  │     └─ RAG pipeline (if answer)
  │           ├─ Catalog shortcut → reads source file directly
  │           ├─ Loan shortcut → all personal-loans/ docs
  │           ├─ Comparison shortcut → keyword-scored bullets
  │           ├─ Product routing → specific product doc from disk
  │           └─ Vector fallback → HNSWLib semantic search
  │
  ├─ Output validation (outputValidation.js) → blocks prompt leakage
  ├─ SSE stream tokens → data:{"token":"..."} ... data:[DONE]
  └─ Save user + assistant messages (message.model.js)
```

## Database Schema

Five tables, all initialised on startup in `config/database.js`:

### `sessions`
| Column | Type | Notes |
|---|---|---|
| id | TEXT | PRIMARY KEY (UUID) |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

### `messages`
| Column | Type | Notes |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| session_id | TEXT | FK → sessions.id |
| role | TEXT | `user` or `assistant` |
| content | TEXT | |
| timestamp | DATETIME | DEFAULT CURRENT_TIMESTAMP |

### `escalations`
| Column | Type | Notes |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| session_id | TEXT | FK → sessions.id |
| reason | TEXT | |
| ticket_id | TEXT | UNIQUE, format: `TKT-YYYYMMDD-NNN` |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

### `qa_analytics`
| Column | Type | Notes |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| session_id | TEXT | FK → sessions.id |
| question | TEXT | |
| answer | TEXT | |
| intent | TEXT | `answer` / `escalate` / `off_topic` |
| sources | TEXT | JSON array of doc paths |
| retrieval_count | INTEGER | |
| response_time_ms | INTEGER | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

### `feedback`
| Column | Type | Notes |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| session_id | TEXT | FK → sessions.id |
| message_id | TEXT | Optional |
| rating | INTEGER | 1–5 |
| feedback_type | TEXT | `thumbs_up` / `thumbs_down` / `rating` / `comment` |
| comment | TEXT | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

### `quality_metrics`
| Column | Type | Notes |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| interaction_id | TEXT | FK → qa_analytics.id |
| response_length | INTEGER | |
| source_count | INTEGER | |
| retrieval_score_avg | REAL | |
| contains_disclaimer | INTEGER | 0/1 |
| contains_product_names | INTEGER | 0/1 |
| intent_confidence | REAL | |
| validation_passed | INTEGER | 0/1 |

## API Endpoints

| Method | Endpoint | Controller | Description |
|---|---|---|---|
| POST | /api/session | session.controller.js | Create session → `{ sessionId }` |
| POST | /api/chat | chat.controller.js | Send message → SSE token stream |
| POST | /api/escalate | escalation.controller.js | Log escalation → `{ success, ticketId }` |
| GET | /api/history/:sessionId | history.controller.js | Conversation history |
| POST | /api/feedback | feedback.controller.js | Submit rating/comment |
| GET | /api/feedback/:sessionId | feedback.controller.js | Get feedback for session |
| GET | /api/analytics/:sessionId | feedback.controller.js | Q&A interactions + feedback |
| GET | /health | index.js | Health check |

## Guardrails

| Guard | Where | Behaviour |
|---|---|---|
| Rate limit (global) | `index.js` | 100 req / 15 min per IP |
| Rate limit (chat) | `index.js` | 20 req / min per IP |
| Input validation | `middleware/validation.js` | sessionId ≤ 100 chars, message ≤ 2000 chars |
| Session gate | controllers | 404 if sessionId not in DB |
| Escalation cooldown | `escalation.controller.js` | 429 if same session escalates within 10 min |
| Profanity filter | `utils/compliance.js` | 400 before any LLM call |
| LLM timeout | `agent.js` | 90 s, safe fallback response on timeout |
| Output validation | `middleware/outputValidation.js` | Strips prompt-leakage patterns before SSE |
| Category filter | `agent.js` | Credit card docs excluded from loan answers and vice versa |
| History cap | `agent.js` | Token-based cap (≈ 2000 tokens) |
| Vectorstore missing | `agent.js` | Safe fallback, no crash |

## Environment Variables

```
PORT=3001
DB_PATH=./data/moneyhero.db
OLLAMA_BASE_URL=http://localhost:11434     # http://ollama:11434 in Docker
OLLAMA_MODEL=llama3.2:1b                  # generation model
OLLAMA_CLASSIFIER_MODEL=llama3.2:1b       # intent classifier
OLLAMA_EMBED_MODEL=nomic-embed-text       # embeddings
NODE_ENV=development
```

## Key Design Decisions

**agent.js as a black box.** Controllers call `agent.chat(sessionId, message, history)` and receive a stream. No controller knows about retrieval, thresholds, or prompts. This lets the RAG pipeline evolve independently.

**Deterministic shortcuts before LLM.** Catalog, loan, comparison, and product-routing queries are handled by keyword matching and direct file reads. The LLM is the last resort, not the first call.

**All inference local.** Ollama runs in Docker alongside the backend. There are no external API keys or network calls at runtime.

**ES modules throughout.** All files use `import/export`. No CommonJS `require()`.

**Prepared statements only.** All SQLite queries use `better-sqlite3` prepared statements — no string interpolation, no SQL injection surface.

---

*Last updated: March 2026 — Architecture v2.1*
