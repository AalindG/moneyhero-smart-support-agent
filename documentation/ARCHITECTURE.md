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
│   ├── admin.controller.js       # POST /api/admin/login, GET /api/admin/*
│   ├── chat.controller.js        # POST /api/chat — intent → RAG → SSE stream
│   ├── escalation.controller.js  # POST /api/escalate — log + ticket
│   ├── feedback.controller.js    # POST/GET /api/feedback, GET /api/analytics/:sessionId
│   ├── history.controller.js     # GET /api/history/:sessionId
│   └── session.controller.js     # POST /api/session
│
├── middleware/
│   ├── adminAuth.js              # In-memory token store, 8-hour TTL, timing-safe auth
│   ├── errorHandler.js           # Global error handler + asyncHandler wrapper
│   ├── outputValidation.js       # Blocks prompt-leakage patterns before SSE flush
│   ├── sse.js                    # SSE response helpers (writeToken, writeDone)
│   └── validation.js             # Input validation (sessionId ≤ 100, message ≤ 2000)
│
├── models/
│   ├── analytics.model.js        # qa_analytics + quality_metrics CRUD
│   ├── escalation.model.js       # escalations CRUD
│   ├── feedback.model.js         # feedback CRUD
│   ├── message.model.js          # messages CRUD + findTopQuestions()
│   └── session.model.js          # sessions CRUD + findAll()
│
├── routes/
│   ├── index.js                  # Mounts all sub-routers under /api
│   ├── admin.routes.js           # POST /api/admin/login, GET /api/admin/sessions, top-questions
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
              └── LLM streaming
                        │
                        ├── Primary: Claude Sonnet 4.6 (Anthropic API)
                        │           USE_CLAUDE=true + ANTHROPIC_API_KEY set
                        │
                        └── Fallback: Ollama llama3.2:1b (Docker)
                                    Used when Claude unavailable or USE_CLAUDE=false
```

### Separation of Concerns

| Layer | Files | Responsibility |
|---|---|---|
| Routes | `routes/*.routes.js` | HTTP method + path → controller mapping |
| Controllers | `controllers/*.controller.js` | Request orchestration, response formatting |
| Models | `models/*.model.js` | SQLite queries only — no business logic |
| Services | `services/ollama.service.js` | External API (Ollama) streaming |
| Middleware | `middleware/` | Cross-cutting: validation, SSE, error handling, output filtering, admin auth |
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

| Method | Endpoint | Controller | Auth | Description |
|---|---|---|---|---|
| POST | /api/session | session.controller.js | — | Create session → `{ sessionId }` |
| POST | /api/chat | chat.controller.js | — | Send message → SSE token stream |
| POST | /api/escalate | escalation.controller.js | — | Log escalation → `{ success, ticketId }` |
| GET | /api/history/:sessionId | history.controller.js | — | Conversation history |
| POST | /api/feedback | feedback.controller.js | — | Submit rating/comment |
| GET | /api/feedback/:sessionId | feedback.controller.js | — | Get feedback for session |
| GET | /api/analytics/:sessionId | feedback.controller.js | — | Q&A interactions + feedback |
| GET | /health | index.js | — | Health check |
| POST | /api/admin/login | admin.controller.js | — | Authenticate → `{ token }` |
| GET | /api/admin/sessions | admin.controller.js | Bearer token | All sessions with message counts |
| GET | /api/admin/sessions/:sessionId/messages | admin.controller.js | Bearer token | Full message thread |
| GET | /api/admin/top-questions | admin.controller.js | Bearer token | Top N most-asked questions |

## Guardrails

| Guard | Where | Behaviour |
|---|---|---|
| Rate limit (global) | `index.js` | 100 req / 15 min per IP (configurable via `RATE_LIMIT_GLOBAL_*`) |
| Rate limit (chat) | `index.js` | 20 req / min per IP (configurable via `RATE_LIMIT_CHAT_*`) |
| Input validation | `middleware/validation.js` | sessionId ≤ 100 chars, message ≤ 2000 chars |
| Session gate | controllers | 404 if sessionId not in DB |
| Escalation cooldown | `escalation.controller.js` | 429 if same session escalates within 10 min (`ESCALATION_COOLDOWN_MINUTES`) |
| Profanity filter | `utils/compliance.js` | 400 before any LLM call |
| LLM timeout | `agent.js` | 90 s (`LLM_TIMEOUT_MS`), safe fallback response on timeout |
| Output validation | `middleware/outputValidation.js` | Strips prompt-leakage patterns before SSE |
| Admin auth | `middleware/adminAuth.js` | Bearer token, in-memory store, 8-hour TTL, timing-safe comparison |
| Category filter | `agent.js` | Credit card docs excluded from loan answers and vice versa |
| History cap | `agent.js` | Token-based cap (200 tokens) to keep prompt under 3000 chars |
| Vectorstore missing | `agent.js` | Safe fallback, no crash |

## Environment Variables

All values have sensible defaults; only `ANTHROPIC_API_KEY` is required for Claude mode.

```
# Server
PORT=3001
DB_PATH=./data/moneyhero.db
NODE_ENV=development
CORS_ORIGIN=*

# LLM selection
USE_CLAUDE=true                           # true → Claude primary + Ollama fallback
ANTHROPIC_API_KEY=sk-ant-...             # required when USE_CLAUDE=true
CLAUDE_MODEL=claude-sonnet-4-6           # Claude model name
CLAUDE_MAX_TOKENS=500                    # max tokens per Claude response

# Ollama (embeddings always; generation when USE_CLAUDE=false)
OLLAMA_BASE_URL=http://localhost:11434   # http://ollama:11434 in Docker
OLLAMA_MODEL=llama3.2:3b                # generation fallback model
OLLAMA_CLASSIFIER_MODEL=llama3.2:1b     # intent classifier (small model)
OLLAMA_EMBED_MODEL=nomic-embed-text     # embeddings (always Ollama)
OLLAMA_TEMPERATURE=0                    # generation temperature
OLLAMA_MAX_TOKENS=900                   # max tokens per Ollama response

# RAG pipeline
RETRIEVAL_K=30                          # candidate docs from vector search
RETRIEVAL_SCORE_THRESHOLD=0.75          # cosine similarity cutoff (0-1)
MAX_CONTEXT_TOKENS=6000                 # max context chars sent to LLM
LLM_TIMEOUT_MS=90000                    # LLM call timeout (ms)
SESSION_TTL_MS=3600000                  # in-memory session cache TTL (ms)

# Ingestion
CHUNK_SIZE=1500                         # chars per document chunk
CHUNK_OVERLAP=250                       # overlap between chunks

# Rate limiting
RATE_LIMIT_GLOBAL_WINDOW_MS=900000      # 15 min
RATE_LIMIT_GLOBAL_MAX=100              # requests per window per IP
RATE_LIMIT_CHAT_WINDOW_MS=60000        # 1 min
RATE_LIMIT_CHAT_MAX=20                 # requests per window per IP

# Escalation & SSE
ESCALATION_COOLDOWN_MINUTES=10
SSE_KEEPALIVE_INTERVAL_MS=2000

# Admin portal
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme                 # change in production!
```

## Key Design Decisions

**agent.js as a black box.** Controllers call `agent.chat(sessionId, message, history)` and receive a stream. No controller knows about retrieval, thresholds, or prompts. This lets the RAG pipeline evolve independently.

**Deterministic shortcuts before LLM.** Catalog, loan, comparison, and product-routing queries are handled by keyword matching and direct file reads. The LLM is the last resort, not the first call.

**Claude Sonnet 4.6 as primary LLM (with Ollama fallback).** When `USE_CLAUDE=true` and `ANTHROPIC_API_KEY` is set, all RAG responses are generated by Claude Sonnet 4.6 via the Anthropic API. Claude is used because the local llama3.2:1b model hallucinated product details even when grounded context was provided. If Claude fails (API error, timeout, quota), the controller transparently retries with Ollama — the user sees no interruption. When `USE_CLAUDE=false` or the key is absent, Ollama is both primary and fallback (suitable for local development). Embeddings always run locally via Ollama (`nomic-embed-text`).

**ES modules throughout.** All files use `import/export`. No CommonJS `require()`.

**Prepared statements only.** All SQLite queries use `better-sqlite3` prepared statements — no string interpolation, no SQL injection surface.

---

*Last updated: March 2026 — Architecture v2.3 (admin portal, env var extraction, top-questions)*
