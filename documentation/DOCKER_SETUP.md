# Docker Setup Guide

## Services

Three containers, all defined in `docker-compose.yml`:

| Container | Port | Description |
|---|---|---|
| `moneyhero-backend` | 3001 | Node.js + Express API + RAG agent |
| `moneyhero-frontend` | 3000 | React + Vite + Tailwind (served via nginx) |
| `moneyhero-ollama` | 11434 | Local LLM server |

```
Browser
  │
  ├── http://localhost:3000   →  moneyhero-frontend (nginx)
  │                                  │ /api/* proxy
  │                                  ▼
  └── http://localhost:3001   →  moneyhero-backend
                                     │
                                     ├── Anthropic API (HTTPS, external)
                                     │   Claude Sonnet 4.6  ← primary LLM
                                     │   (USE_CLAUDE=true + ANTHROPIC_API_KEY)
                                     │
                                     └── http://ollama:11434
                                         moneyhero-ollama
                                         ├── llama3.2:3b  (LLM fallback)
                                         └── nomic-embed-text  (embeddings, always)
```

**Volumes (host → container):**
- `./vectorstore` → `/app/vectorstore` (HNSWLib vector store)
- `./data` → `/app/data` (SQLite database)
- `./docs` → `/app/docs` (source documents)
- `ollama_data` named volume → `/root/.ollama` (persists pulled models)

---

## Quick Start

### First Time Setup

```bash
# Ensure Docker Desktop is running
docker info

# Make script executable and run
chmod +x scripts/setup.sh
./scripts/setup.sh
```

The script:
1. Starts all three containers
2. Waits for Ollama to be healthy
3. Pulls `llama3.2:3b` (generation), `llama3.2:1b` (classifier), and `nomic-embed-text` (embeddings)
4. Waits for the backend health check to pass
5. Runs document ingestion (`npm run ingest`) inside the backend container

**First run:** ~5–10 minutes (model download, ~2 GB total, one-time only).

After setup: open **http://localhost:3000**

### Daily Usage

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f ollama

# Stop services
docker compose down
```

---

## Environment Variables (backend container)

Variables come from two sources:

**`docker-compose.yml` (hardcoded for Docker):**
```yaml
PORT=3001
OLLAMA_BASE_URL=http://ollama:11434    # internal Docker network name
OLLAMA_MODEL=llama3.2:3b              # LLM fallback model
OLLAMA_EMBED_MODEL=nomic-embed-text   # embeddings (always Ollama)
DB_PATH=/app/data/moneyhero.db
NODE_ENV=production
```

**`.env` (read via `env_file:` — override defaults):**
```
USE_CLAUDE=true                        # true → Claude primary + Ollama fallback
ANTHROPIC_API_KEY=sk-ant-...          # required when USE_CLAUDE=true
```

**LLM selection logic:**
- `USE_CLAUDE=true` + `ANTHROPIC_API_KEY` set → Claude Sonnet 4.6 is primary; Ollama is fallback
- `USE_CLAUDE=false` or key missing → Ollama handles all generation

For local development outside Docker, copy `.env.example` to `.env` and set `OLLAMA_BASE_URL=http://localhost:11434`.

---

## Verification

After `./scripts/setup.sh` completes:

```bash
# Backend health
curl http://localhost:3001/health

# Ollama models
curl http://localhost:11434/api/tags

# Create a session
curl -X POST http://localhost:3001/api/session

# Send a chat message (replace <sessionId> with the value from above)
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<sessionId>","message":"What credit cards do you offer?"}'

# Frontend
open http://localhost:3000
```

---

## Troubleshooting

### Ollama not starting

```bash
# Check logs
docker compose logs ollama

# Restart
docker compose restart ollama

# Check if port is in use
lsof -ti:11434
```

### Backend can't reach Ollama

```bash
# Test internal network connectivity
docker compose exec backend curl http://ollama:11434/api/tags

# Check env vars
docker compose exec backend env | grep OLLAMA
```

### Models not persisting after restart

```bash
# Verify named volume exists
docker volume ls | grep ollama

# List models in volume
docker compose exec ollama ollama list
```

### Frontend not loading

```bash
# Check frontend container
docker compose logs frontend

# Confirm it's running
docker compose ps
```

### Clear all data and start fresh

```bash
# Remove containers and volumes
docker compose down -v

# Remove local generated files
rm -rf vectorstore/ data/

# Re-run full setup
./scripts/setup.sh
```

---

## Health Checks (from docker-compose.yml)

| Service | Check | Interval | Retries |
|---|---|---|---|
| backend | `curl -f http://localhost:3001/health` | 10s | 5 |
| ollama | `ollama list` | 5s | 12 |

The `backend` container will not start until `ollama` is healthy. The `frontend` container will not start until `backend` is healthy.
