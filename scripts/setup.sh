#!/bin/bash
set -e

echo "[INFO] Starting MoneyHero backend setup..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "[ERROR] Docker is not running. Please start Docker and try again."
    exit 1
fi

# Start services
echo "[INFO] Starting Docker services..."
docker compose up -d

echo "[INFO] Waiting for Ollama service to be healthy..."
MAX_ATTEMPTS=60
ATTEMPT=0
until [ "$(docker inspect --format='{{.State.Health.Status}}' moneyhero-ollama 2>/dev/null)" = "healthy" ]; do
    ATTEMPT=$((ATTEMPT+1))
    if [ $ATTEMPT -gt $MAX_ATTEMPTS ]; then
        echo "[ERROR] Ollama service failed to start within 60 seconds"
        echo "[INFO] Checking Docker logs:"
        docker compose logs ollama
        exit 1
    fi
    if [ $((ATTEMPT % 10)) -eq 0 ]; then
        echo "[INFO] Still waiting... (attempt $ATTEMPT/$MAX_ATTEMPTS)"
    fi
    sleep 1
done

echo "[SUCCESS] Ollama service is ready!"
echo ""

# Check if models are already pulled
echo "[INFO] Checking existing Ollama models..."
docker compose exec -T ollama ollama list

# Pull LLM models
echo "[INFO] Pulling llama3.2:3b model (main generation)..."
if docker compose exec -T ollama ollama pull llama3.2:3b; then
    echo "[SUCCESS] llama3.2:3b model pulled successfully"
else
    echo "[ERROR] Failed to pull llama3.2:3b model"
    exit 1
fi

echo "[INFO] Pulling llama3.2:1b model (intent classifier)..."
if docker compose exec -T ollama ollama pull llama3.2:1b; then
    echo "[SUCCESS] llama3.2:1b model pulled successfully"
else
    echo "[ERROR] Failed to pull llama3.2:1b model"
    exit 1
fi

# Pull embedding model
echo "[INFO] Pulling nomic-embed-text model..."
if docker compose exec -T ollama ollama pull nomic-embed-text; then
    echo "[SUCCESS] nomic-embed-text model pulled successfully"
else
    echo "[ERROR] Failed to pull nomic-embed-text model"
    exit 1
fi

# List models
echo ""
echo "[INFO] Available Ollama models:"
docker compose exec -T ollama ollama list
echo ""

# Wait for backend to be healthy
echo "[INFO] Waiting for backend service to be healthy..."
ATTEMPT=0
MAX_ATTEMPTS=30
until curl -sf http://localhost:3001/health > /dev/null 2>&1; do
    ATTEMPT=$((ATTEMPT+1))
    if [ $ATTEMPT -gt $MAX_ATTEMPTS ]; then
        echo "[ERROR] Backend service failed to start within 30 seconds"
        echo "[INFO] Checking Docker logs:"
        docker compose logs backend
        exit 1
    fi
    if [ $((ATTEMPT % 5)) -eq 0 ]; then
        echo "[INFO] Still waiting for backend... (attempt $ATTEMPT/$MAX_ATTEMPTS)"
    fi
    sleep 1
done

echo "[SUCCESS] Backend service is ready!"
echo ""

# Run ingestion
echo "[INFO] Running document ingestion..."
if docker compose exec -T backend npm run ingest; then
    echo "[SUCCESS] Document ingestion completed"
else
    echo "[ERROR] Document ingestion failed"
    exit 1
fi

echo ""
echo "======================================"
echo "[SUCCESS] MoneyHero is ready!"
echo "======================================"
echo "Chat interface: http://localhost:3000"
echo "Backend API:    http://localhost:3001"
echo "Health check:   http://localhost:3001/health"
echo "Ollama API:     http://localhost:11434"
echo ""
echo "To view logs:"
echo "  docker compose logs -f backend"
echo "  docker compose logs -f ollama"
echo ""
echo "To stop services:"
echo "  docker compose down"
echo ""
