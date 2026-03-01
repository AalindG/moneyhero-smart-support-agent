# MoneyHero Backend Test Suite

Comprehensive test suite for the MoneyHero Smart Support Agent backend API.

## Test Files

### 1. `api.test.js` - API Endpoint Tests

Tests all REST API endpoints for correct behavior:

- Session creation
- Chat messaging
- Escalation
- History retrieval
- Health checks
- CORS headers
- Error handling

### 2. `integration.test.js` - Integration Tests

Tests complete workflows and system integration:

- Full conversation lifecycle
- Intent classification (answer/escalate/off_topic)
- Multi-turn conversations with memory
- RAG pipeline integration
- Concurrent sessions
- Financial disclaimers

### 3. `database.test.js` - Database Tests

Tests database operations and data persistence:

- Schema creation and validation
- CRUD operations
- Foreign key constraints
- Data integrity
- Query ordering
- Transaction handling

### 4. `sse.test.js` - SSE Streaming Tests

Tests Server-Sent Events streaming functionality:

- SSE headers
- Token streaming format
- Completion markers
- Keepalive messages
- Error handling in streams
- Concurrent streaming
- Client disconnect handling

### 5. `validation.test.js` - Security & Validation Tests

Tests input/output validation and security measures:

- Input validation
- Prompt injection prevention
- Output validation
- SQL injection prevention
- Rate limiting
- Error message security

## Running Tests

### Prerequisites

```bash
# Ensure server is running
docker compose up -d

# Or run locally
npm start
```

### Run All Tests

```bash
npm test
```

### Run Specific Test File

```bash
node --test tests/api.test.js
node --test tests/integration.test.js
node --test tests/database.test.js
node --test tests/sse.test.js
node --test tests/validation.test.js
```

### Run with Test Coverage

```bash
node --test --experimental-test-coverage tests/
```

### Run Tests Against Different Environment

```bash
TEST_BASE_URL=http://localhost:3001 node --test tests/
```

## Test Structure

Each test file uses Node.js built-in test runner (`node:test`) with the following structure:

```javascript
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'

describe('Feature Group', () => {
  describe('Specific Feature', () => {
    it('should behave as expected', async () => {
      // Arrange
      const input = 'test'

      // Act
      const result = await someFunction(input)

      // Assert
      assert.equal(result, expected)
    })
  })
})
```

## Test Coverage Areas

### ✅ Functional Tests

- Session management
- Chat messaging and streaming
- Escalation workflows
- Conversation history
- Health monitoring

### ✅ Performance Tests

- Concurrent requests
- Streaming performance
- Database query performance
- Memory management

### ✅ Security Tests

- Prompt injection protection
- SQL injection prevention
- XSS protection
- Input sanitization
- Output validation

### ✅ Integration Tests

- RAG pipeline
- Intent classification
- Memory persistence
- Multi-turn conversations
- Error recovery

### ✅ Compliance Tests

- Financial disclaimers
- Regulatory warnings
- No approval guarantees
- Information accuracy

## API Test Matrix

| Endpoint           | Method | Test Cases                                   |
| ------------------ | ------ | -------------------------------------------- |
| `/api/session`     | POST   | Create session, unique IDs                   |
| `/api/chat`        | POST   | Valid request, streaming, errors, validation |
| `/api/escalate`    | POST   | Create ticket, validation, uniqueness        |
| `/api/history/:id` | GET    | Retrieve history, ordering, empty session    |
| `/health`          | GET    | Status check, uptime                         |

## Expected Test Results

All tests should pass with no errors. Typical run time:

- `api.test.js`: ~30-60 seconds
- `integration.test.js`: ~60-90 seconds
- `database.test.js`: ~5-10 seconds
- `sse.test.js`: ~30-60 seconds
- `validation.test.js`: ~30-60 seconds

**Total**: ~3-5 minutes for full suite

## Continuous Integration

These tests are designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run Tests
  run: |
    docker compose up -d
    sleep 10
    npm test
    docker compose down
```

## Troubleshooting

### Tests Failing Due to Timeout

- Increase timeout: `node --test --test-timeout=60000 tests/`
- Check if Ollama model is loaded: `docker compose logs ollama`

### Database Tests Failing

- Ensure write permissions: `chmod 755 data/`
- Delete test database: `rm data/test-moneyhero.db`

### SSE Tests Failing

- Check if port 3001 is accessible
- Verify CORS settings
- Check firewall rules

### Integration Tests Failing

- Ensure vectorstore exists: `npm run ingest`
- Check Ollama models: `docker compose exec ollama ollama list`
- Verify environment variables: `cat .env`

## Writing New Tests

When adding new tests:

1. Follow existing test structure
2. Use descriptive test names
3. Clean up resources in `after()` hooks
4. Test both success and error cases
5. Mock external dependencies when possible
6. Keep tests independent and idempotent

## Quality Metrics Tested

- ✅ Response length
- ✅ Source count
- ✅ Retrieval score
- ✅ Disclaimer compliance
- ✅ Product name mentions
- ✅ Intent confidence
- ✅ Validation pass rate

## Contributing

When adding features, ensure:

1. Write tests first (TDD approach)
2. Achieve >80% code coverage
3. All existing tests pass
4. Add documentation to this README
5. Update test matrix if API changes
