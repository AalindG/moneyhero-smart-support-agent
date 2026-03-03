# MoneyHero Backend - Complete Test Suite

## 📋 Overview

Comprehensive test suite covering all aspects of the MoneyHero Smart Support Agent backend API, including functional tests, integration tests, security tests, and performance validation.

## 🎯 Test Coverage

| Test Suite            | Tests   | Coverage Area                                |
| --------------------- | ------- | -------------------------------------------- |
| **API Tests**         | 20+     | REST endpoints, CORS, error handling         |
| **Integration Tests** | 15+     | Complete workflows, multi-turn conversations |
| **Database Tests**    | 15+     | Schema, CRUD, constraints, integrity         |
| **SSE Tests**         | 12+     | Streaming, keepalive, error handling         |
| **Validation Tests**  | 18+     | Security, input/output validation            |
| **Total**             | **80+** | **Comprehensive system coverage**            |

## 🚀 Quick Start

### Prerequisites

```bash
# Start the server
docker compose up -d

# Wait for health check
curl http://localhost:3001/health
```

### Run All Tests

```bash
npm test
```

### Run Specific Test Suite

```bash
npm run test:api          # API endpoint tests
npm run test:integration  # Integration tests
npm run test:database     # Database tests
npm run test:sse          # SSE streaming tests
npm run test:validation   # Security & validation tests
```

### Run with Coverage

```bash
npm run test:coverage
```

### Run Test Script

```bash
./scripts/run-tests.sh
```

## 📁 Test Files Structure

```
tests/
├── README.md              # Test suite documentation
├── api.test.js           # 334 lines - API endpoint tests
├── integration.test.js   # 385 lines - Integration tests
├── database.test.js      # 316 lines - Database tests
├── sse.test.js          # 312 lines - SSE streaming tests
└── validation.test.js    # 379 lines - Security tests
```

**Total: 1,957 lines of test code**

## 🧪 Test Categories

### 1. API Endpoint Tests (`api.test.js`)

**Coverage:**

- ✅ POST /api/session - Session creation
- ✅ POST /api/chat - Chat messaging with SSE
- ✅ POST /api/escalate - Escalation workflows
- ✅ GET /api/history/:sessionId - Conversation history
- ✅ GET /health - Health monitoring
- ✅ CORS headers validation
- ✅ Error handling (400, 404, 500)
- ✅ Input validation
- ✅ Prompt injection prevention

**Key Tests:**

- Session ID format validation (UUID)
- Unique session generation
- Missing parameter handling
- Non-existent session errors
- SSE streaming verification
- Ticket ID format (TKT-YYYYMMDD-NNN)
- Message chronological ordering

### 2. Integration Tests (`integration.test.js`)

**Coverage:**

- ✅ Complete conversation lifecycle
- ✅ Intent classification (answer/escalate/off_topic)
- ✅ Multi-turn conversations with memory
- ✅ RAG pipeline integration
- ✅ Document retrieval accuracy
- ✅ Financial disclaimer inclusion
- ✅ Concurrent session handling

**Key Tests:**

- Full user journey (session → chat → follow-up → history)
- Context maintenance across messages
- Product question handling
- Escalation keyword detection
- Off-topic redirection
- Memory persistence across turns
- Session isolation

### 3. Database Tests (`database.test.js`)

**Coverage:**

- ✅ Schema creation and validation
- ✅ Foreign key constraints
- ✅ Data insertion and retrieval
- ✅ Role constraints (user/assistant)
- ✅ Unique constraints (ticket IDs)
- ✅ Timestamp ordering
- ✅ Transaction integrity

**Key Tests:**

- All 6 tables created correctly
- Foreign key enforcement
- Unique ticket ID generation
- Message ordering by timestamp
- Data persistence
- Constraint validation

### 4. SSE Streaming Tests (`sse.test.js`)

**Coverage:**

- ✅ SSE header configuration
- ✅ Token streaming format
- ✅ Completion markers ([DONE])
- ✅ Keepalive comments
- ✅ Error handling in streams
- ✅ Client disconnect handling
- ✅ Concurrent streaming
- ✅ JSON data format validation

**Key Tests:**

- Correct Content-Type: text/event-stream
- Cache-Control: no-cache
- Connection: keep-alive
- Token JSON format: `data: {"token":"..."}`
- Stream ends with `data: [DONE]`
- Graceful disconnect handling
- Multiple concurrent streams

### 5. Validation Tests (`validation.test.js`)

**Coverage:**

- ✅ Input validation (empty, long, special chars)
- ✅ Prompt injection prevention
- ✅ Role manipulation blocking
- ✅ Context injection sanitization
- ✅ Output meta-language filtering
- ✅ Financial disclaimer enforcement
- ✅ No approval guarantees
- ✅ SQL injection prevention
- ✅ Rate limiting handling
- ✅ Error message security

**Key Tests:**

- Reject empty sessionId/message
- Handle 5000+ character messages
- Block `<script>` tags and XSS
- Prevent system prompt exposure
- Filter "based on the information provided"
- Include financial disclaimers
- Avoid guarantee language
- Safe SQL-like input handling
- No internal path exposure in errors

## 📊 Test Results Format

Each test outputs:

```
✓ should create a new session (150ms)
✓ should stream SSE response for valid request (2500ms)
✓ should not contain forbidden meta-language (3200ms)
```

Summary:

```
# tests 80
# pass 80
# fail 0
# duration_ms 180000
```

## 🛡️ Security Tests Included

- **Prompt Injection**: System prompt exposure prevention
- **SQL Injection**: Parameterized queries validation
- **XSS**: Special character sanitization
- **Role Manipulation**: Tag filtering
- **Output Validation**: Meta-language blocking
- **Rate Limiting**: Rapid request handling

## 📈 Quality Metrics Tested

All responses validated for:

- ✅ Response length tracking
- ✅ Source count (3-5 documents)
- ✅ Retrieval score averaging
- ✅ Disclaimer compliance
- ✅ Product name mentions
- ✅ Intent confidence (>0.3)
- ✅ Validation pass status

## 🔍 Example Test Output

```bash
$ npm test

> moneyhero-backend@1.0.0 test
> node --test tests/*.test.js

▶ API Endpoint Tests
  ▶ POST /api/session
    ✔ should create a new session (120ms)
    ✔ should create unique session IDs (85ms)
  ✔ POST /api/session (205ms)

  ▶ POST /api/chat
    ✔ should return 400 if sessionId is missing (45ms)
    ✔ should stream SSE response for valid request (2800ms)
  ✔ POST /api/chat (2845ms)

✔ API Endpoint Tests (3050ms)

# tests 80
# pass 80
# fail 0
# duration_ms 180000
```

## 🐛 Debugging Failed Tests

### Test Timeout

```bash
# Increase timeout
node --test --test-timeout=120000 tests/api.test.js
```

### Check Server

```bash
curl http://localhost:3001/health
docker compose ps
docker compose logs backend --tail=50
```

### Database Issues

```bash
ls -la data/
rm data/test-moneyhero.db
```

### Ollama Not Responding

```bash
docker compose logs ollama
docker compose exec ollama ollama list
```

## 📝 Adding New Tests

Template:

```javascript
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('New Feature', () => {
  it('should behave correctly', async () => {
    // Arrange
    const input = 'test'

    // Act
    const result = await fetch(`${BASE_URL}/api/endpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    })

    // Assert
    assert.equal(result.status, 200)
  })
})
```

## 🎯 Testing Best Practices

1. **Independence**: Each test runs independently
2. **Cleanup**: Resources cleaned up after tests
3. **Idempotency**: Tests can run multiple times
4. **Fast**: Database tests complete in <10s
5. **Comprehensive**: 80+ tests covering all features
6. **Maintainable**: Clear naming and structure

## 🔄 CI/CD Integration

GitHub Actions example:

```yaml
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v3
    - name: Start services
      run: docker compose up -d
    - name: Wait for health
      run: |
        timeout 30 bash -c 'until curl -sf http://localhost:3001/health; do sleep 1; done'
    - name: Run tests
      run: npm test
    - name: Stop services
      run: docker compose down
```

## 📦 Dependencies

Tests use **Node.js 18+ built-in test runner**:

- No external testing frameworks needed
- Uses native `node:test` module
- Uses native `assert` module
- Zero additional dependencies

## ✅ Production Readiness Checklist

- [x] All API endpoints tested
- [x] Error handling validated
- [x] Security measures verified
- [x] SSE streaming functional
- [x] Database integrity confirmed
- [x] Intent classification working
- [x] Memory management tested
- [x] Compliance features active
- [x] Performance acceptable
- [x] 80+ tests passing

## 📞 Support

For test issues:

1. Check [tests/README.md](../tests/README.md)
2. Review Docker logs: `docker compose logs`
3. Verify environment: `cat .env`
4. Run health check: `curl http://localhost:3001/health`

---

**Test Suite Status**: ✅ Production Ready
**Total Test Coverage**: 80+ tests across 5 suites
**Lines of Test Code**: 1,957 lines
