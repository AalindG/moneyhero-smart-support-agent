# API Contract — MoneyHero Backend

## Overview

This document defines the REST API contract for the MoneyHero Smart Support Agent backend. All endpoints return JSON unless otherwise specified (e.g., SSE streams).

**Base URL:** `http://localhost:3001`

---

## Endpoints

### 1. Create Session

**`POST /api/session`**

Creates a new chat session and returns a unique session identifier.

#### Request

```http
POST /api/session HTTP/1.1
Content-Type: application/json
```

**Body:** None required (empty body or `{}`)

#### Response

**Status:** `200 OK`

**Body:**

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Example

```bash
curl -X POST http://localhost:3001/api/session
```

**Response:**

```json
{
  "sessionId": "abc123-def456-ghi789"
}
```

---

### 2. Chat with Agent

**`POST /api/chat`**

Sends a user message and streams the agent's response via Server-Sent Events (SSE).

#### Request

```http
POST /api/chat HTTP/1.1
Content-Type: application/json
```

**Body:**

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "What are the benefits of the HSBC Revolution card?"
}
```

**Fields:**

- `sessionId` (string, required): Valid session ID from `/api/session`
- `message` (string, required): User's question or message

#### Response

**Status:** `200 OK`

**Content-Type:** `text/event-stream`

**Stream Format:**

Each token is sent as a separate SSE event:

```
data: {"token": "The"}

data: {"token": " HSBC"}

data: {"token": " Revolution"}

data: {"token": " card"}

...

data: [DONE]

```

**Stream Events:**

- **Token event:** `data: {"token": "string"}\n\n`
- **Completion event:** `data: [DONE]\n\n`

#### Example

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "abc123", "message": "Tell me about credit cards"}'
```

**Response Stream:**

```
data: {"token":"I"}

data: {"token":"'d"}

data: {"token":" be"}

data: {"token":" happy"}

data: {"token":" to"}

data: {"token":" help"}

data: [DONE]

```

---

### 3. Escalate to Human

**`POST /api/escalate`**

Escalates the conversation to a human agent and logs the escalation.

#### Request

```http
POST /api/escalate HTTP/1.1
Content-Type: application/json
```

**Body:**

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "reason": "User requested detailed comparison of 5 credit cards"
}
```

**Fields:**

- `sessionId` (string, required): Valid session ID
- `reason` (string, required): Reason for escalation

#### Response

**Status:** `200 OK`

**Body:**

```json
{
  "success": true,
  "ticketId": "TKT-20260226-001",
  "message": "Your request has been escalated to a human agent. Ticket ID: TKT-20260226-001"
}
```

**Fields:**

- `success` (boolean): Always `true` on successful escalation
- `ticketId` (string): Unique ticket identifier
- `message` (string): Confirmation message for the user

#### Example

```bash
curl -X POST http://localhost:3001/api/escalate \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "abc123",
    "reason": "Complex loan restructuring question"
  }'
```

**Response:**

```json
{
  "success": true,
  "ticketId": "TKT-20260226-042",
  "message": "Your request has been escalated to a human agent. Ticket ID: TKT-20260226-042"
}
```

---

### 4. Get Conversation History

**`GET /api/history/:sessionId`**

Retrieves the full conversation history for a given session.

#### Request

```http
GET /api/history/:sessionId HTTP/1.1
```

**URL Parameters:**

- `sessionId` (string, required): Session identifier

#### Response

**Status:** `200 OK`

**Body:**

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "messages": [
    {
      "role": "user",
      "content": "What is the interest rate for DBS personal loans?",
      "timestamp": "2026-02-26T10:30:00.000Z"
    },
    {
      "role": "assistant",
      "content": "DBS personal loans offer competitive interest rates starting from 3.88% p.a. for amounts up to $200,000...",
      "timestamp": "2026-02-26T10:30:02.500Z"
    },
    {
      "role": "user",
      "content": "How do I apply?",
      "timestamp": "2026-02-26T10:31:15.000Z"
    },
    {
      "role": "assistant",
      "content": "You can apply for a DBS personal loan online through their website or mobile app...",
      "timestamp": "2026-02-26T10:31:18.200Z"
    }
  ]
}
```

**Fields:**

- `sessionId` (string): Session identifier
- `messages` (array): Array of message objects
  - `role` (string): Either `"user"` or `"assistant"`
  - `content` (string): Message text
  - `timestamp` (string): ISO 8601 datetime string

#### Example

```bash
curl http://localhost:3001/api/history/abc123
```

**Response:**

```json
{
  "sessionId": "abc123",
  "messages": [
    {
      "role": "user",
      "content": "Hello",
      "timestamp": "2026-02-26T14:20:00.000Z"
    },
    {
      "role": "assistant",
      "content": "Hi! How can I help you with financial products today?",
      "timestamp": "2026-02-26T14:20:01.000Z"
    }
  ]
}
```

---

## Error Responses

All endpoints may return error responses with the following structure:

### Client Errors (4xx)

**Status:** `400 Bad Request`

```json
{
  "error": "sessionId is required"
}
```

**Status:** `404 Not Found`

```json
{
  "error": "Session not found"
}
```

### Server Errors (5xx)

**Status:** `500 Internal Server Error`

```json
{
  "error": "Failed to process request"
}
```

---

## Database Schema

### Table: `sessions`

Stores active chat sessions.

| Column     | Type     | Constraints       |
| ---------- | -------- | ----------------- |
| id         | TEXT     | PRIMARY KEY       |
| created_at | DATETIME | NOT NULL, DEFAULT |

**SQL:**

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### Table: `messages`

Stores conversation messages for each session.

| Column     | Type     | Constraints               |
| ---------- | -------- | ------------------------- |
| id         | TEXT     | PRIMARY KEY               |
| session_id | TEXT     | NOT NULL, FOREIGN KEY     |
| role       | TEXT     | NOT NULL (user/assistant) |
| content    | TEXT     | NOT NULL                  |
| timestamp  | DATETIME | DEFAULT CURRENT_TIMESTAMP |

**SQL:**

```sql
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

---

### Table: `escalations`

Logs escalation requests to human agents.

| Column     | Type     | Constraints               |
| ---------- | -------- | ------------------------- |
| id         | TEXT     | PRIMARY KEY               |
| session_id | TEXT     | NOT NULL, FOREIGN KEY     |
| reason     | TEXT     | NOT NULL                  |
| ticket_id  | TEXT     | NOT NULL, UNIQUE          |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

**SQL:**

```sql
CREATE TABLE IF NOT EXISTS escalations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  ticket_id TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

---

## Notes

- All datetime values are stored and returned in ISO 8601 format (UTC)
- Session IDs are UUIDs (v4) or similar unique identifiers
- Ticket IDs follow the format: `TKT-YYYYMMDD-NNN`
- SSE streams must be consumed with appropriate event listeners
- The chat endpoint streams responses incrementally for better UX
- All text fields support UTF-8 encoding

---

## Rate Limiting

Currently no rate limiting is enforced. Production deployments should implement appropriate rate limiting per IP/session.

---

## CORS

CORS is enabled for all origins in development. Production should restrict to specific origins.
