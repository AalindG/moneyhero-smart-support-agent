# API Contract — MoneyHero Backend

**Base URL:** `http://localhost:3001`

All endpoints return JSON unless noted (SSE streams use `text/event-stream`).

---

## Endpoints

### POST /api/session

Creates a new chat session.

**Request body:** None required.

**Response `200`:**
```json
{ "sessionId": "550e8400-e29b-41d4-a716-446655440000" }
```

**Example:**
```bash
curl -X POST http://localhost:3001/api/session
```

---

### POST /api/chat

Sends a user message. Returns the agent's response as a Server-Sent Events stream.

**Request body:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "What are the benefits of the HSBC Revolution card?"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| sessionId | string | yes | ≤ 100 characters |
| message | string | yes | ≤ 2000 characters |

**Response `200` — `Content-Type: text/event-stream`:**
```
data: {"token":"The"}

data: {"token":" HSBC"}

data: {"token":" Revolution"}

...

data: [DONE]
```

Each token event: `data: {"token": "<string>"}\n\n`
Terminator: `data: [DONE]\n\n`

**Example:**
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"abc123","message":"What credit cards offer cashback?"}'
```

---

### POST /api/escalate

Escalates the conversation to a human agent and logs a ticket.

**Request body:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "reason": "User requested detailed comparison of 5 credit cards"
}
```

| Field | Type | Required |
|---|---|---|
| sessionId | string | yes |
| reason | string | yes |

**Response `200`:**
```json
{
  "success": true,
  "ticketId": "TKT-20260302-001",
  "message": "Your request has been escalated to a human agent. Ticket ID: TKT-20260302-001"
}
```

Ticket ID format: `TKT-YYYYMMDD-NNN` (sequential per day).

**Note:** Same session cannot escalate again within 10 minutes — returns `429`.

**Example:**
```bash
curl -X POST http://localhost:3001/api/escalate \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"abc123","reason":"Complex loan restructuring question"}'
```

---

### GET /api/history/:sessionId

Returns the full conversation history for a session.

**Response `200`:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "messages": [
    {
      "role": "user",
      "content": "What is the interest rate for DBS personal loans?",
      "timestamp": "2026-03-02T10:30:00.000Z"
    },
    {
      "role": "assistant",
      "content": "DBS personal loans offer rates from 3.88% p.a. ...",
      "timestamp": "2026-03-02T10:30:02.500Z"
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| role | string | `"user"` or `"assistant"` |
| content | string | Message text |
| timestamp | string | ISO 8601 UTC |

**Example:**
```bash
curl http://localhost:3001/api/history/abc123
```

---

### POST /api/feedback

Submits customer feedback on a response.

**Request body:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "messageId": "msg-uuid",
  "feedbackType": "thumbs_up",
  "rating": null,
  "comment": null
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| sessionId | string | yes | |
| messageId | string | no | |
| feedbackType | string | yes | `thumbs_up` / `thumbs_down` / `rating` / `comment` |
| rating | integer | no | 1–5, required when feedbackType is `rating` |
| comment | string | no | |

**Response `200`:**
```json
{ "success": true, "feedbackId": "feedback-uuid" }
```

---

### GET /api/feedback/:sessionId

Returns all feedback submitted for a session.

**Response `200`:**
```json
{
  "sessionId": "abc123",
  "feedback": [
    {
      "id": "uuid",
      "feedbackType": "thumbs_up",
      "rating": null,
      "comment": null,
      "createdAt": "2026-03-02T10:35:00.000Z"
    }
  ]
}
```

---

### GET /api/analytics/:sessionId

Returns Q&A interactions and associated feedback for a session.

**Response `200`:**
```json
{
  "sessionId": "abc123",
  "interactions": [
    {
      "id": "uuid",
      "question": "What cards offer cashback?",
      "answer": "2 cards match...",
      "intent": "answer",
      "sources": ["credit-cards/citi-cashback-plus.md"],
      "retrievalCount": 3,
      "responseTimeMs": 1240,
      "createdAt": "2026-03-02T10:30:00.000Z"
    }
  ],
  "feedback": []
}
```

---

### GET /health

Health check.

**Response `200`:**
```json
{ "status": "ok" }
```

---

## Error Responses

| Status | Condition | Body |
|---|---|---|
| 400 | Missing/invalid field | `{ "error": "sessionId is required" }` |
| 404 | Session not found | `{ "error": "Session not found" }` |
| 429 | Rate limit exceeded or escalation cooldown | `{ "error": "Too many requests" }` |
| 500 | Server error | `{ "error": "Failed to process request" }` |

All error bodies: `{ "error": "<message>" }`

---

## Rate Limiting

| Scope | Limit | Window |
|---|---|---|
| Global (all endpoints) | 100 requests | 15 minutes per IP |
| `/api/chat` | 20 requests | 1 minute per IP |
| `/api/escalate` (per session) | 1 escalation | 10-minute cooldown |

Exceeded limits return `429 Too Many Requests`.

---

## Database Schema

Five tables initialised on startup by `config/database.js`:

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS escalations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  ticket_id TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS qa_analytics (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  intent TEXT NOT NULL,
  sources TEXT,
  retrieval_count INTEGER,
  response_time_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  message_id TEXT,
  rating INTEGER CHECK(rating BETWEEN 1 AND 5),
  feedback_type TEXT CHECK(feedback_type IN ('thumbs_up','thumbs_down','rating','comment')),
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

---

## CORS

All origins allowed in development. Restrict to specific origins in production.

---

*Last updated: March 2026*
