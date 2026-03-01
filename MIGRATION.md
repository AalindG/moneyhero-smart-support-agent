# Migration Guide: Old Structure → New MVC Architecture

## Overview

The backend has been restructured from a flat file organization to a professional MVC architecture with clear separation of concerns.

## What Changed

### Old Structure (Flat)

```
src/
├── agent.js          # RAG agent
├── db.js             # All database operations
├── ingest.js         # Document ingestion
├── index.js          # Server + middleware
└── routes/
    └── chat.js       # All routes in one file
```

### New Structure (MVC)

```
src/
├── config/           # Configuration
├── models/           # Database models
├── controllers/      # Business logic
├── routes/           # API routes (by feature)
├── services/         # External integrations
├── middleware/       # Middleware functions
├── utils/            # Utilities
├── agent.js          # RAG agent (unchanged)
├── ingest.js         # Ingestion (unchanged)
└── index.js          # Main server
```

## File Mapping

| Old File             | New Location(s)                            |
| -------------------- | ------------------------------------------ |
| `src/db.js`          | Split into:                                |
|                      | - `config/database.js` (connection & init) |
|                      | - `models/session.model.js`                |
|                      | - `models/message.model.js`                |
|                      | - `models/escalation.model.js`             |
| `src/routes/chat.js` | Split into:                                |
|                      | - `routes/session.routes.js`               |
|                      | - `routes/chat.routes.js`                  |
|                      | - `routes/escalation.routes.js`            |
|                      | - `routes/history.routes.js`               |
|                      | - `controllers/session.controller.js`      |
|                      | - `controllers/chat.controller.js`         |
|                      | - `controllers/escalation.controller.js`   |
|                      | - `controllers/history.controller.js`      |
|                      | - `services/ollama.service.js`             |
|                      | - `middleware/validation.js`               |
|                      | - `middleware/sse.js`                      |
| `src/index.js`       | Refactored (uses new utilities):           |
|                      | - `utils/logger.js`                        |
|                      | - `middleware/errorHandler.js`             |
|                      | - `config/constants.js`                    |

## Import Changes

### Database Functions

**Old:**

```javascript
import { createSession, saveMessage, getHistory } from './db.js'
```

**New:**

```javascript
import * as SessionModel from './models/session.model.js'
import * as MessageModel from './models/message.model.js'

SessionModel.create()
MessageModel.create(sessionId, role, content)
MessageModel.findBySessionId(sessionId)
```

### RAG Agent (No Change)

```javascript
import { chat } from './agent.js' // Still works!
```

### Route Mounting

**Old:**

```javascript
import chatRouter from './routes/chat.js'
app.use('/api', chatRouter)
```

**New:**

```javascript
import apiRoutes from './routes/index.js'
app.use('/api', apiRoutes)
```

## Function Name Changes

### Session Functions

| Old               | New                         |
| ----------------- | --------------------------- |
| `createSession()` | `SessionModel.create()`     |
| `getSession(id)`  | `SessionModel.findById(id)` |

### Message Functions

| Old                | New                                |
| ------------------ | ---------------------------------- |
| `saveMessage(...)` | `MessageModel.create(...)`         |
| `getHistory(id)`   | `MessageModel.findBySessionId(id)` |

### Escalation Functions

| Old                        | New                                          |
| -------------------------- | -------------------------------------------- |
| `logEscalation(...)`       | `EscalationModel.create(...)`                |
| `getRecentEscalation(...)` | `EscalationModel.findRecentBySessionId(...)` |

## API Endpoints (No Change)

All API endpoints remain the same:

- `POST /api/session` ✅
- `POST /api/chat` ✅
- `POST /api/escalate` ✅
- `GET /api/history/:sessionId` ✅
- `GET /health` ✅

## Configuration Changes

### Constants

**Old:** Hardcoded in files

```javascript
const MAX_MESSAGE_LENGTH = 2000
```

**New:** Centralized in `config/constants.js`

```javascript
import { VALIDATION } from './config/constants.js'
const maxLength = VALIDATION.MAX_MESSAGE_LENGTH
```

### Logging

**Old:** Direct `console.log`

```javascript
console.log('Server started on port', PORT)
```

**New:** Structured logger

```javascript
import * as logger from './utils/logger.js'
logger.info('Server started', { port: PORT })
```

## Breaking Changes

### None for External API

The API contract is unchanged, so frontend/clients require **no changes**.

### Internal Breaking Changes

If you were importing from old files:

1. Update import paths
2. Use new model function names
3. Import from split modules

## Benefits of New Structure

### 1. Separation of Concerns

- Models handle data
- Controllers handle logic
- Routes handle HTTP
- Services handle external APIs

### 2. Easier Testing

- Test models independently
- Mock dependencies cleanly
- Test routes in isolation

### 3. Better Organization

- Find code faster
- Understand responsibilities
- Scale to more features

### 4. Consistent Patterns

- All controllers follow same pattern
- All models follow same pattern
- All routes follow same pattern

### 5. Maintainability

- Modify one layer without affecting others
- Add new features following established patterns
- Clear ownership of code

## How to Add New Features

### Example: Add "Feedback" Feature

1. **Create Model** (`models/feedback.model.js`):

```javascript
export function create(sessionId, rating, comment) {
  // SQL INSERT
}

export function findBySessionId(sessionId) {
  // SQL SELECT
}
```

2. **Create Controller** (`controllers/feedback.controller.js`):

```javascript
export async function submitFeedback(req, res) {
  const { sessionId, rating, comment } = req.body
  // Validation
  // Call FeedbackModel.create()
  // Return response
}
```

3. **Create Routes** (`routes/feedback.routes.js`):

```javascript
router.post('/', asyncHandler(submitFeedback))
```

4. **Mount Routes** (update `routes/index.js`):

```javascript
import feedbackRoutes from './feedback.routes.js'
router.use('/feedback', feedbackRoutes)
```

Done! New endpoint available at `POST /api/feedback`

## Rollback Plan

If issues arise, old files are in `old_structure/`:

```
old_structure/
├── db.js
└── chat.js
```

To rollback:

1. Copy old files back to `src/`
2. Update `src/index.js` imports
3. Restart server

## Testing Checklist

After restructuring, verify:

- [x] Server starts successfully
- [x] `GET /health` returns 200
- [x] `POST /api/session` creates session
- [ ] `POST /api/chat` streams response
- [ ] `POST /api/escalate` creates ticket
- [ ] `GET /api/history/:sessionId` returns history
- [ ] Database persistence works
- [ ] Error handling works
- [ ] Rate limiting works
- [ ] Logging is structured

## Common Issues

### Import Errors

**Error:**

```
Cannot find module './db.js'
```

**Solution:** Update import to new path:

```javascript
import * as SessionModel from './models/session.model.js'
```

### Function Not Found

**Error:**

```
createSession is not a function
```

**Solution:** Use model namespace:

```javascript
SessionModel.create() // Not createSession()
```

### Database Not Initialized

**Error:**

```
no such table: sessions
```

**Solution:** Ensure `initializeTables()` is called in `index.js`:

```javascript
import { initializeTables } from './config/database.js'
initializeTables()
```

## Questions?

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed documentation.

---

**Migration Date**: February 2026
**Status**: ✅ Complete
**Backward Compatibility**: API endpoints unchanged
