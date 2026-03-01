# MoneyHero Backend - Architecture Documentation

## Folder Structure

```
src/
├── config/                    # Configuration files
│   ├── constants.js          # Application constants (validation, rate limits, etc.)
│   └── database.js           # Database configuration and initialization
│
├── models/                    # Data models (Database layer)
│   ├── session.model.js      # Session CRUD operations
│   ├── message.model.js      # Message CRUD operations
│   └── escalation.model.js   # Escalation CRUD operations
│
├── controllers/               # Business logic handlers
│   ├── session.controller.js # Session creation logic
│   ├── chat.controller.js    # Chat message processing
│   ├── escalation.controller.js # Escalation handling
│   └── history.controller.js # History retrieval
│
├── routes/                    # API route definitions
│   ├── session.routes.js     # POST /api/session
│   ├── chat.routes.js        # POST /api/chat
│   ├── escalation.routes.js  # POST /api/escalate
│   ├── history.routes.js     # GET /api/history/:sessionId
│   └── index.js              # Route aggregator
│
├── services/                  # Business logic and external integrations
│   └── ollama.service.js     # Ollama API streaming service
│
├── middleware/                # Express middleware
│   ├── validation.js         # Input validation
│   ├── errorHandler.js       # Error handling middleware
│   └── sse.js                # Server-Sent Events setup
│
├── utils/                     # Utility functions
│   └── logger.js             # Structured logging
│
├── agent.js                   # RAG agent (RAG Engineer's domain)
├── ingest.js                  # Document ingestion (RAG Engineer's domain)
└── index.js                   # Main server entry point
```

## Architecture Patterns

### MVC Pattern

The backend follows a clean MVC (Model-View-Controller) architecture:

- **Models**: Data access layer (models/\*)
- **Controllers**: Business logic layer (controllers/\*)
- **Routes**: API layer (routes/\*)

### Separation of Concerns

Each module has a single responsibility:

1. **Models** - Database operations only
2. **Controllers** - Request handling and business logic
3. **Routes** - HTTP routing and middleware composition
4. **Services** - External API integrations
5. **Middleware** - Cross-cutting concerns (validation, errors, logging)

### Module Organization

Routes are organized by **purpose and feature**:

- `/api/session` - Session management
- `/api/chat` - Chat interactions
- `/api/escalate` - Escalation handling
- `/api/history` - History retrieval

## Request Flow

```
Request → Middleware → Routes → Controllers → Models → Database
                 ↓
            Error Handler
```

### Example: Chat Message Flow

1. **Client** sends POST to `/api/chat`
2. **Rate Limiter** middleware checks request rate
3. **Chat Route** receives request
4. **Chat Controller**:
   - Validates input (validation middleware)
   - Checks session exists (session model)
   - Calls RAG agent (agent.js)
   - Streams response (ollama service)
   - Saves messages (message model)
5. **Response** streamed back via SSE

## Key Design Decisions

### 1. Constants Configuration

All magic numbers extracted to `config/constants.js`:

```javascript
export const VALIDATION = {
  MAX_SESSION_ID_LENGTH: 100,
  MAX_MESSAGE_LENGTH: 2000
}
```

### 2. Structured Logging

Logger utility provides consistent logging:

```javascript
import * as logger from './utils/logger.js'
logger.info('Server started', { port: 3001 })
logger.error('Database error', error)
```

### 3. Error Handling

- Async error wrapper (`asyncHandler`)
- Global error handler middleware
- Consistent error response format

### 4. Database Models

Models use named exports for clarity:

```javascript
import * as SessionModel from '../models/session.model.js'
SessionModel.create()
SessionModel.findById(sessionId)
```

### 5. Middleware Composition

Route-specific middleware applied at route level:

```javascript
router.post('/', asyncHandler(handleChatMessage))
```

## Module Responsibilities

### Models (Data Layer)

**Purpose**: Database CRUD operations

- No business logic
- Pure database queries
- Return raw data or null
- Throw errors on database failures

Example:

```javascript
export function findById(sessionId) {
  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?')
  return stmt.get(sessionId) || null
}
```

### Controllers (Business Layer)

**Purpose**: Handle HTTP requests and orchestrate logic

- Validate inputs
- Call models for data operations
- Call services for external APIs
- Format responses
- Handle errors

Example:

```javascript
export async function createSession(req, res) {
  try {
    const { sessionId } = SessionModel.create()
    res.status(200).json({ sessionId })
  } catch (error) {
    res.status(500).json({ error: 'Failed to create session' })
  }
}
```

### Routes (API Layer)

**Purpose**: Define HTTP endpoints and apply middleware

- Map HTTP methods to controllers
- Apply route-specific middleware
- No business logic

Example:

```javascript
router.post('/', asyncHandler(createSession))
```

### Services (Integration Layer)

**Purpose**: External API integrations

- Ollama streaming (ollama.service.js)
- Future: Email service, SMS service, etc.

Example:

```javascript
export async function streamResponse(prompt, res) {
  const response = await fetch(ollamaUrl, { ... })
  // Stream to client
}
```

### Middleware

**Purpose**: Cross-cutting concerns

- **validation.js**: Input validation
- **errorHandler.js**: Error handling and 404s
- **sse.js**: Server-Sent Events setup

## API Endpoints

| Method | Endpoint                | Purpose                  | Controller               |
| ------ | ----------------------- | ------------------------ | ------------------------ |
| POST   | /api/session            | Create new session       | session.controller.js    |
| POST   | /api/chat               | Send message (SSE)       | chat.controller.js       |
| POST   | /api/escalate           | Escalate to human        | escalation.controller.js |
| GET    | /api/history/:sessionId | Get conversation history | history.controller.js    |
| GET    | /health                 | Health check             | index.js                 |

## Configuration

### Environment Variables

All configuration through environment variables:

```bash
PORT=3001
DB_PATH=./data/moneyhero.db
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:1b
OLLAMA_EMBED_MODEL=nomic-embed-text
NODE_ENV=development
```

### Constants

Application-wide constants in `config/constants.js`:

- Validation limits
- Rate limiting configuration
- SSE keepalive intervals
- Ollama temperature

## Error Handling Strategy

### 1. Async Error Handling

All async routes wrapped in `asyncHandler`:

```javascript
router.post('/', asyncHandler(myController))
```

### 2. Database Error Handling

Models throw errors, controllers catch and return appropriate HTTP status:

```javascript
try {
  const session = SessionModel.findById(sessionId)
  if (!session) return res.status(404).json({ error: 'Not found' })
} catch (error) {
  return res.status(500).json({ error: 'Database error' })
}
```

### 3. Global Error Handler

Catches all unhandled errors:

```javascript
app.use(globalErrorHandler)
```

## Testing Strategy

### Unit Tests (Future)

- Test models independently
- Mock database in controller tests
- Test utilities in isolation

### Integration Tests (Future)

- Test routes end-to-end
- Use test database
- Verify API contract

## Development Guidelines

### Adding a New Feature

1. **Define routes** in `routes/` directory
2. **Create controller** in `controllers/`
3. **Add model functions** if database access needed
4. **Update `routes/index.js`** to mount new routes
5. **Add constants** to `config/constants.js` if needed

### Adding a New Service

1. Create service file in `services/`
2. Export service functions
3. Import in controllers that need it

### Modifying Database Schema

1. Update table creation in `config/database.js`
2. Add/update model functions in `models/`
3. Update controllers that use the model

## Security Measures

1. **Rate Limiting**: Global and chat-specific
2. **Security Headers**: X-Frame-Options, CSP, etc.
3. **Input Validation**: All inputs validated before processing
4. **SQL Injection Protection**: Prepared statements only
5. **Error Messages**: No sensitive info in production errors

## Performance Considerations

1. **Database Connection**: Single shared connection (better-sqlite3)
2. **SSE Streaming**: Reduces memory usage for long responses
3. **Rate Limiting**: Prevents API abuse
4. **Keepalive Intervals**: Prevents client timeout

## Future Enhancements

- [ ] Add request ID tracking for distributed tracing
- [ ] Implement caching layer (Redis)
- [ ] Add Prometheus metrics
- [ ] Implement circuit breaker for Ollama
- [ ] Add request/response logging middleware
- [ ] Implement database migrations
- [ ] Add OpenAPI/Swagger documentation
- [ ] Add comprehensive test suite

## Troubleshooting

### Server won't start

1. Check if port 3001 is in use: `lsof -ti:3001`
2. Check environment variables are set
3. Check database directory exists

### Database errors

1. Check DB_PATH environment variable
2. Verify data directory has write permissions
3. Check SQLite installation

### Ollama connection errors

1. Verify Ollama is running: `curl http://localhost:11434/api/tags`
2. Check OLLAMA_BASE_URL environment variable
3. Verify models are pulled: `ollama list`

---

**Last Updated**: February 2026
**Version**: 2.0.0
**Architecture**: MVC with modular organization
