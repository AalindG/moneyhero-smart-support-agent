# Docker Setup Guide

## Issues Fixed

### 1. **Ollama Volume Persistence** ✅

- Added `ollama_data` volume to persist models between container restarts
- Models are now stored in `/root/.ollama` inside the container

### 2. **Health Checks** ✅

- Backend: checks `/health` endpoint every 10s
- Ollama: checks `/api/tags` endpoint every 5s
- Services wait for dependencies to be healthy before starting

### 3. **Model Version Fixed** ✅

- Changed from `llama3.2` (full model, ~2GB) to `llama3.2:1b` (1B param, ~1GB)
- Matches the version specified in docker-compose.yml environment

### 4. **Improved Setup Script** ✅

- Removed emojis (professional logging)
- Better error handling with exit codes
- Checks Docker daemon before starting
- Uses `docker compose exec -T` for non-interactive execution
- Waits for both Ollama and Backend to be healthy
- Shows helpful logs on failure
- Fixed model version mismatch

## Quick Start

### First Time Setup

```bash
# Make sure Docker Desktop is running
docker info

# Run the setup script
chmod +x scripts/setup.sh
./scripts/setup.sh
```

This will:

1. Start Ollama and Backend containers
2. Wait for services to be healthy
3. Pull required models (llama3.2:1b, nomic-embed-text)
4. Run document ingestion
5. Verify everything is working

### Daily Usage

```bash
# Start services
docker compose up -d

# View logs
docker compose logs -f backend
docker compose logs -f ollama

# Stop services
docker compose down
```

## Troubleshooting

### Ollama Not Starting

```bash
# Check Ollama logs
docker compose logs ollama

# Restart Ollama
docker compose restart ollama

# Check if port is in use
lsof -ti:11434
```

### Models Not Persisting

```bash
# Verify volume exists
docker volume ls | grep ollama

# Check volume contents
docker compose exec ollama ls -la /root/.ollama
```

### Backend Can't Connect to Ollama

```bash
# Verify network connectivity
docker compose exec backend curl http://ollama:11434/api/tags

# Check environment variables
docker compose exec backend env | grep OLLAMA
```

### Clear All Data and Start Fresh

```bash
# Stop and remove everything
docker compose down -v

# Remove all MoneyHero data
rm -rf vectorstore/ data/

# Run setup again
./scripts/setup.sh
```

## Architecture

```
┌─────────────────────┐
│   Backend (3001)    │
│   Node.js + Express │
│   RAG Agent         │
└──────────┬──────────┘
           │
           │ HTTP requests
           │ http://ollama:11434
           │
┌──────────▼──────────┐
│   Ollama (11434)    │
│   llama3.2:1b       │
│   nomic-embed-text  │
└─────────────────────┘

Volumes:
- ollama_data: Persists Ollama models
- ./vectorstore: HNSWLib vector store
- ./data: SQLite database
- ./docs: Source documents
```

## Environment Variables

In `docker-compose.yml`:

```yaml
environment:
  - PORT=3001
  - OLLAMA_BASE_URL=http://ollama:11434 # Internal Docker network
  - OLLAMA_MODEL=llama3.2:1b # Matches pulled model
  - OLLAMA_EMBED_MODEL=nomic-embed-text
  - DB_PATH=/app/data/moneyhero.db
  - NODE_ENV=production
```

## Verification

After setup, verify everything is working:

```bash
# Check health endpoint
curl http://localhost:3001/health

# Check Ollama
curl http://localhost:11434/api/tags

# Test chat (requires valid sessionId)
curl -X POST http://localhost:3001/api/session
# Use the sessionId returned above
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<your-session-id>","message":"What credit cards do you offer?"}'
```
